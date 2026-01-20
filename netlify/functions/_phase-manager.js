// ExerciseApp/netlify/functions/_phase-manager.js
'use strict';

const {
    resolveTemplate,
    pickTargetSessions,
    getPhaseConfig,
    PHASE_IDS
} = require('./phase-catalog');

// ============================================================================
// HELPERY
// ============================================================================

const getWeeksDiff = (startDate) => {
    if (!startDate) return 0;
    const start = new Date(startDate).getTime();
    const now = Date.now();
    const diffMs = now - start;
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 7));
};

const getTodayISO = () => new Date().toISOString().split('T')[0];

const createPhaseStats = (phaseId, userCtx) => {
    const config = getPhaseConfig(phaseId);
    return {
        phase_id: phaseId,
        sessions_completed: 0,
        target_sessions: pickTargetSessions(phaseId, userCtx),
        start_date: getTodayISO(),
        last_session_completed_at: null,
        cap_weeks: config.progression.capWeeks || 8,
        is_soft_progression: false,
        soft_progression_factor: 1.0
    };
};

// ============================================================================
// PUBLIC API
// ============================================================================

function initializePhaseState(primaryGoal, userCtx) {
    const template = resolveTemplate(primaryGoal);
    const startPhase = template.sequence[0];

    return {
        version: 1,
        enabled: true,
        template_id: template.id,
        phases_sequence: template.sequence,
        current_cycle_id: 1,
        current_phase_index: 0,
        current_phase_stats: createPhaseStats(startPhase, userCtx),
        override: {
            mode: null,
            reason: null,
            triggered_at: null,
            exit_conditions: null,
            stats: { sessions_completed: 0, start_date: null }
        },
        spiral: { base_difficulty_bias: 0, cycle_increment: 0.1, max_bias: 0.6 },
        history: { transitions: [], max_items: 50 },
        reset_policy: { on_primary_goal_change: "reset_cycle", on_template_change: "reset_phase" }
    };
}

/**
 * 2. RESOLVE ACTIVE PHASE (US-06 Updated)
 * Obsługuje dynamiczne progi zmęczenia i detekcję monotonii.
 */
function resolveActivePhase(state, safetyCtx) {
    if (!state || !state.enabled) {
        return { activePhaseId: PHASE_IDS.CONTROL, isOverride: false };
    }

    // Default thresholds (fallback)
    const thresholdEnter = safetyCtx.fatigueThresholdEnter || 80;
    const thresholdExit = safetyCtx.fatigueThresholdExit || 60;
    
    // Monotony triggers (US-06)
    const isMonotonySpike = (safetyCtx.monotony7d >= 2.0 && safetyCtx.strain7d >= (safetyCtx.p85_strain_56d || 9999));

    // A. Czy wchodzimy w nowy Override?
    let newOverrideMode = null;
    let overrideReason = null;

    // 1. Severe Pain -> Rehab
    if (safetyCtx.isSeverePain) {
        newOverrideMode = PHASE_IDS.REHAB;
        overrideReason = 'severe_pain';
    }
    // 2. Feedback -1 (Symptom Worse) -> Rehab
    else if (safetyCtx.lastFeedbackValue === -1 && safetyCtx.lastFeedbackType === 'symptom') {
        newOverrideMode = PHASE_IDS.REHAB;
        overrideReason = 'symptom_flare_up';
    }
    // 3. High Fatigue OR Monotony Spike -> Deload (US-06)
    else if (safetyCtx.fatigueScore >= thresholdEnter) {
        newOverrideMode = PHASE_IDS.DELOAD;
        overrideReason = 'high_fatigue_load';
    }
    else if (isMonotonySpike) {
        newOverrideMode = PHASE_IDS.DELOAD;
        overrideReason = 'monotony_strain_spike';
    }

    if (newOverrideMode && state.override.mode !== newOverrideMode) {
        return {
            activePhaseId: newOverrideMode,
            isOverride: true,
            suggestedUpdate: { mode: newOverrideMode, reason: overrideReason }
        };
    }

    // B. Jeśli już jesteśmy w Override -> Sprawdzamy wyjście
    if (state.override.mode) {
        let shouldExit = false;

        if (state.override.mode === PHASE_IDS.REHAB) {
            if (!safetyCtx.isSeverePain && state.override.stats.sessions_completed >= 1) {
                shouldExit = true;
            }
        }
        else if (state.override.mode === PHASE_IDS.DELOAD) {
            // US-06: Use personalized exit threshold
            if (safetyCtx.fatigueScore < thresholdExit && state.override.stats.sessions_completed >= 1) {
                shouldExit = true;
            }
        }

        if (shouldExit) {
            return {
                activePhaseId: state.current_phase_stats.phase_id,
                isOverride: false,
                suggestedUpdate: { mode: null, reason: 'condition_cleared' }
            };
        }

        return { activePhaseId: state.override.mode, isOverride: true };
    }

    return { activePhaseId: state.current_phase_stats.phase_id, isOverride: false };
}

function updatePhaseStateAfterSession(state, completedPhaseId, userCtx) {
    const newState = JSON.parse(JSON.stringify(state));
    const now = getTodayISO();

    if (state.override.mode === completedPhaseId) {
        newState.override.stats.sessions_completed++;
        return { newState, transition: null };
    }

    if (state.current_phase_stats.phase_id === completedPhaseId) {
        newState.current_phase_stats.sessions_completed++;
        newState.current_phase_stats.last_session_completed_at = now;

        const stats = newState.current_phase_stats;
        const weeksInPhase = getWeeksDiff(stats.start_date);

        let transitionReason = null;
        let isSoft = false;

        if (stats.sessions_completed >= stats.target_sessions) {
            transitionReason = 'target_reached';
        } else if (weeksInPhase >= stats.cap_weeks) {
            transitionReason = 'time_cap';
            isSoft = true;
        }

        if (transitionReason) {
            advancePhase(newState, transitionReason, isSoft, userCtx);
            return { newState, transition: transitionReason };
        }
    }

    return { newState, transition: null };
}

function advancePhase(state, reason, isSoft, userCtx) {
    const oldPhase = state.current_phase_stats.phase_id;
    const oldStats = { ...state.current_phase_stats };

    state.current_phase_index++;

    if (state.current_phase_index >= state.phases_sequence.length) {
        state.current_phase_index = 0;
        state.current_cycle_id++;
        state.spiral.base_difficulty_bias = Math.min(
            state.spiral.max_bias,
            state.spiral.base_difficulty_bias + state.spiral.cycle_increment
        );
    }

    const newPhaseId = state.phases_sequence[state.current_phase_index];
    state.current_phase_stats = createPhaseStats(newPhaseId, userCtx);

    if (isSoft) {
        state.current_phase_stats.is_soft_progression = true;
        state.current_phase_stats.soft_progression_factor = 0.8;
    }

    state.history.transitions.unshift({
        date: getTodayISO(),
        from: oldPhase,
        to: newPhaseId,
        reason: reason,
        cycle: state.current_cycle_id,
        stats_dump: { sessions: oldStats.sessions_completed, target: oldStats.target_sessions }
    });

    if (state.history.transitions.length > state.history.max_items) {
        state.history.transitions.pop();
    }
}

function checkDetraining(state) {
    if (!state || !state.current_phase_stats.last_session_completed_at) return state;
    const lastDate = new Date(state.current_phase_stats.last_session_completed_at);
    const now = new Date();
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 21) {
        console.log(`[PhaseManager] Detraining detected (${diffDays} days). Reducing volume.`);
        const newState = JSON.parse(JSON.stringify(state));
        newState.current_phase_stats.sessions_completed = Math.floor(newState.current_phase_stats.sessions_completed * 0.5);
        return newState;
    }
    return state;
}

function applyGoalChangePolicy(state, newGoal, userCtx) {
    const template = resolveTemplate(newGoal);
    if (state && state.template_id === template.id) {
        return state;
    }
    const newState = initializePhaseState(newGoal, userCtx);
    if (state && state.override.mode) {
        newState.override = JSON.parse(JSON.stringify(state.override));
    }
    newState.history.transitions.push({
        date: getTodayISO(),
        from: state ? state.template_id : 'none',
        to: template.id,
        reason: 'goal_change_reset'
    });
    return newState;
}

module.exports = {
    initializePhaseState,
    resolveActivePhase,
    updatePhaseStateAfterSession,
    checkDetraining,
    applyGoalChangePolicy
};
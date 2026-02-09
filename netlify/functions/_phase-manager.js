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

/**
 * Inicjalizuje profil ROM w zależności od lokalizacji bólu.
 */
const initializeRomProfile = (userCtx) => {
    const romProfile = {};
    const painLocs = (userCtx.pain_locations || []).map(s => s.toLowerCase());
    const diagnosis = (userCtx.medical_diagnosis || []).map(s => s.toLowerCase());

    // Logika dla kolana (PFPS, Chondromalacja, OA, ACL)
    const hasKneeIssue = painLocs.includes('knee') ||
                         painLocs.includes('knee_anterior') ||
                         painLocs.includes('patella') ||
                         diagnosis.includes('chondromalacia') ||
                         diagnosis.includes('meniscus_tear') ||
                         diagnosis.includes('knee_oa');

    if (hasKneeIssue) {
        // Startujemy konserwatywnie (45-60 stopni)
        // Jeśli ból jest silny (Severe), startujemy od 45. Jeśli nie, od 60.
        // UserCtx w init może nie mieć isSevere, zakładamy bezpieczny start 60.
        romProfile.knee_flexion = {
            current_limit: 60,
            max_limit: 135, // Pełny przysiad
            step: 15,       // Krok progresji
            consecutive_clean_sessions: 0,
            required_clean_sessions: 3 // Co 3 czyste sesje zwiększamy zakres
        };
    }

    return romProfile;
};

// ============================================================================
// PUBLIC API
// ============================================================================

function initializePhaseState(primaryGoal, userCtx) {
    const template = resolveTemplate(primaryGoal);
    const startPhase = template.sequence[0];

    return {
        version: 2, // Bumped version for ROM support
        enabled: true,
        template_id: template.id,
        phases_sequence: template.sequence,
        current_cycle_id: 1,
        current_phase_index: 0,
        current_phase_stats: createPhaseStats(startPhase, userCtx),
        // NOWOŚĆ: Stan Progresji Zakresu Ruchu
        rom_profile: initializeRomProfile(userCtx),
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

function resolveActivePhase(state, safetyCtx) {
    if (!state || !state.enabled) {
        return { activePhaseId: PHASE_IDS.CONTROL, isOverride: false };
    }

    const thresholdEnter = safetyCtx.fatigueThresholdEnter || 80;
    const thresholdExit = safetyCtx.fatigueThresholdExit || 60;
    const isMonotonySpike = (safetyCtx.monotony7d >= 2.0 && safetyCtx.strain7d >= (safetyCtx.p85_strain_56d || 9999));

    let newOverrideMode = null;
    let overrideReason = null;

    if (safetyCtx.isSeverePain) {
        newOverrideMode = PHASE_IDS.REHAB;
        overrideReason = 'severe_pain_reported';
    }
    else if (safetyCtx.painStatus === 'red') {
        newOverrideMode = PHASE_IDS.REHAB;
        overrideReason = 'pain_flare_up_detected';
    }
    else if (safetyCtx.painStatus === 'amber') {
        newOverrideMode = PHASE_IDS.DELOAD;
        overrideReason = 'pain_warning_amber';
    }
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

    if (state.override.mode) {
        let shouldExit = false;

        if (state.override.mode === PHASE_IDS.REHAB) {
            const isPainClear = !safetyCtx.isSeverePain && safetyCtx.painStatus !== 'red';
            if (isPainClear && state.override.stats.sessions_completed >= 1) {
                shouldExit = true;
            }
        }
        else if (state.override.mode === PHASE_IDS.DELOAD) {
            const isPainGreen = safetyCtx.painStatus === 'green';
            const isFatigueOk = safetyCtx.fatigueScore < thresholdExit;
            if (isPainGreen && isFatigueOk && state.override.stats.sessions_completed >= 1) {
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

function applySuggestedUpdate(state, suggestedUpdate) {
    const newState = JSON.parse(JSON.stringify(state));
    const now = getTodayISO();

    if (suggestedUpdate.mode) {
        console.log(`[PhaseManager] Entering Override: ${suggestedUpdate.mode} (${suggestedUpdate.reason})`);
        newState.override.mode = suggestedUpdate.mode;
        newState.override.reason = suggestedUpdate.reason;
        newState.override.triggered_at = now;
        newState.override.exit_conditions = null;
        newState.override.stats = {
            sessions_completed: 0,
            start_date: now
        };
        // Reset ROM progress on flare-up (Safety First)
        if (suggestedUpdate.reason.includes('pain') && newState.rom_profile?.knee_flexion) {
             console.log(`[PhaseManager] Pain detected. Regression of ROM limits.`);
             // Cofamy się o 2 kroki lub do bazy
             newState.rom_profile.knee_flexion.current_limit = Math.max(
                 45,
                 newState.rom_profile.knee_flexion.current_limit - (newState.rom_profile.knee_flexion.step * 2)
             );
             newState.rom_profile.knee_flexion.consecutive_clean_sessions = 0;
        }
    } else {
        console.log(`[PhaseManager] Exiting Override (${suggestedUpdate.reason})`);
        newState.override = {
            mode: null,
            reason: null,
            triggered_at: null,
            exit_conditions: null,
            stats: { sessions_completed: 0, start_date: null }
        };
    }

    return newState;
}

/**
 * Aktualizuje ROM po udanej sesji.
 */
function updateRomProgress(romProfile, painStatus) {
    if (!romProfile) return;

    // Obsługa Kolana
    if (romProfile.knee_flexion) {
        const k = romProfile.knee_flexion;
        // Tylko jeśli sesja była "Green" (bez bólu)
        if (painStatus === 'green') {
            k.consecutive_clean_sessions++;
            if (k.consecutive_clean_sessions >= k.required_clean_sessions) {
                if (k.current_limit < k.max_limit) {
                    k.current_limit = Math.min(k.max_limit, k.current_limit + k.step);
                    k.consecutive_clean_sessions = 0; // Reset licznika po awansie
                    console.log(`[PhaseManager] 🚀 ROM Upgrade! Knee Flexion -> ${k.current_limit}°`);
                }
            }
        } else if (painStatus === 'amber' || painStatus === 'red') {
            // Jeśli ból wystąpił, resetujemy licznik postępu.
            // (Regresję limitu obsługuje applySuggestedUpdate przy wejściu w Rehab)
            k.consecutive_clean_sessions = 0;
        }
    }
}

function updatePhaseStateAfterSession(state, completedPhaseId, userCtx) {
    const newState = JSON.parse(JSON.stringify(state));
    const now = getTodayISO();

    // 1. Aktualizacja ROM (niezależnie od fazy)
    // Potrzebujemy statusu bólu z tej konkretnej sesji.
    // userCtx tutaj to wizardData, który jest statyczny.
    // W save-session.js musimy przekazać painStatus do tej funkcji.
    // (Wymaga małej zmiany w sygnaturze wywołania w save-session.js lub analizy userCtx.painStatus,
    // ale generate-plan.js wstrzykuje painStatus do ctx.
    // Tutaj zakładamy, że `userCtx` ma pole `lastSessionPainStatus` przekazane z handlera)

    if (userCtx.lastSessionPainStatus && newState.rom_profile) {
        updateRomProgress(newState.rom_profile, userCtx.lastSessionPainStatus);
    }

    // 2. Liczniki Faz
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
        // Reset ROM on detraining
        if (newState.rom_profile?.knee_flexion) {
             newState.rom_profile.knee_flexion.current_limit = 60;
        }
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
    // Preserve existing ROM profile on goal change (body hasn't changed)
    if (state && state.rom_profile) {
        newState.rom_profile = state.rom_profile;
    }
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
    applySuggestedUpdate,
    updatePhaseStateAfterSession,
    checkDetraining,
    applyGoalChangePolicy
};
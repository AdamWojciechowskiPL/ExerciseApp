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

/**
 * Tworzy nowy obiekt statystyk dla danej fazy.
 */
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
        soft_progression_factor: 1.0 // 1.0 = brak redukcji, <1.0 = redukcja
    };
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * 1. INICJALIZACJA STANU (Bootstrap)
 * Tworzy strukturę JSON dla nowego użytkownika lub po twardym resecie.
 */
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
            mode: null,         // 'rehab' | 'deload' | null
            reason: null,
            triggered_at: null,
            exit_conditions: null,
            stats: {
                sessions_completed: 0,
                start_date: null
            }
        },

        spiral: {
            base_difficulty_bias: 0,
            cycle_increment: 0.1,
            max_bias: 0.6
        },

        history: {
            transitions: [],
            max_items: 50
        },

        reset_policy: {
            on_primary_goal_change: "reset_cycle",
            on_template_change: "reset_phase"
        }
    };
}

/**
 * 2. RESOLVE ACTIVE PHASE (Decyzja)
 * Określa, w jakiej fazie faktycznie jest użytkownik (biorąc pod uwagę Safety/Override).
 * Funkcja idempotentna - nie zmienia stanu, tylko zwraca decyzję.
 * 
 * @param {object} state - Obiekt phase_manager
 * @param {object} safetyCtx - { isSeverePain, fatigueScore, lastFeedbackValue }
 */
function resolveActivePhase(state, safetyCtx) {
    if (!state || !state.enabled) {
        return { activePhaseId: PHASE_IDS.CONTROL, isOverride: false }; // Fallback safe
    }

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
    // 3. High Fatigue -> Deload
    else if (safetyCtx.fatigueScore >= 80) {
        newOverrideMode = PHASE_IDS.DELOAD;
        overrideReason = 'high_fatigue';
    }

    // Jeśli wykryto nowy stan override, różny od obecnego -> Zwracamy go
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

        // Warunki wyjścia dla Rehab
        if (state.override.mode === PHASE_IDS.REHAB) {
            // Wyjście gdy ból ustąpił (Severity Low) I min 1 sesja zrobiona
            if (!safetyCtx.isSeverePain && state.override.stats.sessions_completed >= 1) {
                shouldExit = true;
            }
        }
        // Warunki wyjścia dla Deload
        else if (state.override.mode === PHASE_IDS.DELOAD) {
            // Wyjście gdy zmęczenie spadło < 60
            if (safetyCtx.fatigueScore < 60 && state.override.stats.sessions_completed >= 1) {
                shouldExit = true;
            }
        }

        if (shouldExit) {
            return { 
                activePhaseId: state.current_phase_stats.phase_id, // Wracamy do bazy
                isOverride: false, 
                suggestedUpdate: { mode: null, reason: 'condition_cleared' } 
            };
        } 
        
        // Nadal w override
        return { 
            activePhaseId: state.override.mode, 
            isOverride: true 
        };
    }

    // C. Standardowa faza
    return { 
        activePhaseId: state.current_phase_stats.phase_id, 
        isOverride: false 
    };
}

/**
 * 3. UPDATE STATE (Transakcja)
 * Inkrementuje liczniki i przeprowadza tranzycję fazy jeśli warunki są spełnione.
 * Wywoływane PO ukończeniu sesji.
 * 
 * @param {object} state - Obiekt phase_manager
 * @param {string} completedPhaseId - ID fazy, która została wykonana (z generatora)
 * @param {object} userCtx - Kontekst usera do wyliczenia nowych targetów
 * @returns {object} Zaktualizowany stan (nie mutuje wejścia, zwraca kopię/zmianę)
 */
function updatePhaseStateAfterSession(state, completedPhaseId, userCtx) {
    const newState = JSON.parse(JSON.stringify(state));
    const now = getTodayISO();

    // A. Czy to była sesja Override?
    if (state.override.mode === completedPhaseId) {
        newState.override.stats.sessions_completed++;
        return { newState, transition: null };
    }

    // B. Czy to była sesja Bazowa?
    if (state.current_phase_stats.phase_id === completedPhaseId) {
        newState.current_phase_stats.sessions_completed++;
        newState.current_phase_stats.last_session_completed_at = now;
        
        // SPRAWDZANIE WARUNKÓW PRZEJŚCIA
        const stats = newState.current_phase_stats;
        const weeksInPhase = getWeeksDiff(stats.start_date);
        
        let transitionReason = null;
        let isSoft = false;

        // 1. Target Reached (Priorytet)
        if (stats.sessions_completed >= stats.target_sessions) {
            transitionReason = 'target_reached';
        }
        // 2. Time Cap (Soft Progression)
        else if (weeksInPhase >= stats.cap_weeks) {
            transitionReason = 'time_cap';
            isSoft = true;
        }

        if (transitionReason) {
            // WYKONAJ PRZEJŚCIE
            advancePhase(newState, transitionReason, isSoft, userCtx);
            return { newState, transition: transitionReason };
        }
    }

    return { newState, transition: null };
}

/**
 * (Wewnętrzna) Przesuwa wskaźnik fazy do przodu
 */
function advancePhase(state, reason, isSoft, userCtx) {
    const oldPhase = state.current_phase_stats.phase_id;
    const oldStats = { ...state.current_phase_stats };

    // 1. Przesuń indeks
    state.current_phase_index++;

    // 2. Obsługa końca cyklu (New Game+)
    if (state.current_phase_index >= state.phases_sequence.length) {
        state.current_phase_index = 0;
        state.current_cycle_id++;
        
        // Zwiększ Spiral Difficulty (do limitu)
        state.spiral.base_difficulty_bias = Math.min(
            state.spiral.max_bias,
            state.spiral.base_difficulty_bias + state.spiral.cycle_increment
        );
    }

    // 3. Ustaw nową fazę
    const newPhaseId = state.phases_sequence[state.current_phase_index];
    state.current_phase_stats = createPhaseStats(newPhaseId, userCtx);
    
    // Obsługa Soft Progression (obniżenie startu nowej fazy)
    if (isSoft) {
        state.current_phase_stats.is_soft_progression = true;
        state.current_phase_stats.soft_progression_factor = 0.8; // Start lżej o 20%
    }

    // 4. Log Historia
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

/**
 * 4. DETRAINING CHECK (Zabezpieczenie przed przerwami)
 * Sprawdza czy user miał długą przerwę i cofa licznik/fazę.
 */
function checkDetraining(state) {
    if (!state || !state.current_phase_stats.last_session_completed_at) return state;

    const lastDate = new Date(state.current_phase_stats.last_session_completed_at);
    const now = new Date();
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 21) {
        // > 3 tygodnie: Cofnij licznik o 50%
        console.log(`[PhaseManager] Detraining detected (${diffDays} days). Reducing volume.`);
        const newState = JSON.parse(JSON.stringify(state));
        newState.current_phase_stats.sessions_completed = Math.floor(newState.current_phase_stats.sessions_completed * 0.5);
        // Opcjonalnie: Jeśli to faza STRENGTH, można cofnąć do CAPACITY (ale to skomplikowane logicznie, na razie tniemy licznik)
        return newState;
    }
    
    return state;
}

/**
 * 5. GOAL CHANGE (Reset Policy)
 * Obsługuje zmianę celu w Wizardzie.
 */
function applyGoalChangePolicy(state, newGoal, userCtx) {
    const template = resolveTemplate(newGoal);
    
    // Jeśli cel ten sam (identyczny template ID) -> Merge (nie resetuj)
    if (state && state.template_id === template.id) {
        return state;
    }

    // Jeśli zmiana -> HARD RESET (Reset Cycle)
    // To jest najbezpieczniejsze. Nie mapujemy faz między różnymi celami.
    const newState = initializePhaseState(newGoal, userCtx);

    // ALE: Zachowaj Override jeśli istnieje (bezpieczeństwo ma priorytet)
    if (state && state.override.mode) {
        newState.override = JSON.parse(JSON.stringify(state.override));
    }

    // Log transition
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
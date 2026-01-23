// ExerciseApp/ui/screens/summary.js
import { state } from '../../state.js';
import { screens } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal, renderPhaseTransitionModal } from '../modals.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import { clearSessionBackup } from '../../sessionRecovery.js';
import { clearPlanFromStorage } from './dashboard.js';

let selectedFeedback = { type: null, value: 0 };

// Tymczasowy stan zmian punktów dla tej sesji
// Struktura: { "exerciseId": delta } np. { "ex1": 15, "ex2": -30 }
let sessionAffinityDeltas = {};

const SCORE_LIKE = 15;
const SCORE_DISLIKE = -30;

export const renderSummaryScreen = () => {
    if (getIsCasting()) sendShowIdle();

    let trainingTitle = "Trening";
    let isSafetyMode = false;

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        trainingTitle = state.todaysDynamicPlan.title;
        isSafetyMode = state.todaysDynamicPlan.mode === 'sos';
    } else {
        const activePlan = state.settings.dynamicPlanData;
        const daysList = activePlan?.days || [];
        const trainingDay = daysList.find(d => d.dayNumber === state.currentTrainingDayId);
        trainingTitle = trainingDay ? trainingDay.title : "Trening";
        isSafetyMode = (state.sessionParams.initialPainLevel || 0) > 3;
    }

    selectedFeedback = { type: isSafetyMode ? 'symptom' : 'tension', value: 0 };
    sessionAffinityDeltas = {}; // Resetujemy zmiany sesyjne

    const summaryScreen = screens.summary;

    let globalOptionsHtml = isSafetyMode ? `
        <div class="feedback-option" data-type="symptom" data-value="1"><div class="fb-icon">🍃</div><div class="fb-text"><h4>Ulga</h4></div></div>
        <div class="feedback-option selected" data-type="symptom" data-value="0"><div class="fb-icon">⚖️</div><div class="fb-text"><h4>Stabilnie</h4></div></div>
        <div class="feedback-option" data-type="symptom" data-value="-1"><div class="fb-icon">⚡</div><div class="fb-text"><h4>Gorzej</h4></div></div>
    ` : `
        <div class="feedback-option" data-type="tension" data-value="1"><div class="fb-icon">🥱</div><div class="fb-text"><h4>Nuda</h4></div></div>
        <div class="feedback-option selected" data-type="tension" data-value="0"><div class="fb-icon">🎯</div><div class="fb-text"><h4>Idealnie</h4></div></div>
        <div class="feedback-option" data-type="tension" data-value="-1"><div class="fb-icon">🥵</div><div class="fb-text"><h4>Za mocno</h4></div></div>
    `;

    const processedIds = new Set();
    const uniqueExercises = (state.sessionLog || []).filter(entry => {
        if (entry.isRest || entry.status === 'skipped') return false;
        const exId = entry.exerciseId || entry.id;
        if (!exId || processedIds.has(exId)) return false;
        processedIds.add(exId);
        return true;
    });

    let exercisesListHtml = '';
    if (uniqueExercises.length > 0) {
        exercisesListHtml = uniqueExercises.map(ex => {
            const id = ex.exerciseId || ex.id;
            const pref = state.userPreferences[id] || { score: 0 };
            const baseScore = pref.score || 0;

            let displayName = ex.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

            // Stylizacja wyniku
            let scoreColor = '#666';
            let scorePrefix = '';
            if (baseScore >= 75) { scoreColor = 'var(--gold-color)'; scorePrefix = '👑 '; }
            else if (baseScore > 0) { scoreColor = 'var(--success-color)'; scorePrefix = '+'; }
            else if (baseScore < 0) { scoreColor = 'var(--danger-color)'; }

            return `
            <div class="rating-card" data-id="${id}" data-base-score="${baseScore}">
                <div class="rating-info" style="flex:1;">
                    <div class="rating-name">${displayName}</div>
                    <div class="rating-score-display" style="font-size:0.75rem; font-weight:700; color:${scoreColor}; transition:color 0.2s;">
                        Wynik: <span class="current-score-val">${scorePrefix}${baseScore}</span>
                    </div>
                </div>
                <div class="rating-actions-group">
                    <div class="btn-group-affinity">
                        <button type="button" class="rate-btn affinity-btn" data-action="like" title="Super (+15)">👍</button>
                        <button type="button" class="rate-btn affinity-btn" data-action="dislike" title="Słabo (-30)">👎</button>
                    </div>
                    <div class="sep"></div>
                    <div class="btn-group-difficulty">
                        <button type="button" class="rate-btn diff-btn" data-action="easy" title="Za łatwe - Awansuj mnie">💤</button>
                        <button type="button" class="rate-btn diff-btn" data-action="hard" title="Za trudne - Ratuj mnie">🔥</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } else {
        exercisesListHtml = '<p class="empty-state">Brak wykonanych ćwiczeń do oceny.</p>';
    }

    let stravaHtml = state.stravaIntegration.isConnected ? `
        <div class="form-group strava-sync-container" style="margin-top:1rem;">
            <label class="checkbox-label" for="strava-sync-checkbox" style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" id="strava-sync-checkbox" checked style="width:20px; height:20px;">
                <span>Wyślij do Strava</span>
            </label>
        </div>` : '';

    summaryScreen.innerHTML = `
        <h2 id="summary-title" style="margin-bottom:0.5rem">${trainingTitle}</h2>
        <p style="opacity:0.6; font-size:0.9rem; margin-top:0;">Podsumowanie sesji</p>
        <form id="summary-form">
            <div class="form-group">
                <label style="display:block; margin-bottom:10px; font-weight:700;">${isSafetyMode ? "Samopoczucie" : "Trudność sesji"}</label>
                <div class="feedback-container compact">${globalOptionsHtml}</div>
            </div>
            <div class="form-group" style="margin-top:1.5rem;">
                <label style="display:block; margin-bottom:5px; font-weight:700;">Twoja Opinia</label>
                <div class="ratings-list">${exercisesListHtml}</div>
            </div>
            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki:</label>
                <textarea id="general-notes" rows="2" placeholder="Jak poszło?"></textarea>
            </div>
            ${stravaHtml}
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>
    `;

    // Listenery
    summaryScreen.querySelectorAll('.feedback-option').forEach(opt => {
        opt.addEventListener('click', () => {
            summaryScreen.querySelectorAll('.feedback-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    // NOWA LOGIKA KCIUKÓW (INTERAKTYWNA) - POPRAWIONY TOGGLE
    const formContainer = summaryScreen.querySelector('#summary-form');

    formContainer.querySelectorAll('.rating-card').forEach(card => {
        const id = card.dataset.id;
        const baseScore = parseInt(card.dataset.baseScore, 10);
        const scoreDisplay = card.querySelector('.current-score-val');
        const scoreContainer = card.querySelector('.rating-score-display');

        const updateVisuals = () => {
            const delta = sessionAffinityDeltas[id] || 0;
            const newScore = Math.max(-100, Math.min(100, baseScore + delta));

            let color = '#666';
            let prefix = '';
            if (newScore >= 75) { color = 'var(--gold-color)'; prefix = '👑 '; }
            else if (newScore > 0) { color = 'var(--success-color)'; prefix = '+'; }
            else if (newScore < 0) { color = 'var(--danger-color)'; }

            scoreDisplay.textContent = `${prefix}${newScore}`;
            scoreContainer.style.color = color;

            // Highlight buttons
            card.querySelectorAll('.affinity-btn').forEach(btn => btn.classList.remove('active'));
            if (delta === SCORE_LIKE) card.querySelector('[data-action="like"]').classList.add('active');
            if (delta === SCORE_DISLIKE) card.querySelector('[data-action="dislike"]').classList.add('active');
        };

        const affinityBtns = card.querySelectorAll('.affinity-btn');
        affinityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const currentDelta = sessionAffinityDeltas[id] || 0;

                // Toggle logic
                if (action === 'like') {
                    // Jeśli już było Like (+15), to zerujemy. Jeśli nie, ustawiamy +15
                    sessionAffinityDeltas[id] = (currentDelta === SCORE_LIKE) ? 0 : SCORE_LIKE;
                } else if (action === 'dislike') {
                    // Jeśli już było Dislike (-30), to zerujemy. Jeśli nie, ustawiamy -30
                    sessionAffinityDeltas[id] = (currentDelta === SCORE_DISLIKE) ? 0 : SCORE_DISLIKE;
                }
                updateVisuals();
            });
        });

        // Difficulty buttons - FIX TOGGLE OFF
        const diffBtns = card.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const wasSelected = btn.classList.contains('selected');

                // 1. Zawsze czyścimy zaznaczenie wszystkich w grupie
                diffBtns.forEach(b => b.classList.remove('selected'));

                // 2. Jeśli kliknięty przycisk NIE BYŁ zaznaczony, zaznaczamy go teraz.
                // Jeśli był, zostawiamy odznaczony (czyli stan "neutralny/0").
                if (!wasSelected) {
                    btn.classList.add('selected');
                }
            });
        });
    });

    // Usuwamy stare listenery i dodajemy nowy
    formContainer.removeEventListener('submit', handleSummarySubmit);
    formContainer.addEventListener('submit', handleSummarySubmit);

    navigateTo('summary');
};

export async function handleSummarySubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return; // Zapobieganie podwójnemu kliknięciu

    submitBtn.disabled = true;
    submitBtn.textContent = "Zapisywanie...";
    showLoader();

    const ratingsArray = [];
    const ratingCards = e.target.querySelectorAll('.rating-card');

    ratingCards.forEach(card => {
        const id = card.dataset.id;
        const delta = sessionAffinityDeltas[id];
        if (delta) {
            const action = delta === SCORE_LIKE ? 'like' : 'dislike';
            ratingsArray.push({ exerciseId: id, action: action });
        }
        const activeDiff = card.querySelector('.diff-btn.selected');
        if (activeDiff) {
            ratingsArray.push({ exerciseId: id, action: activeDiff.dataset.action });
        }
    });

    const now = new Date();
    const durationSeconds = Math.round(Math.max(0, now - state.sessionStartTime - (state.totalPausedTime || 0)) / 1000);

    let planId = state.settings.activePlanId;
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        planId = state.todaysDynamicPlan.id;
    } else if (state.settings.dynamicPlanData?.id) {
        planId = state.settings.dynamicPlanData.id;
    }

    const title = document.getElementById('summary-title').textContent;

    const sessionPayload = {
        sessionId: Date.now(),
        planId: planId,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: title,
        status: 'completed',
        feedback: selectedFeedback,
        exerciseRatings: ratingsArray,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime.toISOString(),
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    try {
        const response = await dataStore.saveSession(sessionPayload);
        clearSessionBackup();
        await dataStore.loadRecentHistory(7);
        if (state.todaysDynamicPlan?.type === 'protocol') state.todaysDynamicPlan = null;

        if (response?.newStats) state.userStats = { ...state.userStats, ...response.newStats };

        // --- FIX: MANUALNA INKREMENTACJA LICZNIKA FAZY ---
        const pm = state.settings.phase_manager;
        if (pm && !response?.phaseUpdate) {
            if (pm.override && pm.override.mode) {
                pm.override.stats.sessions_completed++;
            } else if (pm.current_phase_stats) {
                pm.current_phase_stats.sessions_completed++;
            }
        }
        // --- KONIEC FIX ---

        if (document.getElementById('strava-sync-checkbox')?.checked) dataStore.uploadToStrava(sessionPayload);

        state.currentTrainingDate = null;
        state.sessionLog = [];
        state.isPaused = false;

        // --- AKTUALIZACJA LOKALNEGO STANU PREFERENCJI ---
        
        // 1. Aktualizacja punktów Affinity
        Object.entries(sessionAffinityDeltas).forEach(([id, delta]) => {
            if (state.userPreferences[id]) {
                let s = state.userPreferences[id].score || 0;
                s = Math.max(-100, Math.min(100, s + delta));
                state.userPreferences[id].score = s;
            }
        });

        // 2. Aktualizacja flagi trudności (Difficulty)
        ratingsArray.forEach(r => {
            if (['easy', 'hard'].includes(r.action)) {
                if (!state.userPreferences[r.exerciseId]) state.userPreferences[r.exerciseId] = {};
                
                if (r.action === 'easy') state.userPreferences[r.exerciseId].difficulty = -1;
                else if (r.action === 'hard') state.userPreferences[r.exerciseId].difficulty = 1;
            }
        });

        const finalizeProcess = async () => {
            hideLoader();
            const { renderMainScreen } = await import('/ui/screens/dashboard.js');
            navigateTo('main');
            renderMainScreen();
        };

        const checkRpeAndNavigate = async () => {
            if (selectedFeedback.value !== 0) {
                let msg = '';
                if (selectedFeedback.value === -1) {
                    msg = "Zgłosiłeś, że trening był za ciężki/bolesny.\n\nCzy chcesz, aby Asystent przeliczył plan i zmniejszył obciążenie na kolejne dni?";
                } else if (selectedFeedback.value === 1) {
                    msg = "Zgłosiłeś, że trening był za lekki/nudny.\n\nCzy chcesz, aby Asystent zwiększył intensywność planu?";
                }

                if (msg && confirm(msg)) {
                    showLoader();
                    try {
                        console.log("[AutoReg] Triggering plan regeneration based on RPE...");
                        await dataStore.generateDynamicPlan(state.settings.wizardData);
                        clearPlanFromStorage();
                        alert("Plan został pomyślnie zaktualizowany przez Asystenta.");
                    } catch (e) {
                        console.error("[AutoReg] Failed:", e);
                        alert("Nie udało się przeliczyć planu automatycznie.");
                    }
                }
            }
            await finalizeProcess();
        };

        const checkPhaseTransition = () => {
            if (response && response.phaseUpdate) {
                if (state.settings.phase_manager) {
                    state.settings.phase_manager.current_phase_stats.phase_id = response.phaseUpdate.newPhaseId;
                    state.settings.phase_manager.current_phase_stats.sessions_completed = 0;
                    if (state.settings.phase_manager.override) {
                        state.settings.phase_manager.override.mode = null;
                    }
                }

                hideLoader();
                renderPhaseTransitionModal(response.phaseUpdate, () => {
                    checkRpeAndNavigate();
                });
            } else {
                checkRpeAndNavigate();
            }
        };

        if (response && response.adaptation) {
            hideLoader();
            renderEvolutionModal(response.adaptation, () => {
                checkPhaseTransition();
            });
        } else {
            checkPhaseTransition();
        }

    } catch (error) {
        console.error(error);
        hideLoader();
        alert("Błąd zapisu.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Zapisz i Zakończ";
    }
}
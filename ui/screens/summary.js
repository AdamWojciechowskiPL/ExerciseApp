// ExerciseApp/ui/screens/summary.js
import { state } from '../../state.js';
import { screens } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal, renderPhaseTransitionModal, renderRewardModal } from '../modals.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import { clearSessionBackup } from '../../sessionRecovery.js';
import { clearPlanFromStorage } from './dashboard.js';
import { workoutMixer } from '../../workoutMixer.js';
import { checkNewBadges } from '../../gamification.js';

let selectedFeedback = { type: null, value: 0 };
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
    sessionAffinityDeltas = {};

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

    // ZMIANA: Pobieramy listę płaską, bez sztucznego grupowania
    const completedLogs = (state.sessionLog || []).filter(l => l.status === 'completed' && !l.isRest);
    const hasData = completedLogs.length > 0;

    const renderLogs = (logs) => {
        return logs.map(ex => {
            const id = ex.exerciseId || ex.id;
            const pref = state.userPreferences[id] || { score: 0 };
            const baseScore = pref.score || 0;
            let displayName = ex.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

            let scoreColor = '#666';
            let scorePrefix = '';
            if (baseScore >= 75) { scoreColor = 'var(--gold-color)'; scorePrefix = '👑 '; }
            else if (baseScore > 0) { scoreColor = 'var(--success-color)'; scorePrefix = '+'; }
            else if (baseScore < 0) { scoreColor = 'var(--danger-color)'; }

            const setContext = ex.currentSet && ex.totalSets
                ? `<span class="set-context-badge">S ${ex.currentSet}/${ex.totalSets}</span>`
                : '';

            const deviationButtonsHtml = `
            <div class="difficulty-deviation-group">
                <button type="button" class="deviation-btn easy" data-type="easy" title="Za łatwe (RIR 4+)">⬆️ Łatwe</button>
                <button type="button" class="deviation-btn hard" data-type="hard" title="Za trudne (RIR 0-1)">⬇️ Trudne</button>
            </div>`;

            // Logika sugestii Dewolucji (jeśli było naprawdę ciężko - RIR 0 lub Walka)
            let devolutionHtml = '';
            const wasStruggle = (ex.rating === 'hard' || (ex.rir !== undefined && ex.rir <= 0));

            if (wasStruggle) {
                const easierVariant = workoutMixer.getEasierVariant(id);
                if (easierVariant) {
                    devolutionHtml = `
                    <div class="devolution-action">
                        <span style="font-size:0.75rem; color:var(--danger-color);">Zgłoszono walkę. Sugestia:</span>
                        <button type="button" class="devolution-btn" data-ex-id="${id}" data-target-id="${easierVariant.id}" data-target-name="${easierVariant.name}">
                            ⬇ Zmień na: ${easierVariant.name}
                        </button>
                    </div>`;
                }
            }

            return `
            <div class="rating-card" data-id="${id}" data-unique-id="${ex.uniqueId}" data-base-score="${baseScore}">
                <div class="rating-card-main">
                    <div class="rating-info">
                        <div class="rating-name">${displayName}</div>
                        <div class="rating-score-row">
                            ${setContext}
                            <span class="rating-score-display" style="font-weight:700; color:${scoreColor}; transition:color 0.2s;">
                                <span class="current-score-val">${scorePrefix}${baseScore}</span>
                            </span>
                        </div>
                    </div>

                    <div class="summary-actions-container">
                        ${deviationButtonsHtml}

                        <div class="btn-group-affinity">
                            <button type="button" class="rate-btn affinity-btn" data-action="like" title="Lubię to (+15 Affinity)">👍</button>
                            <button type="button" class="rate-btn affinity-btn" data-action="dislike" title="Nie lubię (-30 Affinity)">👎</button>
                        </div>
                    </div>
                </div>
                ${devolutionHtml}
            </div>
            `;
        }).join('');
    };

    let contentHtml = '';
    if (hasData) {
        contentHtml = `
            <div class="ratings-list">
                ${renderLogs(completedLogs)}
            </div>
        `;
    } else {
        contentHtml = '<p class="empty-state">Brak wykonanych ćwiczeń do oceny.</p>';
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
                <label style="display:block; margin-bottom:10px; font-weight:700;">${isSafetyMode ? "Samopoczucie po treningu" : "Ocena ogólna"}</label>
                <div class="feedback-container compact">${globalOptionsHtml}</div>
            </div>
            <div class="form-group" style="margin-top:1.5rem;">
                <label style="display:block; margin-bottom:5px; font-weight:700;">Raport Ćwiczeń</label>
                <p style="font-size:0.8rem; color:#666; margin-bottom:10px;">
                    Skoryguj trudność (Strzałki) lub oznacz ulubione/nielubiane (Kciuki).
                </p>
                ${contentHtml}
            </div>
            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki:</label>
                <textarea id="general-notes" rows="2" placeholder="Jak poszło?"></textarea>
            </div>
            ${stravaHtml}
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>
    `;

    // --- EVENT LISTENERS ---

    // 1. Feedback Global
    summaryScreen.querySelectorAll('.feedback-option').forEach(opt => {
        opt.addEventListener('click', () => {
            summaryScreen.querySelectorAll('.feedback-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    const formContainer = summaryScreen.querySelector('#summary-form');

    // 2. DEVIATION BUTTONS
    formContainer.addEventListener('click', (e) => {
        const deviationBtn = e.target.closest('.deviation-btn');
        if (deviationBtn) {
            e.preventDefault();
            e.stopPropagation();

            const container = deviationBtn.closest('.difficulty-deviation-group');
            const card = deviationBtn.closest('.rating-card');
            const uniqueId = card.dataset.uniqueId;
            const type = deviationBtn.dataset.type;
            const isActive = deviationBtn.classList.contains('active');

            const logEntry = state.sessionLog.find(l => l.uniqueId === uniqueId);
            if (!logEntry) return;

            if (isActive) {
                // Reset do stanu "OK"
                logEntry.tech = 9;
                logEntry.rir = 2;
                logEntry.rating = 'good';
                logEntry.inferred = true;
                logEntry.difficultyDeviation = null;
                container.querySelectorAll('.deviation-btn').forEach(btn => btn.classList.remove('active'));
            } else {
                let newTech, newRir, newRating;
                if (type === 'easy') { newTech = 10; newRir = 4; newRating = 'good'; }
                else if (type === 'hard') { newTech = 6; newRir = 0; newRating = 'hard'; }

                logEntry.tech = newTech;
                logEntry.rir = newRir;
                logEntry.rating = newRating;
                logEntry.inferred = false;
                logEntry.difficultyDeviation = type;

                container.querySelectorAll('.deviation-btn').forEach(btn => btn.classList.remove('active'));
                deviationBtn.classList.add('active');
            }
        }
    });

    // 3. Affinity Buttons
    formContainer.querySelectorAll('.rating-card').forEach(card => {
        const id = card.dataset.id;
        const baseScore = parseInt(card.dataset.baseScore, 10);
        const scoreDisplay = card.querySelector('.current-score-val');
        const scoreContainer = card.querySelector('.rating-score-display');

        const updateVisuals = () => {
            const delta = sessionAffinityDeltas[id] || 0;
            const newScore = Math.max(-100, Math.min(100, baseScore + delta));
            let color = '#666'; let prefix = '';
            if (newScore >= 75) { color = 'var(--gold-color)'; prefix = '👑 '; }
            else if (newScore > 0) { color = 'var(--success-color)'; prefix = '+'; }
            else if (newScore < 0) { color = 'var(--danger-color)'; }
            scoreDisplay.textContent = `${prefix}${newScore}`;
            scoreContainer.style.color = color;
            card.querySelectorAll('.affinity-btn').forEach(btn => btn.classList.remove('active'));
            if (delta === SCORE_LIKE) card.querySelector('[data-action="like"]').classList.add('active');
            if (delta === SCORE_DISLIKE) card.querySelector('[data-action="dislike"]').classList.add('active');
        };

        card.querySelectorAll('.affinity-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const currentDelta = sessionAffinityDeltas[id] || 0;
                if (action === 'like') sessionAffinityDeltas[id] = (currentDelta === SCORE_LIKE) ? 0 : SCORE_LIKE;
                else if (action === 'dislike') sessionAffinityDeltas[id] = (currentDelta === SCORE_DISLIKE) ? 0 : SCORE_DISLIKE;
                updateVisuals();
            });
        });
    });

    // 4. Devolution Buttons
    formContainer.querySelectorAll('.devolution-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (btn.disabled) return;

            const targetName = btn.dataset.targetName;

            if (confirm(`Czy na pewno chcesz na stałe zamienić to ćwiczenie na łatwiejsze: "${targetName}"?`)) {
                btn.classList.add('pending-devolution');
                btn.textContent = `✅ Zmieniono na: ${targetName}`;
                btn.style.backgroundColor = "#f0fdf4";
                btn.style.borderColor = "#bbf7d0";
                btn.style.color = "#166534";
                btn.disabled = true;
            }
        });
    });

    formContainer.removeEventListener('submit', handleSummarySubmit);
    formContainer.addEventListener('submit', handleSummarySubmit);

    navigateTo('summary');
};

export async function handleSummarySubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

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

        const devBtn = card.querySelector('.devolution-btn.pending-devolution');
        if (devBtn) {
            ratingsArray.push({ exerciseId: id, action: 'hard' });
        }
    });

    if (state.sessionLog) {
        state.sessionLog.forEach(entry => {
            if (entry.status === 'completed' && !entry.isRest) {
                if (entry.rir === undefined || entry.rir === null) {
                    entry.rir = 2;
                    entry.tech = 9;
                    entry.rating = 'good';
                    entry.inferred = true;
                }
            }
        });
    }

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

        const oldStats = { ...state.userStats };

        if (response?.newStats) state.userStats = { ...state.userStats, ...response.newStats };

        const pm = state.settings.phase_manager;
        if (pm && !response?.phaseUpdate) {
            if (pm.override && pm.override.mode) {
                pm.override.stats.sessions_completed++;
            } else if (pm.current_phase_stats) {
                pm.current_phase_stats.sessions_completed++;
            }
        }

        if (document.getElementById('strava-sync-checkbox')?.checked) dataStore.uploadToStrava(sessionPayload);

        state.currentTrainingDate = null;
        state.sessionLog = [];
        state.isPaused = false;

        Object.entries(sessionAffinityDeltas).forEach(([id, delta]) => {
            if (state.userPreferences[id]) {
                let s = state.userPreferences[id].score || 0;
                s = Math.max(-100, Math.min(100, s + delta));
                state.userPreferences[id].score = s;
            }
        });

        ratingsArray.forEach(r => {
            if (r.action === 'hard') {
                if (!state.userPreferences[r.exerciseId]) state.userPreferences[r.exerciseId] = {};
                state.userPreferences[r.exerciseId].difficulty = 1;
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
                if (selectedFeedback.value === -1) msg = "Zgłosiłeś, że trening był za ciężki/bolesny.\n\nCzy chcesz, aby Asystent przeliczył plan i zmniejszył obciążenie na kolejne dni?";
                else if (selectedFeedback.value === 1) msg = "Zgłosiłeś, że trening był za lekki/nudny.\n\nCzy chcesz, aby Asystent zwiększył intensywność planu?";

                if (msg && confirm(msg)) {
                    showLoader();
                    try {
                        await dataStore.generateDynamicPlan(state.settings.wizardData);
                        clearPlanFromStorage();
                        alert("Plan został pomyślnie zaktualizowany przez Asystenta.");
                    } catch (e) { console.error("[AutoReg] Failed:", e); }
                }
            }
            await finalizeProcess();
        };

        const checkAchievements = async () => {
            const unlockedBadges = checkNewBadges(oldStats, state.userStats);
            if (unlockedBadges.length > 0) {
                for (const badge of unlockedBadges) {
                    await new Promise(resolve => {
                        renderRewardModal(badge, resolve);
                    });
                }
            }
        };

        const checkPhaseTransition = async () => {
            if (response && response.phaseUpdate) {
                if (state.settings.phase_manager) {
                    state.settings.phase_manager.current_phase_stats.phase_id = response.phaseUpdate.newPhaseId;
                    state.settings.phase_manager.current_phase_stats.sessions_completed = 0;
                    if (state.settings.phase_manager.override) state.settings.phase_manager.override.mode = null;
                }
                hideLoader();
                await new Promise(resolve => renderPhaseTransitionModal(response.phaseUpdate, resolve));
            } else {
                hideLoader();
            }

            await checkAchievements();
            checkRpeAndNavigate();
        };

        if (response && response.adaptation) {
            hideLoader();
            renderEvolutionModal(response.adaptation, () => checkPhaseTransition());
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
import { state } from '../../state.js';
import { screens } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal, renderPhaseTransitionModal, renderRewardModal } from '../modals.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import { clearSessionBackup } from '../../sessionRecovery.js';
import { clearPlanFromStorage } from './dashboard.js';
import { checkNewBadges } from '../../gamification.js';
import { mapDifficultySelectionToRating, buildExerciseDifficultyRatingsPayload } from '../../shared/exercise-difficulty-rating.mjs';
import { buildExerciseRatingsPayload } from '../../shared/summary-feedback-payload.mjs';

let selectedFeedback = {
    type: 'pain_monitoring',
    schema_version: 1,
    during: { max_nprs: 0, locations: [] },
    note: ''
};
let sessionAffinityDeltas = {};
let sessionDifficultyRatings = {};
const SCORE_LIKE = 15;
const SCORE_DISLIKE = -30;


const renderPainFollowUp24hModal = () => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:540px;">
                <h3 style="margin-bottom:6px;">Check-in po 24h</h3>
                <p style="opacity:0.75; margin-top:0; font-size:0.9rem;">
                    Aby domknąć monitoring po sesji, uzupełnij teraz krótkie dane follow-up.
                </p>
                <form id="pain-24h-form-summary" class="settings-form">
                    <div class="form-group">
                        <label for="after24h-max-nprs-summary" style="display:flex; justify-content:space-between; font-weight:700;">
                            <span>Maksymalne nasilenie objawów po 24h (NPRS)</span>
                            <strong id="after24h-max-nprs-summary-value">0</strong>
                        </label>
                        <input type="range" id="after24h-max-nprs-summary" min="0" max="10" value="0" style="width:100%;">
                    </div>
                    <div class="form-group">
                        <label for="after24h-delta-summary">Zmiana vs baseline (-10 do 10)</label>
                        <input id="after24h-delta-summary" type="number" min="-10" max="10" step="1" value="0" required>
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">
                        <label class="checkbox-label"><input type="checkbox" id="after24h-stiffness-summary"> Sztywność wzrosła</label>
                        <label class="checkbox-label"><input type="checkbox" id="after24h-swelling-summary"> Obrzęk</label>
                        <label class="checkbox-label"><input type="checkbox" id="after24h-night-pain-summary"> Ból nocny</label>
                        <label class="checkbox-label"><input type="checkbox" id="after24h-neuro-summary"> Objawy neuro red flags</label>
                    </div>
                    <div class="form-group">
                        <label for="after24h-note-summary">Notatka (opcjonalnie)</label>
                        <textarea id="after24h-note-summary" rows="2" maxlength="200" placeholder="Co się zmieniło po 24h?"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:1rem;">
                        <button type="button" class="action-btn secondary" id="skip-24h-summary-btn">Później</button>
                        <button type="submit" class="action-btn" id="save-24h-summary-btn">Zapisz check-in</button>
                    </div>
                </form>
            </div>
        `;

        const close = () => {
            overlay.remove();
            resolve({ skipped: true });
        };

        const slider = overlay.querySelector('#after24h-max-nprs-summary');
        const sliderLabel = overlay.querySelector('#after24h-max-nprs-summary-value');
        slider.addEventListener('input', () => {
            sliderLabel.textContent = slider.value;
        });

        overlay.querySelector('#skip-24h-summary-btn').addEventListener('click', close);

        overlay.querySelector('#pain-24h-form-summary').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const after24h = {
                max_nprs: parseInt(slider.value, 10) || 0,
                delta_vs_baseline: parseInt(overlay.querySelector('#after24h-delta-summary').value, 10) || 0,
                stiffness_increased: !!overlay.querySelector('#after24h-stiffness-summary').checked,
                swelling: !!overlay.querySelector('#after24h-swelling-summary').checked,
                night_pain: !!overlay.querySelector('#after24h-night-pain-summary').checked,
                neuro_red_flags: !!overlay.querySelector('#after24h-neuro-summary').checked,
            };
            const note = overlay.querySelector('#after24h-note-summary').value || '';
            overlay.remove();
            resolve({ skipped: false, after24h, note });
        });

        document.body.appendChild(overlay);
    });
};

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

    const initialPain = isSafetyMode ? 2 : 0;
    selectedFeedback = {
        type: 'pain_monitoring',
        schema_version: 1,
        during: { max_nprs: initialPain, locations: [] },
        note: ''
    };
    sessionAffinityDeltas = {};
    sessionDifficultyRatings = {};

    const summaryScreen = screens.summary;

    let globalOptionsHtml = `
        <div class="feedback-option ${isSafetyMode ? '' : 'selected'}" data-pain="0"><div class="fb-icon">🙂</div><div class="fb-text"><h4>Bez bólu</h4></div></div>
        <div class="feedback-option ${isSafetyMode ? 'selected' : ''}" data-pain="3"><div class="fb-icon">⚖️</div><div class="fb-text"><h4>Lekki ból</h4></div></div>
        <div class="feedback-option" data-pain="6"><div class="fb-icon">⚠️</div><div class="fb-text"><h4>Umiarkowany</h4></div></div>
        <div class="feedback-option" data-pain="8"><div class="fb-icon">🚨</div><div class="fb-text"><h4>Silny ból</h4></div></div>
    `;

    const completedLogs = (state.sessionLog || []).filter(l => l.status === 'completed' && !l.isRest);
    const hasData = completedLogs.length > 0;

    // --- GRUPOWANIE SERII PO ĆWICZENIU ---
    const groupedExercises = completedLogs.reduce((acc, log) => {
        const id = log.exerciseId || log.id;
        if (!acc[id]) {
            acc[id] = {
                ...log, // Kopiujemy dane ogólne z pierwszej napotkanej serii
                sets: []
            };
        }
        acc[id].sets.push(log);
        return acc;
    }, {});

    const groupedArray = Object.values(groupedExercises);

    const renderLogs = (exercises) => {
        return exercises.map(ex => {
            const id = ex.exerciseId || ex.id;
            const pref = state.userPreferences[id] || { score: 0 };
            const baseScore = pref.score || 0;
            let displayName = ex.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

            let scoreColor = '#666';
            let scorePrefix = '';
            if (baseScore >= 75) { scoreColor = 'var(--gold-color)'; scorePrefix = '👑 '; }
            else if (baseScore > 0) { scoreColor = 'var(--success-color)'; scorePrefix = '+'; }
            else if (baseScore < 0) { scoreColor = 'var(--danger-color)'; }

            const deviationButtonsHtml = `
            <div class="difficulty-deviation-group">
                <button type="button" class="deviation-btn easy" data-type="easy" title="Za łatwe (RIR 4+)">⬆️ Łatwe</button>
                <button type="button" class="deviation-btn hard" data-type="hard" title="Za trudne (RIR 0-1)">⬇️ Trudne</button>
            </div>`;

            // --- GENEROWANIE TABELI SERII ---
            const setsHtml = ex.sets.map((setLog, index) => {
                const duration = setLog.duration || 0;
                let timeStr = '-';
                if (duration > 0) {
                    const m = Math.floor(duration / 60);
                    const s = duration % 60;
                    timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
                }
                const isUnilateral = setLog.name.includes('(Lewa)') || setLog.name.includes('(Prawa)');
                const setLabel = isUnilateral 
                    ? (setLog.name.includes('Lewa') ? 'L' : 'P')
                    : (index + 1);

                return `
                    <div class="set-row">
                        <div class="set-cell num">${setLabel}</div>
                        <div class="set-cell target">${setLog.reps_or_time}</div>
                        <div class="set-cell time">${timeStr}</div>
                    </div>
                `;
            }).join('');

            return `
            <div class="rating-card" data-id="${id}" data-unique-id="${ex.uniqueId}" data-base-score="${baseScore}">
                <div class="rating-card-main">
                    <div class="rating-info">
                        <div class="rating-name">${displayName}</div>
                        <div class="rating-score-row">
                            <span class="rating-score-display" style="font-weight:700; color:${scoreColor}; transition:color 0.2s;">
                                <span class="current-score-val">${scorePrefix}${baseScore}</span>
                            </span>
                            <span style="font-size:0.7rem; color:#94a3b8; margin-left:6px;">
                                ${ex.sets.length} ${ex.sets.length === 1 ? 'seria' : (ex.sets.length < 5 ? 'serie' : 'serii')}
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
                
                <!-- NOWA SEKCJA STATYSTYK -->
                <div class="set-breakdown-container">
                    ${setsHtml}
                </div>
            </div>
            `;
        }).join('');
    };

    let contentHtml = '';
    if (hasData) {
        contentHtml = `
            <div class="ratings-list">
                ${renderLogs(groupedArray)}
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
                <div style="margin-top:10px;">
                    <label for="during-max-nprs" style="font-size:0.85rem; display:flex; justify-content:space-between;">
                        <span>Maksymalne nasilenie objawów podczas sesji (NPRS)</span>
                        <strong id="during-max-nprs-value">${selectedFeedback.during.max_nprs}</strong>
                    </label>
                    <input type="range" id="during-max-nprs" min="0" max="10" value="${selectedFeedback.during.max_nprs}" style="width:100%;">
                </div>
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

    summaryScreen.querySelectorAll('.feedback-option').forEach(opt => {
        opt.addEventListener('click', () => {
            summaryScreen.querySelectorAll('.feedback-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const mappedPain = parseInt(opt.dataset.pain, 10);
            if (Number.isFinite(mappedPain)) {
                selectedFeedback.during.max_nprs = mappedPain;
                const slider = summaryScreen.querySelector('#during-max-nprs');
                const valLabel = summaryScreen.querySelector('#during-max-nprs-value');
                if (slider) slider.value = String(mappedPain);
                if (valLabel) valLabel.textContent = String(mappedPain);
            }
        });
    });

    const duringPainSlider = summaryScreen.querySelector('#during-max-nprs');
    const duringPainLabel = summaryScreen.querySelector('#during-max-nprs-value');
    if (duringPainSlider && duringPainLabel) {
        duringPainSlider.addEventListener('input', (ev) => {
            const val = parseInt(ev.target.value, 10) || 0;
            selectedFeedback.during.max_nprs = val;
            duringPainLabel.textContent = String(val);
        });
    }

    const formContainer = summaryScreen.querySelector('#summary-form');

    formContainer.addEventListener('click', (e) => {
        const deviationBtn = e.target.closest('.deviation-btn');
        if (deviationBtn) {
            e.preventDefault();
            e.stopPropagation();

            const container = deviationBtn.closest('.difficulty-deviation-group');
            const card = deviationBtn.closest('.rating-card');
            // Zmieniamy pobieranie ID: interesuje nas exerciseId dla wszystkich serii
            const exerciseId = card.dataset.id;
            const type = deviationBtn.dataset.type;
            const isActive = deviationBtn.classList.contains('active');

            // Znajdź WSZYSTKIE logi dla tego ćwiczenia w sesji
            const logEntries = state.sessionLog.filter(l => (l.exerciseId === exerciseId || l.id === exerciseId) && l.status === 'completed');
            if (logEntries.length === 0) return;

            if (isActive) {
                // Resetuj wszystkie serie
                logEntries.forEach(logEntry => {
                    logEntry.tech = 9;
                    logEntry.rir = 2;
                    logEntry.rating = 'good';
                    logEntry.inferred = true;
                    logEntry.difficultyDeviation = null;
                });
                sessionDifficultyRatings[exerciseId] = mapDifficultySelectionToRating(null);
                container.querySelectorAll('.deviation-btn').forEach(btn => btn.classList.remove('active'));
            } else {
                // Ustaw odchylenie dla wszystkich serii
                let newTech, newRir, newRating;
                if (type === 'easy') { newTech = 10; newRir = 4; newRating = 'good'; }
                else if (type === 'hard') { newTech = 6; newRir = 0; newRating = 'hard'; }

                logEntries.forEach(logEntry => {
                    logEntry.tech = newTech;
                    logEntry.rir = newRir;
                    logEntry.rating = newRating;
                    logEntry.inferred = false;
                    logEntry.difficultyDeviation = type;
                });

                sessionDifficultyRatings[exerciseId] = mapDifficultySelectionToRating(type);

                container.querySelectorAll('.deviation-btn').forEach(btn => btn.classList.remove('active'));
                deviationBtn.classList.add('active');
            }
        }
    });

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

    const ratingCards = e.target.querySelectorAll('.rating-card');
    const exerciseIds = Array.from(ratingCards).map(card => card.dataset.id);
    const ratingsArray = buildExerciseRatingsPayload(sessionAffinityDeltas, exerciseIds);
    const difficultyRatingsArray = buildExerciseDifficultyRatingsPayload(sessionDifficultyRatings);

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

    selectedFeedback.note = document.getElementById('general-notes').value || '';

    const sessionPayload = {
        sessionId: Date.now(),
        planId: planId,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: title,
        status: 'completed',
        feedback: selectedFeedback,
        exerciseRatings: ratingsArray,
        exerciseDifficultyRatings: difficultyRatingsArray,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime.toISOString(),
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    try {
        const response = await dataStore.saveSession(sessionPayload);
        clearSessionBackup();

        const shouldPrompt24hFollowUp = (selectedFeedback?.during?.max_nprs || 0) > 0;
        if (shouldPrompt24hFollowUp) {
            const followUpResult = await renderPainFollowUp24hModal();
            if (!followUpResult.skipped) {
                await dataStore.patchSessionFeedback24h(sessionPayload.sessionId, followUpResult.after24h, followUpResult.note || '');
                selectedFeedback.after24h = { ...followUpResult.after24h, updated_at: new Date().toISOString() };
                if (followUpResult.note) {
                    selectedFeedback.note = (selectedFeedback.note ? selectedFeedback.note + "\n[24h]: " : "[24h]: ") + followUpResult.note;
                }
                alert('Check-in po 24h został zapisany. Dziękujemy!');
            }
        }

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

        difficultyRatingsArray.forEach(r => {
            if (!state.userPreferences[r.exerciseId]) state.userPreferences[r.exerciseId] = {};
            state.userPreferences[r.exerciseId].difficulty = r.difficultyRating;
            state.userPreferences[r.exerciseId].difficultyRating = r.difficultyRating;
        });

        const finalizeProcess = async () => {
            hideLoader();
            const { renderMainScreen } = await import('/ui/screens/dashboard.js');
            navigateTo('main');
            renderMainScreen();
        };

        const checkRpeAndNavigate = async () => {
            if ((selectedFeedback?.during?.max_nprs || 0) !== 0) {
                let msg = '';
                if ((selectedFeedback?.during?.max_nprs || 0) >= 6) msg = "Zgłosiłeś podwyższony ból po sesji.\n\nCzy chcesz, aby Asystent przeliczył plan i zmniejszył obciążenie na kolejne dni?";
                else if ((selectedFeedback?.during?.max_nprs || 0) <= 1) msg = "Sesja była bardzo lekka bólowo.\n\nCzy chcesz, aby Asystent zwiększył intensywność planu?";

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

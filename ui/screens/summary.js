// ExerciseApp/ui/screens/summary.js
import { state } from '/state.js';
import { screens } from '/dom.js';
import { navigateTo, showLoader, hideLoader } from '/ui/core.js';
import dataStore from '/dataStore.js';
import { renderEvolutionModal } from '/ui/modals.js';
import { getIsCasting, sendShowIdle } from '/cast.js';
import { clearSessionBackup } from '/sessionRecovery.js';
import { clearPlanFromStorage } from '/ui/screens/dashboard.js';

let selectedFeedback = { type: null, value: 0 };

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

            let displayName = ex.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

            const isLike = pref.score >= 50 ? 'active' : '';
            const isDislike = pref.score <= -50 ? 'active' : '';

            return `
            <div class="rating-card" data-id="${id}">
                <div class="rating-name">${displayName}</div>
                <div class="rating-actions-group">
                    <div class="btn-group-affinity">
                        <button type="button" class="rate-btn affinity-btn ${isLike}" data-action="like" title="Róbmy to częściej">👍</button>
                        <button type="button" class="rate-btn affinity-btn ${isDislike}" data-action="dislike" title="Róbmy to rzadziej">👎</button>
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
                <label style="display:block; margin-bottom:5px; font-weight:700;">Kalibracja Ćwiczeń</label>
                <div style="display:flex; justify-content: flex-end; padding-right: 4px; margin-bottom: 6px;">
                    <div style="display:flex; gap: 10px; font-size: 0.6rem; color: #888; font-weight: 700; text-transform: uppercase;">
                        <span style="width: 82px; text-align: center;">Częstotliwość</span>
                        <span style="width: 82px; text-align: center;">Trudność</span>
                    </div>
                </div>
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

    summaryScreen.querySelectorAll('.feedback-option').forEach(opt => {
        opt.addEventListener('click', () => {
            summaryScreen.querySelectorAll('.feedback-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    summaryScreen.querySelectorAll('.rating-card').forEach(card => {
        const affinityBtns = card.querySelectorAll('.affinity-btn');
        affinityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const isActive = btn.classList.contains('active');
                affinityBtns.forEach(b => b.classList.remove('active'));
                if (!isActive) btn.classList.add('active');
            });
        });

        const diffBtns = card.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                diffBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                btn.title = "Zgłoszono zmianę";
            });
        });
    });

    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    navigateTo('summary');
};

export async function handleSummarySubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Zapisywanie..."; }
    showLoader();

    const ratingsArray = [];
    const ratingCards = document.querySelectorAll('.rating-card');
    ratingCards.forEach(card => {
        const id = card.dataset.id;
        const activeAffinity = card.querySelector('.affinity-btn.active');
        ratingsArray.push({ exerciseId: id, action: activeAffinity ? activeAffinity.dataset.action : 'neutral' });
        const activeDiff = card.querySelector('.diff-btn.selected');
        if (activeDiff) ratingsArray.push({ exerciseId: id, action: activeDiff.dataset.action });
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
        if (document.getElementById('strava-sync-checkbox')?.checked) dataStore.uploadToStrava(sessionPayload);

        state.currentTrainingDate = null;
        state.sessionLog = [];
        state.isPaused = false;

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
                        alert("Nie udało się przeliczyć planu automatycznie. Zmiany nie zostały wprowadzone.");
                    }
                }
            }
            await finalizeProcess();
        };

        if (response && response.adaptation) {
            hideLoader();
            renderEvolutionModal(response.adaptation, () => {
                checkRpeAndNavigate();
            });
        } else {
            await checkRpeAndNavigate();
        }

    } catch (error) {
        console.error(error);
        hideLoader();
        alert("Błąd zapisu.");
        submitBtn.disabled = false;
    }
}
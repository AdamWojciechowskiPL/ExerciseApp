// js/ui/screens/summary.js
import { state } from '../../state.js';
import { screens } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal } from '../modals.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import { clearSessionBackup } from '../../sessionRecovery.js';

let selectedFeedback = { type: null, value: 0 };

export const renderSummaryScreen = () => {
    if (getIsCasting()) sendShowIdle();

    // 1. Wykrywanie właściwego planu (Dynamic vs Static)
    let activePlan = null;
    const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);

    if (isDynamicMode && state.settings.dynamicPlanData) {
        activePlan = state.settings.dynamicPlanData;
    } else {
        activePlan = state.trainingPlans[state.settings.activePlanId];
    }

    if (!activePlan) return;

    // 2. Pobieranie dnia (obsługa różnic w strukturze Days/days)
    const daysList = activePlan.Days || activePlan.days || [];
    const trainingDay = daysList.find(d => d.dayNumber === state.currentTrainingDayId);

    if (!trainingDay) return;

    const initialPain = state.sessionParams.initialPainLevel || 0;
    const isSafetyMode = initialPain > 3;

    const summaryScreen = screens.summary;
    summaryScreen.innerHTML = '';

    let feedbackHtml = '';
    let questionTitle = '';

    if (isSafetyMode) {
        questionTitle = "Zaczynaliśmy z bólem. Jak czujesz się teraz?";
        selectedFeedback.type = 'symptom';
        feedbackHtml = `
            <div class="feedback-option" data-type="symptom" data-value="1">
                <div class="fb-icon">🍃</div>
                <div class="fb-text"><h4>Ulga</h4><p>Czuję się luźniej / mniej boli</p></div>
            </div>
            <div class="feedback-option selected" data-type="symptom" data-value="0">
                <div class="fb-icon">⚖️</div>
                <div class="fb-text"><h4>Bez zmian</h4><p>Stabilnie, ból nie wzrósł</p></div>
            </div>
            <div class="feedback-option" data-type="symptom" data-value="-1">
                <div class="fb-icon">⚡</div>
                <div class="fb-text"><h4>Podrażnienie</h4><p>Ból się nasilił lub rozlał</p></div>
            </div>
        `;
    } else {
        questionTitle = "Jak oceniasz trudność (Stabilność)?";
        selectedFeedback.type = 'tension';
        feedbackHtml = `
            <div class="feedback-option" data-type="tension" data-value="1">
                <div class="fb-icon">🥱</div>
                <div class="fb-text"><h4>Luźna Lina</h4><p>Za łatwo. Nuda. 0 zmęczenia.</p></div>
            </div>
            <div class="feedback-option selected" data-type="tension" data-value="0">
                <div class="fb-icon">🏹</div>
                <div class="fb-text"><h4>Napięta Cięciwa</h4><p>Idealnie. Ciężko, ale technicznie.</p></div>
            </div>
            <div class="feedback-option" data-type="tension" data-value="-1">
                <div class="fb-icon">🧶</div>
                <div class="fb-text"><h4>Strzępiąca się</h4><p>Utrata techniki. Drżenie mięśni.</p></div>
            </div>
        `;
    }

    let stravaHtml = '';
    if (state.stravaIntegration.isConnected) {
        stravaHtml = `
            <div class="form-group strava-sync-container" style="margin-top:1rem;">
                <label class="checkbox-label" for="strava-sync-checkbox" style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" id="strava-sync-checkbox" checked style="width:20px; height:20px;">
                    <span>Wyślij do Strava</span>
                </label>
            </div>
        `;
    }

    summaryScreen.innerHTML = `
        <h2 id="summary-title" style="margin-bottom:0.5rem">Podsumowanie</h2>
        <p style="opacity:0.7; margin-bottom:1.5rem">Trening: ${trainingDay.title}</p>
        
        <form id="summary-form">
            <div class="form-group">
                <label style="display:block; margin-bottom:10px; font-weight:700;">${questionTitle}</label>
                <div class="feedback-container">
                    ${feedbackHtml}
                </div>
            </div>

            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki (opcjonalne):</label>
                <textarea id="general-notes" rows="3" placeholder="Coś jeszcze chcesz dodać?"></textarea>
            </div>

            ${stravaHtml}
            
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>
    `;

    const options = summaryScreen.querySelectorAll('.feedback-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    navigateTo('summary');
};

export async function handleSummarySubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Zapisywanie...";
    }

    showLoader();

    const now = new Date();
    const stravaCheckbox = document.getElementById('strava-sync-checkbox');

    const rawDuration = now - state.sessionStartTime;
    const netDuration = Math.max(0, rawDuration - (state.totalPausedTime || 0));
    const durationSeconds = Math.round(netDuration / 1000);

    // 1. LOGIKA WYBORU PLANU (FIX DLA DYNAMICZNEGO)
    const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);

    let planIdToSave = state.settings.activePlanId;
    let trainingTitle = "Trening";

    if (isDynamicMode && state.settings.dynamicPlanData) {
        planIdToSave = state.settings.dynamicPlanData.id;
        const days = state.settings.dynamicPlanData.days || [];
        const day = days.find(d => d.dayNumber === state.currentTrainingDayId);
        if (day) trainingTitle = day.title;
    } else {
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        if (activePlan) {
            const day = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
            if (day) trainingTitle = day.title;
        }
    }

    const sessionPayload = {
        sessionId: Date.now(),
        planId: planIdToSave,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingTitle,
        status: 'completed',
        feedback: selectedFeedback,
        pain_during: selectedFeedback.type === 'symptom' && selectedFeedback.value === -1 ? 5 : 0,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime ? state.sessionStartTime.toISOString() : now.toISOString(),
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    try {
        const response = await dataStore.saveSession(sessionPayload);

        // Wyczyść backup sesji po udanym zapisie
        clearSessionBackup();

        await dataStore.loadRecentHistory(7);

        if (response && response.newStats) {
            state.userStats = { ...state.userStats, ...response.newStats };
        } else {
            if (!state.userStats) state.userStats = { totalSessions: 0, streak: 0 };
            state.userStats.totalSessions = (parseInt(state.userStats.totalSessions) || 0) + 1;
        }

        if (stravaCheckbox && stravaCheckbox.checked) {
            dataStore.uploadToStrava(sessionPayload);
        }

        state.currentTrainingDate = null;
        state.currentTrainingDayId = null;
        state.sessionLog = [];
        state.sessionStartTime = null;
        state.totalPausedTime = 0;
        state.isPaused = false;

        hideLoader();

        const { renderMainScreen } = await import('./dashboard.js');

        if (response && response.adaptation) {
            renderEvolutionModal(response.adaptation, () => {
                navigateTo('main');
                renderMainScreen();
            });
        } else {
            navigateTo('main');
            renderMainScreen();
        }

    } catch (error) {
        console.error("Błąd zapisu sesji:", error);
        hideLoader();
        alert("Błąd zapisu. Sprawdź połączenie.");

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Spróbuj ponownie";
        }
    }
}
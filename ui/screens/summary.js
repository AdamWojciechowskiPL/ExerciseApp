// js/ui/screens/summary.js
import { state } from '../../state.js';
import { screens } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal } from '../modals.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import { clearSessionBackup } from '../../sessionRecovery.js';

let selectedFeedback = { type: null, value: 0 };
let exerciseRatings = {}; // Mapa: exerciseId -> { action: 'like'|'dislike'|'hard'|'easy' }

export const renderSummaryScreen = () => {
    if (getIsCasting()) sendShowIdle();

    // 1. Ustalanie Planu
    let activePlan = null;
    const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);
    if (isDynamicMode && state.settings.dynamicPlanData) {
        activePlan = state.settings.dynamicPlanData;
    } else {
        activePlan = state.trainingPlans[state.settings.activePlanId];
    }
    if (!activePlan) return;

    const daysList = activePlan.Days || activePlan.days || [];
    const trainingDay = daysList.find(d => d.dayNumber === state.currentTrainingDayId);
    if (!trainingDay) return;

    const initialPain = state.sessionParams.initialPainLevel || 0;
    const isSafetyMode = initialPain > 3;

    // 2. Reset stanu ocen
    exerciseRatings = {};
    selectedFeedback = { type: isSafetyMode ? 'symptom' : 'tension', value: 0 };

    const summaryScreen = screens.summary;
    summaryScreen.innerHTML = '';

    // 3. Budowa Sekcji Globalnej (Bez zmian logicznych, tylko UI)
    let globalQuestion = isSafetyMode ? "Jak czuje się Twoje ciało?" : "Jak oceniasz trudność?";
    let globalOptionsHtml = '';

    if (isSafetyMode) {
        globalOptionsHtml = `
            <div class="feedback-option" data-type="symptom" data-value="1"><div class="fb-icon">🍃</div><div class="fb-text"><h4>Ulga</h4></div></div>
            <div class="feedback-option selected" data-type="symptom" data-value="0"><div class="fb-icon">⚖️</div><div class="fb-text"><h4>Stabilnie</h4></div></div>
            <div class="feedback-option" data-type="symptom" data-value="-1"><div class="fb-icon">⚡</div><div class="fb-text"><h4>Gorzej</h4></div></div>
        `;
    } else {
        globalOptionsHtml = `
            <div class="feedback-option" data-type="tension" data-value="1"><div class="fb-icon">🥱</div><div class="fb-text"><h4>Nuda</h4></div></div>
            <div class="feedback-option selected" data-type="tension" data-value="0"><div class="fb-icon">🎯</div><div class="fb-text"><h4>Idealnie</h4></div></div>
            <div class="feedback-option" data-type="tension" data-value="-1"><div class="fb-icon">🥵</div><div class="fb-text"><h4>Za mocno</h4></div></div>
        `;
    }

    // 4. Budowa Listy Ćwiczeń (Nowość!)
    // Filtrujemy unikalne ćwiczenia wykonane (nie pominięte, nie przerwy)
    const processedIds = new Set();
    const uniqueExercises = state.sessionLog.filter(entry => {
        if (entry.isRest || entry.status === 'skipped') return false;
        if (processedIds.has(entry.exerciseId)) return false;
        processedIds.add(entry.exerciseId);
        return true;
    });

    const exercisesListHtml = uniqueExercises.map(ex => `
        <div class="rating-card" data-id="${ex.exerciseId}">
            <div class="rating-name">${ex.name}</div>
            <div class="rating-actions">
                <button type="button" class="rate-btn" data-action="like">👍</button>
                <button type="button" class="rate-btn" data-action="dislike">👎</button>
                <div class="sep"></div>
                <button type="button" class="rate-btn" data-action="easy" title="Za łatwe">💤</button>
                <button type="button" class="rate-btn" data-action="hard" title="Za trudne">🔥</button>
            </div>
        </div>
    `).join('');

    // 5. Strava Toggle
    let stravaHtml = '';
    if (state.stravaIntegration.isConnected) {
        stravaHtml = `<div class="form-group strava-sync-container" style="margin-top:1rem;"><label class="checkbox-label" for="strava-sync-checkbox" style="display:flex; align-items:center; gap:10px;"><input type="checkbox" id="strava-sync-checkbox" checked style="width:20px; height:20px;"><span>Wyślij do Strava</span></label></div>`;
    }

    // 6. Finalny HTML
    summaryScreen.innerHTML = `
        <h2 id="summary-title" style="margin-bottom:0.5rem">Podsumowanie</h2>
        
        <form id="summary-form">
            <!-- Global Feedback -->
            <div class="form-group">
                <label style="display:block; margin-bottom:10px; font-weight:700;">${globalQuestion}</label>
                <div class="feedback-container compact">${globalOptionsHtml}</div>
            </div>

            <!-- Exercise Ratings -->
            <div class="form-group" style="margin-top:1.5rem;">
                <label style="display:block; margin-bottom:10px; font-weight:700;">Oceń Ćwiczenia (Opcjonalne)</label>
                <p style="font-size:0.8rem; opacity:0.7; margin-top:-5px; margin-bottom:10px;">Kliknij tylko te, które chcesz zmienić.</p>
                <div class="ratings-list">
                    ${exercisesListHtml}
                </div>
            </div>

            <!-- Notes -->
            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki:</label>
                <textarea id="general-notes" rows="2" placeholder="Uwagi..."></textarea>
            </div>

            ${stravaHtml}
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>

        <style>
            .feedback-container.compact { gap: 8px; }
            .feedback-container.compact .feedback-option { padding: 10px; }
            
            .ratings-list { display: flex; flex-direction: column; gap: 8px; }
            .rating-card { background: #fff; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center; }
            .rating-name { font-size: 0.9rem; font-weight: 600; max-width: 50%; }
            .rating-actions { display: flex; gap: 5px; align-items: center; }
            
            .rate-btn { 
                background: #f3f4f6; border: 1px solid transparent; border-radius: 6px; 
                width: 36px; height: 36px; font-size: 1.2rem; cursor: pointer; transition: all 0.2s;
                display: flex; align-items: center; justify-content: center;
            }
            .rate-btn:hover { background: #e5e7eb; }
            
            .rate-btn.active { 
                background: var(--primary-color); border-color: var(--primary-color); 
                transform: scale(1.1); box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            /* Emotki na aktywnym tle mogą wymagać filtra, ale systemowe są ok */
            
            .sep { width: 1px; height: 24px; background: #ddd; margin: 0 4px; }
        </style>
    `;

    // 7. Event Listeners
    
    // Global Feedback
    const globalOpts = summaryScreen.querySelectorAll('.feedback-option');
    globalOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            globalOpts.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    // Exercise Ratings
    const ratingCards = summaryScreen.querySelectorAll('.rating-card');
    ratingCards.forEach(card => {
        const id = card.dataset.id;
        const buttons = card.querySelectorAll('.rate-btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const isActive = btn.classList.contains('active');

                // Reset wszystkich w tym wierszu
                buttons.forEach(b => b.classList.remove('active'));

                if (!isActive) {
                    btn.classList.add('active');
                    exerciseRatings[id] = { exerciseId: id, action: action };
                } else {
                    delete exerciseRatings[id]; // Odznaczenie
                }
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

    const now = new Date();
    const stravaCheckbox = document.getElementById('strava-sync-checkbox');
    const rawDuration = now - state.sessionStartTime;
    const netDuration = Math.max(0, rawDuration - (state.totalPausedTime || 0));
    const durationSeconds = Math.round(netDuration / 1000);

    // Wybór planu (Dynamic vs Static) - kod z poprzedniej wersji
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

    // PRZYGOTOWANIE PAYLOADU
    const ratingsArray = Object.values(exerciseRatings); // Konwersja mapy na tablicę

    const sessionPayload = {
        sessionId: Date.now(),
        planId: planIdToSave,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingTitle,
        status: 'completed',
        feedback: selectedFeedback,
        exerciseRatings: ratingsArray, // NOWE POLE
        pain_during: selectedFeedback.type === 'symptom' && selectedFeedback.value === -1 ? 5 : 0,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime ? state.sessionStartTime.toISOString() : now.toISOString(),
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    try {
        const response = await dataStore.saveSession(sessionPayload);
        clearSessionBackup();
        await dataStore.loadRecentHistory(7);

        // Aktualizacja lokalnych preferencji (UI Optimistic Update)
        if (ratingsArray.length > 0) {
            // Ponowne pobranie byłoby pewniejsze, ale zrobimy update lokalny dla szybkości
            // Logika jest już zaszyta w dataStore.saveSession
        }

        if (response && response.newStats) { state.userStats = { ...state.userStats, ...response.newStats }; } 
        else { if (!state.userStats) state.userStats = { totalSessions: 0, streak: 0 }; state.userStats.totalSessions = (parseInt(state.userStats.totalSessions) || 0) + 1; }

        if (stravaCheckbox && stravaCheckbox.checked) { dataStore.uploadToStrava(sessionPayload); }

        // Reset stanu sesji
        state.currentTrainingDate = null; state.currentTrainingDayId = null; state.sessionLog = []; state.sessionStartTime = null; state.totalPausedTime = 0; state.isPaused = false;

        hideLoader();
        const { renderMainScreen } = await import('./dashboard.js');

        if (response && response.adaptation) {
            renderEvolutionModal(response.adaptation, () => { navigateTo('main'); renderMainScreen(); });
        } else {
            navigateTo('main'); renderMainScreen();
        }

    } catch (error) {
        console.error("Błąd zapisu sesji:", error);
        hideLoader();
        alert("Błąd zapisu. Sprawdź połączenie.");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Spróbuj ponownie"; }
    }
}
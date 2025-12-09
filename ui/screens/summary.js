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

    // 1. Ustalanie Kontekstu (Plan vs Protokół)
    let trainingTitle = "Trening";
    let isSafetyMode = false;
    let isProtocol = false;

    // A. SCENARIUSZ PROTOKOŁU (Bio-Hub)
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        isProtocol = true;
        trainingTitle = state.todaysDynamicPlan.title;
        // Protokoły SOS traktujemy jako tryb bezpieczeństwa (pytanie o objawy)
        isSafetyMode = state.todaysDynamicPlan.mode === 'sos';
    } 
    // B. SCENARIUSZ STANDARDOWY
    else {
        let activePlan = null;
        const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);
        
        if (isDynamicMode && state.settings.dynamicPlanData) {
            activePlan = state.settings.dynamicPlanData;
        } else {
            activePlan = state.trainingPlans[state.settings.activePlanId];
        }

        if (!activePlan) {
            console.error("Błąd: Brak aktywnego planu w Summary.");
            navigateTo('main'); 
            return;
        }

        const daysList = activePlan.Days || activePlan.days || [];
        const trainingDay = daysList.find(d => d.dayNumber === state.currentTrainingDayId);
        
        if (!trainingDay) {
            console.error("Błąd: Nie znaleziono dnia treningowego w Summary.");
            // Fallback: jeśli nie znaleziono dnia, używamy domyślnego tytułu, zamiast przerywać
            trainingTitle = "Zakończony Trening";
        } else {
            trainingTitle = trainingDay.title;
        }

        const initialPain = state.sessionParams.initialPainLevel || 0;
        isSafetyMode = initialPain > 3;
    }

    // 2. Reset stanu formularza
    selectedFeedback = { type: isSafetyMode ? 'symptom' : 'tension', value: 0 };

    const summaryScreen = screens.summary;
    summaryScreen.innerHTML = '';

    // 3. Budowa Sekcji Globalnej
    let globalQuestion = isSafetyMode ? "Jak czuje się Twoje ciało?" : "Jak oceniasz trudność?";
    let globalOptionsHtml = '';

    if (isSafetyMode) {
        globalOptionsHtml = `
            <div class="feedback-option" data-type="symptom" data-value="1">
                <div class="fb-icon">🍃</div>
                <div class="fb-text"><h4>Ulga</h4></div>
            </div>
            <div class="feedback-option selected" data-type="symptom" data-value="0">
                <div class="fb-icon">⚖️</div>
                <div class="fb-text"><h4>Stabilnie</h4></div>
            </div>
            <div class="feedback-option" data-type="symptom" data-value="-1">
                <div class="fb-icon">⚡</div>
                <div class="fb-text"><h4>Gorzej</h4></div>
            </div>
        `;
    } else {
        globalOptionsHtml = `
            <div class="feedback-option" data-type="tension" data-value="1">
                <div class="fb-icon">🥱</div>
                <div class="fb-text"><h4>Nuda</h4></div>
            </div>
            <div class="feedback-option selected" data-type="tension" data-value="0">
                <div class="fb-icon">🎯</div>
                <div class="fb-text"><h4>Idealnie</h4></div>
            </div>
            <div class="feedback-option" data-type="tension" data-value="-1">
                <div class="fb-icon">🥵</div>
                <div class="fb-text"><h4>Za mocno</h4></div>
            </div>
        `;
    }

    // 4. Budowa Listy Ćwiczeń
    const processedIds = new Set();
    const uniqueExercises = (state.sessionLog || []).filter(entry => {
        if (entry.isRest || entry.status === 'skipped') return false;
        
        // Dla protokołów ID może być unikalne (z suffixem), więc bierzemy bazowe exerciseId
        const exId = entry.exerciseId || entry.id;
        if (!exId) return false;

        // Unikamy duplikatów w widoku oceniania (jeśli np. był obwód i ćwiczenie było 3 razy)
        if (processedIds.has(exId)) return false;
        processedIds.add(exId);
        return true;
    });

    let exercisesListHtml = '';

    if (uniqueExercises.length > 0) {
        exercisesListHtml = uniqueExercises.map(ex => {
            const id = ex.exerciseId || ex.id;
            
            // Opcjonalnie: Pre-fill na podstawie istniejących preferencji
            const currentPref = state.userPreferences[id] || { score: 0, difficulty: 0 };
            const isLike = currentPref.score >= 10 ? 'active' : '';
            const isDislike = currentPref.score <= -10 ? 'active' : '';
            const isHard = currentPref.difficulty === 1 ? 'active' : '';
            const isEasy = currentPref.difficulty === -1 ? 'active' : '';

            return `
            <div class="rating-card" data-id="${id}">
                <div class="rating-name">${ex.name}</div>
                <div class="rating-actions-group">
                    <!-- Grupa 1: Emocje -->
                    <div class="btn-group-affinity">
                        <button type="button" class="rate-btn ${isLike}" data-action="like" title="Lubię to">👍</button>
                        <button type="button" class="rate-btn ${isDislike}" data-action="dislike" title="Nie lubię">👎</button>
                    </div>
                    <div class="sep"></div>
                    <!-- Grupa 2: Trudność -->
                    <div class="btn-group-difficulty">
                        <button type="button" class="rate-btn ${isEasy}" data-action="easy" title="Za łatwe">💤</button>
                        <button type="button" class="rate-btn ${isHard}" data-action="hard" title="Za trudne">🔥</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } else {
        exercisesListHtml = '<p class="empty-state">Brak wykonanych ćwiczeń do oceny.</p>';
    }

    // 5. Strava Toggle
    let stravaHtml = '';
    if (state.stravaIntegration.isConnected) {
        stravaHtml = `
            <div class="form-group strava-sync-container" style="margin-top:1rem;">
                <label class="checkbox-label" for="strava-sync-checkbox" style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" id="strava-sync-checkbox" checked style="width:20px; height:20px;">
                    <span>Wyślij do Strava</span>
                </label>
            </div>`;
    }

    // 6. Finalny HTML
    summaryScreen.innerHTML = `
        <h2 id="summary-title" style="margin-bottom:0.5rem">${trainingTitle}</h2>
        <p style="opacity:0.6; font-size:0.9rem; margin-top:0;">Podsumowanie sesji</p>
        
        <form id="summary-form">
            <!-- Global Feedback -->
            <div class="form-group">
                <label style="display:block; margin-bottom:10px; font-weight:700;">${globalQuestion}</label>
                <div class="feedback-container compact">${globalOptionsHtml}</div>
            </div>

            <!-- Exercise Ratings -->
            <div class="form-group" style="margin-top:1.5rem;">
                <label style="display:block; margin-bottom:10px; font-weight:700;">Oceń Ćwiczenia (Opcjonalne)</label>
                <div class="ratings-list">
                    ${exercisesListHtml}
                </div>
            </div>

            <!-- Notes -->
            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki:</label>
                <textarea id="general-notes" rows="2" placeholder="Jak poszło?"></textarea>
            </div>

            ${stravaHtml}
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>
        
        <style>
            .rating-actions-group { display: flex; align-items: center; gap: 5px; }
            .btn-group-affinity, .btn-group-difficulty { display: flex; gap: 4px; }
            .rate-btn {
                background: #f3f4f6; 
                border: 1px solid transparent;
                border-radius: 8px;
                width: 40px; height: 40px;
                font-size: 1.4rem;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex; align-items: center; justify-content: center;
                filter: grayscale(100%); opacity: 0.4;
            }
            .rate-btn:hover { opacity: 0.7; background: #e5e7eb; transform: translateY(-1px); }
            .rate-btn.active {
                opacity: 1; filter: grayscale(0%);
                background: #fff; border-color: #d1d5db;
                box-shadow: 0 2px 5px rgba(0,0,0,0.08); transform: scale(1.15);
            }
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
        const buttons = card.querySelectorAll('.rate-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const parentGroup = btn.parentElement; 
                const isActive = btn.classList.contains('active');
                parentGroup.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active'));
                if (!isActive) {
                    btn.classList.add('active');
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

    // Wybór planu (Dynamic vs Static vs Protocol)
    let planIdToSave = state.settings.activePlanId;
    let trainingTitle = "Trening";
    
    // Sprawdzamy czy to Protokół
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        planIdToSave = state.todaysDynamicPlan.id; // Np. proto_sos_...
        trainingTitle = state.todaysDynamicPlan.title;
    }
    // Jeśli nie protokół, to standardowa logika
    else {
        const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);
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
    }

    // --- ZBIERANIE OCEN Z UI ---
    const ratingsArray = [];
    const ratingCards = document.querySelectorAll('.rating-card');
    
    ratingCards.forEach(card => {
        const id = card.dataset.id;
        const activeButtons = card.querySelectorAll('.rate-btn.active');
        
        activeButtons.forEach(btn => {
            ratingsArray.push({
                exerciseId: id,
                action: btn.dataset.action
            });
        });
    });

    const sessionPayload = {
        sessionId: Date.now(),
        planId: planIdToSave,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingTitle,
        status: 'completed',
        feedback: selectedFeedback,
        exerciseRatings: ratingsArray,
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

        // Jeśli protokół, usuwamy go ze stanu "todaysDynamicPlan" żeby nie wisiał w dashboardzie jako główny plan
        if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
            state.todaysDynamicPlan = null;
        }

        if (response && response.newStats) { state.userStats = { ...state.userStats, ...response.newStats }; } 
        else { if (!state.userStats) state.userStats = { totalSessions: 0, streak: 0 }; state.userStats.totalSessions = (parseInt(state.userStats.totalSessions) || 0) + 1; }

        if (stravaCheckbox && stravaCheckbox.checked) { dataStore.uploadToStrava(sessionPayload); }

        // Reset stanu sesji
        state.currentTrainingDate = null; 
        state.currentTrainingDayId = null; 
        state.sessionLog = []; 
        state.sessionStartTime = null; 
        state.totalPausedTime = 0; 
        state.isPaused = false;

        hideLoader();
        const { renderMainScreen } = await import('./dashboard.js');

        // Pokaż ewolucję tylko jeśli były oceny
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
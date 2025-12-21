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

    let trainingTitle = "Trening";
    let isSafetyMode = false;

    // Ustalanie tytułu i trybu
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        trainingTitle = state.todaysDynamicPlan.title;
        isSafetyMode = state.todaysDynamicPlan.mode === 'sos';
    } else {
        const activePlan = state.settings.dynamicPlanData || state.trainingPlans[state.settings.activePlanId];
        const daysList = activePlan?.Days || activePlan?.days || [];
        const trainingDay = daysList.find(d => d.dayNumber === state.currentTrainingDayId);
        trainingTitle = trainingDay ? trainingDay.title : "Trening";
        isSafetyMode = (state.sessionParams.initialPainLevel || 0) > 3;
    }

    selectedFeedback = { type: isSafetyMode ? 'symptom' : 'tension', value: 0 };
    const summaryScreen = screens.summary;

    // Global Feedback HTML (Bez zmian)
    let globalOptionsHtml = isSafetyMode ? `
        <div class="feedback-option" data-type="symptom" data-value="1"><div class="fb-icon">🍃</div><div class="fb-text"><h4>Ulga</h4></div></div>
        <div class="feedback-option selected" data-type="symptom" data-value="0"><div class="fb-icon">⚖️</div><div class="fb-text"><h4>Stabilnie</h4></div></div>
        <div class="feedback-option" data-type="symptom" data-value="-1"><div class="fb-icon">⚡</div><div class="fb-text"><h4>Gorzej</h4></div></div>
    ` : `
        <div class="feedback-option" data-type="tension" data-value="1"><div class="fb-icon">🥱</div><div class="fb-text"><h4>Nuda</h4></div></div>
        <div class="feedback-option selected" data-type="tension" data-value="0"><div class="fb-icon">🎯</div><div class="fb-text"><h4>Idealnie</h4></div></div>
        <div class="feedback-option" data-type="tension" data-value="-1"><div class="fb-icon">🥵</div><div class="fb-text"><h4>Za mocno</h4></div></div>
    `;

    // Lista Ćwiczeń
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

            // --- FIX: CZYSZCZENIE NAZWY Z DOPISKÓW STRON ---
            // Usuwamy "(Lewa)", "(Prawa)" oraz ewentualne spacje przed nimi
            let displayName = ex.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

            // Nowa logika stanów (50 / -50)
            const isLike = pref.score >= 50 ? 'active' : '';
            const isDislike = pref.score <= -50 ? 'active' : '';
            // Trudność nie jest już stanem w pref, jest akcją jednorazową

            return `
            <div class="rating-card" data-id="${id}">
                <div class="rating-name">${displayName}</div>
                <div class="rating-actions-group">
                    <!-- SEKCJA 1: CZĘSTOTLIWOŚĆ (Radio) -->
                    <div class="btn-group-affinity">
                        <button type="button" class="rate-btn affinity-btn ${isLike}" data-action="like" title="Róbmy to częściej">👍</button>
                        <button type="button" class="rate-btn affinity-btn ${isDislike}" data-action="dislike" title="Róbmy to rzadziej">👎</button>
                    </div>

                    <div class="sep"></div>

                    <!-- SEKCJA 2: TRUDNOŚĆ (Action) -->
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

                <!-- POPRAWIONE NAGŁÓWKI KOLUMN -->
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
        <style>
            /* FIX LAYOUT: Nazwa zajmuje więcej miejsca */
            .rating-card {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px; /* Odstęp między nazwą a przyciskami */
            }
            .rating-name {
                flex: 1; /* Nazwa zajmuje całą dostępną przestrzeń */
                max-width: unset; /* Usuwamy limit 50% */
                padding-right: 5px;
                font-size: 0.9rem;
                font-weight: 600;
                line-height: 1.2;
            }
            /* Kontener akcji zajmuje tylko tyle ile potrzebuje */
            .rating-actions-group {
                display: flex;
                align-items: center;
                gap: 8px;
                justify-content: flex-end;
                width: auto;
                flex-shrink: 0;
            }

            .btn-group-affinity { display: flex; gap: 4px; background: #f0fdfa; padding: 3px; border-radius: 8px; width: 82px; justify-content: center; }
            .btn-group-difficulty { display: flex; gap: 4px; background: #fff7ed; padding: 3px; border-radius: 8px; width: 82px; justify-content: center; }
            .rate-btn {
                background: transparent; border: 1px solid transparent; border-radius: 6px;
                width: 36px; height: 36px; font-size: 1.2rem; cursor: pointer;
                transition: all 0.2s; display: flex; align-items: center; justify-content: center;
                filter: grayscale(100%); opacity: 0.5;
            }
            .rate-btn:hover { opacity: 1; filter: grayscale(0%); background: rgba(0,0,0,0.05); }

            /* Aktywne Affinity */
            .affinity-btn.active { opacity: 1; filter: grayscale(0%); background: #fff; border-color: #2dd4bf; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

            /* Kliknięte Difficulty (Zablokowane) */
            .diff-btn.selected { opacity: 1; filter: grayscale(0%); background: #ea580c; color: white; border-color: #ea580c; cursor: default; transform: scale(0.95); }

            .sep { width: 1px; height: 24px; background: #e5e7eb; }
        </style>
    `;

    // --- EVENT LISTENERS ---

    // Global Feedback
    summaryScreen.querySelectorAll('.feedback-option').forEach(opt => {
        opt.addEventListener('click', () => {
            summaryScreen.querySelectorAll('.feedback-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedFeedback.value = parseInt(opt.dataset.value, 10);
            selectedFeedback.type = opt.dataset.type;
        });
    });

    // Exercise Ratings
    summaryScreen.querySelectorAll('.rating-card').forEach(card => {

        // A. Affinity (Radio Logic)
        const affinityBtns = card.querySelectorAll('.affinity-btn');
        affinityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const isActive = btn.classList.contains('active');
                // Reset grupy
                affinityBtns.forEach(b => b.classList.remove('active'));

                // Toggle (jeśli nie był aktywny, to włącz, jeśli był - to wyłączyliśmy wyżej i zostaje wyłączony = neutral)
                if (!isActive) {
                    btn.classList.add('active');
                }
            });
        });

        // B. Difficulty (Action Logic)
        const diffBtns = card.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Reset grupy (tylko jeden wybór)
                diffBtns.forEach(b => b.classList.remove('selected'));
                // Oznacz jako wybrane
                btn.classList.add('selected');

                // Wizualny feedback
                const action = btn.dataset.action;
                const originalTitle = btn.title;
                btn.title = "Zgłoszono zmianę";
                // Opcjonalnie: można dodać alert/toast "Zmienimy to w przyszłości"
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

        // 1. Pobierz stan Affinity
        const activeAffinity = card.querySelector('.affinity-btn.active');
        if (activeAffinity) {
            ratingsArray.push({ exerciseId: id, action: activeAffinity.dataset.action });
        } else {
            // Jeśli żaden nie jest aktywny, wysyłamy 'neutral' aby zresetować/utrzymać 0
            ratingsArray.push({ exerciseId: id, action: 'neutral' });
        }

        // 2. Pobierz stan Difficulty (Action)
        const activeDiff = card.querySelector('.diff-btn.selected');
        if (activeDiff) {
            ratingsArray.push({ exerciseId: id, action: activeDiff.dataset.action });
        }
    });

    const now = new Date();
    const durationSeconds = Math.round(Math.max(0, now - state.sessionStartTime - (state.totalPausedTime || 0)) / 1000);
    
    // --- FIX: POPRAWNE ID PLANU DLA VIRTUAL PHYSIO ---
    let planId = state.settings.activePlanId; // Domyślny fallback

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        // 1. Jeśli to Bio-Protokół (SOS/Booster)
        planId = state.todaysDynamicPlan.id;
    } else if (state.settings.planMode === 'dynamic' && state.settings.dynamicPlanData?.id) {
        // 2. Jeśli to główny plan dynamiczny (Virtual Physio)
        planId = state.settings.dynamicPlanData.id;
    } 
    // 3. W przeciwnym razie zostaje activePlanId (Static)

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

        // Update stats locally
        if (response?.newStats) state.userStats = { ...state.userStats, ...response.newStats };

        // Strava
        if (document.getElementById('strava-sync-checkbox')?.checked) dataStore.uploadToStrava(sessionPayload);

        // Reset App State
        state.currentTrainingDate = null;
        state.sessionLog = [];
        state.isPaused = false;

        hideLoader();
        const { renderMainScreen } = await import('./dashboard.js');

        if (response && response.adaptation) {
            renderEvolutionModal(response.adaptation, () => { navigateTo('main'); renderMainScreen(); });
        } else {
            navigateTo('main'); renderMainScreen();
        }
    } catch (error) {
        console.error(error);
        hideLoader();
        alert("Błąd zapisu.");
        submitBtn.disabled = false;
    }
}
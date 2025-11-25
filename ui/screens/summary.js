// js/ui/screens/summary.js
import { state } from '../../state.js';
import { screens, containers } from '../../dom.js'; // Dodano containers jeśli potrzebne, ale tu screens.summary wystarczy
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { renderEvolutionModal } from '../modals.js';
import { renderMainScreen } from './dashboard.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';

let selectedFeedback = { type: null, value: 0 }; // Domyślnie neutralnie

export const renderSummaryScreen = () => {
    if (getIsCasting()) sendShowIdle();
    
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return;
    const trainingDay = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    if (!trainingDay) return;
    
    // 1. DECYZJA: Którą ścieżkę wybrać? (Symptom vs Tension)
    const initialPain = state.sessionParams.initialPainLevel || 0;
    const isSafetyMode = initialPain > 3; // Próg 3/10
    
    const summaryScreen = screens.summary;
    summaryScreen.innerHTML = ''; // Czyścimy

    // 2. GENEROWANIE OPCJI FEEDBACKU
    let feedbackHtml = '';
    let questionTitle = '';
    
    if (isSafetyMode) {
        // ŚCIEŻKA A: SYMPTOMY
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
        // ŚCIEŻKA B: TENSION (LINA)
        questionTitle = "Jak oceniasz trudność (Stabilność)?";
        selectedFeedback.type = 'tension';
        // Domyślna wartość to 0 (Sweet Spot)
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

    // 3. RENDEROWANIE CAŁEGO EKRANU
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
            <!-- SEKCJA INTELIGENTNEGO FEEDBACKU -->
            <div class="form-group">
                <label style="display:block; margin-bottom:10px; font-weight:700;">${questionTitle}</label>
                <div class="feedback-container">
                    ${feedbackHtml}
                </div>
            </div>

            <!-- NOTATKI (OPCJONALNE) -->
            <div class="form-group" style="margin-top:2rem;">
                <label for="general-notes">Notatki (opcjonalne):</label>
                <textarea id="general-notes" rows="3" placeholder="Coś jeszcze chcesz dodać?"></textarea>
            </div>

            ${stravaHtml}
            
            <button type="submit" class="action-btn" style="margin-top:1.5rem;">Zapisz i Zakończ</button>
        </form>
    `;

    // 4. LOGIKA WYBORU KART
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
    showLoader();

    const dateKey = state.currentTrainingDate || new Date().toISOString().split('T')[0];
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    const trainingDay = activePlan ? activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId) : null;
    
    const now = new Date();
    const stravaCheckbox = document.getElementById('strava-sync-checkbox');

    const rawDuration = now - state.sessionStartTime;
    const netDuration = Math.max(0, rawDuration - (state.totalPausedTime || 0));
    const durationSeconds = Math.round(netDuration / 1000);

    const sessionPayload = {
        sessionId: Date.now(),
        planId: state.settings.activePlanId,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingDay ? trainingDay.title : "Trening",
        status: 'completed',
        // --- NOWE POLA ---
        feedback: selectedFeedback, // { type: 'tension', value: 1 }
        // Zachowujemy pole pain_during dla kompatybilności wstecznej (mapujemy z feedbacku lub 0)
        pain_during: selectedFeedback.type === 'symptom' && selectedFeedback.value === -1 ? 5 : 0, 
        // -----------------
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime ? state.sessionStartTime.toISOString() : now.toISOString(),
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    try {
        // 1. Zapisz sesję i odbierz ewentualną adaptację
        // UWAGA: dataStore.saveSession musi teraz zwracać wynik z backendu!
        // Zakładamy, że zaktualizowałeś dataStore.js aby zwracał response.json()
        const response = await dataStore.saveSession(sessionPayload); 
        
        // Aktualizacja stanu lokalnego (dla widoku kalendarza)
        if (!state.userProgress[dateKey]) {
            state.userProgress[dateKey] = [];
        }
        state.userProgress[dateKey].push(sessionPayload);
        
        if (!state.userStats) state.userStats = { totalSessions: 0, streak: 0 };
        state.userStats.totalSessions = (parseInt(state.userStats.totalSessions) || 0) + 1;

        if (stravaCheckbox && stravaCheckbox.checked) {
            dataStore.uploadToStrava(sessionPayload); // To działa w tle
        }
        
        // Reset stanu sesji
        state.currentTrainingDate = null;
        state.currentTrainingDayId = null;
        state.sessionLog = [];
        state.sessionStartTime = null;
        state.totalPausedTime = 0;
        state.isPaused = false;

        hideLoader();

        // 2. CZY BYŁA EWOLUCJA?
        // response.adaptation pochodzi z backendu (save-session.js)
        if (response && response.newStats) {
            // Nadpisujemy lokalny stan tym, co wyliczył serwer (pewne dane)
            state.userStats = {
                ...state.userStats,
                ...response.newStats
            };
            console.log("📊 Zaktualizowano statystyki (Streak/Tarcza) z serwera:", state.userStats);
        } else {
            // Fallback (stara logika inkrementacji)
            if (!state.userStats) state.userStats = { totalSessions: 0, streak: 0 };
            state.userStats.totalSessions = (parseInt(state.userStats.totalSessions) || 0) + 1;
        }

    } catch (error) {
        console.error("Błąd zapisu sesji:", error);
        hideLoader();
        alert("Błąd zapisu. Trening zapisany lokalnie.");
        navigateTo('main');
        renderMainScreen();
    }
}
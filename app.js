// === 1. IMPORTY MODUŁÓW ===
import { state } from './state.js';
import dataStore from './dataStore.js';
import { configureClient, login, logout, handleRedirectCallback, isAuthenticated, getToken, getUserProfile } from './auth.js';
import {
    renderMainScreen,
    renderHistoryScreen,
    renderSettingsScreen,
    renderDayDetailsScreen,
    renderLibraryScreen,
    renderTrainingScreen,
    renderHelpScreen, // NOWOŚĆ: Import ekranu pomocy
    navigateTo,
    showLoader,
    hideLoader,
    initWizard
} from './ui.js';
import { containers, mainNav, screens } from './dom.js';
import { moveToPreviousExercise, moveToNextExercise } from './training.js';
import { stopTimer, togglePauseTimer, stopStopwatch } from './timer.js';
import { loadVoices } from './tts.js';
import { initializeCastApi, getIsCasting, sendShowIdle } from './cast.js';


// === 2. GŁÓWNE FUNKCJE APLIKACJI ===

function initAppLogic() {
    renderTrainingScreen();
    
    // Obsługa kliknięcia w logo/nazwę aplikacji
    const brandContainer = document.querySelector('.brand-container');
    if (brandContainer) {
        brandContainer.addEventListener('click', () => {
            navigateTo('main');
            renderMainScreen();
        });
    }
    
    if (mainNav) {
        mainNav.querySelector('#nav-main').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
        mainNav.querySelector('#nav-history').addEventListener('click', renderHistoryScreen);
        mainNav.querySelector('#nav-library').addEventListener('click', () => renderLibraryScreen());
        mainNav.querySelector('#nav-settings').addEventListener('click', renderSettingsScreen);
        
        // NOWOŚĆ: Obsługa przycisku pomocy w górnej nawigacji (jeśli istnieje w HTML)
        const helpBtn = mainNav.querySelector('#nav-help');
        if (helpBtn) {
            helpBtn.addEventListener('click', renderHelpScreen);
        }
    }
    
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) {
        bottomNav.addEventListener('click', (e) => {
            const button = e.target.closest('.bottom-nav-btn');
            if (!button) return;
            
            const screen = button.dataset.screen;
            bottomNav.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            switch (screen) {
                case 'main': renderMainScreen(); break;
                case 'history': renderHistoryScreen(); break;
                case 'library': renderLibraryScreen(); break;
                case 'settings': renderSettingsScreen(); break;
                case 'help': renderHelpScreen(); break; // NOWOŚĆ: Obsługa dolnej nawigacji
            }
        });
    }

    const prevMonthBtn = document.getElementById('prev-month-btn');
    if(prevMonthBtn) prevMonthBtn.addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1); renderHistoryScreen(); });
    const nextMonthBtn = document.getElementById('next-month-btn');
    if(nextMonthBtn) nextMonthBtn.addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1); renderHistoryScreen(); });
    if(containers.calendarGrid) { containers.calendarGrid.addEventListener('click', (e) => { const dayEl = e.target.closest('.calendar-day.has-entry'); if (dayEl && dayEl.dataset.date) { renderDayDetailsScreen(dayEl.dataset.date); } }); }
    const searchInput = document.getElementById('library-search-input');
    if(searchInput) searchInput.addEventListener('input', (e) => { renderLibraryScreen(e.target.value); });
    
    const settingsForm = document.getElementById('settings-form');
    if(settingsForm) settingsForm.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        state.settings.appStartDate = e.target['setting-start-date'].value; 
        state.settings.activePlanId = e.target['setting-training-plan'].value; 
        
        // NOWOŚĆ: Zapisywanie ustawienia TTS
        const ttsCheckbox = e.target.querySelector('#setting-tts');
        if (ttsCheckbox) {
            state.settings.ttsEnabled = ttsCheckbox.checked;
            // Aktualizacja stanu runtime'owego, żeby zadziałało od razu
            state.tts.isSoundOn = state.settings.ttsEnabled;
        }
        
        await dataStore.saveSettings(); 
        alert('Ustawienia zostały zapisane.'); 
        navigateTo('main'); 
        renderMainScreen(); 
    });
    
    // REMOVED: progressionSlider listener

    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if(deleteAccountBtn) deleteAccountBtn.addEventListener('click', async () => { const confirmation1 = prompt("Czy na pewno chcesz usunąć swoje konto? Wpisz 'usuń moje konto' aby potwierdzić."); if (confirmation1 !== 'usuń moje konto') return; if (!confirm("OSTATECZNE POTWIERDZENIE: Dane zostaną trwale usunięte.")) return; showLoader(); try { await dataStore.deleteAccount(); hideLoader(); alert("Konto usunięte."); logout(); } catch (error) { hideLoader(); alert(error.message); } });

    if (screens.training) {
        screens.training.addEventListener('click', (e) => {
            const target = e.target;
            if (target.closest('#exit-training-btn')) { if (confirm('Przerwać trening?')) { stopTimer(); stopStopwatch(); if (state.tts.isSupported) state.tts.synth.cancel(); if (getIsCasting()) sendShowIdle(); state.currentTrainingDate = null; state.sessionLog = []; state.isPaused = false; navigateTo('main'); renderMainScreen(); } return; }
            if (target.closest('#tts-toggle-btn')) { state.tts.isSoundOn = !state.tts.isSoundOn; const icon = document.getElementById('tts-icon'); if (icon) icon.src = state.tts.isSoundOn ? '/icons/sound-on.svg' : '/icons/sound-off.svg'; if (!state.tts.isSoundOn && state.tts.isSupported) state.tts.synth.cancel(); return; }
            if (target.closest('#prev-step-btn')) { moveToPreviousExercise(); return; }
            if (target.closest('#pause-resume-btn')) { togglePauseTimer(); return; }
            if (target.closest('#skip-btn')) { moveToNextExercise({ skipped: true }); return; }
            if (target.closest('#rep-based-done-btn')) { moveToNextExercise({ skipped: false }); return; }
        });
    }
    if (state.tts.isSupported) { loadVoices(); if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices; }
    const yearEl = document.getElementById('current-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();
}

function checkAndMigrateLocalData() {
    const localProgressRaw = localStorage.getItem('trainingAppProgress');
    if (localProgressRaw && Object.keys(JSON.parse(localProgressRaw)).length > 0) {
        setTimeout(() => {
            if (confirm("Wykryliśmy dane lokalne. Przenieść na konto?")) {
                showLoader();
                dataStore.migrateData(JSON.parse(localProgressRaw)).then(() => { localStorage.removeItem('trainingAppProgress'); localStorage.removeItem('trainingAppSettings'); alert("Zmigrowano! Przeładowanie..."); window.location.reload(); }).catch(e => { hideLoader(); alert("Błąd migracji: " + e.message); });
            }
        }, 1000);
    }
}

export async function main() {
    showLoader();
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoContainer = document.getElementById('user-info-container');
    const bottomNav = document.getElementById('app-bottom-nav');

    await configureClient();
    initializeCastApi(); 

    try {
        const resourcesPromise = dataStore.loadAppContent();
        
        if (loginBtn && !loginBtn.dataset.listenerAttached) { loginBtn.addEventListener('click', login); loginBtn.dataset.listenerAttached = 'true'; }
        if (logoutBtn && !logoutBtn.dataset.listenerAttached) { logoutBtn.addEventListener('click', logout); logoutBtn.dataset.listenerAttached = 'true'; }

        const query = window.location.search;
        const isReturningFromStrava = new URLSearchParams(query).has('strava_status');
        if (query.includes("code=") && query.includes("state=") && !isReturningFromStrava) {
            try { await handleRedirectCallback(); } catch (error) { console.error("Błąd redirectu:", error); }
            window.history.replaceState({}, document.title, "/");
        }

        const isAuth = await isAuthenticated();

        if (isAuth) {
            document.getElementById('welcome-screen').classList.add('hidden');
            document.querySelector('main').classList.remove('hidden');
            if (userInfoContainer) userInfoContainer.classList.remove('hidden');
            if (mainNav) mainNav.classList.remove('hidden');

            await getToken(); 
            const profile = getUserProfile();
            const nameEl = document.getElementById('user-display-name');
            if(nameEl) nameEl.textContent = profile.name || profile.email || 'Użytkownik';

            await resourcesPromise; 
            
            initAppLogic();
            hideLoader();

            dataStore.loadAppContent().then(() => {
                console.log("🔄 Weryfikacja danych w tle zakończona.");
            });

            dataStore.initialize().then(async () => {
                console.log("DEBUG: Init zakończony, pobieram historię...");
                await dataStore.loadRecentHistory();
                console.log("DEBUG: Historia gotowa. Sprawdzam Wizard...");

                const wizardStarted = initWizard(); 
                
                if (!wizardStarted) {
                    if (bottomNav) bottomNav.classList.remove('hidden');
                    
                    if (isReturningFromStrava) {
                        const urlParams = new URLSearchParams(window.location.search);
                        const status = urlParams.get('strava_status');
                        if (status === 'success') alert('Strava połączona!');
                        else if (status === 'error') alert('Błąd Stravy: ' + urlParams.get('message'));
                        renderSettingsScreen();
                        window.history.replaceState({}, document.title, window.location.pathname + "#settings");
                    } else {
                        console.log("DEBUG: Wymuszam render Dashboardu po załadowaniu historii.");
                        renderMainScreen();
                    }
                }
                checkAndMigrateLocalData();
            });

            dataStore.fetchDetailedStats().then((newStats) => {
                const mainScreen = document.getElementById('main-screen');
                if (mainScreen && mainScreen.classList.contains('active')) {
                    renderMainScreen();
                }
            });

        } else {
            await resourcesPromise;
            document.getElementById('welcome-screen').classList.remove('hidden');
            document.querySelector('main').classList.add('hidden');
            if (userInfoContainer) userInfoContainer.classList.add('hidden');
            if (mainNav) mainNav.classList.add('hidden');
            if (bottomNav) bottomNav.classList.add('hidden');
            hideLoader();
        }
    } catch (error) {
        console.error("Błąd startu:", error);
        hideLoader();
    }
}

window.addEventListener('DOMContentLoaded', main);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => console.log('SW OK:', registration.scope))
      .catch(err => console.error('SW Fail:', err));
  });
}
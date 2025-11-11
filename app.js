// app.js

// === 1. IMPORTY MODUŁÓW ===
import { state } from './state.js';
import dataStore from './dataStore.js';
import { configureClient, login, logout, handleRedirectCallback, isAuthenticated, getToken, getUserProfile } from './auth.js';
import {
    renderMainScreen,
    renderHistoryScreen,
    renderSettingsScreen,
    renderPreTrainingScreen,
    renderTrainingScreen,
    navigateTo,
    renderDayDetailsScreen,
    renderLibraryScreen,
    showLoader,
    hideLoader
} from './ui.js';
import { containers, mainNav, focus } from './dom.js';
import { getISODate } from './utils.js';
import { moveToNextExercise, moveToPreviousExercise } from './training.js';
import { stopTimer, togglePauseTimer, stopStopwatch } from './timer.js';
import { loadVoices } from './tts.js';


// === 2. GŁÓWNE FUNKCJE APLIKACJI ===

function handleBackup() {
    const dataToBackup = { userProgress: state.userProgress, settings: state.settings };
    const dataStr = JSON.stringify(dataToBackup, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.download = `trening-app-backup-${getISODate(new Date())}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function handleRestore(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.userProgress && importedData.settings) {
                if (confirm("Czy na pewno chcesz nadpisać obecne dane? Spowoduje to przeładowanie strony.")) {
                    localStorage.setItem('trainingAppProgress', JSON.stringify(importedData.userProgress));
                    localStorage.setItem('trainingAppSettings', JSON.stringify(importedData.settings));
                    alert("Dane przywrócone. Aplikacja zostanie przeładowana.");
                    window.location.reload();
                }
            } else {
                alert("Błąd: Nieprawidłowy format pliku.");
            }
        } catch (error) {
            alert("Błąd podczas wczytywania pliku.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function initAppLogic() {
    renderTrainingScreen();
    renderMainScreen();

    // Listener dla nawigacji desktopowej
    mainNav.querySelector('#nav-main').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    mainNav.querySelector('#nav-history').addEventListener('click', renderHistoryScreen);
    mainNav.querySelector('#nav-library').addEventListener('click', () => renderLibraryScreen());
    mainNav.querySelector('#nav-settings').addEventListener('click', renderSettingsScreen);
    
    // Listener dla nowej nawigacji mobilnej
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) {
        bottomNav.addEventListener('click', (e) => {
            const button = e.target.closest('.bottom-nav-btn');
            if (!button) return;
            const screen = button.dataset.screen;
            switch (screen) {
                case 'main': renderMainScreen(); break;
                case 'history': renderHistoryScreen(); break;
                case 'library': renderLibraryScreen(); break;
                case 'settings': renderSettingsScreen(); break;
            }
        });
    }

    // Pozostałe listenery
    document.getElementById('prev-month-btn').addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1); renderHistoryScreen(); });
    document.getElementById('next-month-btn').addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1); renderHistoryScreen(); });
    containers.calendarGrid.addEventListener('click', (e) => { const dayEl = e.target.closest('.calendar-day.has-entry'); if (dayEl && dayEl.dataset.date) { renderDayDetailsScreen(dayEl.dataset.date); } });
    containers.days.addEventListener('click', (e) => { if (e.target.matches('.action-btn')) { renderPreTrainingScreen(parseInt(e.target.dataset.dayId, 10)); } });
    document.getElementById('library-search-input').addEventListener('input', (e) => { renderLibraryScreen(e.target.value); });
    document.getElementById('settings-form').addEventListener('submit', async (e) => { e.preventDefault(); state.settings.appStartDate = e.target['setting-start-date'].value; state.settings.restBetweenExercises = parseInt(e.target['setting-rest-duration'].value, 10); state.settings.progressionFactor = parseInt(e.target['setting-progression-factor'].value, 10); state.settings.activePlanId = e.target['setting-training-plan'].value; await dataStore.saveSettings(); alert('Ustawienia zostały zapisane.'); navigateTo('main'); renderMainScreen(); });
    document.getElementById('setting-progression-factor').addEventListener('input', (e) => { document.getElementById('progression-factor-value').textContent = `${e.target.value}%`; });
    document.getElementById('backup-btn').addEventListener('click', handleBackup);
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-input').click());
    document.getElementById('restore-input').addEventListener('change', handleRestore);

    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        const confirmation1 = prompt("Czy na pewno chcesz usunąć swoje konto? To jest operacja nieodwracalna. Wpisz 'usuń moje konto' aby potwierdzić.");
        if (confirmation1 !== 'usuń moje konto') {
            alert("Anulowano. Tekst potwierdzający był nieprawidłowy.");
            return;
        }
        const confirmation2 = confirm("OSTATECZNE POTWIERDZENIE:\nWszystkie Twoje dane zostaną trwale usunięte. Kontynuować?");
        if (!confirmation2) {
            alert("Anulowano usunięcie konta.");
            return;
        }

        showLoader();
        try {
            await dataStore.deleteAccount();
            hideLoader();
            alert("Twoje konto i wszystkie dane zostały pomyślnie usunięte. Zostaniesz teraz wylogowany.");
            logout();
        } catch (error) {
            hideLoader();
            alert(error.message);
        }
    });

    focus.exitTrainingBtn.addEventListener('click', () => { if (confirm('Czy na pewno chcesz przerwać trening? Postęp tej sesji nie zostanie zapisany.')) { stopTimer(); stopStopwatch(); if (state.tts.isSupported) state.tts.synth.cancel(); navigateTo('main'); renderMainScreen(); } });
    focus.ttsToggleBtn.addEventListener('click', () => { state.tts.isSoundOn = !state.tts.isSoundOn; focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇'; if (!state.tts.isSoundOn && state.tts.isSupported) { state.tts.synth.cancel(); } });
    focus.prevStepBtn.addEventListener('click', moveToPreviousExercise);
    focus.pauseResumeBtn.addEventListener('click', togglePauseTimer);
    focus.skipBtn.addEventListener('click', () => moveToNextExercise({ skipped: true }));
    focus.repBasedDoneBtn.addEventListener('click', () => moveToNextExercise({ skipped: false }));
    if (state.tts.isSupported) { loadVoices(); if (speechSynthesis.onvoiceschanged !== undefined) { speechSynthesis.onvoiceschanged = loadVoices; } }
    document.getElementById('current-year').textContent = new Date().getFullYear();
}

/**
 * Główny punkt wejścia aplikacji i funkcja odświeżająca stan UI.
 */
export async function main() {
    await configureClient();

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoContainer = document.getElementById('user-info-container');
    const bottomNav = document.getElementById('app-bottom-nav');
    
    if (loginBtn && !loginBtn.dataset.listenerAttached) {
        loginBtn.addEventListener('click', login);
        loginBtn.dataset.listenerAttached = 'true';
    }
    
    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
        logoutBtn.addEventListener('click', logout);
        logoutBtn.dataset.listenerAttached = 'true';
    }

    const query = window.location.search;
    const shouldHandleRedirect = query.includes("code=") && query.includes("state=");

    if (shouldHandleRedirect) {
        try {
            await handleRedirectCallback();
        } catch (error) {
            console.error("Błąd krytyczny podczas handleRedirectCallback:", error);
        }
        window.history.replaceState({}, document.title, "/");
    }

    const isAuth = await isAuthenticated();

    if (isAuth) {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.querySelector('main').classList.remove('hidden');
        userInfoContainer.classList.remove('hidden');
        mainNav.classList.remove('hidden');
        bottomNav.classList.remove('hidden');

        showLoader();
        try {
            // POBRANIE TOKENA I PROFILU UŻYTKOWNIKA
            await getToken();
            const profile = getUserProfile();
            const displayName = profile.name || profile.email || 'Użytkownik';
            document.getElementById('user-display-name').textContent = displayName;

            // KROK 1: INICJALIZACJA (USTAWIENIA) - TO USTABILIZUJE SESJĘ I TOKEN
            await dataStore.initialize();
            
            // KROK 2: LOGIKA MIGRACJI - URUCHAMIANA DOPIERO PO POMYŚLNEJ INICJALIZACJI
            const localProgressRaw = localStorage.getItem('trainingAppProgress');
            if (localProgressRaw && Object.keys(JSON.parse(localProgressRaw)).length > 0) {
                if (confirm("Wykryliśmy niezsynchronizowane dane. Czy chcesz je teraz przenieść na swoje konto?")) {
                    try {
                        // Ta funkcja użyje teraz na pewno prawidłowego tokena
                        await dataStore.migrateData(JSON.parse(localProgressRaw));
                        localStorage.removeItem('trainingAppProgress');
                        localStorage.removeItem('trainingAppSettings');
                        alert("Dane zmigrowane! Aplikacja zostanie przeładowana.");
                        window.location.reload(); 
                        return; // Przerwij dalsze wykonywanie, bo strona się przeładuje
                    } catch (e) {
                        alert("Migracja nie powiodła się. Dane pozostaną na tym urządzeniu.");
                    }
                }
            }
            
            // KROK 3: INICJALIZACJA LOGIKI APLIKACJI
            initAppLogic();
        } catch (error) {
            console.error("Błąd krytyczny podczas inicjalizacji aplikacji:", error);
        } finally {
            hideLoader();
        }
    } else {
        document.getElementById('welcome-screen').classList.remove('hidden');
        document.querySelector('main').classList.add('hidden');
        userInfoContainer.classList.add('hidden');
        mainNav.classList.add('hidden');
        bottomNav.classList.add('hidden');
    }
}

// === 4. URUCHOMIENIE APLIKACJI ===
window.addEventListener('DOMContentLoaded', main);
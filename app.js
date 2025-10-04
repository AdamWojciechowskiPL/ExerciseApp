// app.js

import { state } from './state.js';
import { screens, containers, mainNav, focus } from './dom.js';
import dataStore from './dataStore.js';
import { loadVoices } from './tts.js';
import { renderMainScreen, renderHistoryScreen, renderSettingsScreen, renderPreTrainingScreen, renderTrainingScreen, navigateTo, renderDayDetailsScreen } from './ui.js';
import { getISODate } from './utils.js';
import { moveToNextExercise, moveToPreviousExercise } from './training.js';
import { stopTimer, togglePauseTimer } from './timer.js';

// === GŁÓWNE HANDLERY ZDARZEŃ ===

export function handleSummarySubmit(e) {
    e.preventDefault();
    const dateKey = state.currentTrainingDate;
    
    // =========================================================================
    // POPRAWKA: Defensywne sprawdzenie i naprawa danych
    // Ten kod sprawdzi, czy dane dla dzisiejszego dnia istnieją, ale nie są tablicą.
    // Jeśli tak, naprawi je, resetując do pustej tablicy.
    // =========================================================================
    if (state.userProgress[dateKey] && !Array.isArray(state.userProgress[dateKey])) {
        console.warn(`Wykryto uszkodzone dane dla daty ${dateKey}. Naprawianie...`);
        state.userProgress[dateKey] = [];
    }

    // Oryginalna logika, która teraz jest w 100% bezpieczna
    if (!state.userProgress[dateKey]) {
        state.userProgress[dateKey] = [];
    }

    state.userProgress[dateKey].push({
        sessionId: Date.now(),
        trainingDayId: state.currentTrainingDayId,
        status: 'completed',
        pain_during: document.getElementById('pain-during').value,
        notes: document.getElementById('general-notes').value,
        completedAt: new Date().toISOString(),
        sessionLog: state.sessionLog,
    });
    
    dataStore.saveProgress();
    
    state.currentTrainingDate = null;
    state.currentTrainingDayId = null;
    state.sessionLog = [];
    
    navigateTo('main');
    renderMainScreen();
}

function handleBackup() {
    const dataToBackup = {
        userProgress: state.userProgress,
        settings: state.settings
    };
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
                if (confirm("Czy na pewno chcesz nadpisać obecne dane danymi z pliku? Strona zostanie przeładowana.")) {
                    localStorage.setItem('trainingAppProgress', JSON.stringify(importedData.userProgress));
                    localStorage.setItem('trainingAppSettings', JSON.stringify(importedData.settings));
                    alert("Dane zostały przywrócone. Aplikacja zostanie teraz przeładowana.");
                    window.location.reload();
                }
            } else {
                alert("Błąd: Nieprawidłowy format pliku z kopią zapasową.");
            }
        } catch (error) {
            alert("Błąd podczas wczytywania pliku.");
            console.error(error);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// === INICJALIZACJA ===

function init() {
    renderTrainingScreen();
    dataStore.load();
    renderMainScreen();

    // PODŁĄCZENIE WSZYSTKICH EVENT LISTENERÓW
    
    mainNav.querySelector('#nav-main').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    mainNav.querySelector('#nav-history').addEventListener('click', renderHistoryScreen);
    mainNav.querySelector('#nav-settings').addEventListener('click', renderSettingsScreen);
    
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1);
        renderHistoryScreen();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1);
        renderHistoryScreen();
    });

    containers.calendarGrid.addEventListener('click', (e) => {
        const dayEl = e.target.closest('.calendar-day');
        if (dayEl && dayEl.dataset.date) {
            renderDayDetailsScreen(dayEl.dataset.date);
        }
    });

    containers.days.addEventListener('click', (e) => {
        if (e.target.matches('.action-btn')) {
            const dayId = e.target.dataset.dayId;
            renderPreTrainingScreen(parseInt(dayId, 10));
        }
    });

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        // NOWA LINIA: Pobranie i zapisanie daty startowej
        state.settings.appStartDate = e.target['setting-start-date'].value;
        state.settings.restBetweenExercises = parseInt(e.target['setting-rest-duration'].value, 10);
        state.settings.progressionFactor = parseInt(e.target['setting-progression-factor'].value, 10);
        dataStore.saveSettings();
        alert('Ustawienia zostały zapisane.');
        navigateTo('main');
        renderMainScreen(); // Kluczowe jest odświeżenie ekranu głównego
    });
    
    document.getElementById('setting-progression-factor').addEventListener('input', (e) => {
        document.getElementById('progression-factor-value').textContent = `${e.target.value}%`;
    });

    document.getElementById('backup-btn').addEventListener('click', handleBackup);
    document.getElementById('restore-btn').addEventListener('click', () => document.getElementById('restore-input').click());
    document.getElementById('restore-input').addEventListener('change', handleRestore);

    focus.exitTrainingBtn.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz przerwać trening? Postęp tej sesji nie zostanie zapisany.')) {
            stopTimer();
            if (state.tts.isSupported) state.tts.synth.cancel();
            
            const dateKey = state.currentTrainingDate;

            // =========================================================================
            // POPRAWKA: Defensywne sprawdzenie również przy przerywaniu treningu
            // =========================================================================
            if (state.userProgress[dateKey] && !Array.isArray(state.userProgress[dateKey])) {
                console.warn(`Wykryto uszkodzone dane dla daty ${dateKey} podczas przerywania. Naprawianie...`);
                delete state.userProgress[dateKey]; // Usuń uszkodzony obiekt
            }

            // Oznacz dzień jako "w trakcie", ale tylko jeśli nie ma jeszcze żadnych ukończonych sesji
            if (dateKey && (!state.userProgress[dateKey] || state.userProgress[dateKey].length === 0)) {
                state.userProgress[dateKey] = [{
                    sessionId: Date.now(),
                    trainingDayId: state.currentTrainingDayId,
                    status: 'in_progress',
                    notes: 'Sesja przerwana.',
                    completedAt: new Date().toISOString(),
                    sessionLog: [],
                }];
                dataStore.saveProgress();
            }

            navigateTo('main');
            renderMainScreen();
        }
    });
    focus.ttsToggleBtn.addEventListener('click', () => {
        state.tts.isSoundOn = !state.tts.isSoundOn;
        focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇';
        if (!state.tts.isSoundOn) {
            if (state.tts.isSupported) state.tts.synth.cancel();
        }
    });
    focus.prevStepBtn.addEventListener('click', moveToPreviousExercise);
    focus.pauseResumeBtn.addEventListener('click', togglePauseTimer);
    focus.skipBtn.addEventListener('click', () => moveToNextExercise({ skipped: true }));
    focus.repBasedDoneBtn.addEventListener('click', () => moveToNextExercise({ skipped: false }));

    if (state.tts.isSupported) {
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    document.getElementById('current-year').textContent = new Date().getFullYear();
}

init();
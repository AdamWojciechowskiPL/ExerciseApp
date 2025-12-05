// timer.js

import { state } from './state.js';
import { focus } from './dom.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

// --- TIMER (Odliczanie w dół) ---

export const updateTimerDisplay = () => {
    const minutes = Math.floor(state.timer.timeLeft / 60);
    const seconds = state.timer.timeLeft % 60;
    if (focus.timerDisplay) {
        focus.timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
};

export const stopTimer = () => {
    if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
    }
    state.timer.isActive = false;
};

export const startTimer = (seconds, onEndCallback) => {
    stopTimer();
    state.timer.timeLeft = seconds;
    state.timer.isActive = true;
    state.timer.onTimerEnd = onEndCallback;

    // Jeśli jest pauza i wznawiamy, ikona powinna być już ustawiona na Pauzę w togglePauseTimer
    // Ale dla bezpieczeństwa przy starcie nowej rundy:
    if (focus.pauseResumeBtn) {
        focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`;
        focus.pauseResumeBtn.classList.remove('paused-state');
    }

    updateTimerDisplay();

    state.timer.interval = setInterval(() => {
        state.timer.timeLeft--;
        updateTimerDisplay();

        // Optymalizacja: wysyłaj do Cast tylko przy zmianie sekundy
        if (getIsCasting()) {
            sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
        }

        if (state.timer.timeLeft <= 0) {
            stopTimer(); // Ważne, żeby zatrzymać interwał
            state.completionSound();
            if (navigator.vibrate) navigator.vibrate(200);
            if (onEndCallback) {
                onEndCallback();
            }
        }
    }, 1000);
};

// --- STOPER (Odliczanie w górę) ---

export const updateStopwatchDisplay = () => {
    const minutes = Math.floor(state.stopwatch.seconds / 60);
    const seconds = state.stopwatch.seconds % 60;

    if (focus.timerDisplay) {
        focus.timerDisplay.classList.remove('rep-based-text');
        focus.timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    if (getIsCasting()) {
        sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
    }
};

export const startStopwatch = () => {
    stopStopwatch();
    // UWAGA: Nie zerujemy tutaj seconds, jeśli wznawiamy z pauzy.
    // Zerowanie powinno odbywać się w training.js przy starcie nowego ćwiczenia.
    // Tutaj po prostu uruchamiamy interwał.

    if (state.stopwatch.seconds === undefined) state.stopwatch.seconds = 0;

    updateStopwatchDisplay();
    state.stopwatch.interval = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay();
    }, 1000);
};

export const stopStopwatch = () => {
    if (state.stopwatch.interval) {
        clearInterval(state.stopwatch.interval);
        state.stopwatch.interval = null;
    }
};

// --- PAUZA / WZNOWIENIE ---

export const togglePauseTimer = async () => {
    const now = Date.now();
    const currentStep = state.flatExercises[state.currentExerciseIndex];

    // Sprawdzamy czy cokolwiek jest aktywne: Timer, Stoper, lub Timeout "START..."
    if (state.timer.isActive || state.stopwatch.interval || state.breakTimeoutId) {
        // ===========================
        // WŁĄCZAMY PAUZĘ
        // ===========================
        state.isPaused = true;
        state.lastPauseStartTime = now;

        // Zatrzymujemy liczniki
        stopTimer();
        stopStopwatch();

        // Jeśli trwała przerwa "START...", czyścimy timeout, ale NIE zmieniamy UI
        if (state.breakTimeoutId) {
            clearTimeout(state.breakTimeoutId);
            state.breakTimeoutId = null;
        }

        // Zmiana ikony na Play (Wznów)
        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-play.svg" alt="Wznów">`;
            focus.pauseResumeBtn.classList.add('paused-state');
        }

        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';

    } else {
        // ===========================
        // WZNAWIAMY
        // ===========================

        // Oblicz czas trwania pauzy
        if (state.isPaused && state.lastPauseStartTime) {
            const pausedDuration = now - state.lastPauseStartTime;
            state.totalPausedTime += pausedDuration;
            state.isPaused = false;
            state.lastPauseStartTime = null;
        }

        // SCENARIUSZ 1: Wznawiamy Timer (Odliczanie w dół)
        if (state.timer.timeLeft > 0) {
            startTimer(state.timer.timeLeft, state.timer.onTimerEnd);
        }

        // SCENARIUSZ 2: Wznawiamy przerwę typu "START..."
        // Sprawdzamy, czy na ekranie jest tekst "START..." i czy to faza przerwy
        else if (currentStep && currentStep.isRest && focus.timerDisplay?.textContent?.includes("START")) {

            // Dynamiczny import, aby uniknąć cyklicznej zależności z training.js
            const { moveToNextExercise } = await import('./training.js');

            // Przywracamy timeout przejścia (dajemy 2 sekundy na przygotowanie)
            state.breakTimeoutId = setTimeout(() => {
                state.breakTimeoutId = null;
                moveToNextExercise({ skipped: false });
            }, 2000);
        }

        // SCENARIUSZ 3: Wznawiamy Stoper (Ćwiczenie na powtórzenia)
        else if (currentStep && !currentStep.isRest) {
            // Po prostu uruchamiamy interwał, startStopwatch nie zeruje stanu jeśli seconds > 0
            startStopwatch();
        }

        // Zmiana ikony na Pauzę
        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`;
            focus.pauseResumeBtn.classList.remove('paused-state');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }
};
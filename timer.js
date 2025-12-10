// timer.js

import { state } from './state.js';
import { focus } from './dom.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

// --- FORMATOWANIE CZASU (m:ss) ---
// Helper zapewniający spójny format: minuty bez zera wiodącego, sekundy z zerem.
const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    // Format: m:ss (np. 0:05, 1:30, 10:00)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// --- TIMER (Odliczanie w dół lub w górę z limitem) ---

export const updateTimerDisplay = () => {
    let timeToDisplay = state.timer.timeLeft;

    // Jeśli tryb countUp jest aktywny (dla ćwiczeń na czas), obliczamy czas upływający
    if (state.timer.countUp && state.timer.initialDuration) {
        timeToDisplay = state.timer.initialDuration - state.timer.timeLeft;
        // Zabezpieczenie przed ujemnym wynikiem przy lagach
        if (timeToDisplay < 0) timeToDisplay = 0;
    }

    const formattedTime = formatTime(timeToDisplay);

    if (focus.timerDisplay) {
        focus.timerDisplay.textContent = formattedTime;
    }
};

export const stopTimer = () => {
    if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
    }
    state.timer.isActive = false;
    state.timer.countUp = false; // Reset trybu
    state.timer.initialDuration = 0;
};

/**
 * Uruchamia timer.
 * @param {number} seconds - Czas trwania
 * @param {function} onEndCallback - Funkcja wywoływana po zakończeniu
 * @param {function} onTickCallback - Funkcja wywoływana co sekundę (np. sync do Cast)
 * @param {boolean} countUp - Czy wizualnie liczyć od 0 w górę (domyślnie false = odliczanie w dół)
 */
export const startTimer = (seconds, onEndCallback, onTickCallback = null, countUp = false) => {
    stopTimer();
    state.timer.timeLeft = seconds;
    state.timer.initialDuration = seconds; // Zapamiętujemy start dla trybu countUp
    state.timer.isActive = true;
    state.timer.countUp = countUp;
    state.timer.onTimerEnd = onEndCallback;

    // Jeśli jest pauza i wznawiamy, ikona powinna być już ustawiona na Pauzę w togglePauseTimer
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
        
        if (onTickCallback) onTickCallback();

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

// --- STOPER (Odliczanie w górę bez limitu - dla powtórzeń) ---

export const updateStopwatchDisplay = () => {
    const formattedTime = formatTime(state.stopwatch.seconds);

    if (focus.timerDisplay) {
        focus.timerDisplay.classList.remove('rep-based-text');
        focus.timerDisplay.textContent = formattedTime;
    }

    if (getIsCasting()) {
        sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
    }
};

export const startStopwatch = () => {
    stopStopwatch();
    // UWAGA: Nie zerujemy tutaj seconds, jeśli wznawiamy z pauzy.
    // Zerowanie odbywa się w training.js przy starcie nowego ćwiczenia.

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

        // SCENARIUSZ 1: Wznawiamy Timer (Odliczanie w dół lub w górę z limitem)
        if (state.timer.timeLeft > 0) {
            // Przekazujemy true dla countUp, jeśli był wcześniej ustawiony
            startTimer(state.timer.timeLeft, state.timer.onTimerEnd, null, state.timer.countUp);
        }

        // SCENARIUSZ 2: Wznawiamy przerwę typu "START..."
        else if (currentStep && currentStep.isRest && focus.timerDisplay?.textContent?.includes("START")) {
            const { moveToNextExercise } = await import('./training.js');
            state.breakTimeoutId = setTimeout(() => {
                state.breakTimeoutId = null;
                moveToNextExercise({ skipped: false });
            }, 2000);
        }

        // SCENARIUSZ 3: Wznawiamy Stoper (Ćwiczenie na powtórzenia)
        else if (currentStep && !currentStep.isRest) {
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
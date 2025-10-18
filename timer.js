import { state } from './state.js';
import { focus } from './dom.js';

export const updateTimerDisplay = () => {
    const minutes = Math.floor(state.timer.timeLeft / 60);
    const seconds = state.timer.timeLeft % 60;
    focus.timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export const stopTimer = () => {
    clearInterval(state.timer.interval);
    state.timer.isActive = false;
};

export const startTimer = (seconds, onEndCallback) => {
    stopTimer();
    state.timer.timeLeft = seconds;
    state.timer.isActive = true;
    focus.pauseResumeBtn.textContent = 'Pauza';
    updateTimerDisplay();
    state.timer.interval = setInterval(() => {
        state.timer.timeLeft--;
        updateTimerDisplay();
        if (state.timer.timeLeft <= 0) {
            state.completionSound();
            if (navigator.vibrate) navigator.vibrate(200);
            onEndCallback();
        }
    }, 1000);
};

export const togglePauseTimer = () => {
    if (state.timer.isActive) {
        stopTimer();
        focus.pauseResumeBtn.textContent = 'Wznów';
    } else {
        if (state.timer.timeLeft > 0) {
             startTimer(state.timer.timeLeft, focus.onTimerEnd); // onTimerEnd will be attached to focus
        }
    }
};

/**
 * Aktualizuje wyświetlacz stopera, formatując czas do MM:SS.
 */
export const updateStopwatchDisplay = () => {
    const minutes = Math.floor(state.stopwatch.seconds / 60);
    const seconds = state.stopwatch.seconds % 60;
    focus.timerDisplay.classList.remove('rep-based-text'); // Upewnij się, że tekst jest w stylu timera
    focus.timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

/**
 * Startuje stoper, resetując go i rozpoczynając odliczanie w górę.
 */
export const startStopwatch = () => {
    stopStopwatch(); // Zatrzymaj poprzedni, jeśli działał
    state.stopwatch.seconds = 0;
    updateStopwatchDisplay();
    state.stopwatch.interval = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay();
    }, 1000);
};

/**
 * Zatrzymuje stoper, czyszcząc interwał.
 */
export const stopStopwatch = () => {
    clearInterval(state.stopwatch.interval);
    state.stopwatch.interval = null;
};
// timer.js - WERSJA ZOPTYMALIZOWANA

import { state } from './state.js';
import { focus } from './dom.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

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
    state.timer.onTimerEnd = onEndCallback;
    
    focus.pauseResumeBtn.textContent = 'Pauza';
    updateTimerDisplay();

    state.timer.interval = setInterval(() => {
        state.timer.timeLeft--;
        updateTimerDisplay();

        // KLUCZOWA OPTYMALIZACJA: Wysyłaj co sekundę TYLKO zmieniający się czas
        if (getIsCasting()) {
            sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
        }

        if (state.timer.timeLeft <= 0) {
            state.completionSound();
            if (navigator.vibrate) navigator.vibrate(200);
            if (onEndCallback) {
                onEndCallback();
            }
        }
    }, 1000);
};

export const togglePauseTimer = () => {
    if (state.timer.isActive) {
        stopTimer();
        focus.pauseResumeBtn.textContent = 'Wznów';
    } else {
        if (state.timer.timeLeft > 0) {
             startTimer(state.timer.timeLeft, state.timer.onTimerEnd);
        }
    }
};

export const updateStopwatchDisplay = () => {
    const minutes = Math.floor(state.stopwatch.seconds / 60);
    const seconds = state.stopwatch.seconds % 60;
    focus.timerDisplay.classList.remove('rep-based-text');
    focus.timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    // KLUCZOWA OPTYMALIZACJA: Wysyłaj co sekundę TYLKO zmieniający się czas
    if (getIsCasting()) {
        sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
    }
};

export const startStopwatch = () => {
    stopStopwatch();
    state.stopwatch.seconds = 0;
    updateStopwatchDisplay();
    state.stopwatch.interval = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay();
    }, 1000);
};

export const stopStopwatch = () => {
    clearInterval(state.stopwatch.interval);
    state.stopwatch.interval = null;
};
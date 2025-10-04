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
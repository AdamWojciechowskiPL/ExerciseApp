// timer.js

import { state } from './state.js';
import { focus } from './dom.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

// --- FORMATOWANIE CZASU (m:ss) ---
const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
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
    state.timer.countUp = false;
};

/**
 * Uruchamia timer.
 */
export const startTimer = (seconds, onEndCallback, onTickCallback = null, countUp = false) => {
    stopTimer();

    state.timer.timeLeft = seconds;

    if (!state.timer.initialDuration || state.timer.initialDuration < seconds) {
        state.timer.initialDuration = seconds;
    }

    state.timer.isActive = true;
    state.timer.countUp = countUp;
    state.timer.onTimerEnd = onEndCallback;

    if (focus.pauseResumeBtn) {
        focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`;
        focus.pauseResumeBtn.classList.remove('paused-state');
    }

    updateTimerDisplay();

    state.timer.interval = setInterval(() => {
        state.timer.timeLeft--;
        updateTimerDisplay();

        if (getIsCasting()) {
            sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
        }

        if (onTickCallback) onTickCallback();

        if (state.timer.timeLeft <= 0) {
            stopTimer();
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

    if (state.stopwatch.seconds === undefined) state.stopwatch.seconds = 0;

    updateStopwatchDisplay();

    // --- KALKULACJA CELU CZASOWEGO (Dla sygnału dźwiękowego) ---
    let targetAudioAlertTime = null;
    const currentEx = state.flatExercises[state.currentExerciseIndex];

    if (currentEx && currentEx.isWork) {
        const valStr = String(currentEx.reps_or_time || "").toLowerCase();

        // Sprawdzamy typ celu (czas czy powtórzenia)
        const isTimeBased = valStr.includes('s') || valStr.includes('min') || valStr.includes(':');

        if (isTimeBased) {
            // --- NAPRAWA: Obsługa sygnału dla ćwiczeń czasowych (np. Plank 30s) ---
            let seconds = 0;
            if (valStr.includes('min')) {
                // np. "1 min", "1.5 min"
                const minMatch = valStr.match(/(\d+(?:[.,]\d+)?)/);
                if (minMatch) {
                    seconds = Math.round(parseFloat(minMatch[0].replace(',', '.')) * 60);
                }
            } else if (valStr.includes(':')) {
                // np. "1:30"
                const parts = valStr.split(':');
                if (parts.length === 2) {
                    seconds = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
                }
            } else {
                // np. "30 s", "45s"
                const secMatch = valStr.match(/(\d+)/);
                if (secMatch) {
                    seconds = parseInt(secMatch[0], 10);
                }
            }

            if (seconds > 0) {
                targetAudioAlertTime = seconds;
                console.log(`[AudioPace] Czasówka: Cel ustawiony na ${targetAudioAlertTime}s`);
            }

        } else {
            // --- Logika dla powtórzeń (Adaptive Pacing) ---
            // Regex bierze pierwszą liczbę (np. "10-12" -> 10)
            const repsMatch = valStr.match(/(\d+)/);
            const reps = repsMatch ? parseInt(repsMatch[0], 10) : 0;

            if (reps > 0) {
                // Pobieramy ID z biblioteki (priorytet) lub ID instancji
                const exId = currentEx.exerciseId || currentEx.id;

                // Ustalanie tempa: Personalne -> Globalne -> Default (6s)
                let pace = state.settings.secondsPerRep || 6;
                let source = "Global Default";

                if (state.exercisePace && state.exercisePace[exId]) {
                    pace = state.exercisePace[exId];
                    source = "Personal Stats";
                }

                targetAudioAlertTime = Math.round(reps * pace);
                console.log(`[AudioPace] Powtórzenia: Cel ustawiony na ${targetAudioAlertTime}s (Reps=${reps}, Pace=${pace}s [${source}])`);
            }
        }
    }

    state.stopwatch.interval = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay();

        // --- SYGNAŁ DŹWIĘKOWY PO OSIĄGNIĘCIU CELU ---
        if (targetAudioAlertTime && state.stopwatch.seconds === targetAudioAlertTime) {
            console.log(`[AudioPace] Target reached (${targetAudioAlertTime}s). Playing sound.`);
            state.completionSound();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // Dłuższa wibracja dla wyróżnienia
        }

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

    if (state.timer.isActive || state.stopwatch.interval || state.breakTimeoutId) {
        // PAUZA
        state.isPaused = true;
        state.lastPauseStartTime = now;

        stopTimer();
        stopStopwatch();

        if (state.breakTimeoutId) {
            clearTimeout(state.breakTimeoutId);
            state.breakTimeoutId = null;
        }

        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-play.svg" alt="Wznów">`;
            focus.pauseResumeBtn.classList.add('paused-state');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';

    } else {
        // WZNOWIENIE
        if (state.isPaused && state.lastPauseStartTime) {
            const pausedDuration = now - state.lastPauseStartTime;
            state.totalPausedTime += pausedDuration;
            state.isPaused = false;
            state.lastPauseStartTime = null;
        }

        if (state.timer.timeLeft > 0) {
            startTimer(state.timer.timeLeft, state.timer.onTimerEnd, null, state.timer.countUp);
        }
        else if (currentStep && currentStep.isRest && focus.timerDisplay?.textContent?.includes("START")) {
            const { moveToNextExercise } = await import('./training.js');
            state.breakTimeoutId = setTimeout(() => {
                state.breakTimeoutId = null;
                moveToNextExercise({ skipped: false });
            }, 2000);
        }
        else if (currentStep && !currentStep.isRest) {
            startStopwatch();
        }

        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`;
            focus.pauseResumeBtn.classList.remove('paused-state');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }
};
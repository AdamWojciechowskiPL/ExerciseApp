// ExerciseApp/timer.js
import { state } from './state.js';
import { focus } from './dom.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

// --- FORMATOWANIE CZASU (m:ss) ---
const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// --- TIMER (Odliczanie W DÓŁ - TYLKO DLA PRZERW) ---

export const updateTimerDisplay = () => {
    let timeToDisplay = state.timer.timeLeft;

    // Obsługa countUp w timerze (rzadkie przypadki - opcjonalne)
    if (state.timer.countUp && state.timer.initialDuration) {
        timeToDisplay = state.timer.initialDuration - state.timer.timeLeft;
        if (timeToDisplay < 0) timeToDisplay = 0;
    }

    const formattedTime = formatTime(timeToDisplay);

    if (focus.timerDisplay) {
        focus.timerDisplay.textContent = formattedTime;
        // W trybie przerwy (Timer) nie używamy klasy target-reached
        focus.timerDisplay.classList.remove('target-reached');
        // Opcjonalnie można dodać klasę .rest-mode dla koloru niebieskiego
        focus.timerDisplay.classList.add('rest-mode'); 
    }
};

export const stopTimer = () => {
    if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
    }
    state.timer.isActive = false;
};

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
        focus.pauseResumeBtn.innerHTML = `<svg><use href="#icon-pause"/></svg>`;
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

// --- STOPER (Odliczanie W GÓRĘ - DLA WSZYSTKICH ĆWICZEŃ) ---

export const updateStopwatchDisplay = (targetTime = null) => {
    const formattedTime = formatTime(state.stopwatch.seconds);

    if (focus.timerDisplay) {
        focus.timerDisplay.classList.remove('rest-mode');
        focus.timerDisplay.classList.remove('rep-based-text');
        focus.timerDisplay.textContent = formattedTime;

        // Wizualna wskazówka, że cel został osiągnięty (OVERRUN)
        if (targetTime && state.stopwatch.seconds >= targetTime) {
            focus.timerDisplay.classList.add('target-reached');
        } else {
            focus.timerDisplay.classList.remove('target-reached');
        }
    }

    if (getIsCasting()) {
        sendTrainingStateUpdate({ timerValue: focus.timerDisplay.textContent });
    }
};

export const startStopwatch = () => {
    stopStopwatch();

    // Upewniamy się, że sekundy są zainicjowane
    if (state.stopwatch.seconds === undefined) state.stopwatch.seconds = 0;

    // 1. Ustalanie Celu (Target Time) dla sygnału dźwiękowego
    let targetAudioAlertTime = null;
    const currentEx = state.flatExercises[state.currentExerciseIndex];

    if (currentEx && currentEx.isWork) {
        const valStr = String(currentEx.reps_or_time || "").toLowerCase();

        // Logika parsowania celu
        if (valStr.includes('s') || valStr.includes('min') || valStr.includes(':')) {
            // Czasówka (np. "45 s", "1:30", "2 min")
            let seconds = 0;
            if (valStr.includes(':')) {
                const parts = valStr.split(':');
                if (parts.length === 2) seconds = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
            } else if (valStr.includes('min')) {
                const minMatch = valStr.match(/(\d+(?:[.,]\d+)?)/);
                if (minMatch) seconds = Math.round(parseFloat(minMatch[0].replace(',', '.')) * 60);
            } else {
                const secMatch = valStr.match(/(\d+)/);
                if (secMatch) seconds = parseInt(secMatch[0], 10);
            }
            if (seconds > 0) targetAudioAlertTime = seconds;

        } else {
            // Powtórzenia (np. "12") - estymacja czasu na podstawie tempa
            // To ważne: nawet przy powtórzeniach chcemy znać orientacyjny czas, żeby dać sygnał
            const repsMatch = valStr.match(/(\d+)/);
            const reps = repsMatch ? parseInt(repsMatch[0], 10) : 0;
            if (reps > 0) {
                const exId = currentEx.exerciseId || currentEx.id;
                let pace = state.settings.secondsPerRep || 6;
                // Jeśli mamy specyficzne tempo dla tego ćwiczenia (Adaptive Pacing)
                if (state.exercisePace && state.exercisePace[exId]) pace = state.exercisePace[exId];
                targetAudioAlertTime = Math.round(reps * pace);
            }
        }
    }

    console.log(`[Stopwatch] Started. Seconds: ${state.stopwatch.seconds}, Target Alert: ${targetAudioAlertTime}s`);
    updateStopwatchDisplay(targetAudioAlertTime);

    // 2. Pętla Stopera (NIGDY SIĘ SAMA NIE KOŃCZY - Czeka na usera)
    state.stopwatch.interval = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay(targetAudioAlertTime);

        // SYGNAŁ DŹWIĘKOWY (Tylko raz, dokładnie w momencie osiągnięcia celu)
        if (targetAudioAlertTime && state.stopwatch.seconds === targetAudioAlertTime) {
            console.log(`[Stopwatch] Target reached (${targetAudioAlertTime}s). Playing sound.`);
            state.completionSound();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
            focus.pauseResumeBtn.innerHTML = `<svg><use href="#icon-play"/></svg>`;
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

        // KLUCZOWE: Jeśli to ćwiczenie (isWork) -> ZAWSZE wznawiamy STOPER (liczenie w górę)
        if (currentStep && currentStep.isWork) {
            startStopwatch();
        }
        // Jeśli to przerwa (isRest) -> wznawiamy Timer (odliczanie w dół)
        else if (state.timer.timeLeft > 0) {
            startTimer(state.timer.timeLeft, state.timer.onTimerEnd, null, state.timer.countUp);
        }
        // Specyficzny przypadek startu (opóźnione przejście)
        else if (currentStep && currentStep.isRest && focus.timerDisplay?.textContent?.includes("START")) {
            const { moveToNextExercise } = await import('./training.js');
            state.breakTimeoutId = setTimeout(() => {
                state.breakTimeoutId = null;
                moveToNextExercise({ skipped: false });
            }, 2000);
        }

        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<svg><use href="#icon-pause"/></svg>`;
            focus.pauseResumeBtn.classList.remove('paused-state');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }
};
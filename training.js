// training.js

import { state } from './state.js';
import { focus, screens, initializeFocusElements } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, startStopwatch, stopStopwatch, updateTimerDisplay, updateStopwatchDisplay } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS, getHydratedDay } from './utils.js';
import { navigateTo } from './ui.js';
import { renderSummaryScreen } from './ui/screens/summary.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';

/**
 * Synchronizacja z Chromecastem
 */
function syncStateToChromecast() {
    if (!getIsCasting()) return;

    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise) return;

    let nextWorkExercise = null;
    for (let i = state.currentExerciseIndex + 1; i < state.flatExercises.length; i++) {
        if (state.flatExercises[i].isWork) {
            nextWorkExercise = state.flatExercises[i];
            break;
        }
    }

    const payload = {
        sectionName: exercise.sectionName || '',
        timerValue: focus.timerDisplay?.textContent || '0:00',
        exerciseName: exercise.isWork ? `${exercise.name} (Seria ${exercise.currentSet}/${exercise.totalSets})` : exercise.name,
        exerciseDetails: exercise.isWork ? `Cel: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}` : `Następne: ${(state.flatExercises[state.currentExerciseIndex + 1] || {}).name || ''}`,
        nextExercise: nextWorkExercise ? nextWorkExercise.name : 'Koniec',
        isRest: !exercise.isWork,
        animationSvg: exercise.animationSvg || null
    };

    sendTrainingStateUpdate(payload);
}

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;

    let duration = state.stopwatch.seconds > 0 ? state.stopwatch.seconds : 0;

    const newLogEntry = {
        name: exercise.name,
        exerciseId: exercise.id || exercise.exerciseId,
        currentSet: exercise.currentSet,
        totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time,
        tempo_or_iso: exercise.tempo_or_iso,
        status: status,
        duration: duration > 0 ? duration : '-'
    };

    const existingEntryIndex = state.sessionLog.findIndex(
        entry => entry.name === newLogEntry.name && entry.currentSet === newLogEntry.currentSet
    );

    if (existingEntryIndex > -1) {
        state.sessionLog[existingEntryIndex] = newLogEntry;
    } else {
        state.sessionLog.push(newLogEntry);
    }
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch();
    stopTimer();

    if (state.tts.isSupported) state.tts.synth.cancel();

    if (options.skipped) {
        logCurrentStep('skipped');
    } else {
        logCurrentStep('completed');
    }

    if (state.breakTimeoutId) {
        clearTimeout(state.breakTimeoutId);
        state.breakTimeoutId = null;
    }

    if (state.currentExerciseIndex < state.flatExercises.length - 1) {
        startExercise(state.currentExerciseIndex + 1);
    } else {
        state.finalCompletionSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        renderSummaryScreen();
    }
}

export function moveToPreviousExercise() {
    stopStopwatch();
    stopTimer();

    if (state.breakTimeoutId) {
        clearTimeout(state.breakTimeoutId);
        state.breakTimeoutId = null;
    }

    if (state.currentExerciseIndex > 0) {
        if (state.tts.isSupported) state.tts.synth.cancel();
        startExercise(state.currentExerciseIndex - 1);
    }
}

export function startExercise(index) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];

    // 1. Aktualizacja UI ogólnego
    if (focus.ttsIcon) {
        focus.ttsIcon.src = state.tts.isSoundOn ? '/icons/sound-on.svg' : '/icons/sound-off.svg';
    }

    if (focus.prevStepBtn) {
        focus.prevStepBtn.disabled = (index === 0);
    }
    if (focus.progress) {
        focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
    }

    // 2. Obsługa Stanu Pauzy
    if (state.isPaused) {
        state.lastPauseStartTime = Date.now();
        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-play.svg" alt="Wznów">`;
            focus.pauseResumeBtn.classList.add('paused-state');
            focus.pauseResumeBtn.classList.remove('hidden');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';
    } else {
        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`;
            focus.pauseResumeBtn.classList.remove('paused-state');
            focus.pauseResumeBtn.classList.remove('hidden');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }

    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');
    const flipIndicator = document.querySelector('.flip-indicator');

    if (animContainer) animContainer.innerHTML = '';

    // ============================================================
    // SCENARIUSZ A: ĆWICZENIE (WORK) - ZAWSZE STOPER
    // ============================================================
    if (exercise.isWork) {
        focus.sectionName.textContent = exercise.sectionName;
        focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
        focus.exerciseDetails.textContent = `Cel: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
        focus.focusDescription.textContent = exercise.description || '';

        if (exercise.animationSvg && animContainer && descContainer) {
            animContainer.innerHTML = exercise.animationSvg;
            animContainer.classList.remove('hidden');
            descContainer.classList.add('hidden');
            if (flipIndicator) flipIndicator.classList.remove('hidden');
        } else if (animContainer && descContainer) {
            animContainer.classList.add('hidden');
            descContainer.classList.remove('hidden');
            if (flipIndicator) flipIndicator.classList.add('hidden');
        }

        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; }
        }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : "Koniec treningu";

        stopTimer();

        focus.repBasedDoneBtn.classList.remove('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        focus.timerDisplay.classList.remove('rep-based-text');

        state.stopwatch.seconds = 0;
        updateStopwatchDisplay();

        if (!state.isPaused) {
            startStopwatch();

            if (state.tts.isSoundOn) {
                let announcement = `Wykonaj: ${exercise.name}, seria ${exercise.currentSet} z ${exercise.totalSets}. Cel: ${formatForTTS(exercise.reps_or_time)}.`;
                speak(announcement, true, () => { speak(formatForTTS(exercise.description), false); });
            }
        }
    }
    // ============================================================
    // SCENARIUSZ B: PRZERWA (REST) - ZAWSZE TIMER (Odliczanie)
    // ============================================================
    else {
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');

        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) { moveToNextExercise({ skipped: false }); return; }

        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');

        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { afterUpcomingExercise = state.flatExercises[i]; break; }
        }

        focus.sectionName.textContent = (exercise.sectionName || "PRZERWA").toUpperCase();

        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Cel: ${upcomingExercise.reps_or_time} | Tempo: ${upcomingExercise.tempo_or_iso}`;
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : "Koniec treningu";

        focus.timerDisplay.classList.remove('rep-based-text');

        const startNextExercise = () => moveToNextExercise({ skipped: false });

        // ZMIANA: Sztywne 5 sekund, niezależnie od tego co przyszło z generatora (fallback)
        const restDuration = 5;

        state.timer.timeLeft = restDuration;
        updateTimerDisplay();

        if (!state.isPaused) {
            if (state.tts.isSoundOn) {
                let announcement = `Odpocznij. Następnie: ${upcomingExercise.name}, seria ${upcomingExercise.currentSet}. Cel: ${formatForTTS(exercise.reps_or_time)}.`;
                speak(announcement, true);
                startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast);
            } else {
                startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast);
            }
        }
    }

    syncStateToChromecast();
}

export function generateFlatExercises(dayData) {
    const plan = [];

    // ZMIANA: Usunięto logikę pobierania czasów z planu.
    // Zdefiniowano stałą wartość przerwy.
    const FIXED_REST_DURATION = 5;

    const sections = [{ name: 'Rozgrzewka', exercises: dayData.warmup || [] }, { name: 'Część główna', exercises: dayData.main || [] }, { name: 'Schłodzenie', exercises: dayData.cooldown || [] }];
    sections.forEach(section => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const setCount = parseSetCount(exercise.sets);
            for (let i = 1; i <= setCount; i++) {
                plan.push({ ...exercise, isWork: true, sectionName: section.name, currentSet: i, totalSets: setCount });

                // PRZERWA MIĘDZY SERIAMI - ZAWSZE 5 SEKUND
                if (i < setCount) {
                    plan.push({
                        name: 'Odpoczynek',
                        isRest: true,
                        isWork: false,
                        duration: FIXED_REST_DURATION,
                        sectionName: 'Przerwa między seriami'
                    });
                }
            }
            // PRZERWA MIĘDZY ĆWICZENIAMI - ZAWSZE 5 SEKUND
            if (exerciseIndex < section.exercises.length - 1) {
                plan.push({
                    name: 'Przerwa',
                    isRest: true,
                    isWork: false,
                    duration: FIXED_REST_DURATION,
                    sectionName: 'Przerwa'
                });
            }
        });
    });
    if (plan.length > 0 && plan[plan.length - 1].isRest) {
        plan.pop();
    }
    return plan;
}

export async function startModifiedTraining() {
    state.sessionStartTime = new Date();
    state.totalPausedTime = 0;
    state.isPaused = false;
    state.lastPauseStartTime = null;

    let sourcePlan;

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === state.currentTrainingDayId) {
        console.log("🚀 Start treningu: Używam DYNAMICZNEGO planu (Mixer)");
        sourcePlan = state.todaysDynamicPlan;
    } else {
        console.log("ℹ️ Start treningu: Używam STATYCZNEGO planu (Fallback)");
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        if (!activePlan) {
            console.error("No active training plan found in state!");
            return;
        }
        const dayDataRaw = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
        sourcePlan = getHydratedDay(dayDataRaw);
    }

    const modifiedDay = JSON.parse(JSON.stringify(sourcePlan));

    const allExercises = [...(modifiedDay.warmup || []), ...(modifiedDay.main || []), ...(modifiedDay.cooldown || [])];
    const allInputs = screens.preTraining.querySelectorAll('input[data-exercise-index]');

    allInputs.forEach(input => {
        const index = parseInt(input.dataset.exerciseIndex, 10);
        const targetExercise = allExercises[index];
        if (targetExercise) {
            if (input.id.startsWith('sets-')) {
                targetExercise.sets = input.value;
            } else if (input.id.startsWith('reps-')) {
                targetExercise.reps_or_time = input.value;
            }
        }
    });

    let currentIndex = 0;
    if (modifiedDay.warmup) {
        modifiedDay.warmup = allExercises.slice(currentIndex, currentIndex + modifiedDay.warmup.length);
        currentIndex += modifiedDay.warmup.length;
    }
    if (modifiedDay.main) {
        modifiedDay.main = allExercises.slice(currentIndex, currentIndex + modifiedDay.main.length);
        currentIndex += modifiedDay.main.length;
    }
    if (modifiedDay.cooldown) {
        modifiedDay.cooldown = allExercises.slice(currentIndex, currentIndex + modifiedDay.cooldown.length);
    }

    state.sessionLog = [];

    // START TRENINGU - ZAWSZE 5 SEKUND
    state.flatExercises = [
        { name: "Przygotuj się", isRest: true, isWork: false, duration: 5, sectionName: "Start" },
        ...generateFlatExercises(modifiedDay)
    ];

    navigateTo('training');
    initializeFocusElements();

    startExercise(0);
}
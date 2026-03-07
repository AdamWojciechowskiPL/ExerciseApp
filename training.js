import { state } from './state.js';
import { focus, screens, initializeFocusElements } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, startStopwatch, stopStopwatch, updateTimerDisplay, updateStopwatchDisplay } from './timer.js';
import { formatForTTS, processSVG } from './utils.js';
import { navigateTo } from './ui.js';
import { renderSummaryScreen } from './ui/screens/summary.js';
import { getAffinityBadge } from './ui/templates.js';
import dataStore from './dataStore.js';
import { syncStateToChromecast } from './training/castSync.js';
import {
    hydrateStateFromBackup,
    startBackupInterval,
    startSessionClock,
    stopBackupInterval,
    stopSessionClock,
    triggerSessionBackup
} from './training/sessionBackup.js';
import { generateFlatExercises as generateFlatExercisesFromDay } from './training/flatPlanGenerator.js';
import {
    fitText,
    initProgressBar,
    updatePauseButtonState,
    updateProgressBar,
    updateTrainingHeaderControls
} from './training/uiBridge.js';

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;

    let netDuration = 0;
    if (state.stopwatch.interval || state.stopwatch.seconds > 0) {
        netDuration = state.stopwatch.seconds;
    } else if (state.timer.isActive || state.timer.initialDuration > 0) {
        netDuration = state.timer.initialDuration - state.timer.timeLeft;
        if (netDuration < 0) netDuration = 0;
    }

    const entryUniqueId = exercise.uniqueId || `${exercise.id}_${Date.now()}`;
    const newLogEntry = {
        uniqueId: entryUniqueId,
        name: exercise.name,
        exerciseId: exercise.id || exercise.exerciseId,
        categoryId: exercise.categoryId,
        difficultyLevel: parseInt(exercise.difficultyLevel || 1, 10),
        currentSet: exercise.currentSet,
        totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time,
        tempo_or_iso: exercise.tempo_or_iso,
        status,
        duration: netDuration > 0 ? netDuration : 0,
        rating: null,
        rir: null,
        tech: null,
        promptType: 'none'
    };

    const existingEntryIndex = state.sessionLog.findIndex((entry) => entry.uniqueId === newLogEntry.uniqueId);
    if (existingEntryIndex > -1) {
        newLogEntry.rating = state.sessionLog[existingEntryIndex].rating;
        newLogEntry.rir = state.sessionLog[existingEntryIndex].rir;
        newLogEntry.tech = state.sessionLog[existingEntryIndex].tech;
        newLogEntry.promptType = state.sessionLog[existingEntryIndex].promptType;
        state.sessionLog[existingEntryIndex] = newLogEntry;
        return;
    }

    state.sessionLog.push(newLogEntry);
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch();
    stopTimer();

    if (state.tts.isSupported) state.tts.synth.cancel();
    logCurrentStep(options.skipped ? 'skipped' : 'completed');

    if (state.breakTimeoutId) {
        clearTimeout(state.breakTimeoutId);
        state.breakTimeoutId = null;
    }

    triggerSessionBackup();

    if (state.currentExerciseIndex < state.flatExercises.length - 1) {
        startExercise(state.currentExerciseIndex + 1);
        return;
    }

    stopBackupInterval();
    stopSessionClock();
    state.finalCompletionSound();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    renderSummaryScreen();
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

export async function startExercise(index, isResuming = false) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];

    updateTrainingHeaderControls(index);
    updateProgressBar();
    updatePauseButtonState();

    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');
    const flipIndicator = document.querySelector('.flip-indicator');

    if (animContainer) animContainer.innerHTML = '';

    if (exercise.hasAnimation && exercise.isWork) {
        if (animContainer) {
            animContainer.classList.remove('hidden');
            animContainer.innerHTML = '<div class="spinner-dots"></div><style>.spinner-dots { width:30px; height:30px; border:4px solid #ccc; border-top-color:var(--primary-color); border-radius:50%; animation:spin 1s linear infinite; }</style>';
        }
        if (descContainer) descContainer.classList.add('hidden');
        if (flipIndicator) flipIndicator.classList.remove('hidden');

        dataStore.fetchExerciseAnimation(exercise.exerciseId || exercise.id).then((rawSvg) => {
            if (rawSvg && state.currentExerciseIndex === index) {
                const cleanSvg = processSVG(rawSvg);
                exercise.animationSvg = cleanSvg;
                if (animContainer) animContainer.innerHTML = cleanSvg;
                syncStateToChromecast();
            }
        });
    } else {
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');
    }

    if (exercise.isWork) {
        focus.exerciseName.textContent = exercise.name;
        fitText(focus.exerciseName);
        focus.exerciseDetails.textContent = `Seria ${exercise.currentSet}/${exercise.totalSets} | Cel: ${exercise.reps_or_time}`;

        if (focus.tempo) {
            const tempoVal = exercise.tempo_or_iso || 'Kontrolowane';
            focus.tempo.textContent = `Tempo: ${tempoVal}`;
            focus.tempo.classList.remove('hidden');
        }

        focus.focusDescription.textContent = exercise.description || '';
        if (focus.affinityBadge) focus.affinityBadge.innerHTML = getAffinityBadge(exercise.exerciseId || exercise.id);

        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) {
                nextWorkExercise = state.flatExercises[i];
                break;
            }
        }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : 'Koniec treningu';

        if (!isResuming) {
            stopTimer();
            state.stopwatch.seconds = 0;
        }

        updateStopwatchDisplay();

        focus.repBasedDoneBtn.classList.remove('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        focus.timerDisplay.classList.remove('rep-based-text');

        if (!state.isPaused) {
            startStopwatch();

            if (!isResuming && state.tts.isSoundOn) {
                let announcement = `Ćwicz: ${exercise.name}. `;
                if (exercise.reps_or_time) {
                    announcement += `Cel: ${formatForTTS(exercise.reps_or_time)}.`;
                }
                speak(announcement, true, () => {
                    if (exercise.description) speak(formatForTTS(exercise.description), false);
                });
            }
        }
    } else {
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');
        if (focus.affinityBadge) focus.affinityBadge.innerHTML = '';

        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) {
            moveToNextExercise({ skipped: false });
            return;
        }

        if (focus.tempo) {
            const nextTempo = upcomingExercise.tempo_or_iso || 'Kontrolowane';
            focus.tempo.textContent = `Tempo: ${nextTempo}`;
            focus.tempo.classList.remove('hidden');
        }

        if (upcomingExercise.hasAnimation) {
            dataStore.fetchExerciseAnimation(upcomingExercise.exerciseId || upcomingExercise.id);
        }

        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');

        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) {
                afterUpcomingExercise = state.flatExercises[i];
                break;
            }
        }

        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        fitText(focus.exerciseName);
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Cel: ${upcomingExercise.reps_or_time}`;
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : 'Koniec treningu';
        focus.timerDisplay.classList.remove('rep-based-text');
        focus.timerDisplay.classList.remove('target-reached');

        const startNextExercise = () => moveToNextExercise({ skipped: false });

        if (!isResuming) {
            const restDuration = exercise.duration || 5;
            state.timer.timeLeft = restDuration;
        }

        updateTimerDisplay();

        if (!state.isPaused) {
            if (!isResuming && state.tts.isSoundOn) {
                const announcement = `Odpocznij. Następnie: ${upcomingExercise.name}.`;
                speak(announcement, true);
            }
            startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast, false);
        }
    }

    syncStateToChromecast();
    triggerSessionBackup();
}

export function generateFlatExercises(dayData) {
    return generateFlatExercisesFromDay(dayData, state.settings.restTimeFactor || 1.0);
}

export async function startModifiedTraining() {
    state.sessionStartTime = new Date();
    state.totalPausedTime = 0;
    state.isPaused = false;
    state.lastPauseStartTime = null;
    state.sessionDetailPromptCount = 0;

    let sourcePlan;

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        state.flatExercises = state.todaysDynamicPlan.flatExercises;
        state.sessionLog = [];
        navigateTo('training');
        initializeFocusElements();
        initProgressBar();
        startBackupInterval();
        startSessionClock();
        startExercise(0);
        triggerSessionBackup();
        return;
    }

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === state.currentTrainingDayId) {
        sourcePlan = state.todaysDynamicPlan;
    }

    if (!sourcePlan) {
        console.error('Critical: No source plan found in startModifiedTraining!');
        alert('Błąd: Nie znaleziono planu. Powrót do menu.');
        navigateTo('main');
        return;
    }

    const modifiedDay = JSON.parse(JSON.stringify(sourcePlan));
    const allExercises = [...(modifiedDay.warmup || []), ...(modifiedDay.main || []), ...(modifiedDay.cooldown || [])];
    const allInputs = screens.preTraining.querySelectorAll('input[data-exercise-index]');

    allInputs.forEach((input) => {
        const inputIndex = parseInt(input.dataset.exerciseIndex, 10);
        const targetExercise = allExercises[inputIndex];
        if (!targetExercise) return;

        if (input.id.startsWith('sets-')) targetExercise.sets = input.value;
        else if (input.id.startsWith('reps-')) targetExercise.reps_or_time = input.value;
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
    state.flatExercises = [
        { name: 'Przygotuj się', isRest: true, isWork: false, duration: 5, sectionName: 'Start', uniqueId: 'start_prep_0' },
        ...generateFlatExercises(modifiedDay)
    ];

    navigateTo('training');
    initializeFocusElements();
    initProgressBar();
    startBackupInterval();
    startSessionClock();
    startExercise(0);
    triggerSessionBackup();
}

export function resumeFromBackup(backup, timeGapMs) {
    console.log('[Training] 🔄 Resuming session from backup...');
    hydrateStateFromBackup(backup, timeGapMs);

    navigateTo('training');
    initializeFocusElements();
    initProgressBar();
    startBackupInterval();
    startSessionClock();
    startExercise(backup.currentExerciseIndex, true);
}

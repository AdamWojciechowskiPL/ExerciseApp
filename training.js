// training.js

import { state } from './state.js';
import { focus, screens } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer } from './timer.js';
import { getExerciseDuration, parseSetCount } from './utils.js';
import { TRAINING_PLAN } from './training-plan.js';
import { navigateTo, renderSummaryScreen } from './ui.js';
import dataStore from './dataStore.js';

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;

    let duration = 0;
    if (status === 'completed' && state.timer.startTime > 0) {
        duration = Math.round((Date.now() - state.timer.startTime) / 1000);
    }

    state.sessionLog.push({
        name: exercise.name,
        currentSet: exercise.currentSet,
        totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time,
        tempo_or_iso: exercise.tempo_or_iso,
        status: (duration > 0 || status === 'rep-based') ? 'completed' : (status === 'skipped' ? 'skipped' : 'unknown'),
        duration: duration > 0 ? duration : '-'
    });
}

export function moveToNextExercise(options = { skipped: false }) {
    if (state.tts.isSupported) state.tts.synth.cancel();
    
    const duration = getExerciseDuration(state.flatExercises[state.currentExerciseIndex]);
    if (options.skipped) {
        logCurrentStep('skipped');
    } else if (duration === null) {
        logCurrentStep('rep-based');
    } else {
        logCurrentStep('completed');
    }
    
    stopTimer();
    if (state.currentExerciseIndex < state.flatExercises.length - 1) {
        startExercise(state.currentExerciseIndex + 1);
    } else {
        navigateTo('summary');
        renderSummaryScreen();
    }
}

export function moveToPreviousExercise() {
    if (state.currentExerciseIndex > 0) {
        if (state.tts.isSupported) state.tts.synth.cancel();
        stopTimer();
        state.sessionLog.pop();
        startExercise(state.currentExerciseIndex - 1);
    }
}

export function startExercise(index) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];
    const nextExercise = state.flatExercises[index + 1];

    focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇';
    focus.prevStepBtn.disabled = (index === 0);
    focus.sectionName.textContent = exercise.sectionName;
    focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
    const nextName = nextExercise ? (nextExercise.isWork ? `${nextExercise.name} (Seria ${nextExercise.currentSet})` : nextExercise.name) : "Koniec treningu";
    focus.nextExerciseName.textContent = nextName;
    
    if (exercise.isWork) {
        focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
        focus.exerciseDetails.textContent = `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
        focus.exerciseInfoContainer.style.visibility = 'visible';
        focus.focusDescription.textContent = exercise.description || '';
        focus.ttsToggleBtn.style.display = 'inline-block';

        let announcement = `Następne ćwiczenie: ${exercise.name}, seria ${exercise.currentSet} z ${exercise.totalSets}.`;
        if (exercise.reps_or_time) announcement += ` Wykonaj ${exercise.reps_or_time}.`;
        if (exercise.tempo_or_iso) announcement += ` W tempie: ${exercise.tempo_or_iso}.`;
        
        speak(announcement, true, () => {
            speak(exercise.description, false);
        });

    } else {
        focus.exerciseName.textContent = exercise.name;
        focus.exerciseInfoContainer.style.visibility = 'hidden';
        focus.focusDescription.textContent = '';
        focus.ttsToggleBtn.style.display = 'none';
    }
    
    const duration = getExerciseDuration(exercise);
    if (duration !== null) {
        focus.timerDisplay.classList.remove('rep-based-text');
        focus.timerDisplay.style.display = 'block';
        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        startTimer(duration, () => moveToNextExercise({ skipped: false }));
    } else {
        focus.timerDisplay.classList.add('rep-based-text');
        stopTimer();
        focus.timerDisplay.textContent = "WYKONAJ";
        focus.repBasedDoneBtn.classList.remove('hidden');
        focus.pauseResumeBtn.classList.add('hidden');
    }
}

export function generateFlatExercises(dayData) {
    const plan = [];
    const sections = [
        { name: 'Rozgrzewka', exercises: dayData.warmup || [] },
        { name: 'Część główna', exercises: dayData.main || [] },
        { name: 'Schłodzenie', exercises: dayData.cooldown || [] }
    ];
    sections.forEach(section => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const setCount = parseSetCount(exercise.sets);
            for (let i = 1; i <= setCount; i++) {
                plan.push({ ...exercise, isWork: true, sectionName: section.name, currentSet: i, totalSets: setCount });
                if (i < setCount) {
                    plan.push({ name: 'Odpoczynek', isRest: true, duration: TRAINING_PLAN.GlobalRules.defaultRestSecondsBetweenSets, sectionName: 'Przerwa' });
                }
            }
            const isLastExerciseInSection = exerciseIndex === section.exercises.length - 1;
            if (!isLastExerciseInSection) {
                 plan.push({ name: 'Przerwa', isRest: true, duration: state.settings.restBetweenExercises, sectionName: 'Przerwa' });
            }
        });
    });
    return plan;
}

export function startModifiedTraining() {
    const trainingDay = TRAINING_PLAN.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    const modifiedDay = JSON.parse(JSON.stringify(trainingDay));

    const sectionKeys = ['warmup', 'main', 'cooldown'];
    const allExercises = sectionKeys.flatMap(key => modifiedDay[key] || []);

    const allInputs = screens.preTraining.querySelectorAll('input[data-original-name]');
    allInputs.forEach(input => {
        const exerciseName = input.dataset.originalName;
        const targetExercise = allExercises.find(ex => ex.name === exerciseName);
        if (targetExercise) {
            if (input.id.startsWith('sets-')) {
                targetExercise.sets = input.value;
            } else if (input.id.startsWith('reps-')) {
                targetExercise.reps_or_time = input.value;
            }
        }
    });
    
    // =================================================================
    // POPRAWIONA LOGIKA:
    // Czyścimy log sesji i przygotowujemy ćwiczenia.
    // NIE TWORZYMY tutaj wpisu 'in_progress' w state.userProgress.
    // Wpis zostanie utworzony dopiero po ZAKOŃCZENIU lub PRZERWANIU sesji.
    // =================================================================
    state.sessionLog = [];
    state.flatExercises = [
        { name: "Przygotuj się", isRest: true, duration: 5, sectionName: "Start" },
        ...generateFlatExercises(modifiedDay)
    ];
    
    startExercise(0);
    navigateTo('training');
}
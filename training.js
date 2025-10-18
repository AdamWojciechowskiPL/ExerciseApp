// training.js

import { state } from './state.js';
import { focus, screens } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, togglePauseTimer, startStopwatch, stopStopwatch } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS, getHydratedDay } from './utils.js';
import { TRAINING_PLANS } from './training-plans.js';
import { navigateTo, renderSummaryScreen } from './ui.js';

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;
    let duration = (status === 'rep-based' && state.stopwatch.seconds > 0) ? state.stopwatch.seconds : 0;
    if (status === 'completed' && state.timer.startTime > 0) {
        duration = Math.round((Date.now() - state.timer.startTime) / 1000);
    }
    state.sessionLog.push({
        name: exercise.name, currentSet: exercise.currentSet, totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time, tempo_or_iso: exercise.tempo_or_iso,
        status: status, duration: duration > 0 ? duration : '-'
    });
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch();
    if (state.tts.isSupported) state.tts.synth.cancel();
    const duration = getExerciseDuration(state.flatExercises[state.currentExerciseIndex]);
    if (options.skipped) { logCurrentStep('skipped'); } 
    else if (duration === null) { logCurrentStep('rep-based'); } 
    else { logCurrentStep('completed'); }
    stopTimer();
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
    focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇';
    focus.prevStepBtn.disabled = (index === 0);
    focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
    if (exercise.isWork) {
        focus.sectionName.textContent = exercise.sectionName;
        focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
        focus.exerciseDetails.textContent = `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
        focus.focusDescription.textContent = exercise.description || '';
        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; }
        }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : "Koniec treningu";
        const duration = getExerciseDuration(exercise);
        if (duration !== null) {
            focus.timerDisplay.classList.remove('rep-based-text');
            focus.repBasedDoneBtn.classList.add('hidden');
            focus.pauseResumeBtn.classList.remove('hidden');
            startTimer(duration, () => moveToNextExercise({ skipped: false }));
        } else {
            stopTimer();
            focus.repBasedDoneBtn.classList.remove('hidden');
            focus.pauseResumeBtn.classList.add('hidden');
            startStopwatch();
            if (state.tts.isSoundOn) {
                let announcement = `Wykonaj: ${exercise.name}, seria ${exercise.currentSet} z ${exercise.totalSets}. ${formatForTTS(exercise.reps_or_time)}.`;
                speak(announcement, true, () => { speak(formatForTTS(exercise.description), false); });
            }
        }
    } else {
        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) { moveToNextExercise({ skipped: false }); return; }
        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.add('hidden');
        const isNextRepBased = getExerciseDuration(upcomingExercise) === null;
        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { afterUpcomingExercise = state.flatExercises[i]; break; }
        }
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : "Koniec treningu";
        if (isNextRepBased) {
            focus.sectionName.textContent = "PRZYGOTUJ SIĘ";
            focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
            focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Czas/Powt: ${upcomingExercise.reps_or_time}`;
            focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
            focus.timerDisplay.classList.add('rep-based-text');
            focus.timerDisplay.textContent = "START...";
            setTimeout(() => { if (state.currentExerciseIndex === index) { moveToNextExercise({ skipped: false }); } }, 2000);
        } else {
            focus.sectionName.textContent = "PRZYGOTUJ SIĘ";
            focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
            focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Czas/Powt: ${upcomingExercise.reps_or_time} | Tempo: ${upcomingExercise.tempo_or_iso}`;
            focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
            const startNextExercise = () => moveToNextExercise({ skipped: false });
            if (state.tts.isSoundOn) {
                focus.timerDisplay.classList.add('rep-based-text');
                focus.timerDisplay.textContent = "SŁUCHAJ";
                let announcement = `Przygotuj się. Następne ćwiczenie: ${upcomingExercise.name}, seria ${upcomingExercise.currentSet} z ${upcomingExercise.totalSets}. Wykonaj ${formatForTTS(upcomingExercise.reps_or_time)}.`;
                speak(announcement, true, () => { speak(formatForTTS(upcomingExercise.description), false, startNextExercise); });
            } else {
                focus.timerDisplay.classList.remove('rep-based-text');
                focus.pauseResumeBtn.classList.remove('hidden');
                const restDuration = exercise.duration || state.settings.restBetweenExercises;
                startTimer(restDuration > 5 ? restDuration : 5, startNextExercise);
            }
        }
    }
}

export function generateFlatExercises(dayData) {
    const plan = [];
    const activePlan = TRAINING_PLANS[state.settings.activePlanId];
    const defaultRest = activePlan.GlobalRules.defaultRestSecondsBetweenExercises;
    const sections = [{ name: 'Rozgrzewka', exercises: dayData.warmup || [] }, { name: 'Część główna', exercises: dayData.main || [] }, { name: 'Schłodzenie', exercises: dayData.cooldown || [] }];
    sections.forEach(section => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const setCount = parseSetCount(exercise.sets);
            for (let i = 1; i <= setCount; i++) {
                plan.push({ ...exercise, isWork: true, sectionName: section.name, currentSet: i, totalSets: setCount });
                if (i < setCount) { plan.push({ name: 'Odpoczynek', isRest: true, isWork: false, duration: activePlan.GlobalRules.defaultRestSecondsBetweenSets, sectionName: 'Przerwa' }); }
            }
            if (exerciseIndex < section.exercises.length - 1) { plan.push({ name: 'Przerwa', isRest: true, isWork: false, duration: defaultRest, sectionName: 'Przerwa' }); }
        });
    });
    return plan;
}

export function startModifiedTraining() {
    // Krok 1: Pobierz "nawodnione" dane dnia (z opisami, linkami itd.).
    const activePlan = TRAINING_PLANS[state.settings.activePlanId];
    const dayDataRaw = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    const hydratedDay = getHydratedDay(dayDataRaw);

    // Krok 2: Zrób głęboką kopię "nawodnionych" danych, którą będziemy modyfikować.
    const modifiedDay = JSON.parse(JSON.stringify(hydratedDay));

    // Krok 3: Zbierz wszystkie ćwiczenia z tej kopii do jednej, płaskiej listy.
    const allExercises = [
        ...(modifiedDay.warmup || []),
        ...(modifiedDay.main || []),
        ...(modifiedDay.cooldown || [])
    ];

    // Krok 4: Zbierz wszystkie inputy z ekranu podglądu.
    const allInputs = screens.preTraining.querySelectorAll('input[data-exercise-index]');

    // Krok 5: Zastosuj modyfikacje z inputów bezpośrednio do naszej "nawodnionej" listy.
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

    // Krok 6: Przebuduj obiekt `modifiedDay` z powrotem na sekcje, używając już zmodyfikowanej listy.
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

    // Krok 7: Wygeneruj listę do treningu na podstawie finalnego, zmodyfikowanego i "nawodnionego" obiektu.
    state.sessionLog = [];
    state.flatExercises = [
        { name: "Przygotuj się", isRest: true, isWork: false, duration: 5, sectionName: "Start" },
        ...generateFlatExercises(modifiedDay)
    ];
    
    navigateTo('training');
    startExercise(0);
}
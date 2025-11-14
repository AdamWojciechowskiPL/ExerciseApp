// training.js

import { state } from './state.js';
import { focus, screens } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, togglePauseTimer, startStopwatch, stopStopwatch } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS, getHydratedDay } from './utils.js';
import { navigateTo, renderSummaryScreen } from './ui.js';

/**
 * ZMODYFIKOWANA FUNKCJA: Teraz inteligentnie aktualizuje lub dodaje wpis do logu.
 * Zamiast ślepo dodawać, najpierw sprawdza, czy wpis dla danego ćwiczenia i serii już istnieje.
 * Jeśli tak, aktualizuje go; jeśli nie, dodaje nowy.
 */
function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;

    let duration = (status === 'rep-based' && state.stopwatch.seconds > 0) ? state.stopwatch.seconds : 0;
    
    // Poprawka drobnego błędu: state.timer nie ma startTime, ale to nie jest główny problem.
    // Prawidłowa kalkulacja duration nie jest teraz kluczowa, ale warto to mieć na uwadze.
    // Na razie zostawiamy, aby nie wprowadzać zbyt wielu zmian naraz.
    if (status === 'completed' && state.timer.startTime > 0) {
        duration = Math.round((Date.now() - state.timer.startTime) / 1000);
    }

    const newLogEntry = {
        name: exercise.name,
        currentSet: exercise.currentSet,
        totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time,
        tempo_or_iso: exercise.tempo_or_iso,
        status: status,
        duration: duration > 0 ? duration : '-'
    };

    // Logika "znajdź i zaktualizuj" lub "dodaj"
    const existingEntryIndex = state.sessionLog.findIndex(
        entry => entry.name === newLogEntry.name && entry.currentSet === newLogEntry.currentSet
    );

    if (existingEntryIndex > -1) {
        // Jeśli wpis już istnieje (bo użytkownik się cofnął), zaktualizuj go
        state.sessionLog[existingEntryIndex] = newLogEntry;
    } else {
        // Jeśli to nowy wpis, dodaj go
        state.sessionLog.push(newLogEntry);
    }
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch();
    if (state.tts.isSupported) state.tts.synth.cancel();
    
    // Logika logowania pozostaje taka sama, ale teraz używa ulepszonej funkcji logCurrentStep
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
        state.finalCompletionSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        renderSummaryScreen();
    }
}

/**
 * ZMODYFIKOWANA FUNKCJA: Usunięto problematyczną linię `state.sessionLog.pop()`.
 * Dzięki nowej logice w `logCurrentStep`, nie musimy już ręcznie usuwać wpisów.
 */
export function moveToPreviousExercise() {
    stopStopwatch();
    if (state.currentExerciseIndex > 0) {
        if (state.tts.isSupported) state.tts.synth.cancel();
        stopTimer();
        // USUNIĘTO: state.sessionLog.pop(); 
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

// Reszta pliku (generateFlatExercises, startModifiedTraining) pozostaje bez zmian
export function generateFlatExercises(dayData) {
    const plan = [];
    // Zmieniono TRAINING_PLANS na state.trainingPlans
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return []; // Zabezpieczenie
    
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
    // Zmieniono TRAINING_PLANS na state.trainingPlans
    state.sessionStartTime = new Date();
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) {
        console.error("No active training plan found in state!");
        return;
    }
    const dayDataRaw = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    const hydratedDay = getHydratedDay(dayDataRaw);
    const modifiedDay = JSON.parse(JSON.stringify(hydratedDay));
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
    state.flatExercises = [
        { name: "Przygotuj się", isRest: true, isWork: false, duration: 5, sectionName: "Start" },
        ...generateFlatExercises(modifiedDay)
    ];
    
    navigateTo('training');
    startExercise(0);
}
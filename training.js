// training.js

import { state } from './state.js';
import { focus, screens } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS } from './utils.js';
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
        state.finalCompletionSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

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
    focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
    
    if (exercise.isWork) {
        // --- ETAP WYKONYWANIA ĆWICZENIA ---
        focus.sectionName.textContent = exercise.sectionName;
        focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
        focus.exerciseDetails.textContent = `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
        focus.exerciseInfoContainer.style.visibility = 'visible';
        focus.focusDescription.textContent = exercise.description || '';
        focus.ttsToggleBtn.style.display = 'inline-block';
        focus.nextExerciseName.textContent = nextExercise ? (nextExercise.isRest ? "Odpoczynek" : `${nextExercise.name}`) : "Koniec treningu";

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
    } else {
        // =========================================================================
        // NOWA LOGIKA: Dynamiczna przerwa oparta na czasie trwania mowy TTS
        // =========================================================================
        const upcomingExercise = nextExercise;
        if (!upcomingExercise) {
            moveToNextExercise({ skipped: false });
            return;
        }

        // Krok 1: Zaktualizuj interfejs na czas przygotowania
        focus.sectionName.textContent = "PRZYGOTUJ SIĘ";
        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Czas/Powt: ${upcomingExercise.reps_or_time} | Tempo: ${upcomingExercise.tempo_or_iso}`;
        focus.exerciseInfoContainer.style.visibility = 'visible';
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.ttsToggleBtn.style.display = 'inline-block';
        
        const afterUpcoming = state.flatExercises[index + 2];
        focus.nextExerciseName.textContent = afterUpcoming ? (afterUpcoming.isRest ? "Odpoczynek" : `${afterUpcoming.name}`) : "Koniec treningu";

        // Ukryj przyciski timera, bo go nie używamy w tej fazie
        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.add('hidden');

        // Funkcja, która rozpocznie kolejne ćwiczenie
        const startNextExercise = () => {
            moveToNextExercise({ skipped: false });
        };

        // Krok 2: Sprawdź, czy dźwięk jest włączony i wybierz strategię
        if (state.tts.isSoundOn) {
            // STRATEGIA 1: Dźwięk WŁĄCZONY - czas przerwy zależy od TTS
            
            // Pokaż informację, że użytkownik ma słuchać
            focus.timerDisplay.classList.add('rep-based-text');
            focus.timerDisplay.textContent = "SŁUCHAJ";
            
            // Przygotuj zapowiedzi
            let announcement = `Przygotuj się. Następne ćwiczenie: ${upcomingExercise.name}, seria ${upcomingExercise.currentSet} z ${upcomingExercise.totalSets}.`;
            if (upcomingExercise.reps_or_time) announcement += ` Wykonaj ${formatForTTS(upcomingExercise.reps_or_time)}.`;
            if (upcomingExercise.tempo_or_iso) announcement += ` W tempie: ${formatForTTS(upcomingExercise.tempo_or_iso)}.`;
            
            const friendlyDescription = formatForTTS(upcomingExercise.description);

            // Uruchom łańcuch zapowiedzi: po zakończeniu opisu, automatycznie przejdź dalej
            speak(announcement, true, () => {
                speak(friendlyDescription, false, startNextExercise);
            });

        } else {
            // STRATEGIA 2: Dźwięk WYŁĄCZONY - daj użytkownikowi stały, krótki czas na przeczytanie
            focus.timerDisplay.classList.remove('rep-based-text');
            focus.pauseResumeBtn.classList.remove('hidden'); // Pokaż przycisk pauzy
            startTimer(exercise.duration > 5 ? exercise.duration : 5, startNextExercise);
        }
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
                    plan.push({ name: 'Odpoczynek', isRest: true, isWork: false, duration: TRAINING_PLAN.GlobalRules.defaultRestSecondsBetweenSets, sectionName: 'Przerwa' });
                }
            }
            const isLastExerciseInSection = exerciseIndex === section.exercises.length - 1;
            if (!isLastExerciseInSection) {
                 plan.push({ name: 'Przerwa', isRest: true, isWork: false, duration: state.settings.restBetweenExercises, sectionName: 'Przerwa' });
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
    
    state.sessionLog = [];
    state.flatExercises = [
        // Używamy obiektu `isRest: true` jako sygnału do zapowiedzi pierwszego ćwiczenia
        { name: "Przygotuj się", isRest: true, isWork: false, duration: 30, sectionName: "Start" },
        ...generateFlatExercises(modifiedDay)
    ];
    
    startExercise(0);
    navigateTo('training');
}
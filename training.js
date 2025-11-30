// training.js

import { state } from './state.js';
// ZMIANA: Dodano import initializeFocusElements
import { focus, screens, initializeFocusElements } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, startStopwatch, stopStopwatch, updateTimerDisplay, updateStopwatchDisplay } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS, getHydratedDay } from './utils.js';
import { navigateTo} from './ui.js';
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
        timerValue: focus.timerDisplay.textContent,
        exerciseName: exercise.isWork ? `${exercise.name} (Seria ${exercise.currentSet}/${exercise.totalSets})` : exercise.name,
        exerciseDetails: exercise.isWork ? `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}` : `Następne: ${(state.flatExercises[state.currentExerciseIndex + 1] || {}).name || ''}`,
        nextExercise: nextWorkExercise ? nextWorkExercise.name : 'Koniec',
        isRest: !exercise.isWork,
        animationSvg: exercise.animationSvg || null
    };

    sendTrainingStateUpdate(payload);
}

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;
    let duration = (status === 'rep-based' && state.stopwatch.seconds > 0) ? state.stopwatch.seconds : 0;
    
    const newLogEntry = {
        name: exercise.name,
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
    if (state.tts.isSupported) state.tts.synth.cancel();
    
    const exercise = state.flatExercises[state.currentExerciseIndex];
    const duration = getExerciseDuration(exercise);
    
    if (options.skipped) { 
        logCurrentStep('skipped'); 
    } else if (duration === null) { 
        logCurrentStep('rep-based'); 
    } else { 
        logCurrentStep('completed'); 
    }
    
    stopTimer();
    
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
    if (state.breakTimeoutId) {
        clearTimeout(state.breakTimeoutId);
        state.breakTimeoutId = null;
    }
    
    if (state.currentExerciseIndex > 0) {
        if (state.tts.isSupported) state.tts.synth.cancel();
        stopTimer();
        startExercise(state.currentExerciseIndex - 1);
    }
}

export function startExercise(index) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];
    
    // 1. Aktualizacja UI ogólnego (Pasek postępu, Ikona TTS)
    if (focus.ttsIcon) {
        focus.ttsIcon.src = state.tts.isSoundOn ? '/icons/sound-on.svg' : '/icons/sound-off.svg';
    }

    if (focus.prevStepBtn) {
        focus.prevStepBtn.disabled = (index === 0);
    }
    if (focus.progress) {
        focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
    }

    // 2. Obsługa Stanu Pauzy (UI przycisków)
    if (state.isPaused) {
        state.lastPauseStartTime = Date.now(); // Restart licznika pauzy
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

    // 3. Przygotowanie kontenerów Karty Wizualnej
    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');
    const flipIndicator = document.querySelector('.flip-indicator'); // Ikona "obrotu"

    // Zawsze czyścimy kontener animacji przed załadowaniem nowej
    if (animContainer) animContainer.innerHTML = '';

    // ============================================================
    // SCENARIUSZ A: ĆWICZENIE (WORK)
    // ============================================================
    if (exercise.isWork) {
        focus.sectionName.textContent = exercise.sectionName;
        focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
        focus.exerciseDetails.textContent = `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
        focus.focusDescription.textContent = exercise.description || '';
        
        // --- LOGIKA KARTY WIZUALNEJ ---
        if (exercise.animationSvg && animContainer && descContainer) {
            // Mamy animację: Domyślnie pokaż animację, ukryj opis
            animContainer.innerHTML = exercise.animationSvg;
            animContainer.classList.remove('hidden');
            descContainer.classList.add('hidden');
            
            // Pokaż wskaźnik, że można obrócić kartę
            if (flipIndicator) flipIndicator.classList.remove('hidden');
        } else if (animContainer && descContainer) {
            // Brak animacji: Pokaż opis, ukryj kontener animacji
            animContainer.classList.add('hidden');
            descContainer.classList.remove('hidden');
            
            // Ukryj wskaźnik (nie ma do czego wracać)
            if (flipIndicator) flipIndicator.classList.add('hidden');
        }

        // Ustalanie następnego ćwiczenia
        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; }
        }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : "Koniec treningu";
        
        const duration = getExerciseDuration(exercise);
        
        if (duration !== null) {
            // --- ĆWICZENIE NA CZAS ---
            focus.timerDisplay.classList.remove('rep-based-text');
            focus.repBasedDoneBtn.classList.add('hidden');
            focus.pauseResumeBtn.classList.remove('hidden');

            state.timer.timeLeft = duration; 
            updateTimerDisplay(); 

            if (!state.isPaused) {
                startTimer(duration, () => moveToNextExercise({ skipped: false }), syncStateToChromecast);
            }
        } else {
            // --- ĆWICZENIE NA POWTÓRZENIA ---
            stopTimer();
            focus.repBasedDoneBtn.classList.remove('hidden');
            focus.pauseResumeBtn.classList.remove('hidden');
            
            state.stopwatch.seconds = 0; 
            updateStopwatchDisplay(); 

            if (!state.isPaused) {
                startStopwatch();
                
                if (state.tts.isSoundOn) {
                    let announcement = `Wykonaj: ${exercise.name}, seria ${exercise.currentSet} z ${exercise.totalSets}. ${formatForTTS(exercise.reps_or_time)}.`;
                    speak(announcement, true, () => { speak(formatForTTS(exercise.description), false); });
                }
            }
        }
    } 
    // ============================================================
    // SCENARIUSZ B: PRZERWA (REST)
    // ============================================================
    else { 
        // W przerwie zawsze pokazujemy opis (co nastąpi), ukrywamy animację poprzedniego
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden'); // W przerwie raczej nie flipujemy

        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) { moveToNextExercise({ skipped: false }); return; }
        
        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        
        const isNextRepBased = getExerciseDuration(upcomingExercise) === null;
        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) {
            if (state.flatExercises[i].isWork) { afterUpcomingExercise = state.flatExercises[i]; break; }
        }
        
        focus.sectionName.textContent = "PRZYGOTUJ SIĘ";
        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Czas/Powt: ${upcomingExercise.reps_or_time} | Tempo: ${upcomingExercise.tempo_or_iso}`;
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : "Koniec treningu";

        if (isNextRepBased) {
             focus.timerDisplay.classList.add('rep-based-text');
             focus.timerDisplay.textContent = "START...";
             
             if (!state.isPaused) {
                 state.breakTimeoutId = setTimeout(() => { 
                     state.breakTimeoutId = null;
                     if (state.currentExerciseIndex === index) { moveToNextExercise({ skipped: false }); } 
                 }, 2000);
             }
        } else {
            focus.timerDisplay.classList.remove('rep-based-text');
            const startNextExercise = () => moveToNextExercise({ skipped: false });
            const restDuration = exercise.duration || 60;
            
            state.timer.timeLeft = restDuration > 5 ? restDuration : 5;
            updateTimerDisplay();

            if (!state.isPaused) {
                if (state.tts.isSoundOn) {
                    focus.timerDisplay.classList.add('rep-based-text');
                    focus.timerDisplay.textContent = "SŁUCHAJ";
                    let announcement = `Przygotuj się. Następne ćwiczenie: ${upcomingExercise.name}, seria ${upcomingExercise.currentSet} z ${upcomingExercise.totalSets}. Wykonaj ${formatForTTS(upcomingExercise.reps_or_time)}.`;
                    speak(announcement, true, () => { speak(formatForTTS(upcomingExercise.description), false, startNextExercise); });
                } else {
                    startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast);
                }
            }
        }
    }

    syncStateToChromecast();
}

export function generateFlatExercises(dayData) {
    const plan = [];
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return [];
    
    const defaultRest = activePlan.GlobalRules.defaultRestSecondsBetweenExercises;
    const restBetweenSets = activePlan.GlobalRules.defaultRestSecondsBetweenSets;

    const sections = [{ name: 'Rozgrzewka', exercises: dayData.warmup || [] }, { name: 'Część główna', exercises: dayData.main || [] }, { name: 'Schłodzenie', exercises: dayData.cooldown || [] }];
    sections.forEach(section => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const setCount = parseSetCount(exercise.sets);
            for (let i = 1; i <= setCount; i++) {
                plan.push({ ...exercise, isWork: true, sectionName: section.name, currentSet: i, totalSets: setCount });
                if (i < setCount) { plan.push({ name: 'Odpoczynek', isRest: true, isWork: false, duration: restBetweenSets, sectionName: 'Przerwa między seriami' }); }
            }
            if (exerciseIndex < section.exercises.length - 1) { plan.push({ name: 'Przerwa', isRest: true, isWork: false, duration: defaultRest, sectionName: 'Przerwa' }); }
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
    
    // ZMIANA: KLUCZOWE - Odświeżamy referencje do elementów DOM po nawigacji
    initializeFocusElements();

    startExercise(0);
}
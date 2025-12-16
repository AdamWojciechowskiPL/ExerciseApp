// === WAŻNE: To jest plik LOGIKI w głównym folderze: ExerciseApp/training.js ===

import { state } from './state.js';
import { focus, screens, initializeFocusElements } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, startStopwatch, stopStopwatch, updateTimerDisplay, updateStopwatchDisplay } from './timer.js';
import { getExerciseDuration, parseSetCount, formatForTTS, getHydratedDay } from './utils.js';
import { navigateTo } from './ui.js';
import { renderSummaryScreen } from './ui/screens/summary.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';
import { saveSessionBackup } from './sessionRecovery.js';
import { getAffinityBadge } from './ui/templates.js';

// --- HELPER: SKALOWANIE CZCIONKI ---
function fitText(element) {
    if (!element) return;
    element.style.fontSize = '';
    requestAnimationFrame(() => {
        if (element.scrollWidth > element.offsetWidth) {
             const style = window.getComputedStyle(element);
             const currentSize = parseFloat(style.fontSize);
             const ratio = element.offsetWidth / element.scrollWidth;
             const newSize = Math.max(currentSize * ratio * 0.95, 12);
             element.style.fontSize = `${newSize}px`;
        }
    });
}

function syncStateToChromecast() {
    if (!getIsCasting()) return;
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise) return;

    let nextWorkExercise = null;
    for (let i = state.currentExerciseIndex + 1; i < state.flatExercises.length; i++) {
        if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; }
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

    // Jeśli był aktywny timer (np. w starym trybie), bierzemy z initialDuration
    if (state.timer.isActive || state.timer.initialDuration > 0) {
        duration = state.timer.initialDuration;
    }

    // Zabezpieczenie przed brakiem ID
    const entryUniqueId = exercise.uniqueId || `${exercise.id}_${Date.now()}`;

    const newLogEntry = {
        uniqueId: entryUniqueId, // KLUCZOWE: Unikalny identyfikator kroku
        name: exercise.name,
        exerciseId: exercise.id || exercise.exerciseId,
        currentSet: exercise.currentSet,
        totalSets: exercise.totalSets,
        reps_or_time: exercise.reps_or_time,
        tempo_or_iso: exercise.tempo_or_iso,
        status: status,
        duration: duration > 0 ? duration : '-'
    };

    // Szukamy wpisu po uniqueId, aby uniknąć nadpisywania L/P jako tego samego ćwiczenia
    const existingEntryIndex = state.sessionLog.findIndex(entry => entry.uniqueId === newLogEntry.uniqueId);
    
    if (existingEntryIndex > -1) {
        state.sessionLog[existingEntryIndex] = newLogEntry;
    } else {
        state.sessionLog.push(newLogEntry);
    }
}

function triggerSessionBackup() {
    let trainingTitle = 'Trening';
    const isDynamicMode = state.settings.planMode === 'dynamic' || (state.settings.dynamicPlanData && !state.settings.planMode);

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        trainingTitle = state.todaysDynamicPlan.title;
    }
    else if (isDynamicMode && state.settings.dynamicPlanData) {
        const days = state.settings.dynamicPlanData.days || [];
        const day = days.find(d => d.dayNumber === state.currentTrainingDayId);
        if (day) trainingTitle = day.title;
    } else {
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        if (activePlan) {
            const day = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
            if (day) trainingTitle = day.title;
        }
    }

    saveSessionBackup({
        sessionStartTime: state.sessionStartTime ? state.sessionStartTime.toISOString() : null,
        totalPausedTime: state.totalPausedTime || 0,
        planId: isDynamicMode ? (state.settings.dynamicPlanData?.id || state.settings.activePlanId) : state.settings.activePlanId,
        planMode: state.settings.planMode,
        currentTrainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingTitle,
        todaysDynamicPlan: state.todaysDynamicPlan,
        flatExercises: state.flatExercises,
        currentExerciseIndex: state.currentExerciseIndex,
        sessionLog: state.sessionLog,
        stopwatchSeconds: state.stopwatch.seconds,
        timerTimeLeft: state.timer.timeLeft,
        sessionParams: state.sessionParams
    });
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch(); stopTimer();
    if (state.tts.isSupported) state.tts.synth.cancel();
    
    // Logujemy status. Dzięki uniqueId, Skip na Lewej zapisze się jako osobny wpis.
    if (options.skipped) logCurrentStep('skipped'); else logCurrentStep('completed');
    
    if (state.breakTimeoutId) { clearTimeout(state.breakTimeoutId); state.breakTimeoutId = null; }
    
    if (state.currentExerciseIndex < state.flatExercises.length - 1) {
        startExercise(state.currentExerciseIndex + 1);
    } else {
        state.finalCompletionSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        renderSummaryScreen();
    }
}

export function moveToPreviousExercise() {
    stopStopwatch(); stopTimer();
    if (state.breakTimeoutId) { clearTimeout(state.breakTimeoutId); state.breakTimeoutId = null; }
    if (state.currentExerciseIndex > 0) {
        if (state.tts.isSupported) state.tts.synth.cancel();
        startExercise(state.currentExerciseIndex - 1);
    }
}

export function startExercise(index) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];

    if (focus.ttsIcon) focus.ttsIcon.src = state.tts.isSoundOn ? '/icons/sound-on.svg' : '/icons/sound-off.svg';

    if (focus.prevStepBtn) {
        const isFirst = index === 0;
        focus.prevStepBtn.disabled = isFirst;
        focus.prevStepBtn.style.opacity = isFirst ? '0.3' : '1';
        focus.prevStepBtn.style.pointerEvents = isFirst ? 'none' : 'auto';
    }

    if (focus.progress) focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;

    if (state.isPaused) {
        state.lastPauseStartTime = Date.now();
        if (focus.pauseResumeBtn) { focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-play.svg" alt="Wznów">`; focus.pauseResumeBtn.classList.add('paused-state'); focus.pauseResumeBtn.classList.remove('hidden'); }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';
    } else {
        if (focus.pauseResumeBtn) { focus.pauseResumeBtn.innerHTML = `<img src="/icons/control-pause.svg" alt="Pauza">`; focus.pauseResumeBtn.classList.remove('paused-state'); focus.pauseResumeBtn.classList.remove('hidden'); }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }

    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');
    const flipIndicator = document.querySelector('.flip-indicator');
    if (animContainer) animContainer.innerHTML = '';

    if (exercise.isWork) {
        // --- TRYB PRACY (ZAWSZE STOPER + MANUALNE POTWIERDZENIE) ---
        focus.sectionName.textContent = exercise.sectionName;
        focus.exerciseName.textContent = exercise.name;
        fitText(focus.exerciseName);

        // Wyświetlamy aktualny numer serii w kontekście całkowitej liczby serii
        focus.exerciseDetails.textContent = `Seria ${exercise.currentSet}/${exercise.totalSets} | Cel: ${exercise.reps_or_time}`;
        focus.focusDescription.textContent = exercise.description || '';

        if (focus.affinityBadge) focus.affinityBadge.innerHTML = getAffinityBadge(exercise.exerciseId || exercise.id);

        if (exercise.animationSvg && animContainer && descContainer) {
            animContainer.innerHTML = exercise.animationSvg; animContainer.classList.remove('hidden'); descContainer.classList.add('hidden'); if (flipIndicator) flipIndicator.classList.remove('hidden');
        } else if (animContainer && descContainer) {
            animContainer.classList.add('hidden'); descContainer.classList.remove('hidden'); if (flipIndicator) flipIndicator.classList.add('hidden');
        }

        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) { if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; } }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : "Koniec treningu";

        // Resetujemy i zatrzymujemy timer (odliczanie w dół)
        stopTimer();
        
        // Resetujemy stoper
        state.stopwatch.seconds = 0;
        updateStopwatchDisplay();

        // ZAWSZE pokazujemy przycisk GOTOWE (niezależnie czy to czas czy powtórzenia)
        focus.repBasedDoneBtn.classList.remove('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        focus.timerDisplay.classList.remove('rep-based-text');

        if (!state.isPaused) {
            // ZAWSZE uruchamiamy stoper (liczenie w górę)
            startStopwatch();

            // Obsługa TTS
            if (state.tts.isSoundOn) {
                // Budujemy komunikat
                let announcement = `Ćwicz: ${exercise.name}. `;
                
                // Dodajemy informację o celu, żeby użytkownik wiedział ile ma robić
                if (exercise.reps_or_time) {
                    announcement += `Cel: ${formatForTTS(exercise.reps_or_time)}.`;
                }

                speak(announcement, true, () => { 
                    if (exercise.description) speak(formatForTTS(exercise.description), false); 
                });
            }
        }
    }
    else {
        // --- TRYB PRZERWY (ODLICZANIE W DÓŁ) ---
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');
        if (focus.affinityBadge) focus.affinityBadge.innerHTML = '';

        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) { moveToNextExercise({ skipped: false }); return; }

        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');

        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) { if (state.flatExercises[i].isWork) { afterUpcomingExercise = state.flatExercises[i]; break; } }

        focus.sectionName.textContent = (exercise.sectionName || "PRZERWA").toUpperCase();
        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        fitText(focus.exerciseName);
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Cel: ${upcomingExercise.reps_or_time}`;
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : "Koniec treningu";
        focus.timerDisplay.classList.remove('rep-based-text');

        const startNextExercise = () => moveToNextExercise({ skipped: false });
        const restDuration = exercise.duration || 5;
        state.timer.timeLeft = restDuration;
        updateTimerDisplay();

        if (!state.isPaused) {
            if (state.tts.isSoundOn) {
                let announcement = `Odpocznij. Następnie: ${upcomingExercise.name}.`;
                speak(announcement, true);
                startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast, false);
            } else {
                startTimer(state.timer.timeLeft, startNextExercise, syncStateToChromecast, false);
            }
        }
    }
    syncStateToChromecast();
    triggerSessionBackup();
}

/**
 * Generuje płaską listę kroków.
 * ZMIANA: Poprawiona generacja uniqueId i obsługa pojedynczych serii unilateralnych.
 */
export function generateFlatExercises(dayData) {
    const plan = [];
    const FIXED_REST_DURATION = 5;
    const TRANSITION_DURATION = 5;
    let unilateralGlobalIndex = 0;
    let globalStepCounter = 0; // Licznik dla uniqueId, aby każdy krok był unikalny

    const sections = [
        { name: 'Rozgrzewka', exercises: dayData.warmup || [] },
        { name: 'Część główna', exercises: dayData.main || [] },
        { name: 'Schłodzenie', exercises: dayData.cooldown || [] }
    ];

    sections.forEach(section => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const totalSetsDeclared = parseSetCount(exercise.sets);

            // Wykrywanie czy ćwiczenie jest jednostronne
            const isUnilateral = exercise.isUnilateral ||
                                 exercise.is_unilateral ||
                                 String(exercise.reps_or_time).includes('/str') ||
                                 String(exercise.reps_or_time).includes('stron');

            // --- LOGIKA PĘTLI SERII ---
            // ZMIANA: Jeśli ćwiczenie jest unilateralne, ZAWSZE rozbijamy je na L/P,
            // nawet jeśli liczba serii jest 1. Wtedy robimy 1 pętlę (L+P).
            let loopLimit = totalSetsDeclared;
            let displayTotalSets = totalSetsDeclared;

            if (isUnilateral && totalSetsDeclared > 0) {
                // Jeśli parzyście: robimy połowę pętli (np. 4 serie = 2 pętle L+P)
                if (totalSetsDeclared % 2 === 0) {
                    loopLimit = totalSetsDeclared / 2;
                    displayTotalSets = loopLimit; 
                } 
                // Jeśli nieparzyście (np. 1 seria): robimy tyle pętli ile serii (1 seria = 1 pętla L+P)
                // Wtedy displayTotalSets zostaje jak jest (np. Seria 1/1)
            }

            // Ustalanie kolejności stron (Alternacja)
            let startSide = 'Lewa';
            let secondSide = 'Prawa';

            if (isUnilateral) {
                if (unilateralGlobalIndex % 2 !== 0) {
                    startSide = 'Prawa';
                    secondSide = 'Lewa';
                }
                unilateralGlobalIndex++;
            }

            // Obliczanie czasu trwania pojedynczej strony
            let singleSideDuration = 0;
            let singleSideRepsOrTime = exercise.reps_or_time;

            if (isUnilateral) {
                const text = String(exercise.reps_or_time).toLowerCase();
                singleSideRepsOrTime = exercise.reps_or_time.replace(/\/str\.?|\s*stron.*/gi, '').trim();

                if (text.includes('s') || text.includes('min')) {
                    const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
                    if (minMatch) {
                        singleSideDuration = parseFloat(minMatch[1].replace(',', '.')) * 60;
                    } else {
                        const secMatch = text.match(/(\d+)/);
                        if (secMatch) singleSideDuration = parseInt(secMatch[0], 10);
                    }
                }
            }

            for (let i = 1; i <= loopLimit; i++) {
                if (isUnilateral) {
                    // --- KROK 1: STRONA PIERWSZA ---
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: displayTotalSets, 
                        name: `${exercise.name} (${startSide})`,
                        reps_or_time: singleSideRepsOrTime,
                        duration: singleSideDuration > 0 ? singleSideDuration : undefined,
                        // Unikalne ID oparte o licznik
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });

                    // --- KROK 2: ZMIANA STRONY ---
                    plan.push({
                        name: "Zmiana Strony",
                        isRest: true,
                        isWork: false,
                        duration: TRANSITION_DURATION,
                        sectionName: "Przejście",
                        description: `Przygotuj stronę: ${secondSide}`,
                        uniqueId: `rest_transition_${globalStepCounter++}`
                    });

                    // --- KROK 3: STRONA DRUGA ---
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: displayTotalSets,
                        name: `${exercise.name} (${secondSide})`,
                        reps_or_time: singleSideRepsOrTime,
                        duration: singleSideDuration > 0 ? singleSideDuration : undefined,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });

                } else {
                    // --- STANDARDOWE (Bilateral) ---
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: totalSetsDeclared,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });
                }

                // PRZERWA MIĘDZY SERIAMI (jeśli to nie ostatnia seria)
                if (i < loopLimit) {
                    plan.push({
                        name: 'Odpoczynek',
                        isRest: true,
                        isWork: false,
                        duration: FIXED_REST_DURATION,
                        sectionName: 'Przerwa między seriami',
                        uniqueId: `rest_set_${globalStepCounter++}`
                    });
                }
            }

            // PRZERWA MIĘDZY ĆWICZENIAMI
            if (exerciseIndex < section.exercises.length - 1) {
                plan.push({
                    name: 'Przerwa',
                    isRest: true,
                    isWork: false,
                    duration: FIXED_REST_DURATION,
                    sectionName: 'Przerwa',
                    uniqueId: `rest_exercise_${globalStepCounter++}`
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

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        console.log("🚀 Start treningu: Używam BIO-PROTOKOŁU");
        state.flatExercises = state.todaysDynamicPlan.flatExercises;
        state.sessionLog = [];
        navigateTo('training');
        initializeFocusElements();
        startExercise(0);
        triggerSessionBackup();
        return;
    }

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === state.currentTrainingDayId) {
        console.log("🚀 Start treningu: Używam DYNAMICZNEGO planu");
        sourcePlan = state.todaysDynamicPlan;
    } else {
        console.log("ℹ️ Start treningu: Używam STATYCZNEGO planu");
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        if (!activePlan) { console.error("No active training plan found!"); return; }
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
            if (input.id.startsWith('sets-')) targetExercise.sets = input.value;
            else if (input.id.startsWith('reps-')) targetExercise.reps_or_time = input.value;
        }
    });

    let currentIndex = 0;
    if (modifiedDay.warmup) { modifiedDay.warmup = allExercises.slice(currentIndex, currentIndex + modifiedDay.warmup.length); currentIndex += modifiedDay.warmup.length; }
    if (modifiedDay.main) { modifiedDay.main = allExercises.slice(currentIndex, currentIndex + modifiedDay.main.length); currentIndex += modifiedDay.main.length; }
    if (modifiedDay.cooldown) { modifiedDay.cooldown = allExercises.slice(currentIndex, currentIndex + modifiedDay.cooldown.length); }

    state.sessionLog = [];
    state.flatExercises = [
        { name: "Przygotuj się", isRest: true, isWork: false, duration: 5, sectionName: "Start", uniqueId: "start_prep_0" },
        ...generateFlatExercises(modifiedDay)
    ];

    navigateTo('training');
    initializeFocusElements();
    startExercise(0);
    triggerSessionBackup();
}

export function resumeFromBackup(backup, timeGapMs) {
    console.log('[Training] 🔄 Resuming session from backup...');
    state.sessionStartTime = backup.sessionStartTime ? new Date(backup.sessionStartTime) : new Date();
    state.totalPausedTime = (backup.totalPausedTime || 0) + timeGapMs;
    state.isPaused = false;
    state.lastPauseStartTime = null;
    state.currentTrainingDayId = backup.currentTrainingDayId;
    state.todaysDynamicPlan = backup.todaysDynamicPlan;
    state.flatExercises = backup.flatExercises;
    state.sessionLog = backup.sessionLog || [];
    state.sessionParams = backup.sessionParams || { initialPainLevel: 0, timeFactor: 1.0 };

    navigateTo('training');
    initializeFocusElements();
    startExercise(backup.currentExerciseIndex);
}
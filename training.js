// ExerciseApp/training.js
// === WAŻNE: To jest plik LOGIKI w głównym folderze: ExerciseApp/training.js ===

import { state } from './state.js';
import { focus, screens, initializeFocusElements } from './dom.js';
import { speak } from './tts.js';
import { startTimer, stopTimer, startStopwatch, stopStopwatch, updateTimerDisplay, updateStopwatchDisplay } from './timer.js';
import { parseSetCount, formatForTTS, getHydratedDay, processSVG, calculateSmartRest } from './utils.js';
import { navigateTo } from './ui.js';
import { renderSummaryScreen } from './ui/screens/summary.js';
import { getIsCasting, sendTrainingStateUpdate } from './cast.js';
import { saveSessionBackup } from './sessionRecovery.js';
import { getAffinityBadge } from './ui/templates.js';
import { renderDetailAssessmentModal } from './ui/modals.js'; // AMPS PHASE 2 IMPORT
import dataStore from './dataStore.js';

let backupInterval = null;
let sessionClockInterval = null;

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

function updateSessionClockDisplay() {
    if (!focus.sessionElapsedTime) return;
    if (!state.sessionStartTime) {
        focus.sessionElapsedTime.textContent = "00:00";
        return;
    }

    if (state.isPaused) return;

    const now = Date.now();
    const durationMs = Math.max(0, now - state.sessionStartTime.getTime() - (state.totalPausedTime || 0));
    const totalSeconds = Math.floor(durationMs / 1000);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);

    let timeStr = "";
    if (hours > 0) {
        const m = minutes % 60;
        timeStr = `${hours}:${m < 10 ? '0' : ''}${m}:${seconds < 10 ? '0' : ''}${seconds}`;
    } else {
        timeStr = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    focus.sessionElapsedTime.textContent = timeStr;
}

function startSessionClock() {
    stopSessionClock();
    updateSessionClockDisplay();
    sessionClockInterval = setInterval(() => {
        if (!screens.training.classList.contains('active')) {
            stopSessionClock();
            return;
        }
        updateSessionClockDisplay();
    }, 1000);
}

function stopSessionClock() {
    if (sessionClockInterval) {
        clearInterval(sessionClockInterval);
        sessionClockInterval = null;
    }
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
        animationSvg: exercise.animationSvg ? processSVG(exercise.animationSvg) : null
    };
    sendTrainingStateUpdate(payload);
}

function logCurrentStep(status) {
    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise || !exercise.isWork) return;

    let netDuration = 0;

    if (state.stopwatch.interval || state.stopwatch.seconds > 0) {
        netDuration = state.stopwatch.seconds;
    }
    else if (state.timer.isActive || state.timer.initialDuration > 0) {
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
        status: status,
        duration: netDuration > 0 ? netDuration : 0,
        // AMPS Fields init
        rating: null,
        rir: null,
        tech: null,
        promptType: "none"
    };

    const existingEntryIndex = state.sessionLog.findIndex(entry => entry.uniqueId === newLogEntry.uniqueId);

    if (existingEntryIndex > -1) {
        // Zachowaj ocenę, jeśli już była
        newLogEntry.rating = state.sessionLog[existingEntryIndex].rating;
        newLogEntry.rir = state.sessionLog[existingEntryIndex].rir;
        newLogEntry.tech = state.sessionLog[existingEntryIndex].tech;
        newLogEntry.promptType = state.sessionLog[existingEntryIndex].promptType;
        state.sessionLog[existingEntryIndex] = newLogEntry;
    } else {
        state.sessionLog.push(newLogEntry);
    }
}

function triggerSessionBackup() {
    let trainingTitle = 'Trening';
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        trainingTitle = state.todaysDynamicPlan.title;
    } else if (state.settings.dynamicPlanData) {
        const days = state.settings.dynamicPlanData.days || [];
        const day = days.find(d => d.dayNumber === state.currentTrainingDayId);
        if (day) trainingTitle = day.title;
    }

    saveSessionBackup({
        sessionStartTime: state.sessionStartTime ? state.sessionStartTime.toISOString() : null,
        totalPausedTime: state.totalPausedTime || 0,
        planId: state.settings.dynamicPlanData?.id || 'dynamic',
        planMode: 'dynamic',
        currentTrainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingTitle,
        todaysDynamicPlan: state.todaysDynamicPlan,
        flatExercises: state.flatExercises,
        currentExerciseIndex: state.currentExerciseIndex,
        sessionLog: state.sessionLog,
        stopwatchSeconds: state.stopwatch.seconds,
        timerTimeLeft: state.timer.timeLeft,
        timerInitialDuration: state.timer.initialDuration,
        sessionDetailPromptCount: state.sessionDetailPromptCount, // AMPS
        sessionParams: state.sessionParams
    });
}

function startBackupInterval() {
    if (backupInterval) clearInterval(backupInterval);
    backupInterval = setInterval(() => { if (!state.isPaused) triggerSessionBackup(); }, 2000);
}

function stopBackupInterval() {
    if (backupInterval) { clearInterval(backupInterval); backupInterval = null; }
}

function initProgressBar() {
    if (!focus.progressContainer) return;
    focus.progressContainer.innerHTML = '';
    state.flatExercises.forEach((ex, realIndex) => {
        if (ex.isWork) {
            const segment = document.createElement('div');
            segment.className = 'progress-segment';
            segment.dataset.realIndex = realIndex;
            const secName = (ex.sectionName || '').toLowerCase();
            if (secName.includes('rozgrzewka') || secName.includes('warmup') || secName.includes('start')) {
                segment.classList.add('section-warmup');
            } else if (secName.includes('schłodzenie') || secName.includes('cooldown') || secName.includes('koniec')) {
                segment.classList.add('section-cooldown');
            } else {
                segment.classList.add('section-main');
            }
            focus.progressContainer.appendChild(segment);
        }
    });
}

function updateProgressBar() {
    if (!focus.progressContainer) return;
    const currentIndex = state.currentExerciseIndex;
    const currentEx = state.flatExercises[currentIndex];
    const segments = focus.progressContainer.querySelectorAll('.progress-segment');

    segments.forEach(seg => {
        const segRealIndex = parseInt(seg.dataset.realIndex, 10);
        seg.classList.remove('completed', 'active', 'rest-pulse', 'paused-active');

        if (segRealIndex < currentIndex) {
            seg.classList.add('completed');
        } else if (segRealIndex === currentIndex) {
            if (state.isPaused) seg.classList.add('paused-active');
            else seg.classList.add('active');
        } else if (currentEx && !currentEx.isWork && segRealIndex > currentIndex) {
            let nextWorkIndex = -1;
            for(let i = currentIndex + 1; i < state.flatExercises.length; i++) {
                if (state.flatExercises[i].isWork) { nextWorkIndex = i; break; }
            }
            if (segRealIndex === nextWorkIndex && !state.isPaused) {
                seg.classList.add('rest-pulse');
            }
        }
    });
}

export function moveToNextExercise(options = { skipped: false }) {
    stopStopwatch(); stopTimer();
    if (state.tts.isSupported) state.tts.synth.cancel();
    if (options.skipped) logCurrentStep('skipped'); else logCurrentStep('completed');
    if (state.breakTimeoutId) { clearTimeout(state.breakTimeoutId); state.breakTimeoutId = null; }

    triggerSessionBackup();

    if (state.currentExerciseIndex < state.flatExercises.length - 1) {
        startExercise(state.currentExerciseIndex + 1);
    } else {
        stopBackupInterval();
        stopSessionClock();
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

// --- AMPS PHASE 1 & 2: LOGIKA OCEN ---

// Global handler for Quick Rating (Thumbs)
window.handleSetRating = (uniqueId, rating) => {
    const logEntry = state.sessionLog.find(l => l.uniqueId === uniqueId);
    if (logEntry) {
        logEntry.rating = rating;
        logEntry.promptType = "quick";
        console.log(`[AMPS] Quick Rating saved for ${uniqueId}: ${rating}`);
    }
    triggerSessionBackup();
    if (focus.ratingContainer) {
        const labels = { 'good': '👍 Dobrze', 'ok': '👌 OK', 'hard': '👎 Trudne' };
        focus.ratingContainer.innerHTML = `<div class="saved-feedback">Zapisano: ${labels[rating] || rating}</div>`;
        setTimeout(() => { if (focus.ratingContainer) focus.ratingContainer.classList.add('hidden'); }, 1000);
    }
};

// Global handler for Detail Rating (Tech + RIR)
window.handleSetDetailRating = (uniqueId, tech, rir) => {
    const logEntry = state.sessionLog.find(l => l.uniqueId === uniqueId);
    if (logEntry) {
        logEntry.tech = tech;
        logEntry.rir = rir;
        logEntry.rating = 'good'; // Implicitly good if user bothered to fill detail
        logEntry.promptType = "detail";
        console.log(`[AMPS] Detail Rating saved for ${uniqueId}: Tech=${tech}, RIR=${rir}`);
    }
    triggerSessionBackup();
};

function shouldTriggerDetailPrompt(exercise) {
    // 1. Sprawdź limit na sesję
    if (!state.sessionDetailPromptCount) state.sessionDetailPromptCount = 0;
    if (state.sessionDetailPromptCount >= 2) return false;

    // 2. Sprawdź, czy to ćwiczenie zostało już ocenione w tej sesji (unikalność)
    // Nie chcemy pytać o to samo ćwiczenie w 2. i 3. serii
    const alreadyPrompted = state.sessionLog.some(l => 
        l.exerciseId === exercise.exerciseId && l.promptType === 'detail'
    );
    if (alreadyPrompted) return false;

    // 3. Kryterium: "Trudne" w historii (Difficulty Flag)
    // Sprawdzamy preferencje użytkownika (difficulty = 1 oznacza flagę trudności)
    const exId = exercise.exerciseId || exercise.id;
    const pref = state.userPreferences[exId];
    if (pref && pref.difficulty === 1) {
        state.sessionDetailPromptCount++;
        return true;
    }

    // 4. Kryterium: Losowość (15% szans)
    // Tylko dla sekcji 'main'
    if (exercise.sectionName === 'Część główna' && Math.random() < 0.15) {
        state.sessionDetailPromptCount++;
        return true;
    }

    return false;
}

function renderQuickRating(exercise) {
    if (!focus.ratingContainer) return;

    // Nie pokazuj jeśli już oceniono
    const logEntry = state.sessionLog.find(l => l.uniqueId === exercise.uniqueId);
    if (logEntry && (logEntry.rating || logEntry.promptType === 'detail')) return;

    // AMPS PHASE 2: DECYZJA (Quick vs Detail)
    if (shouldTriggerDetailPrompt(exercise)) {
        renderDetailAssessmentModal(exercise.name, (tech, rir) => {
            window.handleSetDetailRating(exercise.uniqueId, tech, rir);
        });
        return; // Modal handles UI, no inline buttons needed
    }

    focus.ratingContainer.innerHTML = `
        <div class="quick-rate-label">${exercise.name}</div>
        <div class="quick-rate-buttons">
            <button class="quick-rate-btn positive" onclick="handleSetRating('${exercise.uniqueId}', 'good')">👍</button>
            <button class="quick-rate-btn ok" onclick="handleSetRating('${exercise.uniqueId}', 'ok')">👌</button>
            <button class="quick-rate-btn difficult" onclick="handleSetRating('${exercise.uniqueId}', 'hard')">👎</button>
        </div>
    `;
    focus.ratingContainer.classList.remove('hidden');
}

function hideQuickRating() {
    if (focus.ratingContainer) {
        focus.ratingContainer.classList.add('hidden');
        focus.ratingContainer.innerHTML = '';
    }
}

export async function startExercise(index, isResuming = false) {
    state.currentExerciseIndex = index;
    const exercise = state.flatExercises[index];

    if (focus.ttsIcon) {
        const useEl = focus.ttsIcon.querySelector('use');
        if(useEl) useEl.setAttribute('href', state.tts.isSoundOn ? '#icon-sound-on' : '#icon-sound-off');
    }

    if (focus.prevStepBtn) {
        const isFirst = index === 0;
        focus.prevStepBtn.disabled = isFirst;
        focus.prevStepBtn.style.opacity = isFirst ? '0.3' : '1';
        focus.prevStepBtn.style.pointerEvents = isFirst ? 'none' : 'auto';
    }

    updateProgressBar();

    if (state.isPaused) {
        state.lastPauseStartTime = Date.now();
        if (focus.pauseResumeBtn) { focus.pauseResumeBtn.innerHTML = `<svg><use href="#icon-play"/></svg>`; focus.pauseResumeBtn.classList.add('paused-state'); focus.pauseResumeBtn.classList.remove('hidden'); }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';
    } else {
        if (focus.pauseResumeBtn) { focus.pauseResumeBtn.innerHTML = `<svg><use href="#icon-pause"/></svg>`; focus.pauseResumeBtn.classList.remove('paused-state'); focus.pauseResumeBtn.classList.remove('hidden'); }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
    }

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

        dataStore.fetchExerciseAnimation(exercise.exerciseId || exercise.id).then(rawSvg => {
            if (rawSvg && state.currentExerciseIndex === index) {
                const cleanSvg = processSVG(rawSvg);
                exercise.animationSvg = cleanSvg;
                if (animContainer) animContainer.innerHTML = cleanSvg;
                syncStateToChromecast();
            }
        });
    }
    else {
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');
    }

    if (exercise.isWork) {
        // --- TRYB PRACY (ĆWICZENIE) ---
        hideQuickRating(); // Ukryj ocenę jeśli przypadkiem została

        focus.exerciseName.textContent = exercise.name;
        fitText(focus.exerciseName);
        focus.exerciseDetails.textContent = `Seria ${exercise.currentSet}/${exercise.totalSets} | Cel: ${exercise.reps_or_time}`;

        if (focus.tempo) {
            const tempoVal = exercise.tempo_or_iso || "Kontrolowane";
            focus.tempo.textContent = `Tempo: ${tempoVal}`;
            focus.tempo.classList.remove('hidden');
        }

        focus.focusDescription.textContent = exercise.description || '';
        if (focus.affinityBadge) focus.affinityBadge.innerHTML = getAffinityBadge(exercise.exerciseId || exercise.id);

        let nextWorkExercise = null;
        for (let i = index + 1; i < state.flatExercises.length; i++) { if (state.flatExercises[i].isWork) { nextWorkExercise = state.flatExercises[i]; break; } }
        focus.nextExerciseName.textContent = nextWorkExercise ? nextWorkExercise.name : "Koniec treningu";

        if (!isResuming) {
            stopTimer(); // Upewniamy się, że timer przerwy jest zatrzymany
            state.stopwatch.seconds = 0; // Resetujemy stoper do 0:00
        }

        updateStopwatchDisplay(); // Pokaż 0:00 lub aktualny czas wznowienia

        focus.repBasedDoneBtn.classList.remove('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');
        focus.timerDisplay.classList.remove('rep-based-text');

        if (!state.isPaused) {
            // ZAWSZE URUCHAMIAMY STOPER (LICZENIE W GÓRĘ)
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
    }
    else {
        // --- PRZERWA (REST) ---
        if (animContainer) animContainer.classList.add('hidden');
        if (descContainer) descContainer.classList.remove('hidden');
        if (flipIndicator) flipIndicator.classList.add('hidden');
        if (focus.affinityBadge) focus.affinityBadge.innerHTML = '';

        // AMPS: POKAŻ OCENĘ DLA POPRZEDNIEGO ĆWICZENIA
        const prevIndex = index - 1;
        if (prevIndex >= 0 && state.flatExercises[prevIndex].isWork) {
            renderQuickRating(state.flatExercises[prevIndex]);
        } else {
            hideQuickRating();
        }

        const upcomingExercise = state.flatExercises[index + 1];
        if (!upcomingExercise) { moveToNextExercise({ skipped: false }); return; }

        if (focus.tempo) {
            const nextTempo = upcomingExercise.tempo_or_iso || "Kontrolowane";
            focus.tempo.textContent = `Tempo: ${nextTempo}`;
            focus.tempo.classList.remove('hidden');
        }

        if (upcomingExercise.hasAnimation) {
             dataStore.fetchExerciseAnimation(upcomingExercise.exerciseId || upcomingExercise.id);
        }

        focus.repBasedDoneBtn.classList.add('hidden');
        focus.pauseResumeBtn.classList.remove('hidden');

        let afterUpcomingExercise = null;
        for (let i = index + 2; i < state.flatExercises.length; i++) { if (state.flatExercises[i].isWork) { afterUpcomingExercise = state.flatExercises[i]; break; } }

        focus.exerciseName.textContent = `Następne: ${upcomingExercise.name}`;
        fitText(focus.exerciseName);
        focus.exerciseDetails.textContent = `Seria ${upcomingExercise.currentSet}/${upcomingExercise.totalSets} | Cel: ${upcomingExercise.reps_or_time}`;
        focus.focusDescription.textContent = upcomingExercise.description || 'Brak opisu.';
        focus.nextExerciseName.textContent = afterUpcomingExercise ? afterUpcomingExercise.name : "Koniec treningu";
        focus.timerDisplay.classList.remove('rep-based-text');

        // Czyścimy klasy stopera
        focus.timerDisplay.classList.remove('target-reached');

        const startNextExercise = () => moveToNextExercise({ skipped: false });

        if (!isResuming) {
            const restDuration = exercise.duration || 5;
            state.timer.timeLeft = restDuration;
        }

        updateTimerDisplay();

        if (!state.isPaused) {
            // TIMER (ODLICZANIE W DÓŁ)
            if (!isResuming && state.tts.isSoundOn) {
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

export function generateFlatExercises(dayData) {
    const plan = [];

    const restFactor = state.settings.restTimeFactor || 1.0;
    const REST_BETWEEN_SECTIONS = Math.round(60 * restFactor);

    let unilateralGlobalIndex = 0;
    let globalStepCounter = 0;

    const sections = [
        { name: 'Rozgrzewka', exercises: dayData.warmup || [] },
        { name: 'Część główna', exercises: dayData.main || [] },
        { name: 'Schłodzenie', exercises: dayData.cooldown || [] }
    ];

    sections.forEach((section, sectionIndex) => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const totalSetsDeclared = parseSetCount(exercise.sets);
            const isUnilateral = exercise.isUnilateral ||
                                 exercise.is_unilateral ||
                                 String(exercise.reps_or_time).includes('/str') ||
                                 String(exercise.reps_or_time).includes('stron');

            // TASK 5: Generowanie kroku "Zmiana Strony" tylko gdy requiresSideSwitch jest true
            const requiresSideSwitch = !!exercise.requiresSideSwitch;

            const smartRestTime = calculateSmartRest(exercise, restFactor);

            let transitionTime = 12;
            if (exercise.transitionTime) {
                transitionTime = exercise.transitionTime;
            } else if (exercise.calculated_timing && exercise.calculated_timing.transition_sec) {
                transitionTime = exercise.calculated_timing.transition_sec;
            }

            // FIX: Enforce minimum 12s if side switch is explicitly required,
            // regardless of what data hydration might have set (e.g. 5s default fallback)
            if (requiresSideSwitch && transitionTime < 10) {
                transitionTime = 12;
            }

            const finalTransitionTime = Math.max(5, Math.round(transitionTime * restFactor));

            let loopLimit = totalSetsDeclared;
            let displayTotalSets = totalSetsDeclared;

            if (isUnilateral && totalSetsDeclared > 0) {
                loopLimit = Math.ceil(totalSetsDeclared / 2);
                if (totalSetsDeclared % 2 === 0) {
                    displayTotalSets = totalSetsDeclared / 2;
                } else {
                    displayTotalSets = loopLimit;
                }
            }

            let startSide = 'Lewa';
            let secondSide = 'Prawa';

            if (isUnilateral) {
                if (unilateralGlobalIndex % 2 !== 0) {
                    startSide = 'Prawa';
                    secondSide = 'Lewa';
                }
                unilateralGlobalIndex++;
            }

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
                    // Krok 1: Pierwsza strona
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: displayTotalSets,
                        name: `${exercise.name} (${startSide})`,
                        reps_or_time: singleSideRepsOrTime,
                        duration: singleSideDuration > 0 ? singleSideDuration : undefined,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });

                    // Krok 2: Opcjonalne Przejście (Switch)
                    // TASK 5: Dodajemy krok zmiany strony TYLKO jeśli requiresSideSwitch=true
                    if (requiresSideSwitch) {
                        plan.push({
                            name: "Zmiana Strony",
                            isRest: true,
                            isWork: false,
                            duration: finalTransitionTime,
                            sectionName: "Przejście",
                            description: `Przygotuj stronę: ${secondSide}`,
                            uniqueId: `rest_transition_${globalStepCounter++}`
                        });
                    }

                    // Krok 3: Druga strona
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
                    // Standardowe (obustronne)
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: totalSetsDeclared,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });
                }

                if (i < loopLimit) {
                    plan.push({
                        name: 'Odpoczynek',
                        isRest: true,
                        isWork: false,
                        duration: smartRestTime,
                        sectionName: 'Przerwa między seriami',
                        uniqueId: `rest_set_${globalStepCounter++}`
                    });
                }
            }

            const isLastExerciseInSection = exerciseIndex === section.exercises.length - 1;
            const isLastSection = sectionIndex === sections.length - 1;

            if (!isLastExerciseInSection) {
                plan.push({
                    name: 'Przerwa',
                    isRest: true,
                    isWork: false,
                    duration: smartRestTime,
                    sectionName: 'Przerwa',
                    uniqueId: `rest_exercise_${globalStepCounter++}`
                });
            } else if (!isLastSection) {
                const nextSectionName = sections[sectionIndex + 1].name;
                plan.push({
                    name: `Start: ${nextSectionName}`,
                    isRest: true,
                    isWork: false,
                    duration: REST_BETWEEN_SECTIONS,
                    sectionName: 'Zmiana Sekcji',
                    description: 'Przygotuj sprzęt do kolejnej części.',
                    uniqueId: `rest_section_${globalStepCounter++}`
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
    state.sessionDetailPromptCount = 0; // RESET AMPS COUNTER

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
        console.error("Critical: No source plan found in startModifiedTraining!");
        alert("Błąd: Nie znaleziono planu. Powrót do menu.");
        navigateTo('main');
        return;
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
    initProgressBar();
    startBackupInterval();
    startSessionClock();
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
    state.sessionDetailPromptCount = backup.sessionDetailPromptCount || 0; // Restore AMPS counter

    state.stopwatch.seconds = backup.stopwatchSeconds || 0;
    state.timer.timeLeft = backup.timerTimeLeft || 0;
    state.timer.initialDuration = backup.timerInitialDuration || 0;

    navigateTo('training');
    initializeFocusElements();
    initProgressBar();
    startBackupInterval();
    startSessionClock();

    startExercise(backup.currentExerciseIndex, true);
}
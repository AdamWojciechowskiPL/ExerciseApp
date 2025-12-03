// ui/screens/training.js
import { state } from '../../state.js';
import { screens, initializeFocusElements } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate } from '../../utils.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { generatePreTrainingCardHTML } from '../templates.js';
import { renderSwapModal } from '../modals.js';
import { startModifiedTraining } from '../../training.js';
import { getIsCasting, sendShowIdle, sendPlayVideo, sendStopVideo } from '../../cast.js';
import dataStore from '../../dataStore.js';
import { renderMainScreen, clearPlanFromStorage } from './dashboard.js';
import { workoutMixer } from '../../workoutMixer.js';
import { getUserPayload } from '../../auth.js';

const savePlanToStorage = (plan) => {
    try {
        const user = getUserPayload();
        const userId = user ? user.sub : 'anon';
        const date = getISODate(new Date());
        localStorage.setItem(`dynamic_plan_${userId}_${date}`, JSON.stringify(plan));
    } catch (e) { console.error("Błąd zapisu planu:", e); }
};

export const renderPreTrainingScreen = (dayId, initialPainLevel = 0, useDynamicPlan = false) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());

    const activePlan = getActiveTrainingPlan();
    if (!activePlan) return;

    const dayDataRaw = activePlan.Days.find(d => d.dayNumber === dayId);
    if (!dayDataRaw) return;

    const hasActiveDynamicPlan = state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === dayId;
    const shouldUseDynamic = useDynamicPlan && hasActiveDynamicPlan;

    let basePlanData;
    if (shouldUseDynamic) {
        basePlanData = state.todaysDynamicPlan;
    } else {
        basePlanData = getHydratedDay(dayDataRaw);
    }

    let currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, 1.0);

    // --- SANITYZACJA DANYCH (Naprawa starego cache) ---
    // Wymuszamy odświeżenie tempa z bazy danych dla podmienionych ćwiczeń
    const staticReference = getHydratedDay(dayDataRaw);

    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (currentAdjustedPlan[section] && staticReference[section]) {
            currentAdjustedPlan[section].forEach((ex, index) => {
                const isSwapped = ex.isDynamicSwap || ex.isSwapped;

                if (!isSwapped) {
                    // Jeśli oryginał: przywróć tempo z planu
                    const originalRef = staticReference[section][index];
                    if (originalRef && (originalRef.id === ex.id || originalRef.exerciseId === ex.exerciseId)) {
                        ex.tempo_or_iso = originalRef.tempo_or_iso;
                    }
                } 
                else {
                    // Jeśli podmienione: pobierz tempo z definicji ćwiczenia (z bazy)
                    // Używamy nowego helpera
                    const dbTempo = workoutMixer.getExerciseTempo(ex.id || ex.exerciseId);
                    ex.tempo_or_iso = dbTempo;
                }
            });
        }
    });

    const screen = screens.preTraining;
    
    // ... (Reszta renderowania UI bez zmian, kopiuję całość dla kompletności pliku)
    const actionButtonsHTML = `
        <div style="display:flex; gap:12px;">
            ${shouldUseDynamic ? 
                `<button id="reset-workout-btn" class="icon-btn" title="Przywróć Plan Bazowy" 
                    style="background:var(--card-background); border:1px solid var(--danger-color); 
                    width: 42px; height: 42px; padding: 0; flex-shrink: 0;
                    display:flex; align-items:center; justify-content:center; border-radius: 50%;">
                    <img src="/icons/control-reset.svg" width="20" height="20" alt="Reset" 
                         style="filter: invert(56%) sepia(69%) saturate(408%) hue-rotate(314deg) brightness(88%) contrast(93%); display:block;">
                </button>` : ''
            }
            <button id="shuffle-workout-btn" class="icon-btn" title="Przelosuj Trening" 
                style="background:var(--card-background); border:1px solid var(--border-color); color:var(--primary-color);
                width: 42px; height: 42px; padding: 0; flex-shrink: 0;
                display:flex; align-items:center; justify-content:center; border-radius: 50%;">
                <img src="/icons/swap.svg" width="22" height="22" alt="Shuffle" style="display:block;">
            </button>
        </div>
    `;

    screen.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h2 id="pre-training-title" style="margin:0;">Podgląd: ${currentAdjustedPlan.title}</h2>
            ${actionButtonsHTML}
        </div>
        
        <div class="adjustment-panel">
            <div class="adjustment-header">
                <h3>Dostosuj Czas</h3>
                <span id="time-factor-display" class="time-factor-display">100%</span>
            </div>
            <div class="slider-container">
                <span style="font-size:0.8rem">Szybko (50%)</span>
                <input type="range" id="time-slider" min="0.5" max="1.2" step="0.1" value="1.0">
                <span style="font-size:0.8rem">Max (120%)</span>
            </div>
            ${initialPainLevel > 0 ? `<p style="font-size:0.8rem; color:var(--danger-color); margin-top:0.5rem;">⚠️ Uwzględniono poziom bólu: ${initialPainLevel}/10</p>` : ''}
        </div>

        <div id="pre-training-list"></div>
        
        <div class="pre-training-nav">
            <button id="pre-training-back-btn" class="nav-btn">Anuluj</button>
            <button id="start-modified-training-btn" class="action-btn">Start Treningu</button>
        </div>
    `;

    const listContainer = screen.querySelector('#pre-training-list');

    const renderList = (planToRender) => {
        listContainer.innerHTML = '';
        const sections = [
            { name: 'Rozgrzewka', exercises: planToRender.warmup || [] },
            { name: 'Część główna', exercises: planToRender.main || [] },
            { name: 'Schłodzenie', exercises: planToRender.cooldown || [] }
        ];

        let exerciseCounter = 0;
        sections.forEach(section => {
            if (section.exercises.length === 0) return;
            const header = document.createElement('h3');
            header.className = 'pre-training-section-header';
            header.textContent = section.name;
            listContainer.appendChild(header);

            section.exercises.forEach((ex) => {
                listContainer.innerHTML += generatePreTrainingCardHTML(ex, exerciseCounter);
                exerciseCounter++;
            });
        });
    };

    renderList(currentAdjustedPlan);

    const slider = screen.querySelector('#time-slider');
    const display = screen.querySelector('#time-factor-display');

    const updateInputsInDOM = (newPlan) => {
        const allExercises = [
            ...(newPlan.warmup || []),
            ...(newPlan.main || []),
            ...(newPlan.cooldown || [])
        ];

        allExercises.forEach((ex, index) => {
            const setsInput = document.getElementById(`sets-ex-${index}`);
            const repsInput = document.getElementById(`reps-ex-${index}`);

            if (setsInput) {
                setsInput.value = ex.sets;
                setsInput.style.transition = 'background-color 0.2s';
                setsInput.style.backgroundColor = '#fff9db';
                setTimeout(() => setsInput.style.backgroundColor = '#f8f9fa', 300);
            }
            if (repsInput) {
                repsInput.value = ex.reps_or_time;
                repsInput.style.transition = 'background-color 0.2s';
                repsInput.style.backgroundColor = '#fff9db';
                setTimeout(() => repsInput.style.backgroundColor = '#f8f9fa', 300);
            }
        });
    };

    slider.addEventListener('input', (e) => {
        const timeFactor = parseFloat(e.target.value);
        display.textContent = `${Math.round(timeFactor * 100)}%`;
        currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, timeFactor);
        
        // FIX: Ponowna sanityzacja przy zmianie suwaka
        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (currentAdjustedPlan[section]) {
                currentAdjustedPlan[section].forEach((ex) => {
                    if (ex.isDynamicSwap || ex.isSwapped) {
                        ex.tempo_or_iso = workoutMixer.getExerciseTempo(ex.id || ex.exerciseId);
                    } else {
                        // Restore original if not swapped (musimy znaleźć oryginał, ale uproszczona wersja bierze z ex, bo assistant kopiuje)
                        // W idealnym świecie assistant powinien brać też tempo. Tu zakładamy, że ex ma już poprawne dane z 1. sanityzacji
                    }
                });
            }
        });

        updateInputsInDOM(currentAdjustedPlan);
    });

    const shuffleBtn = screen.querySelector('#shuffle-workout-btn');
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            if (confirm("Chcesz przelosować cały zestaw ćwiczeń?")) {
                const freshStatic = getHydratedDay(dayDataRaw);
                state.todaysDynamicPlan = workoutMixer.mixWorkout(freshStatic, true);
                savePlanToStorage(state.todaysDynamicPlan); 
                renderPreTrainingScreen(dayId, initialPainLevel, true);
            }
        });
    }

    const resetBtn = screen.querySelector('#reset-workout-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Czy na pewno chcesz cofnąć wszystkie losowania i wrócić do oryginalnego planu?")) {
                clearPlanFromStorage(); 
                renderPreTrainingScreen(dayId, initialPainLevel, false);
            }
        });
    }

    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.swap-btn');
        if (!btn) return;

        const globalIndex = parseInt(btn.dataset.exerciseIndex, 10);
        let counter = 0;
        let targetSection = null;
        let targetLocalIndex = -1;
        let foundExercise = null;

        ['warmup', 'main', 'cooldown'].forEach(sectionName => {
            if (foundExercise) return;
            const list = currentAdjustedPlan[sectionName] || [];
            if (globalIndex < counter + list.length) {
                targetSection = sectionName;
                targetLocalIndex = globalIndex - counter;
                foundExercise = list[targetLocalIndex];
            }
            counter += list.length;
        });

        if (foundExercise) {
            renderSwapModal(foundExercise, (newExerciseDef, swapType) => {
                const updateExerciseInPlan = (plan) => {
                    if (plan[targetSection] && plan[targetSection][targetLocalIndex]) {
                        const oldEx = plan[targetSection][targetLocalIndex];
                        const smartRepsOrTime = workoutMixer.adaptVolume(oldEx, newExerciseDef);
                        
                        // FIX: Pobieramy tempo z bazy dla nowego ćwiczenia
                        const dbTempo = workoutMixer.getExerciseTempo(newExerciseDef.id);

                        plan[targetSection][targetLocalIndex] = {
                            ...newExerciseDef,
                            id: newExerciseDef.id,
                            exerciseId: newExerciseDef.id,
                            sets: oldEx.sets,
                            reps_or_time: smartRepsOrTime,
                            tempo_or_iso: dbTempo, // Nowe tempo
                            isSwapped: true,
                            isDynamicSwap: true,
                            originalName: (oldEx.exerciseId !== newExerciseDef.id) ? oldEx.name : null
                        };
                    }
                };

                if (!state.todaysDynamicPlan) {
                    const freshStatic = getHydratedDay(dayDataRaw);
                    state.todaysDynamicPlan = JSON.parse(JSON.stringify(freshStatic));
                }

                updateExerciseInPlan(state.todaysDynamicPlan);
                savePlanToStorage(state.todaysDynamicPlan); 

                renderPreTrainingScreen(dayId, initialPainLevel, true);

                if (swapType === 'blacklist') {
                    const blockedId = foundExercise.id || foundExercise.exerciseId;
                    const replacementId = newExerciseDef.id;
                    if (confirm(`Dodać "${foundExercise.name}" do czarnej listy i w przyszłości podmieniać na "${newExerciseDef.name}"?`)) {
                        dataStore.addToBlacklist(blockedId, replacementId);
                    }
                }
            });
        }
    });

    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.preview-anim-btn');
        if (btn) {
            e.stopPropagation();
            const exId = btn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];
            
            if (ex && ex.animationSvg) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = `
                    <div class="swap-modal" style="align-items: center; text-align: center;">
                        <h3>${ex.name}</h3>
                        <div style="width: 100%; max-width: 300px; margin: 1rem 0;">${ex.animationSvg}</div>
                        <button type="button" id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button>
                    </div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#close-preview').onclick = (evt) => { evt.stopPropagation(); overlay.remove(); };
                overlay.onclick = (evt) => { if (evt.target === overlay) overlay.remove(); };
            }
        }
    });

    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    screen.querySelector('#start-modified-training-btn').addEventListener('click', () => {
        state.sessionParams.initialPainLevel = initialPainLevel;
        const sliderVal = document.getElementById('time-slider');
        state.sessionParams.timeFactor = sliderVal ? parseFloat(sliderVal.value) : 1.0;
        startModifiedTraining();
    });

    navigateTo('preTraining');
};

export const renderTrainingScreen = () => {
    screens.training.innerHTML = `
    <div class="focus-view">
        <div class="focus-header">
            <p id="focus-section-name"></p>
            <button id="exit-training-btn">Zakończ</button>
            <p id="focus-progress"></p>
        </div>
        
        <div class="focus-timer-container">
            <p id="focus-timer-display"></p>
        </div>
        
        <div class="focus-exercise-info" style="margin-bottom: 0.5rem;">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <button id="tts-toggle-btn" class="tts-button">
                    <img id="tts-icon" src="/icons/sound-on.svg" alt="Dźwięk">
                </button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>

        <div id="visual-toggle-card" class="visual-card-wrapper" title="Kliknij, aby przełączyć widok">
            <div id="focus-animation-container" class="visual-card-content focus-animation-container hidden"></div>
            <div id="focus-description" class="visual-card-content focus-description-container"></div>
            <div class="flip-indicator">
                <img src="/icons/info.svg" alt="Info">
            </div>
        </div>
        
        <div class="focus-controls-wrapper">
             <div class="focus-main-action">
                <button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button>
            </div>
            <div class="focus-secondary-actions">
                <button id="prev-step-btn" class="control-icon-btn"><img src="/icons/control-back.svg"></button>
                <button id="pause-resume-btn" class="control-icon-btn"><img src="/icons/control-pause.svg"></button>
                <button id="skip-btn" class="control-icon-btn"><img src="/icons/control-skip.svg"></button>
            </div>
        </div>

        <div class="focus-next-up">
            <p><strong>Następne:</strong> <span id="next-exercise-name"></span></p>
        </div>
    </div>`;

    initializeFocusElements();

    const cardWrapper = document.getElementById('visual-toggle-card');
    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');

    if (cardWrapper) {
        cardWrapper.addEventListener('click', () => {
            const isAnimVisible = !animContainer.classList.contains('hidden');
            if (animContainer.innerHTML.trim() !== "") {
                if (isAnimVisible) {
                    animContainer.classList.add('hidden');
                    descContainer.classList.remove('hidden');
                } else {
                    animContainer.classList.remove('hidden');
                    descContainer.classList.add('hidden');
                }
            }
        });
    }
};
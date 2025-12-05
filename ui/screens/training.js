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

    const activePlan = getActiveTrainingPlan(); // To jest zawsze plan statyczny (baza wiedzy)
    
    // 1. Logika pobierania surowych danych dnia
    let rawDayData = null;
    let isCurrentDynamicDay = false;

    if (useDynamicPlan) {
        // A. Sprawdź czy to "Dzień Dzisiejszy" w trybie dynamicznym
        // Jeśli tak, bierzemy z state.todaysDynamicPlan, bo tam mogą być już wykonane Swapy/Mixer
        if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === dayId) {
            rawDayData = state.todaysDynamicPlan;
            isCurrentDynamicDay = true;
        } 
        // B. Jeśli to inny dzień (podgląd przyszłości) w trybie dynamicznym
        else if (state.settings.dynamicPlanData && state.settings.dynamicPlanData.days) {
            const dynDays = state.settings.dynamicPlanData.days;
            // Obsługa cykliczności (modulo), jeśli dayId wykracza poza długość planu
            // dayId jest 1-based, tablica 0-based
            const arrayIndex = (dayId - 1) % dynDays.length;
            rawDayData = dynDays[arrayIndex];
            
            // Upewnij się, że dayNumber w obiekcie jest zgodny z wyświetlanym (ważne przy cyklicznym powtarzaniu planu)
            if (rawDayData) {
                // Tworzymy płytką kopię, żeby nie nadpisać oryginału w settings przy zmianie dayNumber
                rawDayData = { ...rawDayData, dayNumber: dayId };
            }
        }
    }

    // C. Fallback do planu statycznego (jeśli nie znaleziono dynamicznego lub tryb statyczny)
    if (!rawDayData && activePlan) {
        rawDayData = activePlan.Days.find(d => d.dayNumber === dayId);
    }

    if (!rawDayData) {
        console.error("Błąd: Nie znaleziono danych dla dnia", dayId);
        alert("Nie udało się załadować podglądu tego dnia.");
        navigateTo('main');
        return;
    }

    // 2. KLUCZOWY MOMENT: Hydracja (uzupełnienie danych z biblioteki)
    const basePlanData = getHydratedDay(rawDayData);

    // 3. Adaptacja (skalowanie objętości przez Asystenta)
    let currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, 1.0);

    const screen = screens.preTraining;
    
    // Przycisk resetu pokazujemy tylko jeśli to jest AKTYWNY (dzisiejszy) plan dynamiczny, który można zresetować
    const showResetButton = useDynamicPlan && isCurrentDynamicDay;

    const actionButtonsHTML = `
        <div style="display:flex; gap:12px;">
            ${showResetButton ? 
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
        currentAdjustedPlan = getHydratedDay(currentAdjustedPlan);
        updateInputsInDOM(currentAdjustedPlan);
    });

    const shuffleBtn = screen.querySelector('#shuffle-workout-btn');
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            if (confirm("Chcesz przelosować cały zestaw ćwiczeń?")) {
                const freshStatic = getHydratedDay(rawDayData);
                const mixedPlan = workoutMixer.mixWorkout(freshStatic, true);
                
                // Jeśli to dzisiejszy dzień, zapisujemy w state i storage
                if (isCurrentDynamicDay) {
                    state.todaysDynamicPlan = mixedPlan;
                    savePlanToStorage(mixedPlan);
                } else {
                    // Jeśli to przyszłość, tylko podmieniamy w podglądzie (nie zapisujemy trwale w storage jako "today")
                    // Opcjonalnie: można by to zapisać w settings.dynamicPlanData, ale to skomplikowane.
                    // Na razie pozwalamy przelosować tylko do podglądu.
                    // Aby user mógł to wykonać, musiałby to być dzień dzisiejszy.
                }
                
                // Ponowne renderowanie z nowym planem w pamięci funkcji (rekurencja UI)
                // Mały hack: podmieniamy basePlanData i currentAdjustedPlan w locie
                const hydratedMixed = getHydratedDay(mixedPlan);
                currentAdjustedPlan = assistant.adjustTrainingVolume(hydratedMixed, initialPainLevel, parseFloat(slider.value));
                renderList(currentAdjustedPlan);
                updateInputsInDOM(currentAdjustedPlan);
            }
        });
    }

    const resetBtn = screen.querySelector('#reset-workout-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Czy na pewno chcesz cofnąć wszystkie losowania i wrócić do oryginalnego planu?")) {
                if (isCurrentDynamicDay) {
                    clearPlanFromStorage(); 
                }
                // Przeładuj ekran
                renderPreTrainingScreen(dayId, initialPainLevel, useDynamicPlan);
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
                // Logika aktualizacji obiektu planu w pamięci
                const updateExerciseInPlan = (plan) => {
                    if (plan[targetSection] && plan[targetSection][targetLocalIndex]) {
                        const oldEx = plan[targetSection][targetLocalIndex];
                        const smartRepsOrTime = workoutMixer.adaptVolume(oldEx, newExerciseDef);
                        const dbTempo = workoutMixer.getExerciseTempo(newExerciseDef.id);

                        plan[targetSection][targetLocalIndex] = {
                            ...newExerciseDef,
                            id: newExerciseDef.id,
                            exerciseId: newExerciseDef.id,
                            sets: oldEx.sets,
                            reps_or_time: smartRepsOrTime,
                            tempo_or_iso: dbTempo,
                            isSwapped: true,
                            isDynamicSwap: true,
                            originalName: (oldEx.exerciseId !== newExerciseDef.id) ? oldEx.name : null
                        };
                    }
                };

                // Jeśli modyfikujemy podgląd przyszłości, musimy stworzyć kopię
                let planToModify = isCurrentDynamicDay ? state.todaysDynamicPlan : JSON.parse(JSON.stringify(rawDayData));
                
                // Jeśli state.todaysDynamicPlan był pusty (np. pierwszy start), tworzymy go
                if (isCurrentDynamicDay && !planToModify) {
                    planToModify = JSON.parse(JSON.stringify(getHydratedDay(rawDayData)));
                    state.todaysDynamicPlan = planToModify;
                }

                updateExerciseInPlan(planToModify);

                if (isCurrentDynamicDay) {
                    savePlanToStorage(planToModify);
                    renderPreTrainingScreen(dayId, initialPainLevel, true);
                } else {
                    // Dla przyszłych dni tylko odświeżamy widok (bez trwałego zapisu w todayStorage)
                    const hydrated = getHydratedDay(planToModify);
                    currentAdjustedPlan = assistant.adjustTrainingVolume(hydrated, initialPainLevel, parseFloat(slider.value));
                    renderList(currentAdjustedPlan);
                }

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
        // Jeśli to przyszły dzień, to nie powinniśmy pozwalać na start w trybie "official"
        // Chyba że użytkownik chce "przeskoczyć" dzień.
        // W obecnej logice startModifiedTraining i tak czyta z state.todaysDynamicPlan lub activePlan.
        // Jeśli podglądamy przyszłość, state.todaysDynamicPlan może być inny niż to co widzimy.
        // Aby to obsłużyć poprawnie, musielibyśmy wymusić ustawienie todaysDynamicPlan na ten dzień.
        
        if (!isCurrentDynamicDay && useDynamicPlan) {
            if (confirm("To jest trening z przyszłości. Czy chcesz ustawić go jako dzisiejszy plan i rozpocząć?")) {
                state.todaysDynamicPlan = currentAdjustedPlan; // Ustawiamy podglądany plan jako "dzisiejszy"
                savePlanToStorage(currentAdjustedPlan);
            } else {
                return;
            }
        }

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
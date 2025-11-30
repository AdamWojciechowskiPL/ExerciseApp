// js/ui/screens/training.js
import { state } from '../../state.js';
import { screens, initializeFocusElements } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate } from '../../utils.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { generatePreTrainingCardHTML } from '../templates.js';
import { renderSwapModal } from '../modals.js';
import { startModifiedTraining } from '../../training.js';
import { getIsCasting, sendShowIdle } from '../../cast.js';
import dataStore from '../../dataStore.js';
import { renderMainScreen } from './dashboard.js';

// ============================================================
// 1. EKRAN PODGLĄDU (PRE-TRAINING)
// ============================================================
export const renderPreTrainingScreen = (dayId, initialPainLevel = 0) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());

    const activePlan = getActiveTrainingPlan();
    if (!activePlan) return;

    const dayDataRaw = activePlan.Days.find(d => d.dayNumber === dayId);
    if (!dayDataRaw) return;

    const originalDayData = getHydratedDay(dayDataRaw);

    // Aplikujemy modyfikację bólową na starcie (TimeFactor = 1.0)
    let currentAdjustedPlan = assistant.adjustTrainingVolume(originalDayData, initialPainLevel, 1.0);

    const screen = screens.preTraining;

    screen.innerHTML = `
        <h2 id="pre-training-title">Podgląd: ${currentAdjustedPlan.title}</h2>
        
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

    // --- OBSŁUGA SUWAKA CZASU ---
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
        currentAdjustedPlan = assistant.adjustTrainingVolume(originalDayData, initialPainLevel, timeFactor);
        updateInputsInDOM(currentAdjustedPlan);
    });

    // --- OBSŁUGA WYMIANY (SMART SWAP) ---
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
                const calculateNewParams = (oldEx, newDef) => {
                    const oldVal = (oldEx.reps_or_time || '').toLowerCase();
                    const isOldTimeBased = /[\d]+\s*(s\b|sec|min|:)/.test(oldVal);
                    const isNewTimeBased = (newDef.maxDuration && newDef.maxDuration > 0);
                    const isNewRepBased = (newDef.maxReps && newDef.maxReps > 0);

                    let newRepsOrTime = oldEx.reps_or_time;

                    if (isNewTimeBased) {
                        if (!isOldTimeBased) {
                            const defaultTime = Math.min(newDef.maxDuration || 60, 45);
                            newRepsOrTime = `${defaultTime} s`;
                        }
                    }
                    else if (isNewRepBased) {
                        if (isOldTimeBased) {
                            const defaultReps = Math.min(newDef.maxReps || 20, 12);
                            newRepsOrTime = `${defaultReps}`;
                        }
                    }

                    return {
                        sets: oldEx.sets,
                        reps_or_time: newRepsOrTime,
                        tempo_or_iso: newDef.tempo_or_iso || oldEx.tempo_or_iso
                    };
                };

                const updateExerciseInPlan = (plan) => {
                    if (plan[targetSection] && plan[targetSection][targetLocalIndex]) {
                        const oldEx = plan[targetSection][targetLocalIndex];
                        const smartParams = calculateNewParams(oldEx, newExerciseDef);

                        plan[targetSection][targetLocalIndex] = {
                            ...newExerciseDef,
                            sets: smartParams.sets,
                            reps_or_time: smartParams.reps_or_time,
                            tempo_or_iso: smartParams.tempo_or_iso,
                            isSwapped: true
                        };
                    }
                };

                updateExerciseInPlan(originalDayData);
                updateExerciseInPlan(currentAdjustedPlan);

                if (swapType === 'blacklist') {
                    const blockedId = foundExercise.id || foundExercise.exerciseId;
                    const replacementId = newExerciseDef.id;

                    if (confirm(`Dodać "${foundExercise.name}" do czarnej listy i w przyszłości podmieniać na "${newExerciseDef.name}"?`)) {
                        dataStore.addToBlacklist(blockedId, replacementId)
                            .then(() => alert("Zapisano preferencję."));
                    }
                }

                renderList(currentAdjustedPlan);
            });
        }
    });

    // --- OBSŁUGA PODGLĄDU ANIMACJI (MODAL) ---
    listContainer.addEventListener('click', (e) => {
        // Używamy closest, aby złapać kliknięcie w ikonkę wewnątrz przycisku
        const btn = e.target.closest('.preview-anim-btn');

        if (btn) {
            // Zatrzymujemy propagację, aby nie uruchamiać innych handlerów na liście
            e.stopPropagation();

            const exId = btn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];

            if (ex && ex.animationSvg) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                // Dodajemy stopPropagation na overlayu, żeby kliknięcie w treść nie zamykało (tylko tło)

                overlay.innerHTML = `
                    <div class="swap-modal" style="align-items: center; text-align: center;">
                        <h3>${ex.name}</h3>
                        <div style="width: 100%; max-width: 300px; margin: 1rem 0;">
                            ${ex.animationSvg}
                        </div>
                        <button type="button" id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button>
                    </div>
                `;

                document.body.appendChild(overlay);

                // 1. Zamknij przyciskiem
                const closeBtn = overlay.querySelector('#close-preview');
                closeBtn.onclick = (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    overlay.remove();
                };

                // 2. Zamknij klikając w tło (poza oknem modala)
                overlay.onclick = (evt) => {
                    if (evt.target === overlay) {
                        overlay.remove();
                    }
                };
            }
        }
    });

    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    screen.querySelector('#start-modified-training-btn').addEventListener('click', () => {
        // --- NOWOŚĆ: Zapisujemy parametry sesji do stanu globalnego ---
        state.sessionParams.initialPainLevel = initialPainLevel;

        // Suwak czasu jest w tym samym widoku, możemy go też pobrać
        const slider = document.getElementById('time-slider');
        state.sessionParams.timeFactor = slider ? parseFloat(slider.value) : 1.0;
        // -------------------------------------------------------------

        startModifiedTraining();
    });

    navigateTo('preTraining');
};

// ============================================================
// 2. EKRAN TRENINGU (ACTIVE FOCUS)
// ============================================================
export const renderTrainingScreen = () => {
    screens.training.innerHTML = `
    <div class="focus-view">
        <!-- HEADER (Bez zmian) -->
        <div class="focus-header">
            <p id="focus-section-name"></p>
            <button id="exit-training-btn">Zakończ</button>
            <p id="focus-progress"></p>
        </div>
        
        <!-- TIMER (Bez zmian) -->
        <div class="focus-timer-container">
            <p id="focus-timer-display"></p>
        </div>
        
        <!-- INFO TEKSTOWE (Nazwa, Seria - ZAWSZE WIDOCZNE, NIE SKACZĄ) -->
        <div class="focus-exercise-info" style="margin-bottom: 0.5rem;">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <button id="tts-toggle-btn" class="tts-button">
                    <img id="tts-icon" src="/icons/sound-on.svg" alt="Dźwięk">
                </button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>

        <!-- NOWA STRUKTURA: VISUAL CARD (Klikalna) -->
        <!-- Zastępuje stary przycisk i luźne kontenery -->
        <div id="visual-toggle-card" class="visual-card-wrapper" title="Kliknij, aby przełączyć widok">
            
            <!-- Widok 1: Animacja -->
            <div id="focus-animation-container" class="visual-card-content focus-animation-container hidden">
                <!-- SVG trafi tutaj -->
            </div>

            <!-- Widok 2: Opis -->
            <div id="focus-description" class="visual-card-content focus-description-container">
                <!-- Tekst trafi tutaj -->
            </div>

            <!-- Dyskretna ikona w rogu -->
            <div class="flip-indicator">
                <img src="/icons/info.svg" alt="Info"> <!-- Upewnij się, że masz ikonę info.svg lub użyj inline SVG poniżej -->
            </div>
        </div>
        
        <!-- CONTROLS (Bez zmian) -->
        <div class="focus-controls-wrapper">
            <!-- ... przyciski ... -->
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

    // Inicjalizacja referencji (Twoja funkcja z dom.js)
    initializeFocusElements();

    // === NOWA OBSŁUGA KLIKNIĘCIA W KARTĘ ===
    const cardWrapper = document.getElementById('visual-toggle-card');
    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');

    if (cardWrapper) {
        cardWrapper.addEventListener('click', () => {
            // Prosta logika przełączania
            const isAnimVisible = !animContainer.classList.contains('hidden');

            // Jeśli jest animacja (i nie jest pusta), to przełączamy.
            // Jeśli animacji nie ma w ogóle (null), kliknięcie nic nie psuje (opis zostaje).
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
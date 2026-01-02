// ExerciseApp/ui/screens/training.js
// Używamy ścieżek absolutnych (/...), aby uniknąć błędów rozwiązywania modułów

import { state } from '/state.js';
import { screens, initializeFocusElements, focus } from '/dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate } from '/utils.js';
import { assistant } from '/assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '/ui/core.js';
import { generatePreTrainingCardHTML, getAffinityBadge } from '/ui/templates.js';
import { renderSwapModal, renderPreviewModal } from '/ui/modals.js';
import { startModifiedTraining } from '/training.js';
import { getIsCasting, sendShowIdle, sendPlayVideo, sendStopVideo } from '/cast.js';
import dataStore from '/dataStore.js';
import { workoutMixer } from '/workoutMixer.js';
import { getUserPayload } from '/auth.js';
import { generateBioProtocol } from '/protocolGenerator.js';

const savePlanToStorage = (plan) => {
    try {
        const user = getUserPayload();
        const userId = user ? user.sub : 'anon';
        const date = getISODate(new Date());
        localStorage.setItem(`dynamic_plan_${userId}_${date}`, JSON.stringify(plan));
    } catch (e) { console.error("Błąd zapisu planu:", e); }
};

// --- EKRAN STARTOWY BIO-PROTOKOŁU ---
export const renderProtocolStart = (protocol) => {
    // Ustawiamy protokół jako "aktualny plan" w stanie
    state.todaysDynamicPlan = protocol;
    state.currentTrainingDayId = protocol.id;

    const screen = screens.preTraining;

    // Dobór koloru akcentującego w zależności od trybu
    let accentColor = 'var(--primary-color)';
    if (protocol.mode === 'sos') accentColor = '#8b5cf6';      // Fiolet
    if (protocol.mode === 'booster') accentColor = '#fb7185';  // Róż
    if (protocol.mode === 'reset') accentColor = '#34d399';    // Zieleń

    // Nowe tryby
    if (protocol.mode === 'calm') accentColor = '#3b82f6';     // Blue
    if (protocol.mode === 'flow') accentColor = '#22d3ee';     // Cyan
    if (protocol.mode === 'neuro') accentColor = '#facc15';    // Yellow
    if (protocol.mode === 'ladder') accentColor = '#fb923c';   // Orange

    // ZMIANA: Wyświetlamy targetDuration (czas celu) zamiast wyliczonego totalDuration,
    // aby zachować spójność z kafelkiem na dashboardzie.
    const displayTime = protocol.targetDuration || Math.round(protocol.totalDuration / 60);

    // Generowanie HTML nagłówka
    screen.innerHTML = `
        <div style="text-align:center; padding: 1.5rem 0; background: linear-gradient(to bottom, ${accentColor} 0%, transparent 100%); margin: -1.5rem -1.5rem 1rem -1.5rem; border-radius: 0 0 20px 20px;">
            <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto; font-size: 2rem;">
                ${protocol.mode === 'sos' ? '💊' : (protocol.mode === 'booster' ? '🔥' : (protocol.mode === 'calm' ? '🌙' : (protocol.mode === 'neuro' ? '⚡' : '🍃')))}
            </div>
            <h2 style="margin:0; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${protocol.title}</h2>
            <p style="margin: 5px 0 0 0; color: rgba(255,255,255,0.9); font-size: 0.9rem; padding: 0 1rem;">${protocol.description}</p>
        </div>

        <!-- SUWAK INTENSYWNOŚCI (TIME FACTOR) -->
        <div class="adjustment-panel" style="margin-bottom: 1rem;">
            <div class="adjustment-header">
                <h3>Dostosuj Czas</h3>
                <span id="time-factor-display" class="time-factor-display">100%</span>
            </div>
            <div class="slider-container">
                <span style="font-size:0.8rem">Szybko (50%)</span>
                <input type="range" id="time-slider" min="0.5" max="1.5" step="0.1" value="1.0">
                <span style="font-size:0.8rem">Długo (150%)</span>
            </div>
        </div>

        <div id="pre-training-list">
            <!-- Lista ćwiczeń -->
        </div>

        <div class="pre-training-nav">
            <button id="proto-cancel-btn" class="nav-btn">Wróć</button>
            <button id="proto-start-btn" class="action-btn" style="background: ${accentColor}; border:none; color: white; font-weight: 800;">
                Rozpocznij (<span id="total-time-display">${displayTime}</span> min)
            </button>
        </div>
    `;

    const listContainer = screen.querySelector('#pre-training-list');
    const totalTimeDisplay = screen.querySelector('#total-time-display');

    // Funkcja renderująca listę (do odświeżania po zmianie suwaka lub wymianie ćwiczenia)
    const renderList = (currentProtocol) => {
        listContainer.innerHTML = '';
        const workExercises = currentProtocol.flatExercises.filter(ex => ex.isWork);

        workExercises.forEach((ex, index) => {
            const cardHTML = generatePreTrainingCardHTML(ex, index);
            listContainer.innerHTML += cardHTML;
        });

        // Jeśli czas nie był zmieniany (timeFactor 1.0), trzymamy się targetDuration (np. 5 min).
        // Jeśli użytkownik ruszył suwak, pokazujemy czas przeliczony.
        // Ale ponieważ suwak resetuje się przy starcie, początkowo używamy logicznego displayTime.
        // Poniższa logika aktualizuje czas TYLKO jeśli suwak został ruszony (wywołanie z eventu)
        // lub przy wymianie ćwiczenia. Przy inicjalizacji (pierwsze wywołanie) używamy wartości wpisanej w HTML.
    };

    // Render startowy (oryginalny protokół)
    renderList(protocol);

    // Obsługa suwaka czasu
    const slider = screen.querySelector('#time-slider');
    const display = screen.querySelector('#time-factor-display');

    slider.addEventListener('input', (e) => {
        const timeFactor = parseFloat(e.target.value);
        display.textContent = `${Math.round(timeFactor * 100)}%`;

        // 1. Tworzymy kopię protokołu dla podglądu UI
        const previewProtocol = JSON.parse(JSON.stringify(protocol));

        // 2. Aktualizujemy czasy w kopii
        previewProtocol.flatExercises.forEach(ex => {
            // Skalujemy tylko jeśli ćwiczenie ma zdefiniowane duration (protokoły mają)
            if (ex.duration) {
                const newDuration = Math.round(ex.duration * timeFactor);
                ex.duration = newDuration;

                // Jeśli to ćwiczenie (WORK), aktualizujemy też tekst wyświetlany
                if (ex.isWork) {
                    ex.reps_or_time = `${newDuration} s`;
                }
            }
        });

        // 3. Aktualizujemy całkowity czas w kopii - TUTAJ już pokazujemy prawdę (obliczoną),
        // ponieważ użytkownik intencjonalnie zmienił czas.
        previewProtocol.totalDuration = Math.round(protocol.totalDuration * timeFactor);

        // 4. Przerysowujemy listę z nowymi wartościami
        renderList(previewProtocol);

        // 5. Aktualizujemy przycisk na dole
        if (totalTimeDisplay) {
            totalTimeDisplay.textContent = Math.round(previewProtocol.totalDuration / 60);
        }
    });

    // --- OBSŁUGA WYMIANY ĆWICZEŃ IN-PLACE ---
    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.swap-btn');
        if (!btn) return;

        const index = parseInt(btn.dataset.exerciseIndex, 10);
        const workExercises = protocol.flatExercises.filter(ex => ex.isWork);
        const exerciseToSwap = workExercises[index];

        if (exerciseToSwap) {
            const oldId = exerciseToSwap.id || exerciseToSwap.exerciseId;

            renderSwapModal(exerciseToSwap, (newExerciseDef, swapType) => {
                exerciseToSwap.id = newExerciseDef.id;
                exerciseToSwap.exerciseId = newExerciseDef.id;
                exerciseToSwap.name = newExerciseDef.name;
                exerciseToSwap.description = newExerciseDef.description;
                exerciseToSwap.animationSvg = newExerciseDef.animationSvg;
                exerciseToSwap.hasAnimation = newExerciseDef.hasAnimation;
                exerciseToSwap.categoryId = newExerciseDef.categoryId;
                exerciseToSwap.equipment = newExerciseDef.equipment;
                exerciseToSwap.youtube_url = newExerciseDef.youtube_url;

                exerciseToSwap.isSwapped = true;
                exerciseToSwap.isDynamicSwap = true;
                exerciseToSwap.originalName = (oldId !== newExerciseDef.id) ? exerciseToSwap.name : null;

                if (swapType === 'blacklist') {
                     if (confirm(`Dodać poprzednie ćwiczenie do czarnej listy?`)) {
                         dataStore.addToBlacklist(oldId, newExerciseDef.id);
                     }
                }

                const timeFactor = parseFloat(slider.value) || 1.0;
                const previewProtocol = JSON.parse(JSON.stringify(protocol));
                previewProtocol.flatExercises.forEach(ex => {
                    if (ex.duration) {
                        const newDuration = Math.round(ex.duration * timeFactor);
                        ex.duration = newDuration;
                        if (ex.isWork) ex.reps_or_time = `${newDuration} s`;
                    }
                });
                renderList(previewProtocol);
            });
        }
    });

    // Obsługa przycisku Wróć
    screen.querySelector('#proto-cancel-btn').addEventListener('click', async () => {
        const { renderMainScreen } = await import('/ui/screens/dashboard.js');
        navigateTo('main');
        renderMainScreen();
    });

    // Obsługa przycisku Start
    screen.querySelector('#proto-start-btn').addEventListener('click', () => {
        const timeFactor = parseFloat(slider.value) || 1.0;
        const scaledProtocol = JSON.parse(JSON.stringify(protocol));

        scaledProtocol.flatExercises.forEach(ex => {
            if (ex.duration) {
                ex.duration = Math.round(ex.duration * timeFactor);
                if (ex.isWork) {
                    ex.reps_or_time = `${ex.duration} s`;
                }
            }
        });
        scaledProtocol.totalDuration = Math.round(protocol.totalDuration * timeFactor);

        state.todaysDynamicPlan = scaledProtocol;
        state.sessionParams = { initialPainLevel: 0, timeFactor: timeFactor };

        startModifiedTraining();
    });

    listContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.preview-anim-btn');
        if (btn) {
            e.stopPropagation();
            const exId = btn.dataset.exerciseId;
            const exName = state.exerciseLibrary[exId]?.name || "Podgląd";
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<span style="font-size:0.75rem">⏳</span>`;
            btn.style.opacity = "0.7";

            try {
                const svg = await dataStore.fetchExerciseAnimation(exId);
                if (svg) {
                    renderPreviewModal(svg, exName);
                } else {
                    alert("Brak podglądu dla tego ćwiczenia.");
                }
            } catch (err) {
                console.error("Preview Error:", err);
            } finally {
                btn.innerHTML = originalContent;
                btn.style.opacity = "1";
            }
        }
    });

    navigateTo('preTraining');
};

// --- STANDARDOWY PRE-TRAINING ---
export const renderPreTrainingScreen = (dayId, initialPainLevel = 0, useDynamicPlan = false) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());

    const activePlan = getActiveTrainingPlan();
    let rawDayData = null;
    let isCurrentDynamicDay = false;

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === dayId) {
        if (state.todaysDynamicPlan.type !== 'protocol') {
            rawDayData = state.todaysDynamicPlan;
            isCurrentDynamicDay = true;
        }
    }

    if (!rawDayData && useDynamicPlan && state.settings.dynamicPlanData && state.settings.dynamicPlanData.days) {
        const dynDays = state.settings.dynamicPlanData.days;
        const arrayIndex = (dayId - 1) % dynDays.length;
        rawDayData = dynDays[arrayIndex];
        if (rawDayData) {
            rawDayData = { ...rawDayData, dayNumber: dayId };
        }
    }

    if (!rawDayData && activePlan) {
        rawDayData = activePlan.Days.find(d => d.dayNumber === dayId);
    }

    if (!rawDayData) {
        navigateTo('main');
        return;
    }

    const basePlanData = getHydratedDay(rawDayData);
    let currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, 1.0);

    const screen = screens.preTraining;

    // NAGŁÓWEK - USUNIĘTO SHUFFLE BTN
    const actionButtonsHTML = `
        <div style="display:flex; gap:12px;">
            ${isCurrentDynamicDay ?
                `<button id="reset-workout-btn" class="icon-btn" title="Przywróć Plan Bazowy"
                    style="background:var(--card-background); border:1px solid var(--danger-color);
                    width: 42px; height: 42px; padding: 0; flex-shrink: 0;
                    display:flex; align-items:center; justify-content:center; border-radius: 50%;">
                    <img src="/icons/control-reset.svg" width="20" height="20" alt="Reset"
                         style="filter: invert(56%) sepia(69%) saturate(408%) hue-rotate(314deg) brightness(88%) contrast(93%); display:block;">
                </button>` : ''
            }
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
        let unilateralGlobalIndex = 0;

        sections.forEach(section => {
            if (section.exercises.length === 0) return;
            const header = document.createElement('h3');
            header.className = 'pre-training-section-header';
            header.textContent = section.name;
            listContainer.appendChild(header);

            section.exercises.forEach((ex) => {
                const currentDataIndex = exerciseCounter++;
                const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');

                if (isUnilateral) {
                    let startSide = unilateralGlobalIndex % 2 === 0 ? 'Lewa' : 'Prawa';
                    let secondSide = unilateralGlobalIndex % 2 === 0 ? 'Prawa' : 'Lewa';
                    unilateralGlobalIndex++;

                    const cleanReps = ex.reps_or_time.replace(/\/str\.?|\s*stron.*/gi, '').trim();
                    const setsPerSide = Math.ceil(parseInt(ex.sets.split('-').pop()) / 2);

                    listContainer.innerHTML += generatePreTrainingCardHTML({...ex, name: `${ex.name} (${startSide})`, reps_or_time: cleanReps, sets: setsPerSide.toString()}, currentDataIndex);
                    listContainer.innerHTML += generatePreTrainingCardHTML({...ex, name: `${ex.name} (${secondSide})`, reps_or_time: cleanReps, sets: setsPerSide.toString()}, currentDataIndex);
                } else {
                    listContainer.innerHTML += generatePreTrainingCardHTML(ex, currentDataIndex);
                }
            });
        });
    };

    renderList(currentAdjustedPlan);

    const slider = screen.querySelector('#time-slider');
    const display = screen.querySelector('#time-factor-display');

    slider.addEventListener('input', (e) => {
        const timeFactor = parseFloat(e.target.value);
        display.textContent = `${Math.round(timeFactor * 100)}%`;
        currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, timeFactor);
        currentAdjustedPlan = getHydratedDay(currentAdjustedPlan);
        renderList(currentAdjustedPlan);
    });

    const resetBtn = screen.querySelector('#reset-workout-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm("Czy na pewno chcesz cofnąć wszystkie manualne zmiany w tym zestawie?")) {
                if (isCurrentDynamicDay) {
                    const { clearPlanFromStorage } = await import('/ui/screens/dashboard.js');
                    clearPlanFromStorage();
                    state.todaysDynamicPlan = null;
                }
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
                if (!state.todaysDynamicPlan) state.todaysDynamicPlan = JSON.parse(JSON.stringify(getHydratedDay(rawDayData)));
                let planToModify = state.todaysDynamicPlan;

                if (planToModify[targetSection] && planToModify[targetSection][targetLocalIndex]) {
                    const oldEx = planToModify[targetSection][targetLocalIndex];
                    planToModify[targetSection][targetLocalIndex] = {
                        ...newExerciseDef,
                        id: newExerciseDef.id,
                        exerciseId: newExerciseDef.id,
                        sets: oldEx.sets,
                        reps_or_time: workoutMixer.adaptVolume(oldEx, newExerciseDef),
                        tempo_or_iso: workoutMixer.getExerciseTempo(newExerciseDef.id),
                        isSwapped: true,
                        isDynamicSwap: true,
                        originalName: (oldEx.exerciseId !== newExerciseDef.id) ? oldEx.name : null
                    };
                }

                savePlanToStorage(planToModify);
                renderPreTrainingScreen(dayId, initialPainLevel, true);

                if (swapType === 'blacklist') {
                    if (confirm(`Dodać "${foundExercise.name}" do czarnej listy?`)) {
                        dataStore.addToBlacklist(foundExercise.id || foundExercise.exerciseId, newExerciseDef.id);
                    }
                }
            });
        }
    });

    listContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.preview-anim-btn');
        if (btn) {
            e.stopPropagation();
            const exId = btn.dataset.exerciseId;
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<span style="font-size:0.75rem">⏳</span>`;
            try {
                const svg = await dataStore.fetchExerciseAnimation(exId);
                if (svg) renderPreviewModal(svg, state.exerciseLibrary[exId]?.name || "Podgląd");
            } catch (err) { console.error(err); } finally { btn.innerHTML = originalContent; }
        }
    });

    screen.querySelector('#pre-training-back-btn').addEventListener('click', async () => {
        const { renderMainScreen } = await import('/ui/screens/dashboard.js');
        navigateTo('main');
        renderMainScreen();
    });

    screen.querySelector('#start-modified-training-btn').addEventListener('click', () => {
        if (!isCurrentDynamicDay && useDynamicPlan) {
            if (confirm("To jest trening z przyszłości. Czy chcesz ustawić go jako dzisiejszy plan i rozpocząć?")) {
                state.todaysDynamicPlan = currentAdjustedPlan;
                savePlanToStorage(currentAdjustedPlan);
            } else return;
        }
        state.sessionParams.initialPainLevel = initialPainLevel;
        state.sessionParams.timeFactor = parseFloat(slider.value) || 1.0;
        startModifiedTraining();
    });

    navigateTo('preTraining');
};

// --- EKRAN TRENINGOWY (FOCUS MODE) ---
export const renderTrainingScreen = () => {
    screens.training.innerHTML = `
    <div class="focus-view">
        <div id="focus-progress-bar" class="focus-progress-container"></div>
        <div class="focus-header-minimal">
            <button id="exit-training-btn" class="close-training-btn" title="Zakończ trening"><img src="/icons/close.svg" alt="Zamknij"></button>
        </div>
        <div class="focus-timer-container"><p id="focus-timer-display"></p></div>
        <div class="focus-exercise-info" style="margin-bottom: 0.5rem;">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <span id="focus-affinity-badge"></span>
                <button id="tts-toggle-btn" class="tts-button"><img id="tts-icon" src="/icons/sound-on.svg" alt="Dźwięk"></button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>
        <p id="focus-tempo" style="text-align: center; margin: -5px 0 10px 0; font-weight: 600; color: var(--accent-color); font-size: 0.9rem; opacity: 0.9;"></p>
        <div id="visual-toggle-card" class="visual-card-wrapper" title="Kliknij, aby przełączyć widok">
            <div id="focus-animation-container" class="visual-card-content focus-animation-container hidden"></div>
            <div id="focus-description" class="visual-card-content focus-description-container"></div>
            <div class="flip-indicator"><img src="/icons/info.svg" alt="Info"></div>
        </div>
        <div class="focus-controls-wrapper">
             <div class="focus-main-action"><button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button></div>
            <div class="focus-secondary-actions">
                <button id="prev-step-btn" class="control-icon-btn"><img src="/icons/control-back.svg"></button>
                <button id="pause-resume-btn" class="control-icon-btn"><img src="/icons/control-pause.svg"></button>
                <button id="skip-btn" class="control-icon-btn"><img src="/icons/control-skip.svg"></button>
            </div>
        </div>
        <div class="focus-next-up"><p><strong>Następne:</strong> <span id="next-exercise-name"></span></p></div>
    </div>`;

    initializeFocusElements();
    focus.affinityBadge = document.getElementById('focus-affinity-badge');

    const cardWrapper = document.getElementById('visual-toggle-card');
    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');

    if (cardWrapper) {
        cardWrapper.addEventListener('click', () => {
            if (animContainer.innerHTML.trim() !== "") {
                const isAnimVisible = !animContainer.classList.contains('hidden');
                animContainer.classList.toggle('hidden', isAnimVisible);
                descContainer.classList.toggle('hidden', !isAnimVisible);
            }
        });
    }
};
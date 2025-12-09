import { state } from '../../state.js';
import { screens, initializeFocusElements, focus } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate } from '../../utils.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { generatePreTrainingCardHTML, getAffinityBadge } from '../templates.js';
import { renderSwapModal, renderPreviewModal } from '../modals.js';
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

// --- NOWOŚĆ: EKRAN STARTOWY BIO-PROTOKOŁU ---
export const renderProtocolStart = (protocol) => {
    // Ustawiamy protokół jako "aktualny plan" w stanie
    state.todaysDynamicPlan = protocol; 
    state.currentTrainingDayId = protocol.id; 
    
    const screen = screens.preTraining;
    
    // Dobór koloru akcentującego w zależności od trybu (SOS/Booster/Reset)
    let accentColor = 'var(--primary-color)';
    if (protocol.mode === 'sos') accentColor = '#8b5cf6';      // Fiolet
    if (protocol.mode === 'booster') accentColor = '#fb7185';  // Róż
    if (protocol.mode === 'reset') accentColor = '#34d399';    // Zieleń

    // Generowanie HTML nagłówka
    screen.innerHTML = `
        <div style="text-align:center; padding: 1.5rem 0; background: linear-gradient(to bottom, ${accentColor} 0%, transparent 100%); margin: -1.5rem -1.5rem 1rem -1.5rem; border-radius: 0 0 20px 20px;">
            <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto; font-size: 2rem;">
                ${protocol.mode === 'sos' ? '💊' : (protocol.mode === 'booster' ? '🔥' : '🍃')}
            </div>
            <h2 style="margin:0; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${protocol.title}</h2>
            <p style="margin: 5px 0 0 0; color: rgba(255,255,255,0.9); font-size: 0.9rem; padding: 0 1rem;">${protocol.description}</p>
        </div>

        <div id="pre-training-list">
            <!-- Lista ćwiczeń -->
        </div>
        
        <div class="pre-training-nav">
            <button id="proto-cancel-btn" class="nav-btn">Wróć</button>
            <button id="proto-start-btn" class="action-btn" style="background: ${accentColor}; border:none; color: white; font-weight: 800;">
                Rozpocznij (${Math.round(protocol.totalDuration / 60)} min)
            </button>
        </div>
    `;

    const listContainer = screen.querySelector('#pre-training-list');
    
    // Filtrujemy listę, aby pokazać tylko ćwiczenia (bez przerw technicznych)
    const workExercises = protocol.flatExercises.filter(ex => ex.isWork);
    
    workExercises.forEach((ex, index) => {
        // Używamy standardowego generatora kart
        const cardHTML = generatePreTrainingCardHTML(ex, index);
        
        // NAPRAWA: Zamiast Regexa (który psuł strukturę HTML przez zagnieżdżone divy),
        // używamy tymczasowego elementu DOM do bezpiecznej podmiany środka karty.
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = cardHTML;

        const inputsGrid = tempContainer.querySelector('.training-inputs-grid');
        if (inputsGrid) {
            // Podmieniamy sekcję inputów na statyczny badge, zachowując resztę karty (w tym footer) nienaruszoną
            inputsGrid.outerHTML = `
                <div style="text-align:center; padding:8px; font-weight:bold; color:${accentColor}; background:rgba(0,0,0,0.03); border-radius:8px; margin-top:10px; font-size: 0.9rem;">
                    ⏱ Czas pracy: ${ex.reps_or_time}
                </div>`;
        }
        
        listContainer.innerHTML += tempContainer.innerHTML;
    });

    // Obsługa przycisku Wróć
    screen.querySelector('#proto-cancel-btn').addEventListener('click', () => {
        navigateTo('main');
    });

    // Obsługa przycisku Start
    screen.querySelector('#proto-start-btn').addEventListener('click', () => {
        // Resetujemy parametry sesji (brak skalowania bólem dla protokołów, chyba że wbudowane)
        state.sessionParams = { initialPainLevel: 0, timeFactor: 1.0 };
        
        // Uruchamiamy logikę startu (teraz obsługuje ona typ 'protocol' w training.js)
        startModifiedTraining();
    });

    // Obsługa podglądu animacji (Preview Modal)
    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.preview-anim-btn');
        if (btn) {
            e.stopPropagation();
            const exId = btn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];
            if (ex && ex.animationSvg) {
                if (typeof renderPreviewModal === 'function') {
                    renderPreviewModal(ex.animationSvg, ex.name);
                }
            }
        }
    });

    navigateTo('preTraining'); // Używamy tego samego kontenera DOM co pre-training
};

// --- STANDARDOWY PRE-TRAINING (Dla Planów Dziennych) ---
export const renderPreTrainingScreen = (dayId, initialPainLevel = 0, useDynamicPlan = false) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());

    const activePlan = getActiveTrainingPlan(); 
    
    let rawDayData = null;
    let isCurrentDynamicDay = false;

    // 1. Priorytet dla planu w pamięci (Mixer/Dynamic)
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === dayId) {
        // Sprawdzamy czy to nie jest przypadkiem pozostałość po protokole
        if (state.todaysDynamicPlan.type !== 'protocol') {
            console.log("✅ [PreTraining] Używam planu z pamięci (Mixer/Dynamic) dla dnia:", dayId);
            rawDayData = state.todaysDynamicPlan;
            isCurrentDynamicDay = true;
        }
    } 
    
    // 2. Fallback do danych z settings (tryb dynamiczny - struktura tygodniowa)
    if (!rawDayData && useDynamicPlan && state.settings.dynamicPlanData && state.settings.dynamicPlanData.days) {
        const dynDays = state.settings.dynamicPlanData.days;
        // Obliczamy indeks modulo, bo dni mogą się zapętlać
        const arrayIndex = (dayId - 1) % dynDays.length;
        rawDayData = dynDays[arrayIndex];
        
        // Nadpisujemy dayNumber, żeby pasował do requested dayId
        if (rawDayData) {
            rawDayData = { ...rawDayData, dayNumber: dayId };
        }
    }

    // 3. Fallback do planu statycznego (Baza JSON)
    if (!rawDayData && activePlan) {
        rawDayData = activePlan.Days.find(d => d.dayNumber === dayId);
    }

    if (!rawDayData) {
        console.error("Błąd: Nie znaleziono danych dla dnia", dayId);
        alert("Nie udało się załadować podglądu tego dnia.");
        navigateTo('main');
        return;
    }

    // Hydracja (uzupełnienie o detale z biblioteki) i Adaptacja (Ból/Czas)
    const basePlanData = getHydratedDay(rawDayData);
    let currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, 1.0);

    const screen = screens.preTraining;
    const showResetButton = isCurrentDynamicDay;

    // Przyciski akcji w nagłówku (Reset / Shuffle)
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

    // Funkcja renderująca listę kart ćwiczeń
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

    // Obsługa suwaka czasu
    const slider = screen.querySelector('#time-slider');
    const display = screen.querySelector('#time-factor-display');

    slider.addEventListener('input', (e) => {
        const timeFactor = parseFloat(e.target.value);
        display.textContent = `${Math.round(timeFactor * 100)}%`;
        // Przeliczamy plan na nowo z nowym timeFactor
        currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, initialPainLevel, timeFactor);
        currentAdjustedPlan = getHydratedDay(currentAdjustedPlan);
        renderList(currentAdjustedPlan);
    });

    // Obsługa Shuffle (Mieszanie)
    const shuffleBtn = screen.querySelector('#shuffle-workout-btn');
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            if (confirm("Chcesz przelosować cały zestaw ćwiczeń?")) {
                const freshStatic = getHydratedDay(rawDayData);
                // Wymuszamy mieszanie (forceShuffle = true)
                const mixedPlan = workoutMixer.mixWorkout(freshStatic, true);
                
                state.todaysDynamicPlan = mixedPlan;
                savePlanToStorage(mixedPlan);
                isCurrentDynamicDay = true; 
                
                // Przeładowujemy ekran z nowym planem
                renderPreTrainingScreen(dayId, initialPainLevel, useDynamicPlan); 
            }
        });
    }

    // Obsługa Reset
    const resetBtn = screen.querySelector('#reset-workout-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Czy na pewno chcesz cofnąć wszystkie losowania i wrócić do oryginalnego planu?")) {
                if (isCurrentDynamicDay) {
                    clearPlanFromStorage(); 
                    state.todaysDynamicPlan = null;
                }
                renderPreTrainingScreen(dayId, initialPainLevel, useDynamicPlan);
            }
        });
    }

    // Obsługa Swap (Wymiana pojedynczego ćwiczenia)
    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.swap-btn');
        if (!btn) return;

        const globalIndex = parseInt(btn.dataset.exerciseIndex, 10);
        
        // Znajdź ćwiczenie w strukturze sekcji
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
                // Jeśli nie mamy jeszcze lokalnej kopii, tworzymy ją z bazy
                if (!state.todaysDynamicPlan) {
                    state.todaysDynamicPlan = JSON.parse(JSON.stringify(getHydratedDay(rawDayData)));
                }
                
                let planToModify = state.todaysDynamicPlan;

                // Aktualizujemy ćwiczenie w planie
                if (planToModify[targetSection] && planToModify[targetSection][targetLocalIndex]) {
                    const oldEx = planToModify[targetSection][targetLocalIndex];
                    const smartRepsOrTime = workoutMixer.adaptVolume(oldEx, newExerciseDef);
                    const dbTempo = workoutMixer.getExerciseTempo(newExerciseDef.id);

                    planToModify[targetSection][targetLocalIndex] = {
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

                savePlanToStorage(planToModify);
                
                // Odświeżamy widok
                renderPreTrainingScreen(dayId, initialPainLevel, true);

                if (swapType === 'blacklist') {
                    const blockedId = foundExercise.id || foundExercise.exerciseId;
                    const replacementId = newExerciseDef.id;
                    if (confirm(`Dodać "${foundExercise.name}" do czarnej listy?`)) {
                        dataStore.addToBlacklist(blockedId, replacementId);
                    }
                }
            });
        }
    });

    // Obsługa Podglądu (Preview Modal)
    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.preview-anim-btn');
        if (btn) {
            e.stopPropagation();
            const exId = btn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];
            
            if (ex && ex.animationSvg) {
                if (typeof renderPreviewModal === 'function') {
                    renderPreviewModal(ex.animationSvg, ex.name);
                } else {
                    // Fallback (powinien być zbędny jeśli modals.js działa)
                    alert("Podgląd niedostępny");
                }
            }
        }
    });

    // Nawigacja
    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    
    screen.querySelector('#start-modified-training-btn').addEventListener('click', () => {
        // Logika: Jeśli plan jest z przyszłości i w trybie dynamicznym, zapytaj o nadpisanie
        if (!isCurrentDynamicDay && useDynamicPlan) {
            if (confirm("To jest trening z przyszłości. Czy chcesz ustawić go jako dzisiejszy plan i rozpocząć?")) {
                state.todaysDynamicPlan = currentAdjustedPlan; 
                savePlanToStorage(currentAdjustedPlan);
            } else {
                return;
            }
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
                <!-- NOWE: Kontener na badge preferencji -->
                <span id="focus-affinity-badge"></span> 
                
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
    
    // Dodajemy referencję do nowego elementu w obiekcie focus
    focus.affinityBadge = document.getElementById('focus-affinity-badge');

    const cardWrapper = document.getElementById('visual-toggle-card');
    const animContainer = document.getElementById('focus-animation-container');
    const descContainer = document.getElementById('focus-description');

    // Obsługa obracania karty (Animacja <-> Opis)
    if (cardWrapper) {
        cardWrapper.addEventListener('click', () => {
            const isAnimVisible = !animContainer.classList.contains('hidden');
            // Obracamy tylko jeśli jest animacja (jeśli pusta, zostajemy na opisie)
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
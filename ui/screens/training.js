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
    
    // 1. Pobieramy oryginalny plan (Nawodniony danymi z biblioteki)
    const originalDayData = getHydratedDay(dayDataRaw);
    
    // 2. Aplikujemy modyfikację bólową na starcie (TimeFactor = 1.0)
    let currentAdjustedPlan = assistant.adjustTrainingVolume(originalDayData, initialPainLevel, 1.0);
    
    const screen = screens.preTraining;
    
    // Generujemy HTML
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
    
    // Funkcja renderująca listę kart
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

    // Funkcja aktualizująca inputy w DOM bez przerysowania
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
                // Wizualny feedback
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
        
        // Przeliczamy plan używając silnika
        currentAdjustedPlan = assistant.adjustTrainingVolume(originalDayData, initialPainLevel, timeFactor);
        updateInputsInDOM(currentAdjustedPlan);
    });

    // --- OBSŁUGA WYMIANY (SMART SWAP) ---
    listContainer.addEventListener('click', (e) => {
        // Szukamy przycisku w górę drzewa DOM (bo mogliśmy kliknąć w ikonę SVG w środku)
        const btn = e.target.closest('.swap-btn');
        if (!btn) return;

        const globalIndex = parseInt(btn.dataset.exerciseIndex, 10);
        
        // Znajdź ćwiczenie w strukturze
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
                console.log(`Wymiana: ${foundExercise.name} -> ${newExerciseDef.name} (${swapType})`);

                // === SMART VALUE CONVERTER ===
                const calculateNewParams = (oldEx, newDef) => {
                    const oldVal = (oldEx.reps_or_time || '').toLowerCase();
                    
                    // POPRAWKA: Używamy Regex, żeby 'str' nie było wykrywane jako sekundy ('s')
                    // Szukamy cyfry, po której jest 's' lub 'min', ale nie jako część innego słowa
                    const isOldTimeBased = /[\d]+\s*(s\b|sec|min|:)/.test(oldVal);

                    // Logowanie dla pewności (zobaczysz w konsoli F12)
                    console.log(`[SmartSwap] Stara wartość: "${oldVal}". Wykryto jako czas? ${isOldTimeBased}`);
                    console.log(`[SmartSwap] Nowe metadane: Duration=${newDef.maxDuration}, Reps=${newDef.maxReps}`);

                    // Sprawdzamy metadane z biblioteki dla NOWEGO ćwiczenia
                    const isNewTimeBased = (newDef.maxDuration && newDef.maxDuration > 0);
                    const isNewRepBased = (newDef.maxReps && newDef.maxReps > 0);

                    let newRepsOrTime = oldEx.reps_or_time;

                    if (isNewTimeBased) {
                        // NOWE: Czas (np. Stretch)
                        if (!isOldTimeBased) {
                            // STARE: Powtórzenia -> Zmieniamy na domyślny czas
                            console.log("Konwersja: Reps -> Time");
                            const defaultTime = Math.min(newDef.maxDuration || 60, 45);
                            newRepsOrTime = `${defaultTime} s`;
                        }
                    } 
                    else if (isNewRepBased) {
                        // NOWE: Powtórzenia (np. Dead Bug)
                        if (isOldTimeBased) {
                            // STARE: Czas -> Zmieniamy na domyślne powtórzenia
                            console.log("Konwersja: Time -> Reps");
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
                        
                        // Obliczamy nowe parametry
                        const smartParams = calculateNewParams(oldEx, newExerciseDef);

                        plan[targetSection][targetLocalIndex] = {
                            ...newExerciseDef, // Dane z biblioteki (name, id, url...)
                            sets: smartParams.sets,
                            reps_or_time: smartParams.reps_or_time,
                            tempo_or_iso: smartParams.tempo_or_iso,
                            isSwapped: true 
                        };
                    }
                };

                // Aktualizujemy oba plany (bazowy i wyświetlany)
                updateExerciseInPlan(originalDayData);
                updateExerciseInPlan(currentAdjustedPlan);

                // Obsługa czarnej listy
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

    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    screen.querySelector('#start-modified-training-btn').addEventListener('click', startModifiedTraining);
    
    navigateTo('preTraining');
};

// ============================================================
// 2. EKRAN TRENINGU (ACTIVE FOCUS)
// ============================================================
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
        
        <div class="focus-exercise-info">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <button id="tts-toggle-btn" class="tts-button">
                    <img id="tts-icon" src="/icons/sound-on.svg" alt="Dźwięk">
                </button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>
        
        <div id="focus-description" class="focus-description-container"></div>
        
        <div class="focus-controls-wrapper">
            <div class="focus-main-action">
                <button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button>
            </div>
            
            <div class="focus-secondary-actions">
                <button id="prev-step-btn" class="control-icon-btn" aria-label="Cofnij">
                    <img src="/icons/control-back.svg">
                </button>
                
                <button id="pause-resume-btn" class="control-icon-btn" aria-label="Pauza">
                    <img src="/icons/control-pause.svg">
                </button>
                
                <button id="skip-btn" class="control-icon-btn" aria-label="Pomiń">
                    <img src="/icons/control-skip.svg">
                </button>
            </div>
        </div>

        <div class="focus-next-up">
            <p><strong>Następne:</strong> <span id="next-exercise-name"></span></p>
        </div>
    </div>`;
    initializeFocusElements();
};

// ============================================================
// 3. EKRAN PODSUMOWANIA (SUMMARY)
// ============================================================
export const renderSummaryScreen = () => {
    if (getIsCasting()) sendShowIdle();
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return;
    const trainingDay = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    if (!trainingDay) return;
    
    const summaryScreen = screens.summary;

    let stravaHtml = '';
    if (state.stravaIntegration.isConnected) {
        stravaHtml = `
            <div class="form-group strava-sync-container">
                <label class="checkbox-label" for="strava-sync-checkbox">
                    <input type="checkbox" id="strava-sync-checkbox" checked>
                    <span>Synchronizuj ten trening ze Strava</span>
                </label>
            </div>
        `;
    }

    summaryScreen.innerHTML = `
        <h2 id="summary-title">Podsumowanie: ${trainingDay.title}</h2>
        <p>Gratulacje! Dobra robota.</p>
        <form id="summary-form">
            <div class="form-group">
                <label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label>
                <div class="slider-container">
                    <input type="range" id="pain-during" min="0" max="10" step="1" value="0">
                    <span class="slider-value" id="pain-during-value">0</span>
                </div>
            </div>
            <div class="form-group">
                <label for="general-notes">Notatki ogólne:</label>
                <textarea id="general-notes" rows="4"></textarea>
            </div>
            ${stravaHtml}
            <button type="submit" class="action-btn">Zapisz i zakończ</button>
        </form>
    `;
    const slider = summaryScreen.querySelector('#pain-during');
    const sliderValueDisplay = summaryScreen.querySelector('#pain-during-value');
    slider.addEventListener('input', () => { sliderValueDisplay.textContent = slider.value; });
    
    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    navigateTo('summary');
};

export function handleSummarySubmit(e) {
    e.preventDefault();
    const dateKey = state.currentTrainingDate;
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    const trainingDay = activePlan ? activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId) : null;
    
    const now = new Date();
    const stravaCheckbox = document.getElementById('strava-sync-checkbox');

    const rawDuration = now - state.sessionStartTime;
    const netDuration = Math.max(0, rawDuration - (state.totalPausedTime || 0));
    const durationSeconds = Math.round(netDuration / 1000);

    const sessionPayload = {
        sessionId: Date.now(),
        planId: state.settings.activePlanId,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingDay ? trainingDay.title : "Trening",
        status: 'completed',
        pain_during: document.getElementById('pain-during').value,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime.toISOString(), 
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        netDurationSeconds: durationSeconds
    };

    if (!state.userProgress[dateKey]) {
        state.userProgress[dateKey] = [];
    }
    state.userProgress[dateKey].push(sessionPayload);
    
    if (!state.userStats) {
        state.userStats = { totalSessions: 0, streak: 0 };
    }
    const currentTotal = parseInt(state.userStats.totalSessions) || 0;
    state.userStats.totalSessions = currentTotal + 1;
    
    dataStore.saveSession(sessionPayload);

    if (stravaCheckbox && stravaCheckbox.checked) {
        dataStore.uploadToStrava(sessionPayload);
    }
    
    state.currentTrainingDate = null;
    state.currentTrainingDayId = null;
    state.sessionLog = [];
    state.sessionStartTime = null;
    state.totalPausedTime = 0;
    state.isPaused = false;
    
    navigateTo('main');
    renderMainScreen();
}
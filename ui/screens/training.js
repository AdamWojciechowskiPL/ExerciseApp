// ExerciseApp/ui/screens/training.js
import { state } from '/state.js';
import { screens, initializeFocusElements, focus } from '/dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate, calculateSmartDuration, calculateSystemLoad, calculateClinicalProfile, getSessionFocus } from '/utils.js';
import { assistant } from '/assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '/ui/core.js';
import { generatePreTrainingCardHTML, getAffinityBadge } from '/ui/templates.js';
import { renderSwapModal, renderPreviewModal } from '/ui/modals.js';
import { startModifiedTraining } from '/training.js';
import { getIsCasting, sendShowIdle } from '/cast.js';
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

// --- RENDEROWANIE PROTOKOŁU (Z SUWAKIEM) ---
export const renderProtocolStart = (protocol) => {
    state.todaysDynamicPlan = protocol;
    state.currentTrainingDayId = protocol.id;

    const screen = screens.preTraining;

    let headerClass = 'proto-bg-default';
    let btnClass = 'proto-btn-default';

    if (protocol.mode === 'sos') { headerClass = 'proto-bg-sos'; btnClass = 'proto-btn-sos'; }
    else if (protocol.mode === 'booster') { headerClass = 'proto-bg-booster'; btnClass = 'proto-btn-booster'; }
    else if (protocol.mode === 'reset') { headerClass = 'proto-bg-reset'; btnClass = 'proto-btn-reset'; }
    else if (protocol.mode === 'calm') { headerClass = 'proto-bg-calm'; btnClass = 'proto-btn-calm'; }
    else if (protocol.mode === 'flow') { headerClass = 'proto-bg-flow'; btnClass = 'proto-btn-flow'; }
    else if (protocol.mode === 'neuro') { headerClass = 'proto-bg-neuro'; btnClass = 'proto-btn-neuro'; }
    else if (protocol.mode === 'ladder') { headerClass = 'proto-bg-ladder'; btnClass = 'proto-btn-ladder'; }

    const displayTime = protocol.targetDuration || Math.round(protocol.totalDuration / 60);

    const iconMap = {
        'sos': '💊', 'booster': '🔥', 'calm': '🌙', 'neuro': '⚡', 'reset': '🍃', 'flow': '🌊', 'ladder': '🧗'
    };
    const icon = iconMap[protocol.mode] || '🍃';

    screen.innerHTML = `
        <div class="protocol-header ${headerClass}">
            <div class="protocol-icon-wrapper">${icon}</div>
            <h2 class="protocol-title">${protocol.title}</h2>
            <p class="protocol-desc">${protocol.description}</p>
        </div>

        <div class="adjustment-panel">
            <div class="adjustment-header">
                <h3>Dostosuj Czas</h3>
                <span id="time-factor-display" class="time-factor-display">100%</span>
            </div>
            <div class="slider-container">
                <span class="slider-label-small">Szybko (50%)</span>
                <input type="range" id="time-slider" min="0.5" max="2.0" step="0.1" value="1.0">
                <span class="slider-label-small">Extra (200%)</span>
            </div>
        </div>

        <div id="pre-training-list"></div>

        <div class="pre-training-nav">
            <button id="proto-cancel-btn" class="nav-btn">Wróć</button>
            <button id="proto-start-btn" class="action-btn proto-action-btn ${btnClass}">
                Rozpocznij (<span id="total-time-display">${displayTime}</span> min)
            </button>
        </div>
    `;

    const listContainer = screen.querySelector('#pre-training-list');
    const totalTimeDisplay = screen.querySelector('#total-time-display');

    const renderList = (currentProtocol) => {
        listContainer.innerHTML = '';
        const workExercises = currentProtocol.flatExercises.filter(ex => ex.isWork);
        workExercises.forEach((ex, index) => {
            listContainer.innerHTML += generatePreTrainingCardHTML(ex, index);
        });
    };

    renderList(protocol);

    const slider = screen.querySelector('#time-slider');
    const display = screen.querySelector('#time-factor-display');

    slider.addEventListener('input', (e) => {
        const timeFactor = parseFloat(e.target.value);
        display.textContent = `${Math.round(timeFactor * 100)}%`;

        const previewProtocol = JSON.parse(JSON.stringify(protocol));
        previewProtocol.flatExercises.forEach(ex => {
            if (ex.duration) {
                const newDuration = Math.round(ex.duration * timeFactor);
                ex.duration = newDuration;
                if (ex.isWork) ex.reps_or_time = `${newDuration} s`;
            }
        });
        previewProtocol.totalDuration = Math.round(protocol.totalDuration * timeFactor);
        renderList(previewProtocol);

        if (totalTimeDisplay) {
            totalTimeDisplay.textContent = Math.round(previewProtocol.totalDuration / 60);
        }
    });

    listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.swap-btn');
        if (!btn) return;
        const index = parseInt(btn.dataset.exerciseIndex, 10);
        const workExercises = protocol.flatExercises.filter(ex => ex.isWork);
        const exerciseToSwap = workExercises[index];

        if (exerciseToSwap) {
            const oldId = exerciseToSwap.id || exerciseToSwap.exerciseId;
            renderSwapModal(exerciseToSwap, (newExerciseDef, swapType) => {
                Object.assign(exerciseToSwap, {
                    id: newExerciseDef.id,
                    exerciseId: newExerciseDef.id,
                    name: newExerciseDef.name,
                    description: newExerciseDef.description,
                    animationSvg: newExerciseDef.animationSvg,
                    hasAnimation: newExerciseDef.hasAnimation,
                    categoryId: newExerciseDef.categoryId,
                    equipment: newExerciseDef.equipment,
                    youtube_url: newExerciseDef.youtube_url,
                    isSwapped: true,
                    isDynamicSwap: true,
                    originalName: (oldId !== newExerciseDef.id) ? exerciseToSwap.name : null
                });

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

    screen.querySelector('#proto-cancel-btn').addEventListener('click', async () => {
        const { renderMainScreen } = await import('/ui/screens/dashboard.js');
        navigateTo('main');
        renderMainScreen();
    });

    screen.querySelector('#proto-start-btn').addEventListener('click', () => {
        const timeFactor = parseFloat(slider.value) || 1.0;
        const scaledProtocol = JSON.parse(JSON.stringify(protocol));
        scaledProtocol.flatExercises.forEach(ex => {
            if (ex.duration) {
                ex.duration = Math.round(ex.duration * timeFactor);
                if (ex.isWork) ex.reps_or_time = `${ex.duration} s`;
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
                if (svg) renderPreviewModal(svg, exName);
                else alert("Brak podglądu.");
            } catch (err) { console.error("Preview Error:", err); }
            finally {
                btn.innerHTML = originalContent;
                btn.style.opacity = "1";
            }
        }
    });

    navigateTo('preTraining');
};

// --- RENDEROWANIE STANDARDOWEJ SESJI (BEZ SUWAKA) ---
export const renderPreTrainingScreen = (dayId, initialPainLevel = 0, useDynamicPlan = false) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());

    const activePlan = getActiveTrainingPlan();
    let rawDayData = null;
    let isCurrentDynamicDay = false;

    if (state.todaysDynamicPlan && state.todaysDynamicPlan.dayNumber === dayId && state.todaysDynamicPlan.type !== 'protocol') {
        rawDayData = state.todaysDynamicPlan;
        isCurrentDynamicDay = true;
    }

    if (!rawDayData && useDynamicPlan && state.settings.dynamicPlanData && state.settings.dynamicPlanData.days) {
        const dynDays = state.settings.dynamicPlanData.days;
        const arrayIndex = (dayId - 1) % dynDays.length;
        rawDayData = dynDays[arrayIndex];
        if (rawDayData) rawDayData = { ...rawDayData, dayNumber: dayId };
    }

    if (!rawDayData && activePlan) rawDayData = activePlan.Days.find(d => d.dayNumber === dayId);

    if (!rawDayData) { navigateTo('main'); return; }

    const basePlanData = getHydratedDay(rawDayData);
    
    // Utrzymujemy lokalny stan poziomu bólu
    let currentPainLevel = initialPainLevel;
    let currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, currentPainLevel, 1.0);

    const screen = screens.preTraining;

    const renderHeader = () => {
        const estimatedMinutes = calculateSmartDuration(currentAdjustedPlan);
        const systemLoad = calculateSystemLoad(currentAdjustedPlan);
        const clinicalTags = calculateClinicalProfile(currentAdjustedPlan);
        const focusArea = getSessionFocus(currentAdjustedPlan);

        let loadColor = '#4ade80';
        let loadLabel = 'Lekki';
        if (systemLoad > 30) { loadColor = '#facc15'; loadLabel = 'Umiarkowany'; }
        if (systemLoad > 60) { loadColor = '#fb923c'; loadLabel = 'Wymagający'; }
        if (systemLoad > 85) { loadColor = '#ef4444'; loadLabel = 'Maksymalny'; }

        const equipmentSet = new Set();
        [...(currentAdjustedPlan.warmup || []), ...(currentAdjustedPlan.main || []), ...(currentAdjustedPlan.cooldown || [])].forEach(ex => {
            if (Array.isArray(ex.equipment)) ex.equipment.forEach(item => equipmentSet.add(item.trim().toLowerCase()));
            else if (ex.equipment) ex.equipment.split(',').forEach(item => equipmentSet.add(item.trim().toLowerCase()));
        });
        const ignoreList = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
        const filteredEquipment = [...equipmentSet].filter(item => !ignoreList.includes(item));
        const equipmentText = filteredEquipment.length > 0
            ? filteredEquipment.map(item => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')
            : 'Bodyweight';

        const clinicalTagsHTML = clinicalTags.map(tag =>
            `<span class="meta-badge" style="
                background:${tag.color === 'red' ? '#fee2e2' : (tag.color === 'green' ? '#dcfce7' : '#ffedd5')};
                color:${tag.color === 'red' ? '#991b1b' : (tag.color === 'green' ? '#166534' : '#9a3412')};
                border: 1px solid ${tag.color === 'red' ? '#fecaca' : (tag.color === 'green' ? '#bbf7d0' : '#fed7aa')};
            ">${tag.label}</span>`
        ).join(' ');

        return `
        <div class="workout-context-card" style="margin-bottom: 1.5rem; background: #fff; border-radius: 12px; padding: 1.2rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
            
            <div class="wc-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <h3 class="wc-title" style="font-size:1.25rem; font-weight:800; color:var(--primary-color); margin:0; line-height:1.2;">
                    ${currentAdjustedPlan.title}
                </h3>
                
                <div class="pre-training-actions" style="display:flex; gap:8px;">
                    ${isCurrentDynamicDay ?
                        `<button id="reset-workout-btn" class="reset-workout-btn" title="Przywróć Plan Bazowy" style="width:32px; height:32px;">
                            <svg width="16" height="16"><use href="#icon-reset-ccw"/></svg>
                        </button>` : ''
                    }
                    <div class="time-badge-pill" style="background-color:#f0f9ff; color:#0284c7; border:1px solid #bae6fd; padding:4px 10px; border-radius:20px; font-size:0.8rem; font-weight:700; display:flex; align-items:center; gap:5px; white-space:nowrap;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span id="header-duration-display">${estimatedMinutes} min</span>
                    </div>
                </div>
            </div>

            <div style="font-size:0.85rem; color:#64748b; margin-bottom:12px; font-weight:500;">
                Cel: <strong style="color:var(--primary-color);">${focusArea}</strong>
            </div>

            <div class="load-metric-container" style="margin-top:15px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:#475569; margin-bottom:5px;">
                    <span style="font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Obciążenie: <span style="color:${loadColor === '#4ade80' ? '#16a34a' : loadColor}">${loadLabel}</span></span>
                    <span style="font-weight:600; opacity:0.8;">${systemLoad}%</span>
                </div>
                <div style="width:100%; height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                    <div style="width:${systemLoad}%; height:100%; background:${loadColor}; border-radius:3px; transition: width 0.5s ease;"></div>
                </div>
            </div>

            <div class="wc-tags" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:1.2rem;">
                ${clinicalTagsHTML}
                <span class="meta-badge tag-equipment" style="font-size:0.7rem; padding:4px 10px; border-radius:8px; font-weight:600; background-color:#f8fafc; color:#475569; border:1px solid #cbd5e1; display:inline-flex; align-items:center; gap:4px;">
                    🛠️ ${equipmentText}
                </span>
            </div>

            <div class="sheet-wellness" style="margin-top:1rem; background:#f8f9fa; padding:10px; border-radius:12px;">
                <div class="sheet-wellness-label" style="font-size:0.75rem; font-weight:700; color:#666; margin-bottom:8px; text-transform:uppercase;">Jak się czujesz?</div>
                <div class="pain-selector">
                    <div class="pain-option ${currentPainLevel === 0 ? 'selected' : ''}" data-level="0">🚀 <span>Świetnie</span></div>
                    <div class="pain-option ${currentPainLevel === 3 ? 'selected' : ''}" data-level="3">🙂 <span>Dobrze</span></div>
                    <div class="pain-option ${currentPainLevel === 5 ? 'selected' : ''}" data-level="5">😐 <span>Średnio</span></div>
                    <div class="pain-option ${currentPainLevel === 7 ? 'selected' : ''}" data-level="7">🤕 <span>Boli</span></div>
                    <div class="pain-option ${currentPainLevel === 9 ? 'selected' : ''}" data-level="9">🛑 <span>Źle</span></div>
                </div>
            </div>
        </div>
        `;
    };

    screen.innerHTML = `
        <div id="pre-training-header-container"></div>
        <div id="pre-training-list"></div>

        <div class="pre-training-nav">
            <button id="pre-training-back-btn" class="nav-btn">Anuluj</button>
            <button id="start-modified-training-btn" class="action-btn">Start Treningu</button>
        </div>
    `;

    const headerContainer = screen.querySelector('#pre-training-header-container');
    const listContainer = screen.querySelector('#pre-training-list');
    const startBtn = screen.querySelector('#start-modified-training-btn');

    // Funkcja Renderująca Listę
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

    // Funkcja odświeżająca Header, Listę i Przycisk Start
    const updateScreen = () => {
        // Obliczanie planu na podstawie bólu (asystent)
        currentAdjustedPlan = assistant.adjustTrainingVolume(basePlanData, currentPainLevel, 1.0);
        currentAdjustedPlan = getHydratedDay(currentAdjustedPlan);
        
        headerContainer.innerHTML = renderHeader();
        
        // --- AKTUALIZACJA UI NA PODSTAWIE POZIOMU BÓLU ---
        // Dla poziomu 9 (Źle) i 7 (Boli) przycisk Start powinien wyglądać ostrzegawczo,
        // ale jego akcja to po prostu uruchomienie zmodyfikowanego (lżejszego) treningu.
        // Jeśli użytkownik wybierze 9 -> od razu proponujemy SOS. Jeśli anuluje SOS, zostaje w tym widoku z opcją Start.
        
        if (currentPainLevel >= 7) {
            startBtn.style.backgroundColor = "var(--danger-color)";
            startBtn.style.boxShadow = "0 8px 20px rgba(231, 111, 81, 0.4)";
            // Ikona apteczki dla wysokiego bólu
            startBtn.innerHTML = `🚑 Start (Tryb Ostrożny)`;
        } else {
            startBtn.style.backgroundColor = "";
            startBtn.style.boxShadow = "";
            startBtn.textContent = "Start Treningu";
        }

        const painOptions = headerContainer.querySelectorAll('.pain-option');
        painOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                const newLevel = parseInt(opt.dataset.level, 10);
                
                // --- LOGIKA SOS PRZY KLIKNIĘCIU "ŹLE" ---
                if (newLevel === 9) {
                    if (confirm("Twój poziom bólu jest bardzo wysoki. Czy chcesz uruchomić bezpieczny Protokół SOS?")) {
                        const wiz = state.settings.wizardData || {};
                        const focusZone = (wiz.pain_locations && wiz.pain_locations.length > 0) ? wiz.pain_locations[0] : 'lumbar_general';
                        
                        const protocol = generateBioProtocol({
                            mode: 'sos',
                            focusZone: focusZone,
                            durationMin: 10,
                            userContext: wiz
                        });
                        renderProtocolStart(protocol);
                        return; // Przerywamy renderowanie obecnego ekranu, bo wychodzimy do protokołu
                    }
                }

                currentPainLevel = newLevel;
                updateScreen();
            });
        });

        const resetBtn = headerContainer.querySelector('#reset-workout-btn');
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

        renderList(currentAdjustedPlan);
    };

    updateScreen(); 

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
                renderPreTrainingScreen(dayId, currentPainLevel, true); 

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
            const exName = state.exerciseLibrary[exId]?.name || "Podgląd";
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

    startBtn.addEventListener('click', () => {
        if (!isCurrentDynamicDay && useDynamicPlan) {
            if (confirm("To jest trening z przyszłości. Czy chcesz ustawić go jako dzisiejszy plan i rozpocząć?")) {
                state.todaysDynamicPlan = currentAdjustedPlan;
                savePlanToStorage(currentAdjustedPlan);
            } else return;
        }
        
        state.sessionParams.initialPainLevel = currentPainLevel;
        state.sessionParams.timeFactor = 1.0; 
        
        startModifiedTraining();
    });

    navigateTo('preTraining');
};

export const renderTrainingScreen = () => {
    screens.training.innerHTML = `
    <div class="focus-view">
        <div id="focus-progress-bar" class="focus-progress-container"></div>
        <div class="focus-header-minimal">
            <button id="exit-training-btn" class="close-training-btn" title="Zakończ trening"><svg width="18" height="18"><use href="#icon-close"/></svg></button>
        </div>
        <div class="focus-timer-container"><p id="focus-timer-display"></p></div>
        <div class="focus-exercise-info" style="margin-bottom: 0.5rem;">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <span id="focus-affinity-badge"></span>
                <button id="tts-toggle-btn" class="tts-button"><svg id="tts-icon" width="24" height="24"><use href="#icon-sound-on"/></svg></button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>
        <p id="focus-tempo" style="text-align: center; margin: -5px 0 10px 0; font-weight: 600; color: var(--accent-color); font-size: 0.9rem; opacity: 0.9;"></p>
        <div id="visual-toggle-card" class="visual-card-wrapper" title="Kliknij, aby przełączyć widok">
            <div id="focus-animation-container" class="visual-card-content focus-animation-container hidden"></div>
            <div id="focus-description" class="visual-card-content focus-description-container"></div>
            <div class="flip-indicator"><svg width="18" height="18"><use href="#icon-info"/></svg></div>
        </div>
        <div class="focus-controls-wrapper">
             <div class="focus-main-action"><button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button></div>
            <div class="focus-secondary-actions">
                <button id="prev-step-btn" class="control-icon-btn"><svg><use href="#icon-back"/></svg></button>
                <button id="pause-resume-btn" class="control-icon-btn"><svg><use href="#icon-pause"/></svg></button>
                <button id="skip-btn" class="control-icon-btn"><svg><use href="#icon-skip"/></svg></button>
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
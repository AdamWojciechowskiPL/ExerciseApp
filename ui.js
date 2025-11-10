// ui.js

import { state } from './state.js';
import { screens, containers, mainNav, initializeFocusElements } from './dom.js';
import { getISODate, getTrainingDayForDate, applyProgression, getHydratedDay, getActiveTrainingPlan } from './utils.js';
import { startModifiedTraining } from './training.js';
import { TRAINING_PLANS } from './training-plans.js';
import { EXERCISE_LIBRARY } from './exercise-library.js';
import dataStore from './dataStore.js';

// === NOWOŚĆ: Przeniesienie logiki z app.js, aby przełamać cykliczną zależność ===

const loadingOverlay = document.getElementById('loading-overlay');

export const showLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove('hidden');
    setTimeout(() => { loadingOverlay.style.opacity = '1'; }, 10);
};

export const hideLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.style.opacity = '0';
    setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 300);
};

export const wakeLockManager = {
    wakeLock: null,
    async request() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error(`Błąd Wake Lock: ${err.name}, ${err.message}`);
            }
        }
    },
    async release() {
        if (this.wakeLock !== null) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }
};

export function handleSummarySubmit(e) {
    e.preventDefault();
    const dateKey = state.currentTrainingDate;
    
    const sessionPayload = {
        sessionId: Date.now(),
        planId: state.settings.activePlanId,
        trainingDayId: state.currentTrainingDayId,
        status: 'completed',
        pain_during: document.getElementById('pain-during').value,
        notes: document.getElementById('general-notes').value,
        completedAt: new Date().toISOString(),
        sessionLog: state.sessionLog,
    };
    
    if (!state.userProgress[dateKey]) {
        state.userProgress[dateKey] = [];
    }
    state.userProgress[dateKey].push(sessionPayload);
    
    dataStore.saveSession(sessionPayload);
    
    state.currentTrainingDate = null;
    state.currentTrainingDayId = null;
    state.sessionLog = [];
    
    navigateTo('main');
    renderMainScreen();
}

// ==============================================================================


export const navigateTo = (screenName) => {
    if (screenName === 'training') { wakeLockManager.request(); } 
    else { wakeLockManager.release(); }
    
    if (screenName === 'training') {
        screens.training.classList.add('active');
        mainNav.style.display = 'none';
        document.getElementById('app-footer').style.display = 'none';
    } else {
        screens.training.classList.remove('active');
        document.getElementById('app-footer').style.display = 'block';
        Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
        if (screens[screenName]) screens[screenName].classList.add('active');

        if (mainNav) {
            mainNav.style.display = 'flex';
        }
        const bottomNavButtons = document.querySelectorAll('#app-bottom-nav .bottom-nav-btn');
        bottomNavButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.screen === screenName) {
                btn.classList.add('active');
            }
        });
    }
    window.scrollTo(0, 0);
};

export const renderMainScreen = () => {
    const activePlan = getActiveTrainingPlan();
    const mainScreenTitle = document.getElementById('main-screen-title');
    if (mainScreenTitle) {
        mainScreenTitle.textContent = activePlan.name || 'Mój Plan Treningowy';
    }

    containers.days.innerHTML = '';
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const trainingDayData = getTrainingDayForDate(date);
        if (!trainingDayData) continue;
        const trainingDay = getHydratedDay(trainingDayData);
        if (!trainingDay) continue;
        const equipmentSet = new Set();
        const allExercises = [...(trainingDay.warmup || []), ...(trainingDay.main || []), ...(trainingDay.cooldown || [])];
        allExercises.forEach(exercise => {
            if (exercise.equipment && exercise.equipment.trim() !== '') {
                exercise.equipment.split(',').map(item => item.trim()).forEach(item => equipmentSet.add(item));
            }
        });
        let equipmentHtml = equipmentSet.size > 0 
            ? `<p class="day-card-equipment"><strong>Sprzęt:</strong> ${[...equipmentSet].join(', ')}</p>`
            : `<p class="day-card-equipment"><strong>Sprzęt:</strong> Brak wymaganego sprzętu</p>`;
        let dateLabel = date.toLocaleString('pl-PL', { day: 'numeric', month: 'short' });
        if (i === 0) dateLabel = `Dzisiaj, ${dateLabel}`;
        if (i === 1) dateLabel = `Jutro, ${dateLabel}`;
        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
            <p class="day-card-date">${dateLabel}</p>
            <div class="card-header"><h3>Dzień ${trainingDay.dayNumber}: ${trainingDay.title}</h3></div>
            ${equipmentHtml}
            <button class="action-btn" data-day-id="${trainingDay.dayNumber}">Start treningu (Dzień ${trainingDay.dayNumber})</button>
        `;
        containers.days.appendChild(card);
    }
    navigateTo('main');
};

export const renderHistoryScreen = async () => {
    navigateTo('history');
    showLoader(); 

    try {
        const date = state.currentCalendarView;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        await dataStore.getHistoryForMonth(year, month);
        
        document.getElementById('month-year-header').textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        const grid = containers.calendarGrid;
        grid.innerHTML = '';
        
        const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        let startDay = firstDayOfMonth.getDay();
        if (startDay === 0) startDay = 7;
        
        for (let i = 1; i < startDay; i++) { 
            grid.innerHTML += `<div class="calendar-day other-month"></div>`; 
        }
        
        const todayISO = getISODate(new Date());
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const currentDate = new Date(date.getFullYear(), date.getMonth(), i);
            const isoDate = getISODate(currentDate);
            const dayEntries = state.userProgress[isoDate] || [];
            
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            
            if (dayEntries.length > 0) {
                dayEl.classList.add('has-entry', 'completed');
                dayEl.dataset.date = isoDate;
            } else {
                dayEl.classList.add('not_started');
            }
            if (isoDate === todayISO) { 
                dayEl.classList.add('today'); 
            }
            
            let planHtml = '';
            const trainingDayForVisuals = getTrainingDayForDate(currentDate);
            if (trainingDayForVisuals) {
                planHtml = `<div class="day-plan">Dzień ${trainingDayForVisuals.dayNumber}</div>`;
            }

            dayEl.innerHTML = `<div class="day-number">${i}</div>${planHtml}`;
            grid.appendChild(dayEl);
        }
    } catch (error) {
        console.error("Error rendering history screen:", error);
    } finally {
        hideLoader();
    }
};

export const renderDayDetailsScreen = (isoDate) => {
    const dayEntries = state.userProgress[isoDate];
    if (!dayEntries || dayEntries.length === 0) return;
    const date = new Date(isoDate);
    let sessionsHtml = dayEntries.map(session => {
        const planId = session.planId || 'l5s1-foundation';
        const planForHistory = TRAINING_PLANS[planId];
        const trainingDay = planForHistory.Days.find(d => d.dayNumber === session.trainingDayId);
        const title = trainingDay ? trainingDay.title : 'Nieznany trening';
        const completedTime = new Date(session.completedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        const exercisesHtml = session.sessionLog && session.sessionLog.length > 0 ? session.sessionLog.map(item => `
            <div class="details-exercise-item">
                <div class="details-exercise-info">
                    <strong>${item.name} (Seria ${item.currentSet}/${item.totalSets})</strong>
                    <span>${item.reps_or_time} | ${item.tempo_or_iso}</span>
                </div>
                <div class="details-exercise-status ${item.status === 'skipped' ? 'skipped' : 'completed'}">
                    ${item.status === 'skipped' ? 'Pominięto' : 'Wykonano'}
                </div>
            </div>
        `).join('') : '<p>Brak szczegółowego logu dla tej sesji.</p>';
        return `<details class="details-session-card" open><summary><span>${title}</span><span>${completedTime}</span></summary><div class="details-session-card-content"><div class="details-summary-card"><p><strong>Status:</strong> Ukończono</p><p><strong>Ocena bólu:</strong> ${session.pain_during || 'Brak oceny'}/10</p>${session.notes ? `<div class="details-notes"><strong>Notatki:</strong><br>${session.notes}</div>` : ''}</div><div class="details-exercise-list"><h4>Wykonane ćwiczenia:</h4>${exercisesHtml}</div></div></details>`;
    }).join('');
    screens.dayDetails.innerHTML = `<h2 id="details-day-title">${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><div id="day-details-content">${sessionsHtml}</div><button id="details-back-btn" class="action-btn">Wróć do Historii</button>`;
    screens.dayDetails.querySelector('#details-back-btn').addEventListener('click', renderHistoryScreen);
    navigateTo('dayDetails');
};

export const renderSettingsScreen = () => {
    const form = document.getElementById('settings-form');
    form['setting-start-date'].value = state.settings.appStartDate;
    form['setting-rest-duration'].value = state.settings.restBetweenExercises;
    form['setting-progression-factor'].value = state.settings.progressionFactor;
    document.getElementById('progression-factor-value').textContent = `${state.settings.progressionFactor}%`;
    const planSelector = document.getElementById('setting-training-plan');
    if (planSelector) {
        planSelector.innerHTML = '';
        Object.keys(TRAINING_PLANS).forEach(planId => {
            const plan = TRAINING_PLANS[planId];
            const option = document.createElement('option');
            option.value = planId;
            option.textContent = plan.name;
            if (planId === state.settings.activePlanId) { option.selected = true; }
            planSelector.appendChild(option);
        });
    }
    navigateTo('settings');
};

export const renderLibraryScreen = (searchTerm = '') => {
    const container = containers.exerciseLibrary;
    container.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    Object.values(EXERCISE_LIBRARY).filter(exercise => exercise.name.toLowerCase().includes(lowerCaseSearchTerm) || exercise.description.toLowerCase().includes(lowerCaseSearchTerm)).forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'library-card';
        card.innerHTML = `<div class="card-header"><h3>${exercise.name}</h3></div><p class="library-card-description">${exercise.description}</p><div class="library-card-footer"><p><strong>Sprzęt:</strong> ${exercise.equipment || 'Brak'}</p><a href="${exercise.youtube_url}" target="_blank" rel="noopener noreferrer" class="nav-btn">Obejrzyj wideo ↗</a></div>`;
        container.appendChild(card);
    });
    navigateTo('library');
};

export const renderPreTrainingScreen = (dayId) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());
    const activePlan = TRAINING_PLANS[state.settings.activePlanId];
    const dayData = activePlan.Days.find(d => d.dayNumber === dayId);
    if (!dayData) return;
    const trainingDay = getHydratedDay(dayData);
    if (!trainingDay) return;
    const factor = state.settings.progressionFactor;
    const screen = screens.preTraining;
    screen.innerHTML = `<h2 id="pre-training-title">Podgląd: ${trainingDay.title}</h2><div id="pre-training-list"></div><div class="pre-training-nav"><button id="pre-training-back-btn" class="nav-btn">Wróć</button><button id="start-modified-training-btn" class="action-btn">Rozpocznij Trening</button></div>`;
    const listContainer = screen.querySelector('#pre-training-list');
    const sections = [{ name: 'Rozgrzewka', exercises: trainingDay.warmup || [] }, { name: 'Część główna', exercises: trainingDay.main || [] }, { name: 'Schłodzenie', exercises: trainingDay.cooldown || [] }];
    let exerciseCounter = 0;
    sections.forEach(section => {
        if (section.exercises.length === 0) return;
        const header = document.createElement('h3');
        header.className = 'pre-training-section-header';
        header.textContent = section.name;
        listContainer.appendChild(header);
        section.exercises.forEach((ex) => {
            const card = document.createElement('div');
            card.className = 'pre-training-exercise-card';
            const uniqueId = `ex-${exerciseCounter}`;
            card.innerHTML = `
                <h4>${ex.name}</h4>
                <p class="pre-training-description">${ex.description || 'Brak opisu.'}</p>
                <a href="${ex.youtube_url}" target="_blank" rel="noopener noreferrer">Obejrzyj wideo ↗</a>
                <p class="details">Tempo: ${applyProgression(ex.tempo_or_iso, factor)} | Sprzęt: ${ex.equipment}</p>
                <div class="pre-training-inputs">
                    <div class="form-group">
                        <label for="sets-${uniqueId}">Serie</label>
                        <input type="text" id="sets-${uniqueId}" value="${ex.sets}" data-exercise-index="${exerciseCounter}">
                    </div>
                    <div class="form-group">
                        <label for="reps-${uniqueId}">Powtórzenia/Czas</label>
                        <input type="text" id="reps-${uniqueId}" value="${applyProgression(ex.reps_or_time, factor)}" data-exercise-index="${exerciseCounter}">
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
            exerciseCounter++;
        });
    });
    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    screen.querySelector('#start-modified-training-btn').addEventListener('click', startModifiedTraining);
    navigateTo('preTraining');
};

export const renderSummaryScreen = () => {
    const activePlan = TRAINING_PLANS[state.settings.activePlanId];
    const trainingDay = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    const summaryScreen = screens.summary;
    summaryScreen.innerHTML = `<h2 id="summary-title">Podsumowanie: ${trainingDay.title}</h2><p>Gratulacje! Dobra robota.</p><form id="summary-form"><div class="form-group"><label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label><div class="slider-container"><input type="range" id="pain-during" min="0" max="10" step="1" value="0"><span class="slider-value" id="pain-during-value">0</span></div></div><div class="form-group"><label for="general-notes">Notatki ogólne:</label><textarea id="general-notes" rows="4"></textarea></div><button type="submit" class="action-btn">Zapisz i zakończ</button></form>`;
    const slider = summaryScreen.querySelector('#pain-during');
    const sliderValueDisplay = summaryScreen.querySelector('#pain-during-value');
    slider.addEventListener('input', () => { sliderValueDisplay.textContent = slider.value; });
    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    navigateTo('summary');
};

export const renderTrainingScreen = () => {
    screens.training.innerHTML = `<div class="focus-view"><div class="focus-header"><p id="focus-section-name"></p><button id="exit-training-btn">Zakończ</button><p id="focus-progress"></p></div><div class="focus-timer-container"><p id="focus-timer-display"></p></div><div class="focus-exercise-info"><div class="exercise-title-container"><h2 id="focus-exercise-name"></h2><button id="tts-toggle-btn" class="tts-button"></button></div><p id="focus-exercise-details"></p></div><div id="focus-description" class="focus-description-container"></div><div class="focus-controls"><button id="prev-step-btn" class="control-btn">Cofnij</button><button id="pause-resume-btn" class="control-btn">Pauza</button><button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button><button id="skip-btn" class="control-btn">Pomiń</button></div><div class="focus-next-up"><p><strong>Następne:</strong> <span id="next-exercise-name"></span></p></div></div>`;
    initializeFocusElements();
};
// ui.js

import { state } from './state.js';
import { screens, containers, mainNav, initializeFocusElements } from './dom.js';
import { getISODate, getTrainingDayForDate, applyProgression } from './utils.js';
import { handleSummarySubmit } from './app.js';
import { startModifiedTraining } from './training.js';
import { TRAINING_PLAN } from './training-plan.js'; // Dodano import TRAINING_PLAN

export const navigateTo = (screenName) => {
    if (screenName === 'training') {
        screens.training.classList.add('active');
        mainNav.style.display = 'none';
    } else {
        screens.training.classList.remove('active');
        mainNav.style.display = 'flex';
        Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
        if (screens[screenName]) screens[screenName].classList.add('active');
    }
    window.scrollTo(0, 0);
};

export const renderMainScreen = () => {
    containers.days.innerHTML = '';
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const trainingDay = getTrainingDayForDate(date);
        if (!trainingDay) continue;

        let dateLabel = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
        if (i === 0) dateLabel = `Dzisiaj, ${dateLabel}`;
        if (i === 1) dateLabel = `Jutro, ${dateLabel}`;

        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
            <p class="day-card-date">${dateLabel}</p>
            <div class="card-header">
                <h3>Dzień ${trainingDay.dayNumber}: ${trainingDay.title}</h3>
            </div>
            <button class="action-btn" data-day-id="${trainingDay.dayNumber}">Start treningu (Dzień ${trainingDay.dayNumber})</button>
        `;
        containers.days.appendChild(card);
    }
};

export const renderHistoryScreen = () => {
    const date = state.currentCalendarView;
    const year = date.getFullYear();
    const month = date.getMonth();
    
    document.getElementById('month-year-header').textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    
    const grid = containers.calendarGrid;
    grid.innerHTML = '';
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7;
    
    for (let i = 1; i < startDay; i++) {
        grid.innerHTML += `<div class="calendar-day other-month"></div>`;
    }
    
    const todayISO = getISODate(new Date());
    for (let i = 1; i <= daysInMonth; i++) {
        const currentDate = new Date(year, month, i);
        const isoDate = getISODate(currentDate);
        const dayEntries = state.userProgress[isoDate] || [];
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        if (dayEntries.length > 0) {
            dayEl.classList.add('has-entry');
            dayEl.dataset.date = isoDate;
            if (dayEntries.some(e => e.status === 'completed')) {
                dayEl.classList.add('completed');
            } else {
                dayEl.classList.add('in_progress');
            }
        } else {
            dayEl.classList.add('not_started');
        }

        if (isoDate === todayISO) {
            dayEl.classList.add('today');
        }
        
        // =========================================================================
        // KLUCZOWA ZMIANA: Wyświetlaj przydział planu tylko dla dnia dzisiejszego i przyszłych
        // =========================================================================
        let planHtml = '';
        // Porównanie stringów 'YYYY-MM-DD' jest bezpieczne i wydajne
        if (isoDate >= todayISO) {
            const trainingDayForVisuals = getTrainingDayForDate(currentDate);
            if (trainingDayForVisuals) { // Upewnij się, że dzień istnieje
                 planHtml = `<div class="day-plan">Plan: Dzień ${trainingDayForVisuals.dayNumber}</div>`;
            }
        }

        dayEl.innerHTML = `
            <div class="day-number">${i}</div>
            ${planHtml} 
        `;
        grid.appendChild(dayEl);
    }
    navigateTo('history');
};

export const renderDayDetailsScreen = (isoDate) => {
    const dayEntries = state.userProgress[isoDate];
    if (!dayEntries || dayEntries.length === 0) return;

    const date = new Date(isoDate);
    const screen = screens.dayDetails;
    
    let sessionsHtml = dayEntries.map(session => {
        const trainingDay = TRAINING_PLAN.Days.find(d => d.dayNumber === session.trainingDayId);
        const completedTime = new Date(session.completedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

        const exercisesHtml = session.sessionLog && session.sessionLog.length > 0 ? session.sessionLog.map(item => `
            <div class="details-exercise-item">
                <div class="details-exercise-info">
                    <strong>${item.name} (Seria ${item.currentSet}/${item.totalSets})</strong>
                    <span>${item.reps_or_time} | ${item.tempo_or_iso}</span>
                </div>
                <div class="details-exercise-status ${item.status}">
                    ${item.status === 'completed' && item.duration !== '-' ? `Ukończono<br>${item.duration}s` : (item.status === 'skipped' ? 'Pominięto' : 'Wykonano')}
                </div>
            </div>
        `).join('') : '<p>Brak szczegółowego logu dla tej sesji.</p>';

        return `
            <details class="details-session-card">
                <summary>
                    <span>${trainingDay.title}</span>
                    <span>${completedTime}</span>
                </summary>
                <div class="details-session-card-content">
                    <div class="details-summary-card">
                        <p><strong>Status:</strong> ${session.status === 'completed' ? 'Ukończono' : 'W trakcie'}</p>
                        <p><strong>Ocena bólu:</strong> ${session.pain_during || 'Brak oceny'}/10</p>
                        ${session.notes ? `<div class="details-notes"><strong>Notatki:</strong><br>${session.notes}</div>` : ''}
                    </div>
                    <div class="details-exercise-list">
                        <h4>Wykonane ćwiczenia:</h4>
                        ${exercisesHtml}
                    </div>
                </div>
            </details>
        `;
    }).join('');

    screen.innerHTML = `
        <h2 id="details-day-title">${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <div id="day-details-content">${sessionsHtml}</div>
        <button id="details-back-btn" class="action-btn">Wróć do Historii</button>
    `;

    screen.querySelector('#details-back-btn').addEventListener('click', renderHistoryScreen);
    navigateTo('dayDetails');
};

export const renderSettingsScreen = () => {
    const form = document.getElementById('settings-form');
    // NOWA LINIA: Ustawienie wartości w polu kalendarza
    form['setting-start-date'].value = state.settings.appStartDate;
    form['setting-rest-duration'].value = state.settings.restBetweenExercises;
    form['setting-progression-factor'].value = state.settings.progressionFactor;
    document.getElementById('progression-factor-value').textContent = `${state.settings.progressionFactor}%`;
    navigateTo('settings');
};

export const renderPreTrainingScreen = (dayId) => {
    // =========================================================================
    // NAPRAWIONA CZĘŚĆ: Poprawna logika renderowania
    // =========================================================================
    state.currentTrainingDayId = dayId; // Zapisz ID dnia z planu
    state.currentTrainingDate = getISODate(new Date()); // Zapisz DZISIEJSZĄ datę jako datę treningu
    
    const trainingDay = TRAINING_PLAN.Days.find(d => d.dayNumber === dayId);
    if (!trainingDay) return;

    const factor = state.settings.progressionFactor;
    
    const screen = screens.preTraining;
    screen.innerHTML = `
        <h2 id="pre-training-title">Podgląd: ${trainingDay.title}</h2>
        <div id="pre-training-list"></div>
        <div class="pre-training-nav">
            <button id="pre-training-back-btn" class="nav-btn">Wróć</button>
            <button id="start-modified-training-btn" class="action-btn">Rozpocznij Trening</button>
        </div>
    `;
    
    const listContainer = screen.querySelector('#pre-training-list');

    const sections = [
        { name: 'Rozgrzewka', exercises: trainingDay.warmup || [] },
        { name: 'Część główna', exercises: trainingDay.main || [] },
        { name: 'Schłodzenie', exercises: trainingDay.cooldown || [] }
    ];

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
            const modifiedReps = applyProgression(ex.reps_or_time, factor);
            const modifiedTempo = applyProgression(ex.tempo_or_iso, factor);
            
            card.innerHTML = `
                <h4>${ex.name}</h4>
                <p class="pre-training-description">${ex.description || 'Brak opisu.'}</p>
                <a href="${ex.youtube_url}" target="_blank">Obejrzyj wideo ↗</a>
                <p class="details">Tempo: ${modifiedTempo} | Sprzęt: ${ex.equipment}</p>
                <div class="pre-training-inputs">
                    <div class="form-group">
                        <label for="sets-${uniqueId}">Serie</label>
                        <input type="text" id="sets-${uniqueId}" value="${ex.sets}" data-original-name="${ex.name}">
                    </div>
                    <div class="form-group">
                        <label for="reps-${uniqueId}">Powtórzenia/Czas</label>
                        <input type="text" id="reps-${uniqueId}" value="${modifiedReps}" data-original-name="${ex.name}">
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
    const trainingDay = TRAINING_PLAN.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    const dayProgress = state.userProgress[state.currentTrainingDate] || [];
    const latestSession = dayProgress[dayProgress.length - 1] || {};
    const initialPainValue = latestSession.pain_during || 0;
    const summaryScreen = screens.summary;

    summaryScreen.innerHTML = `
        <h2 id="summary-title">Podsumowanie: ${trainingDay.title}</h2>
        <p>Gratulacje! Dobra robota.</p>
        <form id="summary-form">
            <div class="form-group">
                <label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label>
                <div class="slider-container">
                    <input type="range" id="pain-during" min="0" max="10" step="1" value="${initialPainValue}">
                    <span class="slider-value" id="pain-during-value">${initialPainValue}</span>
                </div>
            </div>
            <div class="form-group">
                <label for="general-notes">Notatki ogólne:</label>
                <textarea id="general-notes" rows="4">${latestSession.notes || ''}</textarea>
            </div>
            <button type="submit" class="action-btn">Zapisz i zakończ</button>
        </form>
    `;

    const slider = summaryScreen.querySelector('#pain-during');
    const sliderValueDisplay = summaryScreen.querySelector('#pain-during-value');
    slider.addEventListener('input', () => {
        sliderValueDisplay.textContent = slider.value;
    });

    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
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
            <div class="focus-exercise-info">
                <div class="exercise-title-container">
                    <h2 id="focus-exercise-name"></h2>
                    <button id="tts-toggle-btn" class="tts-button"></button>
                </div>
                <p id="focus-exercise-details"></p>
            </div>
            <div id="focus-description" class="focus-description-container"></div>
            <div class="focus-controls">
                <button id="prev-step-btn" class="control-btn">Cofnij</button>
                <button id="pause-resume-btn" class="control-btn">Pauza</button>
                <button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button>
                <button id="skip-btn" class="control-btn">Pomiń</button>
            </div>
            <div class="focus-next-up">
                <p><strong>Następne:</strong> <span id="next-exercise-name"></span></p>
            </div>
        </div>`;
    initializeFocusElements();
};
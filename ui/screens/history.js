// js/ui/screens/history.js
import { state } from '../../state.js';
import { containers, screens } from '../../dom.js';
import { getISODate, getTrainingDayForDate } from '../../utils.js';
import { showLoader, hideLoader, navigateTo } from '../core.js';
import { generateSessionCardHTML } from '../templates.js';
import dataStore from '../../dataStore.js';

export const renderHistoryScreen = async (forceRefresh = false) => {
    // ... (Kod kalendarza bez zmian) ...
    navigateTo('history');
    const date = state.currentCalendarView;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const cacheKey = `${year}-${month}`;
    const isCached = state.loadedMonths.has(cacheKey);
    if (forceRefresh || !isCached) { showLoader(); }
    try {
        await dataStore.getHistoryForMonth(year, month, forceRefresh);
        const headerContainer = document.getElementById('month-year-header');
        headerContainer.innerHTML = `<span style="vertical-align: middle;">${date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span><button id="refresh-history-btn" style="background:none; border:none; cursor:pointer; margin-left:10px; vertical-align: middle; opacity: 0.6;" title="Odśwież"><img src="/icons/refresh-cw.svg" width="16" height="16" alt="Odśwież"></button>`;
        document.getElementById('refresh-history-btn').addEventListener('click', (e) => { e.stopPropagation(); renderHistoryScreen(true); });
        const grid = containers.calendarGrid;
        grid.innerHTML = '';
        const firstDayOfMonth = new Date(year, date.getMonth(), 1);
        const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0);
        let startDay = firstDayOfMonth.getDay(); if (startDay === 0) startDay = 7;
        for (let i = 1; i < startDay; i++) { grid.innerHTML += `<div class="calendar-day other-month"></div>`; }
        const todayISO = getISODate(new Date());
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const currentDate = new Date(year, date.getMonth(), i);
            const isoDate = getISODate(currentDate);
            const dayEntries = state.userProgress[isoDate] || [];
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            if (dayEntries.length > 0) { dayEl.classList.add('has-entry', 'completed'); dayEl.dataset.date = isoDate; } else { dayEl.classList.add('not_started'); }
            if (isoDate === todayISO) { dayEl.classList.add('today'); }
            let planHtml = '';
            const trainingDayForVisuals = getTrainingDayForDate(currentDate);
            if (trainingDayForVisuals) { planHtml = `<div class="day-plan">Dzień ${trainingDayForVisuals.dayNumber}</div>`; }
            dayEl.innerHTML = `<div class="day-number">${i}</div>${planHtml}`;
            grid.appendChild(dayEl);
        }
    } catch (error) { console.error("Error rendering history screen:", error); } finally { hideLoader(); }
};

export const renderDayDetailsScreen = (isoDate, customBackAction = null) => {
    const dayEntries = state.userProgress[isoDate];
    if (!dayEntries || dayEntries.length === 0) {
        renderHistoryScreen();
        return;
    }
    const date = new Date(isoDate);
    const sessionsHtml = dayEntries.map(generateSessionCardHTML).join('');

    const backButtonLabel = customBackAction ? "Wróć" : "Wróć do Historii";

    screens.dayDetails.innerHTML = `
        <h2 id="details-day-title">${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <div id="day-details-content">${sessionsHtml}</div>
        <button id="details-back-btn" class="action-btn">${backButtonLabel}</button>
        
        <style>
            .rate-btn-hist { 
                background: transparent; 
                border: 1px solid #e0e0e0; 
                border-radius: 6px; 
                padding: 4px 8px; 
                cursor: pointer; 
                opacity: 0.5; 
                filter: grayscale(100%); 
                transition: all 0.2s; 
                font-size: 1.1rem;
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
            }
            .rate-btn-hist:hover { 
                opacity: 0.8; 
                filter: grayscale(50%); 
                transform: scale(1.1); 
                background: #f9f9f9;
            }
            .rate-btn-hist.active { 
                opacity: 1; 
                filter: grayscale(0%); 
                border-color: var(--primary-color); 
                background: #e0f2fe; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .hist-rating-actions {
                display: flex;
                gap: 6px;
                margin-left: auto;
            }
        </style>
    `;

    const backBtn = screens.dayDetails.querySelector('#details-back-btn');
    backBtn.addEventListener('click', () => {
        if (customBackAction) { customBackAction(); } else { renderHistoryScreen(); }
    });

    const contentContainer = screens.dayDetails.querySelector('#day-details-content');
    
    contentContainer.addEventListener('click', async (e) => {
        // DELETE SESSION
        const delBtn = e.target.closest('.delete-session-btn');
        if (delBtn) {
            const sessionId = delBtn.dataset.sessionId;
            if (!confirm('Czy na pewno chcesz trwale usunąć ten trening?')) return;
            showLoader();
            try {
                await dataStore.deleteSession(sessionId);
                state.userProgress[isoDate] = state.userProgress[isoDate].filter(s => String(s.sessionId) !== String(sessionId));
                await dataStore.fetchDetailedStats();
                if (state.userProgress[isoDate].length > 0) { renderDayDetailsScreen(isoDate); } else { delete state.userProgress[isoDate]; renderHistoryScreen(); }
            } catch (error) { console.error("Deletion failed:", error); } finally { hideLoader(); }
            return;
        }

        // RATE EXERCISE
        const rateBtn = e.target.closest('.rate-btn-hist');
        if (rateBtn) {
            e.stopPropagation();
            
            const id = rateBtn.dataset.id;
            const action = rateBtn.dataset.action;
            const isActive = rateBtn.classList.contains('active');
            
            // Logika grupowania (Affinity vs Difficulty)
            const parentActions = rateBtn.closest('.hist-rating-actions');
            
            if (action === 'like' || action === 'dislike') {
                // Grupa Affinity: Wyłącz inne affinity, nie ruszaj difficulty
                parentActions.querySelectorAll('[data-action="like"], [data-action="dislike"]').forEach(b => b.classList.remove('active'));
            } else if (action === 'hard' || action === 'easy') {
                // Grupa Difficulty: Wyłącz inne difficulty, nie ruszaj affinity
                parentActions.querySelectorAll('[data-action="hard"], [data-action="easy"]').forEach(b => b.classList.remove('active'));
            }

            if (!isActive) {
                rateBtn.classList.add('active');
                dataStore.updatePreference(id, action);
            }
        }
    });

    navigateTo('dayDetails');
};
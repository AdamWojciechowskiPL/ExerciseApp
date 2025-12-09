// js/ui/screens/history.js
import { state } from '../../state.js';
import { containers, screens } from '../../dom.js';
import { getISODate, getTrainingDayForDate } from '../../utils.js';
import { showLoader, hideLoader, navigateTo } from '../core.js';
import { generateSessionCardHTML } from '../templates.js';
import dataStore from '../../dataStore.js';

export const renderHistoryScreen = async (forceRefresh = false) => {
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
            const action = rateBtn.dataset.action; // 'like', 'dislike', 'hard', 'easy'
            
            // 1. Pobierz aktualny stan (Source of Truth)
            const currentPref = state.userPreferences[id] || { score: 0, difficulty: 0 };
            
            // 2. Dekompozycja wyniku na części składowe
            let baseScore = currentPref.score;
            let currentDiff = currentPref.difficulty;

            // Cofamy kary, aby odzyskać czystą intencję "Lubię/Nie lubię"
            if (currentDiff === 1) baseScore += 10; // Cofnij karę za Hard
            if (currentDiff === -1) baseScore += 5; // Cofnij karę za Easy

            let newBaseScore = baseScore;
            let newDiff = currentDiff;

            // 3. Logika Zmian
            if (action === 'like') {
                newBaseScore = (baseScore >= 10) ? 0 : 20;
            } 
            else if (action === 'dislike') {
                newBaseScore = (baseScore <= -10) ? 0 : -20;
            }
            else if (action === 'hard') {
                newDiff = (currentDiff === 1) ? 0 : 1;
            }
            else if (action === 'easy') {
                newDiff = (currentDiff === -1) ? 0 : -1;
            }

            // 4. Rekonstrukcja Finalnego Wyniku
            let finalScore = newBaseScore;
            if (newDiff === 1) finalScore -= 10;
            if (newDiff === -1) finalScore -= 5;

            finalScore = Math.max(-100, Math.min(100, finalScore));

            // 5. Aktualizacja UI - NAPRAWA: Aktualizujemy WSZYSTKIE przyciski dla tego ID
            // Znajdujemy wszystkie przyciski na ekranie, które dotyczą tego samego ćwiczenia (np. z różnych sesji)
            const allButtonsForId = contentContainer.querySelectorAll(`.rate-btn-hist[data-id="${id}"]`);

            const showLike = newBaseScore >= 10;
            const showDislike = newBaseScore <= -10;
            const showHard = newDiff === 1;
            const showEasy = newDiff === -1;

            allButtonsForId.forEach(btn => {
                const btnAction = btn.dataset.action;
                let isActive = false;

                if (btnAction === 'like') isActive = showLike;
                else if (btnAction === 'dislike') isActive = showDislike;
                else if (btnAction === 'hard') isActive = showHard;
                else if (btnAction === 'easy') isActive = showEasy;

                // Wymuszamy stan klasy active
                btn.classList.toggle('active', isActive);
            });

            // 6. Wyślij do API
            try {
                // Aktualizujemy lokalny stan natychmiast (Optimistic Update)
                state.userPreferences[id] = { score: finalScore, difficulty: newDiff };
                
                await dataStore.updatePreference(id, 'set', finalScore);
                await dataStore.updatePreference(id, 'set_difficulty', newDiff);
            } catch (err) {
                console.error("Błąd aktualizacji preferencji:", err);
            }
        }
    });

    navigateTo('dayDetails');
};
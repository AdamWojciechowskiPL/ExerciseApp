// js/ui/screens/history.js
import { state } from '../../state.js';
import { containers, screens } from '../../dom.js';
import { getISODate, getTrainingDayForDate } from '../../utils.js';
import { showLoader, hideLoader, navigateTo } from '../core.js';
import { generateSessionCardHTML } from '../templates.js';
import dataStore from '../../dataStore.js';

export const renderHistoryScreen = async (forceRefresh = false) => {
    navigateTo('history');
    
    // Jeśli dane są w cache i nie wymuszamy, loader nie jest potrzebny (działa natychmiast)
    // Ale dla spójności pokażmy go na krótko lub tylko przy faktycznym pobieraniu.
    // Tutaj uproszczona wersja:
    
    const date = state.currentCalendarView;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const cacheKey = `${year}-${month}`;

    // Pokazujemy loader TYLKO jeśli faktycznie będziemy pobierać dane
    if (forceRefresh || !state.loadedMonths.has(cacheKey)) {
        showLoader();
    }

    try {
        // Przekazujemy flagę forceRefresh do dataStore
        await dataStore.getHistoryForMonth(year, month, forceRefresh);
        
        // Generowanie nagłówka z przyciskiem odświeżania
        const headerContainer = document.getElementById('month-year-header');
        
        // Czyścimy stare event listenery poprzez klonowanie (prost trick) lub innerHTML
        // Tutaj użyjemy innerHTML dla wstawienia przycisku
        headerContainer.innerHTML = `
            <span style="vertical-align: middle;">${date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
            <button id="refresh-history-btn" style="background:none; border:none; cursor:pointer; margin-left:10px; vertical-align: middle; opacity: 0.6;" title="Odśwież">
                <img src="/icons/refresh-cw.svg" width="16" height="16" alt="Odśwież">
            </button>
        `;

        // Obsługa przycisku odświeżania
        document.getElementById('refresh-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            // Wywołujemy render z flagą true
            renderHistoryScreen(true);
        });

        const grid = containers.calendarGrid;
        grid.innerHTML = '';
        
        // ... (Reszta logiki renderowania kalendarza bez zmian: firstDayOfMonth, pętle, kafelki) ...
        
        const firstDayOfMonth = new Date(year, date.getMonth(), 1);
        const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0);
        let startDay = firstDayOfMonth.getDay();
        if (startDay === 0) startDay = 7; 
        
        for (let i = 1; i < startDay; i++) { 
            grid.innerHTML += `<div class="calendar-day other-month"></div>`; 
        }
        
        const todayISO = getISODate(new Date());
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const currentDate = new Date(year, date.getMonth(), i);
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

export const renderDayDetailsScreen = (isoDate, customBackAction = null) => {
    const dayEntries = state.userProgress[isoDate];
    if (!dayEntries || dayEntries.length === 0) {
        renderHistoryScreen();
        return;
    }
    const date = new Date(isoDate);
    const sessionsHtml = dayEntries.map(generateSessionCardHTML).join('');

    // Ustalanie etykiety przycisku w zależności od kontekstu
    const backButtonLabel = customBackAction ? "Wróć" : "Wróć do Historii";

    screens.dayDetails.innerHTML = `
        <h2 id="details-day-title">${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <div id="day-details-content">${sessionsHtml}</div>
        <button id="details-back-btn" class="action-btn">${backButtonLabel}</button>
    `;

    // Obsługa kliknięcia Wstecz
    const backBtn = screens.dayDetails.querySelector('#details-back-btn');
    backBtn.addEventListener('click', () => {
        if (customBackAction) {
            // Jeśli podano niestandardową akcję (np. powrót do Dashboardu)
            customBackAction();
        } else {
            // Domyślne zachowanie (powrót do kalendarza)
            renderHistoryScreen();
        }
    });
    
    const contentContainer = screens.dayDetails.querySelector('#day-details-content');
    contentContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.delete-session-btn');
        if (btn) {
            const sessionId = btn.dataset.sessionId;
            if (!confirm('Czy na pewno chcesz trwale usunąć ten trening?')) return;

            showLoader();
            try {
                await dataStore.deleteSession(sessionId);
                state.userProgress[isoDate] = state.userProgress[isoDate].filter(s => String(s.sessionId) !== String(sessionId));

                if (state.userProgress[isoDate].length > 0) {
                    renderDayDetailsScreen(isoDate);
                } else {
                    delete state.userProgress[isoDate];
                    renderHistoryScreen();
                }
            } catch (error) {
                console.error("Deletion failed:", error);
            } finally {
                hideLoader();
            }
        }
    });
    
    navigateTo('dayDetails');
};
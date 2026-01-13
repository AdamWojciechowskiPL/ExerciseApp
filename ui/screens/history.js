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
        headerContainer.innerHTML = `<span style="vertical-align: middle;">${date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span><button id="refresh-history-btn" style="background:none; border:none; cursor:pointer; margin-left:10px; vertical-align: middle; opacity: 0.6;" title="Odśwież"><svg width="16" height="16"><use href="#icon-refresh-cw"/></svg></button>`;
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
    `;

    const backBtn = screens.dayDetails.querySelector('#details-back-btn');
    backBtn.addEventListener('click', () => {
        if (customBackAction) { customBackAction(); } else { renderHistoryScreen(); }
    });

    const contentContainer = screens.dayDetails.querySelector('#day-details-content');

    contentContainer.addEventListener('click', async (e) => {
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

        const resetBtn = e.target.closest('.reset-diff-btn');
        if (resetBtn) {
            e.stopPropagation();
            if (!confirm("Czy na pewno cofnąć oznaczenie trudności? Spowoduje to przywrócenie poprzedniego wariantu ćwiczenia.")) return;

            const id = resetBtn.dataset.id;
            const allResetButtons = contentContainer.querySelectorAll(`.reset-diff-btn[data-id="${id}"]`);
            allResetButtons.forEach(btn => btn.style.display = 'none');

            if (state.userPreferences[id]) state.userPreferences[id].difficulty = 0;

            try {
                await dataStore.updatePreference(id, 'reset_difficulty');
                console.log("Difficulty reset successful");
            } catch (err) {
                console.error("Failed to reset difficulty:", err);
                allResetButtons.forEach(btn => btn.style.display = 'inline-block');
                alert("Błąd połączenia. Spróbuj ponownie.");
            }
            return;
        }

        const rateBtn = e.target.closest('.rate-btn-hist');
        if (rateBtn) {
            e.stopPropagation();

            const id = rateBtn.dataset.id;
            const action = rateBtn.dataset.action;
            const SCORE_LIKE = 15;
            const SCORE_DISLIKE = -30;

            // Efekt wizualny kliknięcia
            rateBtn.classList.add('active');
            setTimeout(() => rateBtn.classList.remove('active'), 300);

            // Optimistic update of the badge
            const row = rateBtn.closest('.history-exercise-row');
            if (row) {
                const badge = row.querySelector(`#score-${id}`);
                if (badge) {
                    let currentScore = parseInt(badge.textContent.replace(/[^\d-]/g, ''), 10) || 0;
                    if (action === 'like') currentScore = Math.min(100, currentScore + SCORE_LIKE);
                    else currentScore = Math.max(-100, currentScore + SCORE_DISLIKE);

                    let scoreColor = '#999';
                    let scorePrefix = '';
                    if (currentScore >= 75) { scoreColor = 'var(--gold-color)'; scorePrefix = '👑 '; }
                    else if (currentScore > 0) { scoreColor = 'var(--success-color)'; scorePrefix = '+'; }
                    else if (currentScore < 0) { scoreColor = 'var(--danger-color)'; }

                    badge.style.color = scoreColor;
                    badge.textContent = `${scorePrefix}${currentScore}`;
                }
            }

            try {
                // Wywołanie endpointu z nową logiką (+15/-30)
                await dataStore.updatePreference(id, action);
            } catch (err) {
                console.error("Błąd aktualizacji preferencji:", err);
                alert("Błąd zapisu.");
            }
        }
    });

    navigateTo('dayDetails');
};
// js/ui/screens/history.js
import { state } from '../../state.js';
import { containers, screens } from '../../dom.js';
import { getISODate } from '../../utils.js';
import { showLoader, hideLoader, navigateTo } from '../core.js';
import { generateSessionCardHTML } from '../templates.js';
import dataStore from '../../dataStore.js';

// Importujemy helpery do generowania badge'a punktowego
import { getAffinityBadge } from '../templates.js';

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

    // === DELEGACJA ZDARZEŃ W HISTORII ===
    contentContainer.addEventListener('click', async (e) => {

        // 1. USUWANIE SESJI
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

        // 2. PRZYCISKI OCEN (RATE BTN) - LOGIKA TOGGLE & SYNC
        const rateBtn = e.target.closest('.rate-btn-hist');
        if (rateBtn) {
            e.stopPropagation();

            const exerciseId = rateBtn.dataset.id; // To ID jest wspólne dla wszystkich serii tego ćwiczenia
            const action = rateBtn.dataset.action; // 'like' | 'dislike' | 'hard' | 'easy'
            const isAffinity = rateBtn.classList.contains('affinity-btn'); // Kciuki
            const isDifficulty = rateBtn.classList.contains('diff-btn'); // Ogień/Sen

            // Znajdujemy WSZYSTKIE wystąpienia tego ćwiczenia w widoku (wszystkie serie)
            // Używamy querySelectorAll na kontenerze szczegółów dnia
            const allRowsForExercise = contentContainer.querySelectorAll(`.rating-card[data-id="${exerciseId}"]`);

            if (isAffinity) {
                // --- LOGIKA PUNKTACJI (SCORE) ---
                const SCORE_LIKE = 15;
                const SCORE_DISLIKE = 30; // Backend odejmuje 30, więc undo dodaje 30

                // Sprawdzamy stan klikniętego przycisku (czy wyłączamy go?)
                const isTurningOff = rateBtn.classList.contains('active');

                // Sprawdzamy czy przeciwny przycisk był aktywny (np. klikam Like, a Dislike był włączony)
                // Wystarczy sprawdzić stan w bieżącym wierszu (bo są zsynchronizowane)
                const currentRow = rateBtn.closest('.rating-card');
                const siblingBtn = action === 'like'
                    ? currentRow.querySelector('[data-action="dislike"]')
                    : currentRow.querySelector('[data-action="like"]');
                const isSwitching = siblingBtn && siblingBtn.classList.contains('active');

                // Obliczamy zmianę punktów (Delta)
                let delta = 0;

                if (action === 'like') {
                    if (isTurningOff) {
                        delta = -SCORE_LIKE; // Cofamy Like (-15)
                    } else {
                        delta = SCORE_LIKE; // Dodajemy Like (+15)
                        if (isSwitching) delta += SCORE_DISLIKE; // Cofamy Dislike (+30) -> razem +45
                    }
                } else if (action === 'dislike') {
                    if (isTurningOff) {
                        delta = SCORE_DISLIKE; // Cofamy Dislike (+30)
                    } else {
                        delta = -SCORE_DISLIKE; // Odejmujemy Dislike (-30)
                        if (isSwitching) delta -= SCORE_LIKE; // Cofamy Like (-15) -> razem -45
                    }
                }

                // Aplikujemy zmianę do globalnego stanu
                let currentScore = state.userPreferences[exerciseId]?.score || 0;
                let newScore = currentScore + delta;
                // Clamp do zakresu -100..100
                newScore = Math.max(-100, Math.min(100, newScore));
                if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = {};
                state.userPreferences[exerciseId].score = newScore;

                // Synchronizacja wizualna WSZYSTKICH serii
                allRowsForExercise.forEach(row => {
                    const likeBtn = row.querySelector('[data-action="like"]');
                    const dislikeBtn = row.querySelector('[data-action="dislike"]');

                    // Reset
                    likeBtn.classList.remove('active');
                    dislikeBtn.classList.remove('active');

                    // Set new state
                    if (!isTurningOff) {
                        if (action === 'like') likeBtn.classList.add('active');
                        if (action === 'dislike') dislikeBtn.classList.add('active');
                    }

                    // Update Badge HTML
                    const headerDiv = row.querySelector('div[style*="display:flex; align-items:center; gap:6px"]');
                    if (headerDiv) {
                        // Usuwamy stare
                        const oldBadge = headerDiv.querySelector('.affinity-badge');
                        const oldRawScore = headerDiv.querySelector('span[style*="font-weight:800"]'); // [score]
                        if(oldBadge) oldBadge.remove();
                        if(oldRawScore) oldRawScore.remove();

                        // Generujemy nowe
                        const newBadgeHtml = getAffinityBadge(exerciseId); // Korzysta ze zaktualizowanego stanu
                        let scoreText = newScore > 0 ? `+${newScore}` : `${newScore}`;
                        let scoreColor = '#6b7280';
                        if (newScore > 0) scoreColor = '#10b981';
                        if (newScore < 0) scoreColor = '#ef4444';
                        const newRawScoreHtml = `<span style="font-size:0.75rem; font-weight:800; color:${scoreColor}; margin-left:4px;">[${scoreText}]</span>`;

                        headerDiv.insertAdjacentHTML('beforeend', newBadgeHtml + newRawScoreHtml);
                    }
                });

                // Send Absolute Value to Backend (Bezpieczniejsze niż przyrostowe)
                try {
                    await dataStore.updatePreference(exerciseId, 'set', newScore);
                    console.log(`[History] Zaktualizowano punkty: ${newScore} dla ${exerciseId} (Action: ${action})`);
                } catch (err) {
                    console.error("Błąd zapisu punktów:", err);
                }

            } else if (isDifficulty) {
                // --- LOGIKA TRUDNOŚCI (DIFFICULTY) ---
                // Tu wartości to flagi: -1 (easy), 0 (ok), 1 (hard)
                const isTurningOff = rateBtn.classList.contains('selected');
                let newValue = 0;

                if (!isTurningOff) {
                    newValue = (action === 'easy') ? -1 : 1;
                }

                // Aktualizuj stan lokalny
                if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = {};
                state.userPreferences[exerciseId].difficulty = newValue;

                // Synchronizacja wizualna
                allRowsForExercise.forEach(row => {
                    const easyBtn = row.querySelector('[data-action="easy"]');
                    const hardBtn = row.querySelector('[data-action="hard"]');

                    easyBtn.classList.remove('selected');
                    hardBtn.classList.remove('selected');

                    if (newValue === -1) easyBtn.classList.add('selected');
                    if (newValue === 1) hardBtn.classList.add('selected');
                });

                // Send to Backend
                try {
                    const backendAction = (newValue === 0) ? 'reset_difficulty' : 'set_difficulty';
                    await dataStore.updatePreference(exerciseId, backendAction, newValue);
                    console.log(`[History] Zaktualizowano trudność: ${newValue} dla ${exerciseId}`);
                } catch (err) {
                    console.error("Błąd zapisu trudności:", err);
                }
            }
        }
    });

    navigateTo('dayDetails');
};
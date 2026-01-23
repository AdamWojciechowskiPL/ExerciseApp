// js/ui/screens/history.js
import { state } from '../../state.js';
import { containers, screens } from '../../dom.js';
import { getISODate } from '../../utils.js';
import { showLoader, hideLoader, navigateTo } from '../core.js';
import { generateSessionCardHTML } from '../templates.js';
import dataStore from '../../dataStore.js';
import { getAffinityBadge } from '../templates.js';
import { renderDetailAssessmentModal } from '../modals.js'; // Import Modala

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
        let startDay = firstDayOfMonth.getDay();
        if (startDay === 0) startDay = 7;

        for (let i = 1; i < startDay; i++) { grid.innerHTML += `<div class="calendar-day other-month"></div>`; }

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

            if (isoDate === todayISO) { dayEl.classList.add('today'); }

            dayEl.innerHTML = `<div class="day-number">${i}</div>`;

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

        // 1. USUWANIE SESJI
        const delBtn = e.target.closest('.delete-session-btn');
        if (delBtn) {
            const sessionId = delBtn.dataset.sessionId;
            if (!confirm('Czy na pewno chcesz trwale usunąć ten trening?')) return;
            showLoader();
            try {
                await dataStore.deleteSession(sessionId);
                state.userProgress[isoDate] = state.userProgress[isoDate].filter(s => String(s.sessionId) !== String(sessionId));
                await dataStore.initialize();

                if (state.userProgress[isoDate].length > 0) {
                    renderDayDetailsScreen(isoDate);
                } else {
                    delete state.userProgress[isoDate];
                    renderHistoryScreen();
                }
            } catch (error) {
                console.error("Deletion failed:", error);
                alert("Wystąpił błąd podczas usuwania.");
            } finally {
                hideLoader();
            }
            return;
        }

        // 2. EDYCJA PARAMETRÓW AMPS (TECH/RIR) - ZAPIS DO BAZY
        const ampsBadge = e.target.closest('.amps-inline-badge');
        if (ampsBadge) {
            e.stopPropagation();
            
            // Pobieramy ID sesji z kontekstu (z DELETE button w tej samej karcie)
            const sessionCard = ampsBadge.closest('.workout-context-card');
            const deleteBtn = sessionCard ? sessionCard.querySelector('.delete-session-btn') : null;
            const sessionId = deleteBtn ? deleteBtn.dataset.sessionId : null;

            const row = ampsBadge.closest('.rating-card');
            const exerciseId = row ? row.dataset.id : null;
            const ratingNameEl = row ? row.querySelector('.rating-name') : null;
            const exerciseName = ratingNameEl ? ratingNameEl.innerText : "Ćwiczenie";

            if (sessionId && exerciseId) {
                renderDetailAssessmentModal(exerciseName, async (newTech, newRir) => {
                    // Optymistyczna aktualizacja UI
                    const icon = (newRir === 0) ? '👎' : ((newRir >= 3) ? '👍' : '👌');
                    const originalContent = ampsBadge.innerHTML;
                    ampsBadge.innerHTML = `<span class="pulsate-slow">⏳ Zapisuję...</span>`;

                    try {
                        const res = await dataStore.updateExerciseLog(sessionId, exerciseId, newTech, newRir);
                        if (res) {
                            ampsBadge.innerHTML = `${icon} T:${newTech} RIR:${newRir}`;
                            ampsBadge.style.backgroundColor = "#dcfce7"; // Zielonkawy sukces
                            setTimeout(() => ampsBadge.style.backgroundColor = "", 1000);
                        } else {
                            throw new Error("Brak odpowiedzi");
                        }
                    } catch (err) {
                        console.error("AMPS Update Failed:", err);
                        alert("Nie udało się zapisać oceny.");
                        ampsBadge.innerHTML = originalContent;
                    }
                });
            }
            return;
        }

        // 3. PRZYCISKI OCEN (KCIUKI/TRUDNOŚĆ) - ISTNIEJĄCA LOGIKA + FIX UI
        const rateBtn = e.target.closest('.rate-btn-hist');
        if (rateBtn) {
            e.stopPropagation();
            const exerciseId = rateBtn.dataset.id;
            const action = rateBtn.dataset.action;
            const isAffinity = rateBtn.classList.contains('affinity-btn');
            const allRowsForExercise = contentContainer.querySelectorAll(`.rating-card[data-id="${exerciseId}"]`);

            if (isAffinity) {
                const SCORE_LIKE = 15;
                const SCORE_DISLIKE = 30;
                const isTurningOff = rateBtn.classList.contains('active');
                const currentRow = rateBtn.closest('.rating-card');
                const siblingBtn = action === 'like' ? currentRow.querySelector('[data-action="dislike"]') : currentRow.querySelector('[data-action="like"]');
                const isSwitching = siblingBtn && siblingBtn.classList.contains('active');
                let delta = 0;

                if (action === 'like') {
                    if (isTurningOff) delta = -SCORE_LIKE;
                    else { delta = SCORE_LIKE; if (isSwitching) delta += SCORE_DISLIKE; }
                } else if (action === 'dislike') {
                    if (isTurningOff) delta = SCORE_DISLIKE;
                    else { delta = -SCORE_DISLIKE; if (isSwitching) delta -= SCORE_LIKE; }
                }

                let currentScore = state.userPreferences[exerciseId]?.score || 0;
                let newScore = Math.max(-100, Math.min(100, currentScore + delta));
                if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = {};
                state.userPreferences[exerciseId].score = newScore;

                allRowsForExercise.forEach(row => {
                    const likeBtn = row.querySelector('[data-action="like"]');
                    const dislikeBtn = row.querySelector('[data-action="dislike"]');
                    likeBtn.classList.remove('active');
                    dislikeBtn.classList.remove('active');
                    if (!isTurningOff) {
                        if (action === 'like') likeBtn.classList.add('active');
                        if (action === 'dislike') dislikeBtn.classList.add('active');
                    }

                    // FIX: Aktualizacja spanu z wynikiem
                    const scoreSpan = row.querySelector('.dynamic-score-val');
                    let scoreText = newScore > 0 ? `+${newScore}` : `${newScore}`;
                    let scoreColor = newScore > 0 ? '#10b981' : (newScore < 0 ? '#ef4444' : '#6b7280');

                    if (scoreSpan) {
                        scoreSpan.textContent = newScore !== 0 ? `[${scoreText}]` : '';
                        scoreSpan.style.color = scoreColor;
                    }
                });

                try { await dataStore.updatePreference(exerciseId, 'set', newScore); } catch (err) { console.error("Błąd zapisu punktów:", err); }
            }
        }
    });

    navigateTo('dayDetails');
};
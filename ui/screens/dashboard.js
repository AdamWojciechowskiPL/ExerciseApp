// ExerciseApp/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getHydratedDay, getISODate, calculateSmartDuration, calculateSystemLoad, savePlanToStorage } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import {
    generateHeroDashboardHTML,
    generateCalendarPageHTML,
    generateRestCalendarPageHTML,
    generateCompletedMissionCardHTML,
    generateSkeletonDashboardHTML
} from '../templates.js';
import { renderPreTrainingScreen, renderProtocolStart } from './training.js';
import { renderDayDetailsScreen } from './history.js';
import { generateBioProtocol } from '../../protocolGenerator.js';
import { renderMoveDayModal, renderDetailAssessmentModal } from '../modals.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js';

// --- POMOCNICZE FUNKCJE STORAGE ---
// savePlanToStorage is now imported from utils.js

const getStorageKey = (date) => `todays_plan_cache_${date}`;

export const clearPlanFromStorage = () => {
    const today = getISODate(new Date());
    try {
        localStorage.removeItem(getStorageKey(today));
        state.todaysDynamicPlan = null;
    } catch (e) { console.error("Błąd czyszczenia planu:", e); }
};

// --- LOGIKA MODYFIKACJI PLANU ---

const savePlanToDB = async (planData) => {
    state.settings.dynamicPlanData = planData;
    try {
        await dataStore.saveSettings();
        return true;
    } catch (e) {
        console.error("Błąd zapisu planu do DB:", e);
        alert("Nie udało się zapisać zmian w chmurze. Spróbuj ponownie.");
        return false;
    }
};

const handleTurnToRest = async (dayDateISO) => {
    if (!confirm("Czy na pewno chcesz anulować ten trening i zamienić go na dzień regeneracji?")) return;

    showLoader();
    const plan = JSON.parse(JSON.stringify(state.settings.dynamicPlanData));
    const dayIndex = plan.days.findIndex(d => d.date === dayDateISO);

    if (dayIndex > -1) {
        plan.days[dayIndex].type = 'rest';
        plan.days[dayIndex].title = 'Regeneracja (Manualnie)';
        plan.days[dayIndex].warmup = [];
        plan.days[dayIndex].main = [];
        plan.days[dayIndex].cooldown = [];
        delete plan.days[dayIndex].estimatedDurationMin;

        const success = await savePlanToDB(plan);
        if (success) {
            clearPlanFromStorage();
            setTimeout(async () => {
                if (confirm("Zmodyfikowałeś ten dzień. Czy chcesz przeliczyć pozostałe dni planu?")) {
                    showLoader();
                    const payload = JSON.parse(JSON.stringify(state.settings.wizardData || {}));
                    if (!payload.forced_rest_dates) payload.forced_rest_dates = [];
                    if (!payload.forced_rest_dates.includes(dayDateISO)) {
                        payload.forced_rest_dates.push(dayDateISO);
                    }
                    await dataStore.generateDynamicPlan(payload);
                }
                hideLoader();
                renderMainScreen(false);
            }, 100);
        } else {
            hideLoader();
        }
    } else {
        hideLoader();
    }
};

const handleMoveDay = (sourceDateISO) => {
    const plan = state.settings.dynamicPlanData;
    const todayISO = getISODate(new Date());

    const availableTargets = plan.days.filter(d =>
        d.type === 'rest' &&
        d.date !== sourceDateISO &&
        d.date >= todayISO
    );

    if (availableTargets.length === 0) {
        alert("Brak wolnych dni w bieżącym cyklu (od dzisiaj w górę), na które można przenieść trening.");
        return;
    }

    renderMoveDayModal(availableTargets, async (targetDateISO) => {
        showLoader();
        const newPlan = JSON.parse(JSON.stringify(plan));
        const sourceIndex = newPlan.days.findIndex(d => d.date === sourceDateISO);
        const targetIndex = newPlan.days.findIndex(d => d.date === targetDateISO);

        if (sourceIndex > -1 && targetIndex > -1) {
            const sourceDayContent = newPlan.days[sourceIndex];
            const targetDayContent = newPlan.days[targetIndex];

            const tempSourceContent = { ...sourceDayContent };
            delete tempSourceContent.date;
            delete tempSourceContent.dayNumber;

            const tempTargetContent = { ...targetDayContent };
            delete tempTargetContent.date;
            delete tempTargetContent.dayNumber;

            Object.assign(newPlan.days[targetIndex], tempSourceContent);
            Object.assign(newPlan.days[sourceIndex], tempTargetContent);

            const success = await savePlanToDB(newPlan);
            if (success) {
                clearPlanFromStorage();
                setTimeout(async () => {
                    if (confirm("Trening został przeniesiony. Czy chcesz przeliczyć pozostałe dni planu?")) {
                        showLoader();
                        await dataStore.generateDynamicPlan(state.settings.wizardData);
                    }
                    hideLoader();
                    renderMainScreen(false);
                }, 100);
            } else {
                hideLoader();
            }
        } else {
            hideLoader();
        }
    });
};

const handleResetPlan = async () => {
    if (!confirm("Czy na pewno chcesz zresetować wszystkie manualne zmiany i wygenerować plan na nowo?")) return;
    showLoader();
    try {
        const cleanPayload = { ...state.settings.wizardData };
        if (cleanPayload.forced_rest_dates) {
            cleanPayload.forced_rest_dates = [];
        }

        await dataStore.generateDynamicPlan(cleanPayload);
        clearPlanFromStorage();
        hideLoader();
        renderMainScreen(false);
    } catch (e) {
        hideLoader();
        alert("Błąd resetowania planu: " + e.message);
        renderMainScreen(false);
    }
};

// --- GLOBAL CONTEXT MENU MANAGER ---

let globalMenu = null;

const createGlobalMenu = () => {
    if (globalMenu) return globalMenu;
    globalMenu = document.createElement('div');
    globalMenu.className = 'global-ctx-menu';
    document.body.appendChild(globalMenu);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.global-ctx-menu') && !e.target.closest('.ctx-menu-btn')) {
            closeGlobalMenu();
        }
    });

    globalMenu.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.ctx-action');
        if (actionBtn) {
            e.stopPropagation();
            const action = actionBtn.dataset.action;
            const date = actionBtn.dataset.date;
            const dayId = actionBtn.dataset.dayId;

            closeGlobalMenu();

            if (action === 'preview') {
                renderPreTrainingScreen(parseInt(dayId, 10), 3, true);
            }
            if (action === 'rest') handleTurnToRest(date);
            if (action === 'move') handleMoveDay(date);
            if (action === 'reset') handleResetPlan();
        }
    });

    return globalMenu;
};

const openGlobalMenu = (targetElement, dateISO, isRest, dayNumber) => {
    const menu = createGlobalMenu();

    let content = '';
    if (!isRest) {
        content += `<button class="ctx-action" data-action="preview" data-day-id="${dayNumber}">
            <svg width="18" height="18" aria-hidden="true"><use href="#icon-eye"/></svg>
            <span>👁️ Podgląd</span>
        </button>`;
        content += `<button class="ctx-action" data-action="rest" data-date="${dateISO}">
            <svg width="18" height="18" aria-hidden="true"><use href="#icon-rest-coffee"/></svg>
            <span>Zmień na Wolne</span>
        </button>`;
        content += `<button class="ctx-action" data-action="move" data-date="${dateISO}">
            <svg width="18" height="18" aria-hidden="true"><use href="#icon-calendar-move"/></svg>
            <span>Przenieś...</span>
        </button>`;
    }
    content += `<button class="ctx-action" data-action="reset">
        <svg width="18" height="18" aria-hidden="true"><use href="#icon-reset-ccw"/></svg>
        <span>Resetuj Plan</span>
    </button>`;

    menu.innerHTML = content;

    const rect = targetElement.getBoundingClientRect();
    const menuWidth = 200;

    let left = rect.right - menuWidth;
    if (rect.width > 100) {
        left = rect.left + (rect.width / 2) - (menuWidth / 2);
    }

    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }

    let top = rect.bottom + 5;
    if (top + 200 > window.innerHeight) {
        top = rect.top - 5 - menu.offsetHeight;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.add('active');
};

const closeGlobalMenu = () => {
    if (globalMenu) globalMenu.classList.remove('active');
};

function attachLongPressHandlers(element, dataCallback) {
    let timer = null;
    let startY = 0;
    const LONG_PRESS_DURATION = 600;

    element.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        timer = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            element.dataset.longPressTriggered = "true";
            const data = dataCallback();
            openGlobalMenu(element, data.date, data.isRest, data.dayId);
        }, LONG_PRESS_DURATION);
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
        const moveY = e.touches[0].clientY;
        if (Math.abs(moveY - startY) > 10) {
            clearTimeout(timer);
        }
    }, { passive: true });

    element.addEventListener('touchend', () => {
        clearTimeout(timer);
        setTimeout(() => {
            delete element.dataset.longPressTriggered;
        }, 100);
    });

    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    });
}

// --- GŁÓWNA FUNKCJA RENDERUJĄCA ---

export const renderMainScreen = async (isLoading = false) => {
    if (!containers.days._hasDashboardListeners) {
        containers.days.addEventListener('click', (e) => {
            const btn = e.target.closest('.ctx-menu-btn');
            if (btn) {
                e.stopPropagation();
                e.preventDefault();
                const date = btn.dataset.date;
                const isRest = btn.dataset.isRest === 'true';
                const dayId = btn.dataset.dayId;
                openGlobalMenu(btn, date, isRest, dayId);
            }
        });
        containers.days._hasDashboardListeners = true;
    }

    if (isLoading) {
        const heroContainer = document.getElementById('hero-dashboard');
        if (heroContainer) {
            heroContainer.classList.remove('hidden');
            heroContainer.innerHTML = generateHeroDashboardHTML({ resilience: null });
        }
        containers.days.innerHTML = generateSkeletonDashboardHTML();
        navigateTo('main');
        return;
    }

    const wizardData = state.settings.wizardData;
    const hasWizardData = wizardData && Object.keys(wizardData).length > 0;

    if (!hasWizardData) {
        containers.days.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <h3>Witaj w Virtual Physio</h3>
                <p>Nie mamy Twoich danych. Wypełnij ankietę, aby wygenerować program.</p>
                <button id="start-wizard-btn" class="action-btn" style="margin-top:1rem;">Uruchom Kreatora</button>
            </div>
        `;
        document.getElementById('start-wizard-btn').addEventListener('click', () => initWizard(true));
        renderHero();
        renderBioHub();
        return;
    }

    const dynamicPlan = state.settings.dynamicPlanData;
    const today = new Date();
    const todayISO = getISODate(today);

    let todayPlanEntry = null;
    if (dynamicPlan && dynamicPlan.days) {
        todayPlanEntry = dynamicPlan.days.find(d => d.date === todayISO);
    }

    if (!todayPlanEntry) {
        console.log(`[Dashboard] Brak planu na ${todayISO}. Rolling Update...`);
        containers.days.innerHTML = generateSkeletonDashboardHTML();
        try {
            await dataStore.generateDynamicPlan(wizardData);
            return renderMainScreen(false);
        } catch (e) {
            console.error(e);
            containers.days.innerHTML = `<div class="error-msg">Błąd aktualizacji planu.</div>`;
            return;
        }
    }

    renderHero();
    containers.days.innerHTML = '';

    const todaysSessions = state.userProgress[todayISO] || [];
    const completedSession = todaysSessions.find(s => s.status === 'completed');

    const getMenuBtn = (date, isRest, dayNum) => `
        <div class="ctx-menu-wrapper" style="position: absolute; top: 10px; right: 10px; z-index: 20;">
            <button class="ctx-menu-btn"
                aria-label="Opcje"
                data-date="${date}"
                data-is-rest="${isRest}"
                data-day-id="${dayNum}">
                <svg width="24" height="24" aria-hidden="true"><use href="#icon-dots-vertical"/></svg>
            </button>
        </div>
    `;

    if (completedSession) {
        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        missionWrapper.innerHTML = generateCompletedMissionCardHTML(completedSession);
        containers.days.appendChild(missionWrapper);
        clearPlanFromStorage();

        // 1. Nawigacja do szczegółów
        const detailsBtn = missionWrapper.querySelector('.view-details-btn');
        if (detailsBtn) detailsBtn.addEventListener('click', () => renderDayDetailsScreen(todayISO, () => { navigateTo('main'); renderMainScreen(); }));

        // 2. Event Listener dla Karty (Delegacja Zdarzeń)
        missionWrapper.addEventListener('click', async (e) => {

            // --- A. EDYCJA PARAMETRÓW AMPS (BADGE: RIR/TECH) ---
            const ampsBadge = e.target.closest('.amps-inline-badge');
            if (ampsBadge) {
                e.stopPropagation();

                // Szukamy ID sesji (pobieramy z przycisku usuwania, który jest renderowany w generateCompletedMissionCardHTML)
                const deleteBtn = missionWrapper.querySelector('.delete-session-btn');
                const sessionId = deleteBtn ? deleteBtn.dataset.sessionId : completedSession.sessionId;

                const row = ampsBadge.closest('.rating-card');
                const exerciseId = row ? row.dataset.id : null;
                const ratingNameEl = row ? row.querySelector('.rating-name') : null;
                const exerciseName = ratingNameEl ? ratingNameEl.innerText : "Ćwiczenie";

                if (sessionId && exerciseId) {
                    renderDetailAssessmentModal(exerciseName, async (newTech, newRir) => {
                        // Optymistyczna aktualizacja UI
                        const icon = (newRir === 0) ? '👎' : ((newRir >= 3) ? '👍' : '👌');
                        const originalContent = ampsBadge.innerHTML;

                        ampsBadge.innerHTML = `<span class="pulsate-slow" style="font-size:0.6rem">⏳ Zapis...</span>`;

                        try {
                            const res = await dataStore.updateExerciseLog(sessionId, exerciseId, newTech, newRir);
                            if (res) {
                                ampsBadge.innerHTML = `${icon} T:${newTech} RIR:${newRir}`;
                                ampsBadge.style.backgroundColor = "#dcfce7"; // Sukces
                                ampsBadge.style.borderColor = "#bbf7d0";
                                setTimeout(() => {
                                    ampsBadge.style.backgroundColor = "#f1f5f9"; // Powrót do standardu
                                    ampsBadge.style.borderColor = "#e2e8f0";
                                }, 1500);
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

            // --- C. DEVIATION BUTTONS (DASHBOARD) ---
            const deviationBtn = e.target.closest('.deviation-btn-hist');
            if (deviationBtn) {
                e.stopPropagation();

                const uniqueId = deviationBtn.dataset.uniqueId;
                const type = deviationBtn.dataset.type; // 'easy' or 'hard'
                const isActive = deviationBtn.classList.contains('active');
                const card = deviationBtn.closest('.rating-card');
                const deviationGroup = card.querySelector('.difficulty-deviation-group');
                const difficultyIndicator = card.querySelector('.difficulty-indicator');

                // Toggle all buttons in this group off first
                deviationGroup.querySelectorAll('.deviation-btn-hist').forEach(btn => btn.classList.remove('active'));

                if (!isActive) {
                    // Activate this button
                    deviationBtn.classList.add('active');

                    // Update the difficulty indicator
                    if (difficultyIndicator) {
                        if (type === 'easy') {
                            difficultyIndicator.textContent = '⬆️ Łatwe';
                            difficultyIndicator.style.background = '#ecfdf5';
                            difficultyIndicator.style.color = '#166534';
                            difficultyIndicator.style.borderColor = '#10b981';
                        } else if (type === 'hard') {
                            difficultyIndicator.textContent = '⬇️ Trudne';
                            difficultyIndicator.style.background = '#fef2f2';
                            difficultyIndicator.style.color = '#991b1b';
                            difficultyIndicator.style.borderColor = '#ef4444';
                        }
                    }

                    const sessionId = card.dataset.sessionId;
                    const exerciseId = card.dataset.id;

                    if (sessionId) {
                        let newRir = undefined;
                        let newRating = undefined;
                        if (type === 'easy') { newRir = 4; newRating = 'good'; }
                        else if (type === 'hard') { newRir = 0; newRating = 'hard'; }

                        dataStore.updateExerciseLog(sessionId, exerciseId, undefined, newRir, type, newRating)
                            .then(res => { if (!res) console.warn("Dash Update might have failed"); })
                            .catch(err => console.error("Dash deviation update failed:", err));
                    }
                } else {
                    // Reset to OK
                    if (difficultyIndicator) {
                        difficultyIndicator.textContent = '👌 OK';
                        difficultyIndicator.style.background = '#f8fafc';
                        difficultyIndicator.style.color = '#64748b';
                        difficultyIndicator.style.borderColor = '#e2e8f0';
                    }

                    const sessionId = card.dataset.sessionId;
                    const exerciseId = card.dataset.id;

                    if (sessionId) {
                        dataStore.updateExerciseLog(sessionId, exerciseId, undefined, 2, null, 'ok')
                            .catch(err => console.error("Dash deviation reset failed:", err));
                    }
                }
                return;
            }

            // --- B. OBSŁUGA KCIUKÓW (AFFINITY RATING) ---
            const rateBtn = e.target.closest('.rate-btn-hist');
            if (rateBtn) {
                e.stopPropagation();
                const exerciseId = rateBtn.dataset.id;
                const action = rateBtn.dataset.action;
                const isAffinity = rateBtn.classList.contains('affinity-btn');
                const allRowsForExercise = missionWrapper.querySelectorAll(`.rating-card[data-id="${exerciseId}"]`);

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

    } else if (todayPlanEntry.type === 'rest') {
        const cardWrapper = document.createElement('div');
        cardWrapper.style.position = 'relative';
        cardWrapper.innerHTML = generateRestCalendarPageHTML(today);
        cardWrapper.insertAdjacentHTML('beforeend', getMenuBtn(todayISO, true, todayPlanEntry.dayNumber));
        containers.days.appendChild(cardWrapper);
        clearPlanFromStorage();

        cardWrapper.querySelector('#force-workout-btn').addEventListener('click', () => {
            try {
                const recoveryProtocol = generateBioProtocol({
                    mode: 'reset',
                    focusZone: 'full_body',
                    durationMin: 15,
                    userContext: state.settings.wizardData || {}
                });
                recoveryProtocol.title = "Dodatkowa Regeneracja";
                recoveryProtocol.description = "Lekka sesja mobilności wygenerowana na żądanie.";
                renderProtocolStart(recoveryProtocol);
            } catch (err) {
                console.error("Błąd generowania recovery:", err);
                const bioHub = document.querySelector('.bio-hub-container');
                if (bioHub) bioHub.scrollIntoView({ behavior: 'smooth' });
            }
        });

    } else {
        let finalPlan = getHydratedDay(todayPlanEntry);
        finalPlan.planId = dynamicPlan.id;
        state.todaysDynamicPlan = finalPlan;
        state.currentTrainingDayId = todayPlanEntry.dayNumber;
        savePlanToStorage(finalPlan, todayISO);

        // Usuwamy pre-kalkulowany czas z obiektu, aby wymusić świeże obliczenia już na starcie
        if (finalPlan.estimatedDurationMin) delete finalPlan.estimatedDurationMin;

        let estimatedMinutes = calculateSmartDuration(finalPlan);

        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        missionWrapper.innerHTML = generateCalendarPageHTML(finalPlan, estimatedMinutes, today, wizardData);

        const cardContainer = missionWrapper.querySelector('.calendar-sheet');
        if (cardContainer) {
            cardContainer.style.position = 'relative';
            cardContainer.insertAdjacentHTML('beforeend', getMenuBtn(todayISO, false, todayPlanEntry.dayNumber));
        }

        containers.days.appendChild(missionWrapper);

        const cardEl = missionWrapper.querySelector('.calendar-sheet');
        const startBtn = cardEl.querySelector('#start-mission-btn');
        const painOptions = cardEl.querySelectorAll('.pain-option');

        painOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                painOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                const painLevel = parseInt(opt.dataset.level, 10);

                // 1. Przeliczenie planu przez Asystenta
                const checkPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                const isSOS = checkPlan?._modificationInfo?.shouldSuggestSOS;

                // --- FIX: WYMUSZENIE PRZELICZENIA CZASU ---
                // Usuwamy właściwość estimatedDurationMin, jeśli została skopiowana
                if (checkPlan.estimatedDurationMin) delete checkPlan.estimatedDurationMin;

                // 2. Aktualizacja Czasu
                const newDuration = calculateSmartDuration(checkPlan);
                const timeDisplay = document.getElementById('today-time-val');
                if (timeDisplay) timeDisplay.textContent = `${newDuration} min`;

                // 3. Aktualizacja Obciążenia (Load)
                const newLoad = calculateSystemLoad(checkPlan);
                const gridItems = cardEl.querySelectorAll('div[style*="background: rgba(255,255,255,0.6)"]');
                const loadTile = gridItems[2];

                if (loadTile) {
                    let loadColor = '#4ade80';
                    let loadLabel = 'Lekki';
                    if (newLoad > 30) { loadColor = '#facc15'; loadLabel = 'Umiarkowany'; }
                    if (newLoad > 60) { loadColor = '#fb923c'; loadLabel = 'Wymagający'; }
                    if (newLoad > 85) { loadColor = '#ef4444'; loadLabel = 'Maksymalny'; }

                    const loadValueSpan = loadTile.querySelector('span[style*="font-weight:600"]');
                    if (loadValueSpan) loadValueSpan.textContent = `${newLoad}%`;

                    const loadLabelSpan = loadTile.querySelector('div[style*="bottomSlotStyle"] span');
                    if (loadLabelSpan) {
                        loadLabelSpan.textContent = loadLabel;
                    }

                    const barFill = loadTile.querySelector('div[style*="width:"][style*="height:100%"]');
                    if (barFill) {
                        barFill.style.width = `${newLoad}%`;
                        barFill.style.background = loadColor;
                    }
                }

                if (isSOS) {
                    startBtn.textContent = "🏥 Aktywuj Protokół SOS";
                    startBtn.style.backgroundColor = "var(--danger-color)";
                    startBtn.dataset.mode = 'sos';
                } else {
                    startBtn.innerHTML = `<div class="btn-content-wrapper"><span class="btn-icon-bg"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span><span>Rozpocznij Trening</span></div>`;
                    startBtn.style.backgroundColor = "";
                    startBtn.dataset.mode = 'normal';
                }
                startBtn.dataset.initialPain = painLevel;
            });
        });

        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pain = parseInt(startBtn.dataset.initialPain, 10) || 0;
            if (startBtn.dataset.mode === 'sos') {
                if (confirm("Uruchomić bezpieczny Protokół SOS?")) {
                    const protocol = generateBioProtocol({
                        mode: 'sos',
                        focusZone: state.settings.wizardData?.pain_locations?.[0] || 'lumbar_general',
                        durationMin: 10,
                        userContext: state.settings.wizardData || {}
                    });
                    renderProtocolStart(protocol);
                    return;
                }
            }
            renderPreTrainingScreen(finalPlan.dayNumber, pain, true);
        });
    }

    renderUpcomingQueue(dynamicPlan.days, todayISO);
    renderBioHub();
    navigateTo('main');
};

function renderHero() {
    const heroContainer = document.getElementById('hero-dashboard');
    if (heroContainer) {
        try {
            const stats = state.userStats || {};
            const phaseData = state.settings.phase_manager;

            const combinedStats = {
                ...getGamificationState(state.userProgress),
                resilience: stats.resilience,
                streak: stats.streak,
                totalSessions: stats.totalSessions,
                level: stats.level,
                totalMinutes: stats.totalMinutes,
                fatigueScore: stats.fatigueScore,
                phaseData: phaseData
            };
            if (getIsCasting()) sendUserStats(combinedStats);
            heroContainer.classList.remove('hidden');
            heroContainer.innerHTML = generateHeroDashboardHTML(combinedStats);
        } catch (e) { console.error('[Dashboard] Błąd renderowania Hero:', e); }
    }
}
function renderBioHub() {
    const bioHubContainer = document.createElement('div');
    bioHubContainer.className = 'bio-hub-container';
    const wz = state.settings.wizardData || {};
    const protocols = [];

    const canBurn = state.userStats?.resilience?.status !== 'Critical';
    if (canBurn) protocols.push({ mode: 'burn', zone: 'metabolic', time: 15, title: 'Metabolic Burn', desc: 'Low-impact Fat Loss', icon: '🔥', styleClass: 'bio-card-booster' });

    protocols.push({ mode: 'booster', zone: 'core', time: 5, title: 'Brzuch ze stali', desc: 'Szybki obwód', icon: '⚡' });
    protocols.push({ mode: 'flow', zone: 'full_body', time: 8, title: 'Mobility Flow', desc: 'Płynny ruch całego ciała', icon: '🌊' });
    protocols.push({ mode: 'calm', zone: 'sleep', time: 10, title: 'Głęboki Reset', desc: 'Oddech i wyciszenie', icon: '🌙' });

    if (wz.work_type === 'sedentary') protocols.unshift({ mode: 'flow', zone: 'office', time: 5, title: 'Anty-Biuro', desc: 'Rozprostuj się po pracy', icon: '🪑' });
    if (wz.pain_locations?.includes('cervical')) protocols.unshift({ mode: 'sos', zone: 'cervical', time: 4, title: 'Szyja: Ratunek', desc: 'Ulga w napięciu karku', icon: '💊' });

    const cardsHTML = protocols.map(p => `
        <div class="bio-card ${p.styleClass || `bio-card-${p.mode}`}" data-mode="${p.mode}" data-zone="${p.zone}" data-time="${p.time}">
            <div class="bio-bg-icon">${p.icon}</div>
            <div class="bio-header"><span class="bio-tag">${p.mode.toUpperCase()}</span><span class="bio-duration">⏱ ${p.time} min</span></div>
            <div><div class="bio-title">${p.title}</div><div class="bio-desc">${p.desc}</div></div>
        </div>
    `).join('');

    bioHubContainer.innerHTML = `<div class="section-title bio-hub-title">PROTOKOŁY CELOWANE</div><div class="bio-hub-scroll">${cardsHTML}</div>`;
    containers.days.appendChild(bioHubContainer);

    bioHubContainer.querySelectorAll('.bio-card').forEach(card => {
        card.addEventListener('click', () => {
            try {
                const protocol = generateBioProtocol({
                    mode: card.dataset.mode,
                    focusZone: card.dataset.zone,
                    durationMin: parseInt(card.dataset.time),
                    userContext: state.settings.wizardData || {}
                });
                renderProtocolStart(protocol);
            } catch (err) { alert("Nie udało się utworzyć tej sesji: " + err.message); }
        });
    });
}

function renderUpcomingQueue(days, todayISO) {
    const futureDays = days.filter(d => d.date > todayISO);
    if (futureDays.length === 0) return;

    let upcomingHTML = `<div class="section-title upcoming-title">NADCHODZĄCE DNI</div>`;

    upcomingHTML += `<div class="calendar-strip">`;

    futureDays.slice(0, 6).forEach(dayRaw => {
        const dayData = getHydratedDay(dayRaw);
        const dateObj = new Date(dayData.date);
        const dayShort = dateObj.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase().replace('.', '');
        const dayNum = dateObj.getDate();
        const isRest = dayData.type === 'rest';

        const stripDayClass = isRest ? 'strip-day rest' : 'strip-day workout';
        const weekendClass = (dateObj.getDay() === 0 || dateObj.getDay() === 6) ? ' weekend' : '';

        const btnHtml = `
            <button class="strip-menu-btn ctx-menu-btn"
                aria-label="Opcje dnia"
                data-date="${dayData.date}"
                data-is-rest="${isRest}"
                data-day-id="${dayData.dayNumber}">
                <svg width="16" height="16" fill="currentColor" style="color: #94a3b8;" aria-hidden="true"><use href="#icon-dots-vertical"/></svg>
            </button>
        `;

        upcomingHTML += `
            <div class="${stripDayClass}${weekendClass}" data-day-id="${dayData.dayNumber}" data-is-rest="${isRest}">
                ${btnHtml}
                <span class="strip-day-name">${dayShort}</span>
                <span class="strip-day-number">${dayNum}</span>
                <div class="strip-status-dot"></div>
            </div>
        `;
    });
    upcomingHTML += `</div>`;

    const upcomingWrapper = document.createElement('div');
    upcomingWrapper.innerHTML = upcomingHTML;
    containers.days.appendChild(upcomingWrapper);

    upcomingWrapper.querySelectorAll('.strip-day').forEach(card => {
        attachLongPressHandlers(card, () => ({
            date: card.querySelector('.ctx-menu-btn').dataset.date,
            isRest: card.querySelector('.ctx-menu-btn').dataset.isRest === 'true',
            dayId: card.dataset.dayId
        }));

        if (card.dataset.isRest === 'true') return;

        card.addEventListener('click', (e) => {
            if (card.dataset.longPressTriggered === "true") return;
            if (e.target.closest('.ctx-menu-btn')) return;
            e.stopPropagation();
            renderPreTrainingScreen(parseInt(card.dataset.dayId, 10), 3, true);
        });
    });
}
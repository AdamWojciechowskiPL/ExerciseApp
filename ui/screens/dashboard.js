// ExerciseApp/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getHydratedDay, getISODate, calculateSmartDuration, calculateSystemLoad } from '../../utils.js'; // Dodany import calculateSystemLoad
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
import { renderMoveDayModal } from '../modals.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js';

// --- POMOCNICZE FUNKCJE STORAGE ---

const getStorageKey = (date) => `todays_plan_cache_${date}`;

const savePlanToStorage = (plan, date) => {
    try { localStorage.setItem(getStorageKey(date), JSON.stringify(plan)); } catch (e) { console.error("Błąd zapisu planu:", e); }
};

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
                renderPreTrainingScreen(parseInt(dayId, 10), 0, true);
            }
            if (action === 'rest') handleTurnToRest(date);
            if (action === 'move') handleMoveDay(date);
            if (action === 'reset') handleResetPlan();
        }
    });

    return globalMenu;
};

const openGlobalMenu = (btn, dateISO, isRest, dayNumber) => {
    const menu = createGlobalMenu();

    let content = '';
    if (!isRest) {
        content += `<button class="ctx-action" data-action="preview" data-day-id="${dayNumber}">
            <svg width="18" height="18"><use href="#icon-eye"/></svg>
            <span>👁️ Podgląd</span>
        </button>`;
        content += `<button class="ctx-action" data-action="rest" data-date="${dateISO}">
            <svg width="18" height="18"><use href="#icon-rest-coffee"/></svg>
            <span>Zmień na Wolne</span>
        </button>`;
        content += `<button class="ctx-action" data-action="move" data-date="${dateISO}">
            <svg width="18" height="18"><use href="#icon-calendar-move"/></svg>
            <span>Przenieś...</span>
        </button>`;
    }
    content += `<button class="ctx-action" data-action="reset">
        <svg width="18" height="18"><use href="#icon-reset-ccw"/></svg>
        <span>Resetuj Plan</span>
    </button>`;

    menu.innerHTML = content;

    const rect = btn.getBoundingClientRect();
    const menuWidth = 200;

    let left = rect.right - menuWidth;
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
                data-date="${date}"
                data-is-rest="${isRest}"
                data-day-id="${dayNum}">
                <svg width="24" height="24"><use href="#icon-dots-vertical"/></svg>
            </button>
        </div>
    `;

    if (completedSession) {
        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        missionWrapper.innerHTML = generateCompletedMissionCardHTML(completedSession);
        containers.days.appendChild(missionWrapper);
        clearPlanFromStorage();

        const detailsBtn = missionWrapper.querySelector('.view-details-btn');
        if (detailsBtn) detailsBtn.addEventListener('click', () => renderDayDetailsScreen(todayISO, () => { navigateTo('main'); renderMainScreen(); }));

    } else if (todayPlanEntry.type === 'rest') {
        const cardWrapper = document.createElement('div');
        cardWrapper.style.position = 'relative';
        cardWrapper.innerHTML = generateRestCalendarPageHTML(today);
        cardWrapper.insertAdjacentHTML('beforeend', getMenuBtn(todayISO, true, todayPlanEntry.dayNumber));
        containers.days.appendChild(cardWrapper);
        clearPlanFromStorage();

        cardWrapper.querySelector('#force-workout-btn').addEventListener('click', () => {
            const bioHub = document.querySelector('.bio-hub-container');
            if (bioHub) bioHub.scrollIntoView({ behavior: 'smooth' });
        });

    } else {
        let finalPlan = getHydratedDay(todayPlanEntry);
        finalPlan.planId = dynamicPlan.id;
        state.todaysDynamicPlan = finalPlan;
        state.currentTrainingDayId = todayPlanEntry.dayNumber;
        savePlanToStorage(finalPlan, todayISO);

        let estimatedMinutes = calculateSmartDuration(finalPlan);
        if (todayPlanEntry.estimatedDurationMin) estimatedMinutes = todayPlanEntry.estimatedDurationMin;

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

                const checkPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                const isSOS = checkPlan?._modificationInfo?.shouldSuggestSOS;

                // 1. Aktualizacja Czasu
                const newDuration = calculateSmartDuration(checkPlan);
                const timeDisplay = document.getElementById('today-duration-display');
                if (timeDisplay) {
                    timeDisplay.textContent = `${newDuration} min`;
                }

                // 2. NOWOŚĆ: Aktualizacja Paska Obciążenia (System Load)
                const newLoad = calculateSystemLoad(checkPlan);
                const loadContainer = cardEl.querySelector('.load-metric-container');
                if (loadContainer) {
                    let loadColor = '#4ade80';
                    let loadLabel = 'Lekki';
                    if (newLoad > 30) { loadColor = '#facc15'; loadLabel = 'Umiarkowany'; }
                    if (newLoad > 60) { loadColor = '#fb923c'; loadLabel = 'Wymagający'; }
                    if (newLoad > 85) { loadColor = '#ef4444'; loadLabel = 'Maksymalny'; }

                    // Aktualizacja wizualna
                    const loadValueSpan = loadContainer.querySelector('span[style*="font-weight:600"]');
                    if (loadValueSpan) loadValueSpan.textContent = `${newLoad}%`;

                    const loadLabelSpan = loadContainer.querySelector('span > span');
                    if (loadLabelSpan) {
                        loadLabelSpan.textContent = loadLabel;
                        loadLabelSpan.style.color = (loadColor === '#4ade80' ? '#16a34a' : loadColor);
                    }

                    const barFill = loadContainer.querySelector('div[style*="width:"]');
                    if (barFill) {
                        barFill.style.width = `${newLoad}%`;
                        barFill.style.background = loadColor;
                    }
                }

                // 3. Aktualizacja Przycisku Start
                if (isSOS) {
                    startBtn.textContent = "🏥 Aktywuj Protokół SOS";
                    startBtn.style.backgroundColor = "var(--danger-color)";
                    startBtn.dataset.mode = 'sos';
                } else {
                    startBtn.innerHTML = `
                    <div class="btn-content-wrapper">
                        <span class="btn-icon-bg"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span>
                        <span>Rozpocznij Trening</span>
                    </div>`;
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
            const combinedStats = {
                ...getGamificationState(state.userProgress),
                resilience: stats.resilience,
                streak: stats.streak,
                totalSessions: stats.totalSessions,
                level: stats.level,
                totalMinutes: stats.totalMinutes
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

    // ZMIANA: Używamy nowej klasy "calendar-strip" zamiast "upcoming-timeline"
    upcomingHTML += `<div class="calendar-strip">`;

    // Pokazujemy max 6 kolejnych dni (żeby zmieścić się w tygodniu)
    futureDays.slice(0, 6).forEach(dayRaw => {
        const dayData = getHydratedDay(dayRaw);
        const dateObj = new Date(dayData.date);
        const dayShort = dateObj.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase().replace('.', '');
        const dayNum = dateObj.getDate();
        const isRest = dayData.type === 'rest';

        // Klasy pomocnicze
        const stripDayClass = isRest ? 'strip-day rest' : 'strip-day workout';
        const weekendClass = (dateObj.getDay() === 0 || dateObj.getDay() === 6) ? ' weekend' : '';

        const btnHtml = `
            <button class="strip-menu-btn ctx-menu-btn"
                data-date="${dayData.date}"
                data-is-rest="${isRest}"
                data-day-id="${dayData.dayNumber}">
                <svg width="16" height="16" fill="currentColor" style="color: #94a3b8;"><use href="#icon-dots-vertical"/></svg>
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

    // Listener na kafelki paska (otwiera podgląd, chyba że to menu)
    upcomingWrapper.querySelectorAll('.strip-day').forEach(card => {
        if (card.dataset.isRest === 'true') return;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.ctx-menu-btn')) return;
            e.stopPropagation();
            renderPreTrainingScreen(parseInt(card.dataset.dayId, 10), 0, true);
        });
    });
}
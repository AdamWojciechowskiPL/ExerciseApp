// ExerciseApp/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getHydratedDay, getISODate, calculateSmartDuration } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML, generateSkeletonDashboardHTML } from '../templates.js';
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
            clearPlanFromStorage(); // Ważne: czyścimy cache dzisiejszego dnia
            
            // Decyzja o regeneracji (po krótkiej pauzie dla lepszego UX)
            setTimeout(async () => {
                if (confirm("Zmodyfikowałeś ten dzień. Czy chcesz przeliczyć pozostałe dni planu?")) {
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
};

const handleMoveDay = (sourceDateISO) => {
    const plan = state.settings.dynamicPlanData;
    // Znajdź przyszłe dni wolne
    const availableTargets = plan.days.filter(d =>
        d.type === 'rest' &&
        d.date !== sourceDateISO &&
        new Date(d.date) > new Date(sourceDateISO)
    );

    if (availableTargets.length === 0) {
        alert("Brak wolnych dni w bieżącym cyklu, na które można przenieść trening.");
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

            // Kopia zawartości (bez daty i numeru dnia)
            const tempSourceContent = { ...sourceDayContent };
            delete tempSourceContent.date;
            delete tempSourceContent.dayNumber;

            const tempTargetContent = { ...targetDayContent };
            delete tempTargetContent.date;
            delete tempTargetContent.dayNumber;

            // Zamiana
            Object.assign(newPlan.days[targetIndex], tempSourceContent); // Cel staje się treningiem
            Object.assign(newPlan.days[sourceIndex], tempTargetContent); // Źródło staje się restem

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
        await dataStore.generateDynamicPlan(state.settings.wizardData);
        clearPlanFromStorage();
        hideLoader();
        renderMainScreen(false);
    } catch (e) {
        hideLoader();
        alert("Błąd resetowania planu: " + e.message);
        renderMainScreen(false);
    }
};

// --- RENDEROWANIE MENU KONTEKSTOWEGO ---

const getContextMenuHTML = (dateISO, isRest) => {
    // Menu dla dnia dzisiejszego lub przyszłego
    return `
        <div class="ctx-menu-wrapper">
            <button class="ctx-menu-btn" aria-label="Opcje dnia" onclick="this.nextElementSibling.classList.toggle('active'); event.stopPropagation();">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-more-vertical"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="ctx-menu-dropdown">
                ${!isRest ? `<button class="ctx-action" data-action="rest" data-date="${dateISO}">
                    <img src="/icons/trash.svg" alt="Usuń">
                    <span>Zmień na Wolne</span>
                </button>` : ''}
                ${!isRest ? `<button class="ctx-action" data-action="move" data-date="${dateISO}">
                    <img src="/icons/calendar.svg" alt="Przenieś">
                    <span>Przenieś...</span>
                </button>` : ''}
                <button class="ctx-action" data-action="reset">
                    <img src="/icons/refresh-ccw.svg" alt="Reset">
                    <span>Resetuj Plan</span>
                </button>
            </div>
        </div>
    `;
};

// --- GŁÓWNA FUNKCJA RENDERUJĄCA ---

export const renderMainScreen = async (isLoading = false) => {
    // --- KLUCZOWA POPRAWKA: Globalny listener na poziomie kontenera ---
    // Zapobiega wielokrotnemu podpinaniu przy odświeżaniu widoku
    if (!containers.days._hasDashboardListeners) {
        containers.days.addEventListener('click', (e) => {
            // Obsługa akcji z menu
            const actionBtn = e.target.closest('.ctx-action');
            if (actionBtn) {
                e.stopPropagation();
                // Natychmiast ukryj menu
                document.querySelectorAll('.ctx-menu-dropdown.active').forEach(m => m.classList.remove('active'));

                const action = actionBtn.dataset.action;
                const date = actionBtn.dataset.date;

                if (action === 'rest') handleTurnToRest(date);
                if (action === 'move') handleMoveDay(date);
                if (action === 'reset') handleResetPlan();
                return;
            }

            // Zamykanie menu przy kliknięciu gdziekolwiek indziej
            if (!e.target.closest('.ctx-menu-btn')) {
                document.querySelectorAll('.ctx-menu-dropdown.active').forEach(m => m.classList.remove('active'));
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

    // Nagłówek dnia
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateString = today.toLocaleDateString('pl-PL', dateOptions);
    const capitalizedDate = dateString.charAt(0).toUpperCase() + dateString.slice(1);

    containers.days.innerHTML += `
        <div class="daily-mission-header">
            <div class="dm-text">
                <span class="dm-subtitle">${capitalizedDate}</span>
                <h2 class="dm-title">TWOJA MISJA</h2>
            </div>
            <div class="dm-icon-wrapper">
                <div class="dm-icon">📅</div>
            </div>
        </div>
    `;

    const todaysSessions = state.userProgress[todayISO] || [];
    const completedSession = todaysSessions.find(s => s.status === 'completed');

    if (completedSession) {
        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        missionWrapper.innerHTML = generateCompletedMissionCardHTML(completedSession);
        containers.days.appendChild(missionWrapper);
        clearPlanFromStorage();

        const detailsBtn = missionWrapper.querySelector('.view-details-btn');
        if (detailsBtn) detailsBtn.addEventListener('click', () => renderDayDetailsScreen(todayISO, () => { navigateTo('main'); renderMainScreen(); }));

    } else if (todayPlanEntry.type === 'rest') {
        const ctxMenu = getContextMenuHTML(todayISO, true);

        const card = document.createElement('div');
        card.innerHTML = `
            <div class="mission-card" style="border-left-color: #aaa; background: linear-gradient(135deg, #fff, #f8f9fa); position: relative;">
                <div style="position:absolute; right:10px; top:10px; z-index:20;">${ctxMenu}</div>
                <div class="mission-header">
                    <div>
                        <span class="mission-day-badge" style="background:#64748b;">REGENERACJA</span>
                        <h3 class="mission-title">Dzień Odnowy</h3>
                        <p style="opacity:0.7; margin:5px 0 0 0; font-size:0.9rem;">Twój plan przewiduje dzisiaj odpoczynek.</p>
                    </div>
                    <div style="font-size:2.5rem;">🔋</div>
                </div>
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed var(--border-color);">
                    <button id="force-workout-btn" class="nav-btn" style="width:100%; border: 1px solid var(--gold-color); color: var(--text-color);">
                        🔥 Chcę zrobić dodatkowy trening
                    </button>
                </div>
            </div>
        `;
        containers.days.appendChild(card);
        clearPlanFromStorage();

        card.querySelector('#force-workout-btn').addEventListener('click', () => {
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
        missionWrapper.innerHTML = generateMissionCardHTML(finalPlan, estimatedMinutes, wizardData);

        // Dodanie menu kontekstowego do karty treningu
        const ctxMenu = getContextMenuHTML(todayISO, false);
        const cardContainer = missionWrapper.querySelector('.mission-card');
        const headerStrip = cardContainer.querySelector('.ai-header-strip');
        
        // Wstrzykiwanie menu - pozycjonowanie absolutne wewnątrz karty
        if (headerStrip) {
            headerStrip.insertAdjacentHTML('beforebegin', `<div style="position:absolute; right:10px; top:10px; z-index:20;">${ctxMenu}</div>`);
        } else {
            cardContainer.insertAdjacentHTML('afterbegin', `<div style="position:absolute; right:10px; top:10px; z-index:20;">${ctxMenu}</div>`);
        }

        containers.days.appendChild(missionWrapper);

        // POPRAWKA BŁĘDU ZMIENNEJ: Definiujemy cardEl poprawnie
        const cardEl = missionWrapper.querySelector('.mission-card');
        
        // Pobieramy elementy wewnątrz karty
        const timeBadgeEl = cardEl.querySelector('#mission-time-val');
        const startBtn = cardEl.querySelector('#start-mission-btn');
        const painOptions = cardEl.querySelectorAll('.pain-option');

        painOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                painOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                const painLevel = parseInt(opt.dataset.level, 10);
                const checkPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                const isSOS = checkPlan?._modificationInfo?.shouldSuggestSOS;

                if (isSOS) {
                    startBtn.textContent = "🏥 Aktywuj Protokół SOS";
                    startBtn.style.backgroundColor = "var(--danger-color)";
                    startBtn.dataset.mode = 'sos';
                    if (timeBadgeEl) timeBadgeEl.textContent = "10 min";
                } else {
                    const newDuration = calculateSmartDuration(checkPlan);
                    if (timeBadgeEl) timeBadgeEl.textContent = `${newDuration} min`;
                    startBtn.textContent = "Start Misji";
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

    renderBioHub();
    renderUpcomingQueue(dynamicPlan.days, todayISO);
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

    bioHubContainer.innerHTML = `<div class="section-title" style="margin-top:1.5rem; margin-bottom:0.8rem; padding-left:4px;">PROTOKOŁY CELOWANE</div><div class="bio-hub-scroll">${cardsHTML}</div>`;
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

    let upcomingHTML = `<div class="section-title" style="margin-top:1.5rem; margin-bottom:0.8rem; padding-left:4px;">NADCHODZĄCE DNI</div>`;
    upcomingHTML += `<div class="upcoming-scroll-container">`;

    futureDays.slice(0, 5).forEach(dayRaw => {
        const dayData = getHydratedDay(dayRaw);
        const dateObj = new Date(dayData.date);
        const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
        const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const isRest = dayData.type === 'rest';
        const cardStyle = isRest ? 'background: #f8f9fa; border-color: #ddd;' : '';
        const titleColor = isRest ? 'color: #777;' : '';

        const ctxMenu = getContextMenuHTML(dayData.date, isRest);

        upcomingHTML += `
            <div class="upcoming-card" style="${cardStyle}; position: relative;" data-day-id="${dayData.dayNumber}" data-is-rest="${isRest}">
                <div style="position:absolute; top:5px; right:5px; z-index:10;">${ctxMenu}</div>
                <div>
                    <div class="upcoming-day-label">${dayLabel}</div>
                    <div class="upcoming-title" style="${titleColor}">${dayData.title}</div>
                </div>
                ${!isRest ? '<button class="upcoming-btn">Podgląd</button>' : '<span style="font-size:1.5rem; display:block; text-align:right; opacity:0.5;">☕</span>'}
            </div>
        `;
    });
    upcomingHTML += `</div>`;

    const upcomingWrapper = document.createElement('div');
    upcomingWrapper.innerHTML = upcomingHTML;
    containers.days.appendChild(upcomingWrapper);

    upcomingWrapper.querySelectorAll('.upcoming-card').forEach(card => {
        if (card.dataset.isRest === 'true') return;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.ctx-menu-btn') || e.target.closest('.ctx-menu-dropdown')) return;
            e.stopPropagation();
            renderPreTrainingScreen(parseInt(card.dataset.dayId, 10), 0, true);
        });
    });
}
// ExerciseApp/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getHydratedDay, getISODate, calculateSmartDuration } from '../../utils.js';
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
    // Zastąpiono <img> kodem SVG (inline), aby naprawić brakujące ikony
    return `
        <div class="ctx-menu-wrapper">
            <button class="ctx-menu-btn" aria-label="Opcje dnia" onclick="this.nextElementSibling.classList.toggle('active'); event.stopPropagation();">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-more-vertical"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="ctx-menu-dropdown">
                ${!isRest ? `<button class="ctx-action" data-action="rest" data-date="${dateISO}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span>Zmień na Wolne</span>
                </button>` : ''}
                ${!isRest ? `<button class="ctx-action" data-action="move" data-date="${dateISO}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>Przenieś...</span>
                </button>` : ''}
                <button class="ctx-action" data-action="reset">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                    <span>Resetuj Plan</span>
                </button>
            </div>
        </div>
    `;
};

// --- GLOBAL CLICK HANDLER (Dla zamykania menu) ---
// Dodajemy to raz, aby kliknięcie gdziekolwiek zamykało menu
window.addEventListener('click', (e) => {
    if (!e.target.closest('.ctx-menu-btn')) {
        document.querySelectorAll('.ctx-menu-dropdown.active').forEach(m => m.classList.remove('active'));
    }
});

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
        const cardWrapper = document.createElement('div');
        // Pozycjonowanie względne dla menu
        cardWrapper.style.position = 'relative'; 
        
        // Generujemy kartkę "Rest Mode"
        cardWrapper.innerHTML = generateRestCalendarPageHTML(today);
        
        // Wstrzykujemy menu kontekstowe
        cardWrapper.insertAdjacentHTML('beforeend', `<div style="position:absolute; right:15px; top:15px; z-index:20;">${ctxMenu}</div>`);
        
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

        // --- ZMIANA: Używamy nowej funkcji do generowania Kartki z Kalendarza ---
        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        // Przekazujemy obiekt Date, aby wyrenderować "Kartkę"
        missionWrapper.innerHTML = generateCalendarPageHTML(finalPlan, estimatedMinutes, today, wizardData);

        // Dodanie menu kontekstowego do karty treningu
        const ctxMenu = getContextMenuHTML(todayISO, false);
        const cardContainer = missionWrapper.querySelector('.calendar-sheet');
        
        // Wstrzykiwanie menu - pozycjonowanie absolutne wewnątrz kartki
        if (cardContainer) {
            // Ustawiamy styl relative, aby absolute działał względem kartki
            cardContainer.style.position = 'relative';
            cardContainer.insertAdjacentHTML('beforeend', `<div style="position:absolute; right:15px; top:15px; z-index:20;">${ctxMenu}</div>`);
        }

        containers.days.appendChild(missionWrapper);

        // --- LOGIKA OBSŁUGI ZDARZEŃ W KARTCE ---
        const cardEl = missionWrapper.querySelector('.calendar-sheet'); // Nowa klasa
        const startBtn = cardEl.querySelector('#start-mission-btn');
        const painOptions = cardEl.querySelectorAll('.pain-option');

        painOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                painOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                const painLevel = parseInt(opt.dataset.level, 10);
                
                // Sprawdzenie czy włączyć SOS
                const checkPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                const isSOS = checkPlan?._modificationInfo?.shouldSuggestSOS;

                if (isSOS) {
                    startBtn.textContent = "🏥 Aktywuj Protokół SOS";
                    startBtn.style.backgroundColor = "var(--danger-color)";
                    startBtn.dataset.mode = 'sos';
                } else {
                    // Przywracamy ikonę Play przy normalnym trybie
                    startBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:block;"><path d="M8 5v14l11-7z"></path></svg> Rozpocznij Trening`;
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
    renderBioHub(); // Przeniosłem na dół
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

    bioHubContainer.innerHTML = `<div class="section-title" style="margin-top:2.5rem; margin-bottom:0.8rem; padding-left:4px;">PROTOKOŁY CELOWANE</div><div class="bio-hub-scroll">${cardsHTML}</div>`;
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
    upcomingHTML += `<div class="upcoming-timeline">`; // Zmiana klasy na timeline

    futureDays.slice(0, 5).forEach(dayRaw => {
        const dayData = getHydratedDay(dayRaw);
        const dateObj = new Date(dayData.date);
        
        // Formatowanie daty: "CZW 12"
        const dayShort = dateObj.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase().replace('.', '');
        const dayNum = dateObj.getDate();
        
        const isRest = dayData.type === 'rest';
        
        // Stylizacja osi czasu
        const cardClass = isRest ? 'timeline-card rest' : 'timeline-card workout';
        
        // Menu kontekstowe
        const ctxMenu = getContextMenuHTML(dayData.date, isRest);

        upcomingHTML += `
            <div class="${cardClass}" data-day-id="${dayData.dayNumber}" data-is-rest="${isRest}">
                <div style="position:absolute; top:2px; right:2px; z-index:10;">${ctxMenu}</div>
                <div class="tl-day-name">${dayShort}</div>
                <div class="tl-day-number">${dayNum}</div>
                <div class="tl-dot"></div>
                <div style="font-size:0.6rem; opacity:0.7; margin-top:6px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">${isRest ? 'Wolne' : 'Trening'}</div>
            </div>
        `;
    });
    upcomingHTML += `</div>`;

    const upcomingWrapper = document.createElement('div');
    upcomingWrapper.innerHTML = upcomingHTML;
    containers.days.appendChild(upcomingWrapper);

    // Listener używający klasy timeline-card
    upcomingWrapper.querySelectorAll('.timeline-card').forEach(card => {
        if (card.dataset.isRest === 'true') return;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.ctx-menu-btn') || e.target.closest('.ctx-menu-dropdown')) return;
            e.stopPropagation();
            renderPreTrainingScreen(parseInt(card.dataset.dayId, 10), 0, true);
        });
    });
}
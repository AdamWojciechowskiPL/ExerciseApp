// js/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate, isTodayRestDay, getNextLogicalDay, getTrainingDayForDate } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo } from '../core.js';
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML } from '../templates.js';
import { renderPreTrainingScreen } from './training.js';
import { renderDayDetailsScreen } from './history.js';
import { workoutMixer } from '../../workoutMixer.js';
import { getUserPayload } from '../../auth.js'; 

const getStorageKey = () => {
    const user = getUserPayload();
    const userId = user ? user.sub : 'anon';
    const date = getISODate(new Date());
    return `dynamic_plan_${userId}_${date}`; 
};

const savePlanToStorage = (plan) => {
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(plan));
    } catch (e) { console.error("Błąd zapisu planu:", e); }
};

export const clearPlanFromStorage = () => {
    try {
        localStorage.removeItem(getStorageKey());
        state.todaysDynamicPlan = null;
    } catch (e) { console.error("Błąd czyszczenia planu:", e); }
};

const loadPlanFromStorage = () => {
    try {
        const raw = localStorage.getItem(getStorageKey());
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};

export const renderMainScreen = () => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) {
        containers.days.innerHTML = '<p>Ładowanie planu treningowego...</p>';
        return;
    }

    const heroContainer = document.getElementById('hero-dashboard');
    if (heroContainer) {
        try {
            const stats = state.userStats || {};
            const combinedStats = {
                ...getGamificationState(state.userProgress), 
                resilience: stats.resilience, 
                streak: stats.streak,         
                totalSessions: stats.totalSessions,
                level: stats.level
            };

            if (getIsCasting()) sendUserStats(combinedStats);
            heroContainer.classList.remove('hidden');
            heroContainer.innerHTML = generateHeroDashboardHTML(combinedStats);
        } catch (e) {
            console.error('[Dashboard] Błąd renderowania Hero:', e);
        }
    }

    containers.days.innerHTML = '';
    const today = new Date();
    const todayISO = getISODate(today); 

    // --- PRIORYTET 1: CZY TRENING JUŻ ZROBIONY? ---
    const todaysSessions = state.userProgress[todayISO] || [];
    const completedSession = todaysSessions.find(s => s.planId === state.settings.activePlanId);

    if (completedSession) {
        containers.days.innerHTML += `<div class="section-title">Twoja Misja na Dziś</div>`;
        const missionWrapper = document.createElement('div');
        missionWrapper.className = 'mission-card-wrapper';
        missionWrapper.innerHTML = generateCompletedMissionCardHTML(completedSession);
        containers.days.appendChild(missionWrapper);
        
        clearPlanFromStorage();

        const detailsBtn = missionWrapper.querySelector('.view-details-btn');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', () => {
                renderDayDetailsScreen(todayISO, () => { navigateTo('main'); renderMainScreen(); });
            });
        }

    } else if (isTodayRestDay()) {
        containers.days.innerHTML += `
            <div class="section-title">Dzisiaj</div>
            <div class="mission-card" style="border-left-color: #aaa; background: linear-gradient(135deg, #fff, #f0f0f0);">
                <div class="mission-header">
                    <div>
                        <span class="mission-day-badge" style="background:#888;">REGENERACJA</span>
                        <h3 class="mission-title">Dzień Wolny</h3>
                        <p style="opacity:0.7; margin:0">Odpoczynek to część treningu. Zadbaj o sen i nawodnienie.</p>
                    </div>
                    <div style="font-size:2rem;">🔋</div>
                </div>
            </div>
        `;
        clearPlanFromStorage();

    } else {
        const todayDataRaw = getNextLogicalDay();
        const todayDataStatic = getHydratedDay(todayDataRaw);

        if (todayDataStatic) {
            containers.days.innerHTML += `<div class="section-title">Twoja Misja na Dziś</div>`;
            
            const missionWrapper = document.createElement('div');
            missionWrapper.className = 'mission-card-wrapper';
            containers.days.appendChild(missionWrapper);

            let dynamicDayData = state.todaysDynamicPlan;

            if (!dynamicDayData) {
                const cachedPlan = loadPlanFromStorage();
                if (cachedPlan && cachedPlan.dayNumber === todayDataStatic.dayNumber) {
                    console.log("💾 Załadowano zapisany plan dynamiczny z dysku.");
                    state.todaysDynamicPlan = cachedPlan;
                    dynamicDayData = cachedPlan;
                }
            }

            const isProcessing = !state.isHistoryLoaded && !dynamicDayData;
            
            if (!isProcessing && !dynamicDayData) {
                console.log("🎲 Generowanie nowego Planu (Mixer)...");
                state.todaysDynamicPlan = workoutMixer.mixWorkout(todayDataStatic);
                dynamicDayData = state.todaysDynamicPlan;
                savePlanToStorage(dynamicDayData);
            }
            
            const finalPlan = dynamicDayData || todayDataStatic;
            const estimatedMinutes = assistant.estimateDuration(finalPlan);
            
            missionWrapper.innerHTML = generateMissionCardHTML(finalPlan, estimatedMinutes);

            if (isProcessing) {
                const cardEl = missionWrapper.firstElementChild;
                cardEl.classList.add('ai-blur');
                
                const overlay = document.createElement('div');
                overlay.className = 'ai-processing-overlay';
                overlay.innerHTML = `
                    <div class="ai-badge">
                        <div class="spinner-dots"></div>
                        <span>Analiza historii...</span>
                    </div>
                `;
                missionWrapper.appendChild(overlay);
            }

            const cardEl = missionWrapper.querySelector('.mission-card');
            const timeBadge = cardEl.querySelector('#mission-time-val');
            const timeContainer = cardEl.querySelector('.estimated-time-badge');
            const startBtn = cardEl.querySelector('#start-mission-btn');
            const painOptions = cardEl.querySelectorAll('.pain-option');

            if (finalPlan.compressionApplied) {
                timeContainer.classList.add('reduced');
                timeBadge.textContent = `${estimatedMinutes} min (limit)`;
            }

            painOptions.forEach(opt => {
                opt.addEventListener('click', () => {
                    painOptions.forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');

                    const painLevel = parseInt(opt.dataset.level, 10);
                    const adjustedPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                    const newDuration = assistant.estimateDuration(adjustedPlan);

                    timeBadge.textContent = `${newDuration} min`;
                    startBtn.dataset.initialPain = painLevel;
                });
            });

            startBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const pain = parseInt(startBtn.dataset.initialPain, 10) || 0;
                renderPreTrainingScreen(finalPlan.dayNumber, pain, true); 
            });

        } else {
            containers.days.innerHTML += `<p style="padding:1rem; text-align:center; opacity:0.6">Plan ukończony lub brak danych.</p>`;
        }
    }

    // 3. NADCHODZĄCE DNI (Kolejka)
    let upcomingHeaderAdded = false;
    
    const baseDayRaw = getNextLogicalDay();
    
    if (baseDayRaw) {
        let startOffset = 1;
        // Jeśli dzisiaj zrobione, to baseDayRaw = Jutro (kolejka przesunięta), więc startujemy od 0
        if (completedSession) {
            startOffset = 0;
        }

        const nextDayNum = baseDayRaw.dayNumber;
        
        // FIX: Zwiększono limit pętli z 3 do 6, aby pokazać więcej nadchodzących dni
        for (let i = 0; i < 6; i++) {
            // Cykliczne pobieranie dni z planu
            const targetDayNum = ((nextDayNum - 1 + i + startOffset) % activePlan.Days.length) + 1;
            
            const dayDataRaw = activePlan.Days.find(d => d.dayNumber === targetDayNum);
            if (!dayDataRaw) continue;
            const dayData = getHydratedDay(dayDataRaw);

            if (!upcomingHeaderAdded) {
                const upcomingTitle = document.createElement('div');
                upcomingTitle.className = 'section-title';
                upcomingTitle.textContent = 'Kolejne w cyklu';
                containers.days.appendChild(upcomingTitle);
                upcomingHeaderAdded = true;
            }
            
            const card = document.createElement('div');
            card.className = 'day-card';
            const label = `Kolejka #${i + 1}`;
            
            card.innerHTML = `
                <p class="day-card-date" style="font-size:0.7rem; opacity:0.6;">${label}</p>
                <div class="card-header"><h3>Dzień ${dayData.dayNumber}: ${dayData.title}</h3></div>
                <button class="nav-btn" style="width:100%; margin-top:0.5rem; opacity:0.7">Podgląd</button>
            `;
            
            card.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                renderPreTrainingScreen(dayData.dayNumber, 0, false); 
            });
            containers.days.appendChild(card);
        }
    }

    navigateTo('main');
};
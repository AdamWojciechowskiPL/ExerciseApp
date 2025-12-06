// js/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate, isTodayRestDay, getNextLogicalDay, getTrainingDayForDate } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo } from '../core.js';
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML, generateSkeletonDashboardHTML } from '../templates.js';
import { renderPreTrainingScreen } from './training.js';
import { renderDayDetailsScreen } from './history.js';
import { workoutMixer } from '../../workoutMixer.js';
import { getUserPayload } from '../../auth.js';

// --- POMOCNICZE FUNKCJE STORAGE ---

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

const getDynamicDayFromSettings = (dayIndex) => {
    const dynamicPlan = state.settings.dynamicPlanData;
    if (!dynamicPlan || !dynamicPlan.days) return null;

    const planLength = dynamicPlan.days.length;
    const arrayIndex = (dayIndex - 1) % planLength;

    return dynamicPlan.days[arrayIndex];
};

const getPlanDaysArray = (plan) => {
    if (!plan) return [];
    return plan.Days || plan.days || [];
};

// --- GŁÓWNA FUNKCJA RENDERUJĄCA ---

export const renderMainScreen = (isLoading = false) => {

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

    const hasDynamicData = state.settings.dynamicPlanData && state.settings.dynamicPlanData.days && state.settings.dynamicPlanData.days.length > 0;

    let isDynamicMode = false;

    if (state.settings.planMode === 'dynamic') {
        isDynamicMode = true;
    } else if (state.settings.planMode === 'static') {
        isDynamicMode = false;
    } else {
        isDynamicMode = hasDynamicData;
    }

    const activePlan = isDynamicMode && hasDynamicData
        ? state.settings.dynamicPlanData
        : getActiveTrainingPlan();

    if (!activePlan) {
        containers.days.innerHTML = '<p style="padding:2rem; text-align:center;">Brak aktywnego planu. Sprawdź ustawienia.</p>';
        return;
    }

    const currentPlanId = isDynamicMode
        ? (state.settings.dynamicPlanData.id || 'dynamic')
        : state.settings.activePlanId;

    // 1. RENDEROWANIE HERO STATS
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
        } catch (e) {
            console.error('[Dashboard] Błąd renderowania Hero:', e);
        }
    }

    // 2. RENDEROWANIE ZAWARTOŚCI GŁÓWNEJ
    containers.days.innerHTML = '';

    // PRZYWRÓCONY EFEKT WOW (Zamiast paska tygodnia)
    const today = new Date();
    const todayISO = getISODate(today);

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
                <div class="dm-icon">🎯</div>
            </div>
        </div>
    `;

    const todaysSessions = state.userProgress[todayISO] || [];

    const completedSession = todaysSessions.find(s =>
        (isDynamicMode && s.planId && s.planId.startsWith('dynamic')) ||
        (!isDynamicMode && s.planId === currentPlanId)
    );

    let currentSequenceDayNum = 1;

    // A. SEKCJA "MISJA NA DZIŚ"
    if (completedSession) {
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

        currentSequenceDayNum = parseInt(completedSession.trainingDayId || 1);

    } else if (isTodayRestDay()) {
        containers.days.innerHTML += `
            <div class="mission-card" style="border-left-color: #aaa; background: linear-gradient(135deg, #fff, #f0f0f0);">
                <div class="mission-header">
                    <div>
                        <span class="mission-day-badge" style="background:#888;">REGENERACJA</span>
                        <h3 class="mission-title">Dzień Wolny</h3>
                        <p style="opacity:0.7; margin:0">Odpoczynek to część treningu.</p>
                    </div>
                    <div style="font-size:2rem;">🔋</div>
                </div>
            </div>
        `;
        clearPlanFromStorage();

        const allSessions = Object.values(state.userProgress).flat();
        const dynSessions = allSessions.filter(s => s.planId && s.planId.startsWith('dynamic'));
        currentSequenceDayNum = dynSessions.length;

    } else {
        let finalPlan = null;
        let estimatedMinutes = 0;

        // --- LOGIKA DLA TRYBU DYNAMICZNEGO ---
        if (isDynamicMode) {
            const allSessions = Object.values(state.userProgress).flat();
            const dynSessions = allSessions.filter(s => s.planId && s.planId.startsWith('dynamic'));
            currentSequenceDayNum = dynSessions.length + 1;

            const rawDay = getDynamicDayFromSettings(currentSequenceDayNum);

            if (!rawDay) {
                containers.days.innerHTML += `<p class="error-msg">Błąd danych planu dynamicznego.</p>`;
                return;
            }

            const cachedPlan = loadPlanFromStorage();

            if (cachedPlan &&
                cachedPlan.dayNumber === currentSequenceDayNum &&
                cachedPlan.planId === currentPlanId) {
                console.log("CACHE HIT: Używam zapisanego planu z dysku.");
                finalPlan = cachedPlan;
            } else {
                console.log("CACHE MISS: Generuję plan na dziś.");
                const hydratedDay = getHydratedDay(rawDay);
                finalPlan = JSON.parse(JSON.stringify(hydratedDay));
                finalPlan.dayNumber = currentSequenceDayNum;
                finalPlan.planId = currentPlanId;
                savePlanToStorage(finalPlan);
            }
            state.todaysDynamicPlan = finalPlan;

        }
        // --- LOGIKA DLA TRYBU STATYCZNEGO (Z POPRAWIONYM MIXEREM) ---
        else {
            const todayDataRaw = getNextLogicalDay();
            if (todayDataRaw) {
                const todayDataStatic = getHydratedDay(todayDataRaw);
                currentSequenceDayNum = todayDataStatic.dayNumber;

                let dynamicDayData = state.todaysDynamicPlan;

                // Walidacja: czy zapisany plan jest z aktualnego trybu/planId?
                if (dynamicDayData && dynamicDayData.planId !== currentPlanId) {
                    console.log(`[Dashboard] Plan mismatch: ${dynamicDayData.planId} vs ${currentPlanId}. Resetuję.`);
                    dynamicDayData = null;
                    state.todaysDynamicPlan = null;
                    clearPlanFromStorage();
                }

                if (!dynamicDayData) {
                    const cachedPlan = loadPlanFromStorage();
                    if (cachedPlan && cachedPlan.dayNumber === currentSequenceDayNum && cachedPlan.planId === currentPlanId) {
                        // SPRAWDZAMY CZY PLAN JEST ZMIKSOWANY (_isDynamic)
                        if (cachedPlan._isDynamic) {
                            console.log("CACHE HIT (Static-Mixed): Znaleziono zmiksowany plan.");
                            dynamicDayData = cachedPlan;
                        } else {
                            console.log("CACHE STALE: Plan nie był miksowany. Usuwam i generuję nowy.");
                            clearPlanFromStorage();
                        }
                    }
                }

                if (!dynamicDayData) {
                    console.log(`🎲 [Dashboard] Uruchamiam Mixer dla dnia ${currentSequenceDayNum}...`);
                    state.todaysDynamicPlan = workoutMixer.mixWorkout(todayDataStatic);
                    dynamicDayData = state.todaysDynamicPlan;
                    dynamicDayData.planId = currentPlanId;
                    savePlanToStorage(dynamicDayData);
                }
                finalPlan = dynamicDayData || todayDataStatic;

                if (state.todaysDynamicPlan) state.todaysDynamicPlan = finalPlan;
            }
        }

        if (finalPlan) {
            const missionWrapper = document.createElement('div');
            missionWrapper.className = 'mission-card-wrapper';
            containers.days.appendChild(missionWrapper);

            estimatedMinutes = assistant.estimateDuration(finalPlan);

            const wizardData = isDynamicMode ? state.settings.wizardData : null;
            missionWrapper.innerHTML = generateMissionCardHTML(finalPlan, estimatedMinutes, wizardData);

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
                renderPreTrainingScreen(finalPlan.dayNumber, pain, isDynamicMode);
            });
        }
    }

    // C. SEKCJA "KOLEJNE W CYKLU" (Horyzontalna Karuzela)
    let upcomingHTML = '';
    const planDays = getPlanDaysArray(activePlan);
    const totalDaysInPlan = planDays.length;

    if (totalDaysInPlan > 0) {
        upcomingHTML += `<div class="section-title" style="margin-top:1.5rem; margin-bottom:0.8rem; padding-left:4px;">KOLEJNE W CYKLU</div>`;
        upcomingHTML += `<div class="upcoming-scroll-container">`;

        for (let i = 0; i < 5; i++) {
            let targetLogicalNum = currentSequenceDayNum + 1 + i;
            const arrayIndex = (targetLogicalNum - 1) % totalDaysInPlan;
            const dayDataRaw = planDays[arrayIndex];

            const dayData = getHydratedDay(dayDataRaw);
            dayData.dayNumber = targetLogicalNum;

            upcomingHTML += `
                <div class="upcoming-card" data-day-id="${targetLogicalNum}">
                    <div>
                        <div class="upcoming-day-label">Dzień ${dayData.dayNumber}</div>
                        <div class="upcoming-title">${dayData.title}</div>
                    </div>
                    <button class="upcoming-btn">Podgląd</button>
                </div>
            `;
        }
        upcomingHTML += `</div>`;

        const upcomingWrapper = document.createElement('div');
        upcomingWrapper.innerHTML = upcomingHTML;
        containers.days.appendChild(upcomingWrapper);

        upcomingWrapper.querySelectorAll('.upcoming-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const dayId = parseInt(card.dataset.dayId, 10);
                renderPreTrainingScreen(dayId, 0, isDynamicMode);
            });
        });
    }

    navigateTo('main');
};
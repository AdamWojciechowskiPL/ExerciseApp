// js/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getActiveTrainingPlan, getHydratedDay, getISODate, isTodayRestDay, getNextLogicalDay, getTrainingDayForDate } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo } from '../core.js';
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML, generateSkeletonDashboardHTML } from '../templates.js';
import { renderPreTrainingScreen, renderProtocolStart } from './training.js';
import { renderDayDetailsScreen } from './history.js';
import { workoutMixer } from '../../workoutMixer.js';
import { getUserPayload } from '../../auth.js';
import { generateBioProtocol } from '../../protocolGenerator.js';

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

    // ============================================================
    // A. SEKCJA "MISJA NA DZIŚ"
    // ============================================================
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
                console.log("CACHE MISS: Generuję plan na dziś (z Mikserem).");
                const hydratedDay = getHydratedDay(rawDay);

                finalPlan = workoutMixer.mixWorkout(hydratedDay, false);

                finalPlan.dayNumber = currentSequenceDayNum;
                finalPlan.planId = currentPlanId;
                savePlanToStorage(finalPlan);
            }
            state.todaysDynamicPlan = finalPlan;

        }
        // --- LOGIKA DLA TRYBU STATYCZNEGO (Z MIXEREM) ---
        else {
            const todayDataRaw = getNextLogicalDay();
            if (todayDataRaw) {
                const todayDataStatic = getHydratedDay(todayDataRaw);
                currentSequenceDayNum = todayDataStatic.dayNumber;

                let dynamicDayData = state.todaysDynamicPlan;

                if (dynamicDayData && dynamicDayData.planId !== currentPlanId) {
                    dynamicDayData = null;
                    state.todaysDynamicPlan = null;
                    clearPlanFromStorage();
                }

                if (!dynamicDayData) {
                    const cachedPlan = loadPlanFromStorage();
                    if (cachedPlan && cachedPlan.dayNumber === currentSequenceDayNum && cachedPlan.planId === currentPlanId) {
                        if (cachedPlan._isDynamic) {
                            dynamicDayData = cachedPlan;
                            state.todaysDynamicPlan = cachedPlan;
                        } else {
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

                if (finalPlan && finalPlan._isDynamic) {
                    state.todaysDynamicPlan = finalPlan;
                }
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

            // --- WELLNESS LOGIC V2.1 ---
            painOptions.forEach(opt => {
                opt.addEventListener('click', () => {
                    painOptions.forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');

                    const painLevel = parseInt(opt.dataset.level, 10);

                    // 1. Sprawdzamy czy to tryb SOS (Level 8+)
                    const checkPlan = assistant.adjustTrainingVolume(finalPlan, painLevel);
                    const isSOS = checkPlan?._modificationInfo?.shouldSuggestSOS;

                    if (isSOS) {
                        startBtn.textContent = "🏥 Aktywuj Protokół SOS";
                        startBtn.style.backgroundColor = "var(--danger-color)";
                        startBtn.dataset.mode = 'sos';
                        timeBadge.textContent = "10 min";
                    } else {
                        const newDuration = assistant.estimateDuration(checkPlan);
                        timeBadge.textContent = `${newDuration} min`;

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

                // Obsługa przekierowania SOS
                if (startBtn.dataset.mode === 'sos') {
                    if (confirm("Wykryto wysoki poziom bólu. Czy uruchomić bezpieczny Protokół SOS zamiast głównego planu?")) {
                        try {
                            const protocol = generateBioProtocol({
                                mode: 'sos',
                                focusZone: state.settings.wizardData?.pain_locations?.[0] || 'lumbar_general',
                                durationMin: 10,
                                userContext: state.settings.wizardData || {}
                            });
                            renderProtocolStart(protocol);
                            return;
                        } catch (err) {
                            console.error("SOS Gen Error:", err);
                        }
                    }
                }

                renderPreTrainingScreen(finalPlan.dayNumber, pain, isDynamicMode);
            });
        }
    }

    // ============================================================
    // B. LABORATORIUM REGENERACJI (z nowymi trybami)
    // ============================================================
    const bioHubContainer = document.createElement('div');
    bioHubContainer.className = 'bio-hub-container';

    const wz = state.settings.wizardData || {};
    const protocols = [];

    // --- NOWOŚĆ: TRYB BURN (Dla wszystkich, którzy nie mają ostrych restrykcji) ---
    // Sprawdzamy, czy użytkownik nie ma ostrego bólu (resilience != Critical)
    const canBurn = state.userStats?.resilience?.status !== 'Critical';
    if (canBurn) {
        protocols.push({ 
            mode: 'burn', 
            zone: 'metabolic', 
            time: 15, 
            title: 'Metabolic Burn', 
            desc: 'Low-impact Fat Loss', 
            icon: '🔥',
            styleClass: 'bio-card-booster' // używamy stylu boostera, bo to intensywne
        });
    }

    // 1. ZAWSZE DOSTĘPNE (Baza)
    protocols.push({ mode: 'booster', zone: 'core', time: 5, title: 'Brzuch ze stali', desc: 'Szybki obwód', icon: '⚡' });
    protocols.push({ mode: 'flow', zone: 'full_body', time: 8, title: 'Mobility Flow', desc: 'Płynny ruch całego ciała', icon: '🌊' });
    protocols.push({ mode: 'calm', zone: 'sleep', time: 10, title: 'Głęboki Reset', desc: 'Oddech i wyciszenie', icon: '🌙' });

    // 2. KONTEKSTOWE
    if (wz.work_type === 'sedentary') {
        protocols.unshift({ mode: 'flow', zone: 'office', time: 5, title: 'Anty-Biuro', desc: 'Rozprostuj się po pracy', icon: '🪑' });
    }

    if (wz.pain_locations?.includes('cervical')) {
        protocols.unshift({ mode: 'sos', zone: 'cervical', time: 4, title: 'Szyja: Ratunek', desc: 'Ulga w napięciu karku', icon: '💊' });
    }

    const hasSciatica = wz.medical_diagnosis?.includes('sciatica') || wz.pain_locations?.includes('sciatica');
    const hasHipIssues = wz.pain_locations?.includes('hip') || wz.medical_diagnosis?.includes('piriformis');

    if (hasSciatica || hasHipIssues) {
        protocols.unshift({ mode: 'neuro', zone: 'sciatica', time: 6, title: 'Neuro-Ślizgi', desc: 'Mobilizacja nerwów', icon: '⚡' });
    }

    if (wz.exercise_experience === 'advanced' || wz.exercise_experience === 'regular') {
        protocols.push({ mode: 'ladder', zone: 'full_body', time: 12, title: 'Drabina Progresji', desc: 'Buduj technikę', icon: '🧗' });
    }

    const cardsHTML = protocols.map(p => `
        <div class="bio-card ${p.styleClass || `bio-card-${p.mode}`}"
             data-mode="${p.mode}" data-zone="${p.zone}" data-time="${p.time}">
            <div class="bio-bg-icon">${p.icon}</div>
            <div class="bio-header">
                <span class="bio-tag">${p.mode.toUpperCase()}</span>
                <span class="bio-duration">⏱ ${p.time} min</span>
            </div>
            <div>
                <div class="bio-title">${p.title}</div>
                <div class="bio-desc">${p.desc}</div>
            </div>
        </div>
    `).join('');

    bioHubContainer.innerHTML = `
        <div class="section-title" style="margin-top:1.5rem; margin-bottom:0.8rem; padding-left:4px;">PROTOKOŁY CELOWANE</div>
        <div class="bio-hub-scroll">${cardsHTML}</div>
    `;

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
            } catch (err) {
                console.error("Błąd generowania protokołu:", err);
                alert("Nie udało się utworzyć tej sesji: " + err.message);
            }
        });
    });

    // ============================================================
    // C. SEKCJA "KOLEJNE W CYKLU"
    // ============================================================
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
// gamification.js

import { state } from './state.js';

const LEVEL_THRESHOLDS = [
    0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 
    55, 65, 75, 85, 100, 115, 130, 145, 160, 175, 
    190, 210, 230, 250, 275, 300, 350, 400, 450, 500
];

const TIERS = [
    { minLevel: 1, maxLevel: 9, icon: '/icons/badge-level-1.svg', name: 'Początkujący' },
    { minLevel: 10, maxLevel: 24, icon: '/icons/badge-level-2.svg', name: 'Adept' },
    { minLevel: 25, maxLevel: 999, icon: '/icons/badge-level-3.svg', name: 'Mistrz' }
];

function calculateStreak(userProgress) {
    const dates = Object.keys(userProgress).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) return 0;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    if (dates[0] !== today && dates[0] !== yesterday) {
        return 0;
    }

    let streak = 1;
    let currentDateStr = dates[0];

    for (let i = 1; i < dates.length; i++) {
        const prevDateStr = dates[i];
        const curr = new Date(currentDateStr);
        const prev = new Date(prevDateStr);
        const diffDays = Math.round(Math.abs(curr - prev) / (1000 * 60 * 60 * 24)); 

        if (diffDays === 1) {
            streak++;
            currentDateStr = prevDateStr;
        } else if (diffDays === 0) {
            continue; 
        } else {
            break; 
        }
    }
    return streak;
}

export function getGamificationState(userProgress) {
    let localTotalSessions = 0;
    let localStreak = 0;
    let serverTotalSessions = state.userStats?.totalSessions || 0;
    let serverStreak = state.userStats?.streak || 0;

    // 1. Oblicz dane z lokalnej historii (jeśli istnieje)
    if (userProgress && Object.keys(userProgress).length > 0) {
        Object.values(userProgress).forEach(daySessions => {
            localTotalSessions += daySessions.length;
        });
        localStreak = calculateStreak(userProgress);
    }

    // 2. INTELLIGENT MERGE (POPRAWKA)
    // Wybieramy większą wartość, co zabezpiecza nas przed sytuacją, 
    // gdy lokalnie mamy tylko 1 trening (dzisiejszy), a na serwerze 100.
    
    // Konwertujemy na int, bo z bazy/json mogą przyjść stringi
    serverTotalSessions = parseInt(serverTotalSessions) || 0;
    
    const totalSessions = Math.max(localTotalSessions, serverTotalSessions);
    
    // Streak jest trudniejszy - jeśli lokalny jest > 0 (czyli user ćwiczył dziś),
    // to jest bardziej aktualny niż serwerowy (który może być z wczoraj).
    // Jeśli lokalny to 0, bierzemy serwerowy.
    const streak = localStreak > 0 ? Math.max(localStreak, serverStreak) : serverStreak;


    // --- Obliczanie Poziomu (Reszta bez zmian) ---
    let currentLevel = 1;
    let nextLevelThreshold = LEVEL_THRESHOLDS[1];
    let currentLevelThreshold = LEVEL_THRESHOLDS[0];

    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalSessions >= LEVEL_THRESHOLDS[i]) {
            currentLevel = i + 1;
            currentLevelThreshold = LEVEL_THRESHOLDS[i];
            nextLevelThreshold = LEVEL_THRESHOLDS[i + 1] || (LEVEL_THRESHOLDS[i] + 50); 
        } else {
            break;
        }
    }

    let progressPercent = 0;
    const sessionsInCurrentLevel = totalSessions - currentLevelThreshold;
    const sessionsNeededForNext = nextLevelThreshold - currentLevelThreshold;
    
    if (sessionsNeededForNext > 0) {
        progressPercent = (sessionsInCurrentLevel / sessionsNeededForNext) * 100;
    }
    progressPercent = Math.min(100, Math.max(0, progressPercent));

    const tier = TIERS.find(t => currentLevel >= t.minLevel && currentLevel <= t.maxLevel) || TIERS[TIERS.length - 1];

    return {
        level: currentLevel,
        tierName: tier.name,
        iconPath: tier.icon,
        totalSessions,
        nextLevelThreshold,
        progressPercent,
        streak
    };
}
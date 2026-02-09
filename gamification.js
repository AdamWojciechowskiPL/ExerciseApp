// gamification.js

import { state } from './state.js';
import { getISODate } from './utils.js';

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

// --- DEFINICJE ODZNAK (ACHIEVEMENTS) ---
export const BADGES_CONFIG = [
    // Kamienie milowe sesji
    { id: 'first_step', label: 'Pierwszy Krok', desc: 'Ukończono 1. trening', icon: '🦶', condition: (s) => s.totalSessions >= 1 },
    { id: 'high_five', label: 'Piątka!', desc: 'Ukończono 5 treningów', icon: '✋', condition: (s) => s.totalSessions >= 5 },
    { id: 'warming_up', label: 'Rozgrzany', desc: 'Ukończono 10 treningów', icon: '🔥', condition: (s) => s.totalSessions >= 10 },
    { id: 'quarter_century', label: 'Dyscyplina', desc: 'Ukończono 25 treningów', icon: '🥈', condition: (s) => s.totalSessions >= 25 },
    { id: 'half_century', label: 'Półwiecze', desc: 'Ukończono 50 treningów', icon: '🥇', condition: (s) => s.totalSessions >= 50 },
    { id: 'centurion', label: 'Centurion', desc: 'Ukończono 100 treningów', icon: '👑', condition: (s) => s.totalSessions >= 100 },

    // Seria (Streak)
    { id: 'streak_3', label: 'Trójpak', desc: '3 dni treningowe z rzędu', icon: '⚡', condition: (s) => s.streak >= 3 },
    { id: 'streak_7', label: 'Tydzień Mocy', desc: '7 dni treningowych z rzędu', icon: '🗓️', condition: (s) => s.streak >= 7 },
    { id: 'streak_30', label: 'Nawyk Żelaza', desc: '30 dni treningowych z rzędu', icon: '🚀', condition: (s) => s.streak >= 30 },

    // Tarcza (Resilience)
    { id: 'shield_guardian', label: 'Strażnik', desc: 'Tarcza Resilience > 80%', icon: '🛡️', condition: (s) => (s.resilience && s.resilience.score >= 80) },

    // Fazy (Specjalne - nadawane ręcznie przez Phase Manager, tu tylko definicje do wyświetlania)
    { id: 'phase_control_master', label: 'Mistrz Kontroli', desc: 'Ukończono fazę Control', icon: '🧘', type: 'manual' },
    { id: 'phase_capacity_master', label: 'Żelazne Płuca', desc: 'Ukończono fazę Capacity', icon: '🔋', type: 'manual' },
    { id: 'phase_strength_master', label: 'Siłacz', desc: 'Ukończono fazę Strength', icon: '🦍', type: 'manual' },
    { id: 'phase_metabolic_master', label: 'Piecyk', desc: 'Ukończono fazę Metabolic', icon: '🚒', type: 'manual' }
];

function calculateStreak(userProgress) {
    const dates = Object.keys(userProgress).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) return 0;

    const now = new Date();
    const today = getISODate(now);

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getISODate(yesterdayDate);

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

    if (userProgress && Object.keys(userProgress).length > 0) {
        Object.values(userProgress).forEach(daySessions => {
            localTotalSessions += daySessions.length;
        });
        localStreak = calculateStreak(userProgress);
    }

    serverTotalSessions = parseInt(serverTotalSessions) || 0;
    const totalSessions = Math.max(localTotalSessions, serverTotalSessions);
    const streak = localStreak > 0 ? Math.max(localStreak, serverStreak) : serverStreak;

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

    // --- BADGE CALCULATION ---
    const earnedBadges = [];
    const statsForBadges = {
        totalSessions,
        streak,
        resilience: state.userStats?.resilience || { score: 0 }
    };

    // Auto-calculate badges based on stats
    BADGES_CONFIG.forEach(badge => {
        if (badge.type !== 'manual' && badge.condition(statsForBadges)) {
            earnedBadges.push(badge.id);
        }
    });

    // Merge with manually awarded badges (stored in state/DB - placeholder logic)
    // W prawdziwej implementacji pobralibyśmy to z user_settings lub user_achievements table
    // Na razie symulujemy, że badges są trzymane w userStats (jeśli backend je zwróci)
    const storedBadges = state.userStats?.achievements || [];
    const allBadges = [...new Set([...earnedBadges, ...storedBadges])];

    return {
        level: currentLevel,
        tierName: tier.name,
        iconPath: tier.icon,
        totalSessions,
        nextLevelThreshold,
        progressPercent,
        streak,
        badges: allBadges // Zwracamy listę ID zdobytych odznak
    };
}

/**
 * Sprawdza, czy po ostatniej sesji odblokowano nową odznakę.
 * @param {Object} oldStats - Statystyki przed sesją
 * @param {Object} newStats - Statystyki po sesji
 * @returns {Array} Lista nowych odznak (obiektów config)
 */
export function checkNewBadges(oldStats, newStats) {
    const newBadges = [];

    BADGES_CONFIG.forEach(badge => {
        if (badge.type === 'manual') return;

        const hadBefore = badge.condition(oldStats);
        const hasNow = badge.condition(newStats);

        if (!hadBefore && hasNow) {
            newBadges.push(badge);
        }
    });

    return newBadges;
}
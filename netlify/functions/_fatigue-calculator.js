// ExerciseApp/netlify/functions/_fatigue-calculator.js
'use strict';

/**
 * FATIGUE CALCULATOR v4.1 (Load Gated Monotony)
 *
 * Wykorzystuje model Banistera (Impulse-Response) zasilany danymi obliczanymi
 * metodą zmodyfikowanego RPE wg Fostera (2001).
 *
 * ZMIANA v4.1: Dodano "Load Gate". Monotonia jest ignorowana, jeśli średnie
 * obciążenie tygodniowe jest niskie (Paradoks Spacerowicza).
 */

// Stałe fizjologiczne i konfiguracyjne
const FATIGUE_HALF_LIFE_HOURS = 24;
const MAX_BUCKET_CAPACITY = 120;
const HISTORY_WINDOW_DAYS = 56; // 8 tygodni do kalibracji
const MIN_SESSIONS_FOR_CALIBRATION = 10;
const DEFAULT_SECONDS_PER_REP = 6;

// Stałe kalibracyjne
const LOAD_SCALE = 0.1333;

// --- NOWOŚĆ: BRAMKI BEZPIECZEŃSTWA (SAFETY GATES) ---
// Jeśli średnie dzienne obciążenie jest < 200 AU (np. 40 min RPE 5),
// wysoka monotonia jest fizjologicznie bezpieczna.
const MIN_RELEVANT_DAILY_LOAD = 200;
// Minimalny Strain, który może wywołać alarm (nawet przy wysokiej monotonii)
const MIN_RELEVANT_STRAIN_THRESHOLD = 2500;

// --- HELPERS STATYSTYCZNE ---

function getMean(array) {
    if (!array.length) return 0;
    return array.reduce((a, b) => a + b, 0) / array.length;
}

function getStandardDeviation(array, mean) {
    if (array.length < 2) return 0;
    const variance = array.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (array.length - 1);
    return Math.sqrt(variance);
}

function getPercentile(sortedArray, p) {
    if (!sortedArray.length) return 0;
    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sortedArray.length) return sortedArray[lower];
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

// --- HELPERS PARSOWANIA ---

function parseSetCount(setsString) {
    if (!setsString) return 1;
    const parts = String(setsString).split('-');
    return parseInt(parts[parts.length - 1].trim(), 10) || 1;
}

function parseDurationSeconds(valStr) {
    const text = String(valStr || '').toLowerCase();
    if (text.includes('min')) {
        const match = text.match(/(\d+(?:[.,]\d+)?)/);
        return match ? parseFloat(match[0].replace(',', '.')) * 60 : 60;
    }
    if (text.includes('s')) {
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[0], 10) : 30;
    }
    return 0;
}

function parseReps(valStr) {
    const text = String(valStr || '').toLowerCase();
    if (text.includes('s') || text.includes('min')) return 0;
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 10;
}

// --- LOGIKA BIZNESOWA ---

function calculateExerciseRPE(logEntry) {
    // 1. RIR (Złoty standard)
    if (logEntry.rir !== undefined && logEntry.rir !== null) {
        return Math.min(10, Math.max(1, 10 - logEntry.rir));
    }
    // 2. Quick Rating (Szybka ocena)
    if (logEntry.rating) {
        switch (logEntry.rating) {
            case 'hard': return 9;
            case 'ok': return 7;
            case 'good': return 6;
            case 'skipped': return 5;
            default: break;
        }
    }
    // 3. Fallback
    const difficultyLevel = logEntry.difficultyLevel || 1;
    const metabolicIntensity = logEntry.metabolicIntensity || 1;
    let rpe = difficultyLevel * 2;
    if (metabolicIntensity >= 3) {
        rpe += 1.5;
    }
    return Math.min(10, Math.max(1, rpe));
}

function calculateSessionLoadAU(session) {
    if (session.sessionLog && Array.isArray(session.sessionLog) && session.sessionLog.length > 0) {
        let totalLoad = 0;
        let hasValidLogs = false;

        session.sessionLog.forEach(log => {
            if (log.status === 'skipped' || log.isRest) return;
            hasValidLogs = true;

            const rpe = calculateExerciseRPE(log);
            const sets = parseSetCount(log.sets) || log.totalSets || 1;
            let workSeconds = 0;

            if (log.duration && log.duration > 0) {
                workSeconds = log.duration;
            } else {
                const timeBasedSec = parseDurationSeconds(log.reps_or_time);
                if (timeBasedSec > 0) {
                    workSeconds = timeBasedSec * sets;
                } else {
                    const reps = parseReps(log.reps_or_time);
                    workSeconds = reps * DEFAULT_SECONDS_PER_REP * sets;
                }
                const isUnilateral = String(log.reps_or_time || '').includes('/str');
                if (isUnilateral) workSeconds *= 2;
            }
            const load = (workSeconds / 60) * rpe;
            totalLoad += load;
        });

        if (hasValidLogs && totalLoad > 0) return totalLoad;
    }

    // Fallback Top-Down
    let durationMinutes = 0;
    if (session.netDurationSeconds) {
        durationMinutes = session.netDurationSeconds / 60;
    } else if (session.startedAt && session.completedAt) {
        const ms = new Date(session.completedAt) - new Date(session.startedAt);
        if (ms > 0 && ms < 6 * 3600000) durationMinutes = ms / 60000;
    } else {
        durationMinutes = 30;
    }
    const globalRPE = (session.feedback && parseInt(session.feedback.value, 10) === -1) ? 7 : 5;
    return durationMinutes * globalRPE;
}

async function calculateFatigueProfile(client, userId) {
    console.log(`[FatigueCalc v4.1] 🏁 Starting profile calculation for: ${userId}`);

    try {
        const query = `
            SELECT completed_at, session_data
            FROM training_sessions
            WHERE user_id = $1
              AND completed_at > NOW() - INTERVAL '56 days'
            ORDER BY completed_at ASC
        `;
        const dbResult = await client.query(query, [userId]);
        const sessions = dbResult.rows;

        const dailyLoadsMap = new Map();

        sessions.forEach(row => {
            const dateStr = new Date(row.completed_at).toISOString().split('T')[0];
            const data = row.session_data || {};
            if (!data.completedAt) data.completedAt = row.completed_at;

            const loadAU = calculateSessionLoadAU(data);
            const current = dailyLoadsMap.get(dateStr) || 0;
            dailyLoadsMap.set(dateStr, current + loadAU);
        });

        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);

        const historyFatigueScores = [];
        const historyStrainScores = [];
        let currentBucketScore = 0;

        let todayMonotony = 0;
        let todayStrain = 0;
        let todayWeekLoad = 0;

        for (let d = HISTORY_WINDOW_DAYS; d >= 0; d--) {
            const dateIter = new Date(now);
            dateIter.setUTCDate(dateIter.getUTCDate() - d);
            const dateKey = dateIter.toISOString().split('T')[0];

            currentBucketScore *= 0.5; // Decay
            const dayLoadAU = dailyLoadsMap.get(dateKey) || 0;
            const scaledLoad = dayLoadAU * LOAD_SCALE;
            currentBucketScore += scaledLoad;

            historyFatigueScores.push(currentBucketScore);

            const weeklyLoads = [];
            for (let w = 6; w >= 0; w--) {
                const wDate = new Date(dateIter);
                wDate.setUTCDate(wDate.getUTCDate() - w);
                const wKey = wDate.toISOString().split('T')[0];
                weeklyLoads.push(dailyLoadsMap.get(wKey) || 0);
            }

            const weekTotal = weeklyLoads.reduce((a, b) => a + b, 0);
            const weekMean = getMean(weeklyLoads);
            const weekSD = Math.max(1.0, getStandardDeviation(weeklyLoads, weekMean));

            const dailyMonotony = weekMean / weekSD;
            const dailyStrain = weekTotal * dailyMonotony;

            historyStrainScores.push(dailyStrain);

            if (d === 0) {
                todayMonotony = dailyMonotony;
                todayStrain = dailyStrain;
                todayWeekLoad = weekTotal;
            }
        }

        historyFatigueScores.sort((a, b) => a - b);
        historyStrainScores.sort((a, b) => a - b);

        const p85_fatigue = getPercentile(historyFatigueScores, 85);
        const p75_fatigue = getPercentile(historyFatigueScores, 75);
        const p60_fatigue = getPercentile(historyFatigueScores, 60);
        const p85_strain = getPercentile(historyStrainScores, 85);

        const sessionCount = sessions.length;
        const isCalibrated = sessionCount >= MIN_SESSIONS_FOR_CALIBRATION;

        let thEnter = 80, thExit = 60, thFilter = 70;

        if (isCalibrated) {
            thEnter = Math.max(80, p85_fatigue);
            thExit = Math.min(60, p60_fatigue);
            thFilter = Math.max(70, p75_fatigue);
        }

        const finalScore = Math.min(MAX_BUCKET_CAPACITY, Math.round(currentBucketScore));

        // --- ZMIANA: LOAD GATE CHECK ---
        const averageDailyLoad = todayWeekLoad / 7;
        const isMonotonyRelevant = (averageDailyLoad >= MIN_RELEVANT_DAILY_LOAD) && (todayStrain >= MIN_RELEVANT_STRAIN_THRESHOLD);

        const result = {
            fatigueScoreNow: finalScore,
            fatigueThresholdEnter: Math.round(thEnter),
            fatigueThresholdExit: Math.round(thExit),
            fatigueThresholdFilter: Math.round(thFilter),
            weekLoad7d: Math.round(todayWeekLoad),
            monotony7d: parseFloat(todayMonotony.toFixed(2)),
            strain7d: Math.round(todayStrain),
            p85_strain_56d: Math.round(p85_strain),
            p85_fatigue_56d: Math.round(p85_fatigue),
            isMonotonyRelevant: isMonotonyRelevant, // Flaga dla Phase Managera
            dataQuality: { sessions56d: sessionCount, calibrated: isCalibrated }
        };

        console.log(`[FatigueCalc] Result: Score=${finalScore}, Monotony=${result.monotony7d} (Relevant: ${isMonotonyRelevant}), AvgDailyLoad=${Math.round(averageDailyLoad)}`);
        return result;

    } catch (error) {
        console.error("[FatigueCalc] Critical Error:", error);
        return {
            fatigueScoreNow: 0, fatigueThresholdEnter: 80, fatigueThresholdExit: 60, fatigueThresholdFilter: 70,
            weekLoad7d: 0, monotony7d: 0, strain7d: 0, p85_strain_56d: 9999, p85_fatigue_56d: 80, isMonotonyRelevant: false,
            dataQuality: { sessions56d: 0, calibrated: false, error: error.message }
        };
    }
}

async function calculateAcuteFatigue(client, userId) {
    const profile = await calculateFatigueProfile(client, userId);
    return profile.fatigueScoreNow;
}

module.exports = { calculateAcuteFatigue, calculateFatigueProfile };
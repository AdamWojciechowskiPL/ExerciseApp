// ExerciseApp/netlify/functions/_fatigue-calculator.js
'use strict';

/**
 * FATIGUE CALCULATOR v3.0 (Science-Based Load)
 *
 * Wykorzystuje model Banistera (Impulse-Response) zasilany danymi obliczanymi
 * metodą zmodyfikowanego RPE wg Fostera (2001) oraz McGuigana (2004).
 *
 * Jednostka: Arbitrary Units (AU) = Czas (min) * RPE (1-10).
 */

// Stałe fizjologiczne i konfiguracyjne
const FATIGUE_HALF_LIFE_HOURS = 24;
const MAX_BUCKET_CAPACITY = 120;
const HISTORY_WINDOW_DAYS = 56; // 8 tygodni do kalibracji
const MIN_SESSIONS_FOR_CALIBRATION = 10;
const DEFAULT_SECONDS_PER_REP = 6; // Średnie tempo jeśli brak danych

// Stałe kalibracyjne (Session-RPE -> Bucket Point)
// Założenie: 60 min @ RPE 5 (Średnio) = 300 AU.
// 300 AU powinno odpowiadać ok. 40 punktom w wiadrze zmęczenia (skala 0-120).
// Skala: 40 / 300 = 0.1333
const LOAD_SCALE = 0.1333;

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

// --- HELPERS PARSOWANIA (Backend Version) ---

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
    return 0; // To nie jest czasówka
}

function parseReps(valStr) {
    const text = String(valStr || '').toLowerCase();
    if (text.includes('s') || text.includes('min')) return 0;
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 10;
}

// --- LOGIKA BIZNESOWA: SCIENCE-BASED LOAD ---

/**
 * Oblicza RPE (Rate of Perceived Exertion 1-10) dla pojedynczego ćwiczenia.
 * Bazuje na Difficulty Level (1-5) z korektą metaboliczną.
 */
function calculateExerciseRPE(difficultyLevel, metabolicIntensity) {
    // 1. Bazowe mapowanie Lvl 1-5 -> RPE 2-10 (Liniowe dla uproszczenia, fizjologicznie wykładnicze)
    // Lvl 1->2 (Easy), Lvl 3->6 (Hard), Lvl 5->10 (Max)
    let rpe = (difficultyLevel || 1) * 2;

    // 2. Korekta metaboliczna (Senna et al. 2011)
    // Krótkie przerwy/wysokie tętno zwiększają odczuwalny wysiłek
    if ((metabolicIntensity || 1) >= 3) {
        rpe += 1.5;
    }

    return Math.min(10, Math.max(1, rpe));
}

/**
 * Oblicza obciążenie (AU) dla całej sesji.
 * Priorytet: Suma (Czas ćwiczenia * RPE ćwiczenia).
 * Fallback: Czas sesji * RPE sesji.
 */
function calculateSessionLoadAU(session) {
    // A. BOTTOM-UP: Jeśli mamy logi, liczymy dokładnie (Micro-Load)
    if (session.sessionLog && Array.isArray(session.sessionLog) && session.sessionLog.length > 0) {
        let totalLoad = 0;
        let hasValidLogs = false;

        session.sessionLog.forEach(log => {
            // Ignoruj pominięte i przerwy
            if (log.status === 'skipped' || log.isRest) return;

            hasValidLogs = true;

            // 1. Parametry
            const rpe = calculateExerciseRPE(log.difficultyLevel, log.metabolicIntensity);
            const sets = parseSetCount(log.sets) || log.totalSets || 1; // Zazwyczaj w logu jest wpis per ćwiczenie (agregat) lub per seria
            
            // Logika Unilateral: jeśli w logu jest "x/str", to sets zazwyczaj oznacza sumę lub jedną stronę.
            // Przyjmujemy bezpiecznie: jeśli log.duration > 0 to ufamy logowi.
            
            let workSeconds = 0;

            // 2. Czas Pracy (Time Under Tension)
            if (log.duration && log.duration > 0) {
                // Jeśli mamy zmierzony czas z frontendu (najdokładniejsze)
                workSeconds = log.duration;
            } else {
                // Estymacja z planu
                const timeBasedSec = parseDurationSeconds(log.reps_or_time);
                if (timeBasedSec > 0) {
                    workSeconds = timeBasedSec * sets;
                } else {
                    const reps = parseReps(log.reps_or_time);
                    workSeconds = reps * DEFAULT_SECONDS_PER_REP * sets;
                }

                // Korekta Unilateral dla estymacji
                const isUnilateral = String(log.reps_or_time || '').includes('/str');
                if (isUnilateral) workSeconds *= 2;
            }

            // 3. Wzór Fostera: Minuty * RPE
            const load = (workSeconds / 60) * rpe;
            totalLoad += load;
        });

        if (hasValidLogs && totalLoad > 0) {
            return totalLoad;
        }
    }

    // B. TOP-DOWN (Fallback): Jeśli brak logów, użyj ogólnego czasu i RPE
    let durationMinutes = 0;
    if (session.netDurationSeconds) {
        durationMinutes = session.netDurationSeconds / 60;
    } else if (session.startedAt && session.completedAt) {
        const ms = new Date(session.completedAt) - new Date(session.startedAt);
        if (ms > 0 && ms < 6 * 3600000) durationMinutes = ms / 60000;
    } else {
        durationMinutes = 30; // Ostateczny fallback
    }

    const globalRPE = estimateSessionRPE(session);
    return durationMinutes * globalRPE;
}

function estimateSessionRPE(session) {
    // Mapping feedbacku usera na skalę 1-10
    if (session.feedback) {
        const val = parseInt(session.feedback.value, 10);
        if (val === -1) return 7; // Hard
        if (val === 1) return 3;  // Easy
    }
    // Domyślnie "Somewhat Hard"
    return 5;
}

/**
 * Główna funkcja obliczająca profil zmęczenia.
 * Pobiera historię z DB, symuluje przebieg zmęczenia i wylicza dynamiczne progi.
 *
 * @param {Object} client - Klient bazy danych
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} Profil zmęczenia
 */
async function calculateFatigueProfile(client, userId) {
    console.log(`[FatigueCalc v3] 🏁 Starting profile calculation for: ${userId}`);

    try {
        // 1. Pobierz historię (56 dni - okno kalibracyjne)
        const query = `
            SELECT completed_at, session_data
            FROM training_sessions
            WHERE user_id = $1
              AND completed_at > NOW() - INTERVAL '56 days'
            ORDER BY completed_at ASC
        `;
        const dbResult = await client.query(query, [userId]);
        const sessions = dbResult.rows;

        // 2. Mapowanie sesji na dni (YYYY-MM-DD) -> Load AU
        const dailyLoadsMap = new Map();

        sessions.forEach(row => {
            const dateStr = new Date(row.completed_at).toISOString().split('T')[0];
            const data = row.session_data || {};
            
            // Wstrzykujemy brakujące metadane, jeśli ich nie ma w JSON
            if (!data.completedAt) data.completedAt = row.completed_at;

            const loadAU = calculateSessionLoadAU(data);

            const current = dailyLoadsMap.get(dateStr) || 0;
            dailyLoadsMap.set(dateStr, current + loadAU);
        });

        // 3. Symulacja dzienna (od -56 dni do dzisiaj)
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0); // UTC Midnight!

        const historyFatigueScores = [];
        const historyStrainScores = [];

        let currentBucketScore = 0; // Stan wiadra (Acute Fatigue)

        // Zmienne do przechowywania wyników "na dzisiaj"
        let todayMonotony = 0;
        let todayStrain = 0;
        let todayWeekLoad = 0;

        // Pętla po dniach (od najdawniejszego do dzisiaj)
        for (let d = HISTORY_WINDOW_DAYS; d >= 0; d--) {
            const dateIter = new Date(now);
            dateIter.setUTCDate(dateIter.getUTCDate() - d);
            const dateKey = dateIter.toISOString().split('T')[0];

            // A. Decay (Upływ czasu - 24h)
            currentBucketScore *= 0.5;

            // B. Add Load (jeśli w tym dniu był trening)
            const dayLoadAU = dailyLoadsMap.get(dateKey) || 0;
            
            // Skalowanie AU do punktów wiadra (aby zachować kompatybilność z limitem 120)
            const scaledLoad = dayLoadAU * LOAD_SCALE;
            currentBucketScore += scaledLoad;

            historyFatigueScores.push(currentBucketScore);

            // C. Obliczanie Foster's Monotony & Strain (okno kroczące 7 dni wstecz)
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

        // 4. Sortowanie danych historycznych
        historyFatigueScores.sort((a, b) => a - b);
        historyStrainScores.sort((a, b) => a - b);

        // 5. Wyliczanie Percentyli (indywidualna tolerancja)
        const p85_fatigue = getPercentile(historyFatigueScores, 85);
        const p75_fatigue = getPercentile(historyFatigueScores, 75);
        const p60_fatigue = getPercentile(historyFatigueScores, 60);
        const p85_strain = getPercentile(historyStrainScores, 85);

        // 6. Kalibracja Progów
        const sessionCount = sessions.length;
        const isCalibrated = sessionCount >= MIN_SESSIONS_FOR_CALIBRATION;

        // Domyślne progi (Fallback dla nowych userów)
        let thEnter = 80;
        let thExit = 60;
        let thFilter = 70;

        if (isCalibrated) {
            thEnter = Math.max(80, p85_fatigue);
            thExit = Math.min(60, p60_fatigue);
            thFilter = Math.max(70, p75_fatigue);
        }

        const finalScore = Math.min(MAX_BUCKET_CAPACITY, Math.round(currentBucketScore));

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
            dataQuality: {
                sessions56d: sessionCount,
                sessions7d: dailyLoadsMap.size,
                calibrated: isCalibrated
            }
        };

        console.log(`[FatigueCalc] Profile Calculated: Score=${finalScore}, Enter=${result.fatigueThresholdEnter}, Monotony=${result.monotony7d.toFixed(2)}`);
        return result;

    } catch (error) {
        console.error("[FatigueCalc] Critical Error:", error);
        return {
            fatigueScoreNow: 0,
            fatigueThresholdEnter: 80,
            fatigueThresholdExit: 60,
            fatigueThresholdFilter: 70,
            weekLoad7d: 0, monotony7d: 0, strain7d: 0,
            p85_strain_56d: 9999, p85_fatigue_56d: 80,
            dataQuality: { sessions56d: 0, calibrated: false, error: error.message }
        };
    }
}

async function calculateAcuteFatigue(client, userId) {
    const profile = await calculateFatigueProfile(client, userId);
    return profile.fatigueScoreNow;
}

module.exports = { calculateAcuteFatigue, calculateFatigueProfile };
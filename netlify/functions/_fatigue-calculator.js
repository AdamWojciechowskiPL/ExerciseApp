// netlify/functions/_fatigue-calculator.js
'use strict';

/**
 * FATIGUE CALCULATOR v2.1 (UTC Fix & Robustness)
 *
 * Zastępuje sztywne progi (80/60) modelem indywidualnym opartym o:
 * 1. Banister Impulse-Response (Bucket 0-120) - kompatybilność wsteczna.
 * 2. Monotony & Strain (Foster) - wykrywanie ryzykownej stałości obciążenia.
 * 3. Percentyle historyczne (56 dni) - kalibracja pod unikalną tolerancję użytkownika.
 */

// Stałe fizjologiczne i konfiguracyjne
const FATIGUE_HALF_LIFE_HOURS = 24;
const MAX_BUCKET_CAPACITY = 120;
const HISTORY_WINDOW_DAYS = 56; // 8 tygodni do kalibracji
const MIN_SESSIONS_FOR_CALIBRATION = 10;

// Stałe kalibracyjne (Session-RPE -> Bucket Point)
// Założenie: 60 min @ RPE 5 (Średnio) = 300 AU.
// W starym modelu: 60 min * 1.0 intensity * 0.66 = ~40 pkt.
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

// --- HELPERS LOGIKI BIZNESOWEJ ---

function getNetDurationMinutes(session) {
    // 1. Czas netto z trackera (najdokładniejszy)
    if (session.netDurationSeconds) return Math.round(session.netDurationSeconds / 60);

    // 2. Różnica timestampów (jeśli brak pauz)
    if (session.startedAt && session.completedAt) {
        const diffMs = new Date(session.completedAt) - new Date(session.startedAt);
        // Sanity check: < 6h (odsiewamy sesje "wiszące" przez noc)
        if (diffMs > 0 && diffMs < 6 * 3600000) return Math.round(diffMs / 60000);
    }

    // 3. Fallback z logów (liczba ćwiczeń * estymata)
    const log = session.sessionLog || [];
    const completedCount = log.filter(l => l.status === 'completed').length;
    return completedCount * 4; // 4 minuty na ćwiczenie (z przerwami)
}

function estimateSessionRPE(session) {
    // 1. Explicit RPE (przyszłościowo - jeśli dodamy suwak RPE)
    if (session.rpe) return Math.max(1, Math.min(10, session.rpe));

    // 2. Feedback mapping (CR10 scale approximation)
    // -1 (Hard/Pain) -> 7 (Very Hard)
    //  0 (Good)      -> 5 (Hard) - Baseline
    //  1 (Easy)      -> 3 (Moderate)
    let rpe = 5;
    if (session.feedback) {
        const val = parseInt(session.feedback.value, 10);
        if (val === -1) rpe = 7;
        else if (val === 1) rpe = 3;
    }
    return rpe;
}

function calculateSessionLoadAU(session) {
    const duration = getNetDurationMinutes(session);
    const rpe = estimateSessionRPE(session);
    return duration * rpe;
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
    console.log(`[FatigueCalc v2] 🏁 Starting profile calculation for: ${userId}`);

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
            // Normalizacja daty do UTC ISO Date (ignorujemy czas)
            // Używamy daty z bazy, która jest w UTC
            const dateStr = new Date(row.completed_at).toISOString().split('T')[0];
            const data = row.session_data || {};
            if (!data.completedAt) data.completedAt = row.completed_at;

            const loadAU = calculateSessionLoadAU(data);

            // Sumowanie sesji z tego samego dnia (np. rano + wieczór)
            const current = dailyLoadsMap.get(dateStr) || 0;
            dailyLoadsMap.set(dateStr, current + loadAU);
        });

        // 3. Symulacja dzienna (od -56 dni do dzisiaj)
        // FIX: Używamy UTC Midnight, aby zgrać się z datami z bazy danych
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0); // UTC Midnight!

        // Tablice do percentyli
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
            // Odejmujemy dni w UTC
            dateIter.setUTCDate(dateIter.getUTCDate() - d);
            const dateKey = dateIter.toISOString().split('T')[0];

            // A. Decay (Upływ czasu - 24h)
            // Model Banistera: najpierw upływ czasu, potem impuls
            // Half-life 24h => mnożnik 0.5 co dobę
            currentBucketScore *= 0.5;

            // B. Add Load (jeśli w tym dniu był trening)
            const dayLoadAU = dailyLoadsMap.get(dateKey) || 0;
            const scaledLoad = dayLoadAU * LOAD_SCALE;
            currentBucketScore += scaledLoad;

            // Zbieramy historię stanu wiadra (do percentyli)
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
            // Zabezpieczenie SD przed zerem (min 1.0), aby monotonia nie była Infinity
            const weekSD = Math.max(1.0, getStandardDeviation(weeklyLoads, weekMean));

            const dailyMonotony = weekMean / weekSD;
            const dailyStrain = weekTotal * dailyMonotony;

            historyStrainScores.push(dailyStrain);

            // Zapisz stan bieżący (ostatnia iteracja pętli)
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
            // Adaptive Logic (US-06):
            // Próg wejścia w Deload (Enter):
            // Nie chcemy karać za wcześnie (min 80), ale jeśli user "wytrzymuje" więcej (p85 > 80), podnosimy poprzeczkę.
            thEnter = Math.max(80, p85_fatigue);

            // Próg wyjścia z Deload (Exit):
            // Histereza - musisz zejść do p60 lub 60, cokolwiek niższe (bezpieczeństwo).
            thExit = Math.min(60, p60_fatigue);

            // Próg Filtra (Ostrzeżenie/Redukcja w planie):
            // Zaczynamy filtrować trudne ćwiczenia przy p75 lub 70.
            thFilter = Math.max(70, p75_fatigue);
        }

        // Clamp wyniku końcowego wiadra (żeby nie wybuchło przy błędnych danych)
        const finalScore = Math.min(MAX_BUCKET_CAPACITY, Math.round(currentBucketScore));

        const result = {
            // --- CORE METRICS ---
            fatigueScoreNow: finalScore,

            // --- ADAPTIVE THRESHOLDS ---
            fatigueThresholdEnter: Math.round(thEnter),
            fatigueThresholdExit: Math.round(thExit),
            fatigueThresholdFilter: Math.round(thFilter),

            // --- MONOTONY & STRAIN (Current) ---
            weekLoad7d: Math.round(todayWeekLoad),
            monotony7d: parseFloat(todayMonotony.toFixed(2)),
            strain7d: Math.round(todayStrain),

            // --- HISTORICAL CONTEXT ---
            p85_strain_56d: Math.round(p85_strain),
            p85_fatigue_56d: Math.round(p85_fatigue),

            // --- METADATA ---
            dataQuality: {
                sessions56d: sessionCount,
                sessions7d: dailyLoadsMap.size, // Uproszczenie: liczba dni z treningiem
                calibrated: isCalibrated
            }
        };

        console.log(`[FatigueCalc] Profile Calculated: Score=${finalScore}, Enter=${result.fatigueThresholdEnter}, Monotony=${result.monotony7d.toFixed(2)}`);
        return result;

    } catch (error) {
        console.error("[FatigueCalc] Critical Error:", error);
        // Fail-safe Return (Fallback to static logic)
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

/**
 * Wrapper dla kompatybilności wstecznej.
 * Zwraca tylko liczbę (fatigueScoreNow), używany w endpointach statystyk,
 * które nie potrzebują pełnego profilu.
 */
async function calculateAcuteFatigue(client, userId) {
    const profile = await calculateFatigueProfile(client, userId);
    return profile.fatigueScoreNow;
}

module.exports = { calculateAcuteFatigue, calculateFatigueProfile };
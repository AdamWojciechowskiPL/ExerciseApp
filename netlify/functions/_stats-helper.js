// netlify/functions/_stats-helper.js

// Konfiguracja Tarczy (musi być spójna z frontendem)
const RESILIENCE_WINDOW_DAYS = 14;
const RESILIENCE_TARGET_SESSIONS = 10;

/**
 * Oblicza serię (Streak) dni treningowych pod rząd.
 * @param {Date[]} dates - Posortowana tablica dat (od najnowszej)
 */
function calculateStreak(dates) {
    if (!dates || dates.length === 0) return 0;
    
    // Unikalne daty YYYY-MM-DD
    const uniqueDates = [...new Set(dates.map(d => d.toISOString().split('T')[0]))];
    if (uniqueDates.length === 0) return 0;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    // Jeśli ostatni trening nie był dzisiaj ani wczoraj, seria = 0
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
        return 0;
    }

    let streak = 1;
    let currentDateStr = uniqueDates[0];

    for (let i = 1; i < uniqueDates.length; i++) {
        const prevDateStr = uniqueDates[i];
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

/**
 * Oblicza wynik Tarczy (Resilience Score).
 * @param {Date[]} dates - Posortowana tablica dat (od najnowszej)
 */
function calculateResilience(dates) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - RESILIENCE_WINDOW_DAYS);

    // 1. Policz sesje w oknie ostatnich 14 dni
    let sessionCount = 0;
    let lastTrainingDate = null;

    // Filtrujemy tylko daty z okna czasowego
    // (dates są posortowane malejąco, więc możemy przerwać pętlę wcześniej dla optymalizacji,
    // ale filter jest czytelniejszy i przy małej skali wystarczający)
    const recentDates = dates.filter(d => d >= cutoffDate);
    sessionCount = recentDates.length;

    if (recentDates.length > 0) {
        lastTrainingDate = recentDates[0]; // Pierwsza to najnowsza
    }

    // 2. Oblicz dni od ostatniego treningu
    let daysSinceLast = 0;
    if (lastTrainingDate) {
        const diffTime = Math.abs(now - lastTrainingDate);
        daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else {
        // Jeśli brak treningów w oknie, traktujemy jakby minęło całe okno
        daysSinceLast = RESILIENCE_WINDOW_DAYS;
    }

    // 3. Bazowy wynik (ilość sesji vs cel)
    let score = Math.min(100, Math.round((sessionCount / RESILIENCE_TARGET_SESSIONS) * 100));

    // 4. Kara za przerwę > 2 dni
    if (daysSinceLast > 2) {
        const penaltyDays = daysSinceLast - 2;
        const penalty = penaltyDays * 10;
        score = Math.max(0, score - penalty);
    }

    // 5. Status tekstowy
    let status = 'Critical';
    if (score >= 80) status = 'Strong';
    else if (score >= 50) status = 'Stable';
    else if (score >= 20) status = 'Vulnerable';

    return { score, status };
}

module.exports = { calculateStreak, calculateResilience };
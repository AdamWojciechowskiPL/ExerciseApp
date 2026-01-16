// netlify/functions/_fatigue-calculator.js
'use strict';

/**
 * FATIGUE CALCULATOR (Server-Side)
 * Oparty na uproszczonym modelu Banistera (Impulse-Response).
 * Oblicza 'Acute Training Load' (ATL) - czyli aktualne zmęczenie.
 */

// Stałe fizjologiczne
const FATIGUE_HALF_LIFE_HOURS = 24; // Czas, po którym zmęczenie spada o połowę
const MAX_BUCKET_CAPACITY = 120;    // Absolutny limit wiadra (powyżej tego jest "burnout")

// Helper: Parsowanie czasu trwania z logów (kopia logiki backendowej)
function getNetDurationMinutes(session) {
    // 1. Jeśli mamy zapisany czas netto (nowe sesje)
    if (session.netDurationSeconds) {
        return Math.round(session.netDurationSeconds / 60);
    }

    // 2. Fallback: Obliczenie z różnicy dat
    if (session.startedAt && session.completedAt) {
        const start = new Date(session.startedAt);
        const end = new Date(session.completedAt);
        const diffMs = end - start;
        if (diffMs > 0 && diffMs < 6 * 60 * 60 * 1000) { // Sanity check < 6h
            return Math.round(diffMs / 60000);
        }
    }

    // 3. Fallback ostateczny: Estymacja na podstawie liczby ćwiczeń
    const log = session.sessionLog || [];
    const completedCount = log.filter(l => l.status === 'completed').length;
    return completedCount * 3; // Średnio 3 min na ćwiczenie
}

// Helper: Ocena intensywności sesji (Intensity Factor)
function calculateIntensityFactor(session) {
    let factor = 1.0; // Bazowa intensywność

    // 1. Korekta o RPE (Subiektywna ocena użytkownika)
    if (session.feedback) {
        const val = parseInt(session.feedback.value, 10);
        const type = session.feedback.type;

        if (val === -1) { // "Za ciężko" / "Ból"
            factor += 0.5;
        } else if (val === 1) { // "Za lekko" / "Nuda"
            factor -= 0.3;
        }
        // val === 0 ("Idealnie") -> bez zmian
    }

    // 2. Korekta o średnią trudność ćwiczeń (jeśli dostępna w logu)
    const log = session.sessionLog || [];
    if (log.length > 0) {
        let sumDiff = 0;
        let count = 0;
        log.forEach(entry => {
            if (entry.status === 'completed' && entry.difficultyLevel) {
                sumDiff += entry.difficultyLevel;
                count++;
            }
        });

        if (count > 0) {
            const avgDiff = sumDiff / count;
            // Skalowanie: Lvl 1 -> x0.8, Lvl 3 -> x1.0, Lvl 5 -> x1.3
            const diffMod = (avgDiff - 3) * 0.15;
            factor += diffMod;
        }
    }

    return Math.max(0.5, factor); // Minimum 0.5 (Active Recovery)
}

/**
 * Oblicza aktualny poziom zmęczenia (0-100+) na podstawie historii.
 * @param {Object} client - Połączenie z bazą danych (pg pool client)
 * @param {string} userId - ID użytkownika
 * @returns {Promise<number>} - Wynik punktowy (Fatigue Score)
 */
async function calculateAcuteFatigue(client, userId) {
    console.log(`[FatigueCalc] 🏁 Starting calculation for user: ${userId}`);
    try {
        // 1. Pobierz sesje z ostatnich 7 dni (okno ostrego zmęczenia)
        const query = `
            SELECT completed_at, session_data
            FROM training_sessions
            WHERE user_id = $1
              AND completed_at > NOW() - INTERVAL '7 days'
            ORDER BY completed_at DESC
        `;

        const result = await client.query(query, [userId]);
        const sessions = result.rows;

        console.log(`[FatigueCalc] Found ${sessions.length} sessions in the last 7 days.`);

        if (sessions.length === 0) return 0; // Brak historii = Pełna świeżość

        let totalFatigue = 0;
        const now = new Date();

        // 2. Sumowanie "Impulsów Treningowych"
        for (const row of sessions) {
            const sessionDate = new Date(row.completed_at);
            const data = row.session_data || {};

            // A. Czas trwania (Minuty)
            const durationMin = getNetDurationMinutes({ ...data, completedAt: row.completed_at });
            if (durationMin <= 0) continue;

            // B. Współczynnik Intensywności
            const intensity = calculateIntensityFactor(data);

            // C. Raw Load (Surowy Ładunek)
            // Przyjmujemy, że 60 min średniego treningu (1.0) = 40 pkt zmęczenia (zgodnie z naszym modelem wiadra)
            // Stąd mnożnik 0.66 (40 / 60)
            const rawLoad = durationMin * intensity * 0.66;

            // D. Decay (Zanik w czasie)
            const hoursAgo = (now - sessionDate) / (1000 * 60 * 60);

            // Wzór wykładniczy: Load * 0.5 ^ (godziny / half_life)
            // Jeśli minęło 24h (half_life), zostaje 50% zmęczenia.
            // Jeśli minęło 48h, zostaje 25%.
            const residualFatigue = rawLoad * Math.pow(0.5, hoursAgo / FATIGUE_HALF_LIFE_HOURS);

            console.log(`[FatigueCalc] Session ${row.completed_at.toISOString().split('T')[0]}: Dur=${durationMin}m, Int=${intensity.toFixed(2)}, Raw=${rawLoad.toFixed(1)}, Residual=${residualFatigue.toFixed(1)} (Age: ${hoursAgo.toFixed(1)}h)`);

            totalFatigue += residualFatigue;
        }

        const finalScore = Math.min(MAX_BUCKET_CAPACITY, Math.round(totalFatigue));
        console.log(`[FatigueCalc] ✅ Final Score: ${finalScore} / ${MAX_BUCKET_CAPACITY}`);

        // 3. Wynik końcowy (zaokrąglony, z limitem)
        return finalScore;

    } catch (error) {
        console.error("[FatigueCalc] Error:", error);
        return 0; // Fail-safe: zakładamy świeżość w razie błędu
    }
}

module.exports = { calculateAcuteFatigue };
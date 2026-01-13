// netlify/functions/_stats-helper.js

// Konfiguracja Tarczy (musi być spójna z frontendem)
const RESILIENCE_WINDOW_DAYS = 14;
const RESILIENCE_TARGET_SESSIONS = 10;

/**
 * Oblicza serię (Streak) dni treningowych pod rząd.
 */
function calculateStreak(dates) {
    if (!dates || dates.length === 0) return 0;

    const uniqueDates = [...new Set(dates.map(d => d.toISOString().split('T')[0]))];
    if (uniqueDates.length === 0) return 0;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

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
 */
function calculateResilience(dates) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - RESILIENCE_WINDOW_DAYS);

    let sessionCount = 0;
    let lastTrainingDate = null;

    const recentDates = dates.filter(d => d >= cutoffDate);
    sessionCount = recentDates.length;

    if (recentDates.length > 0) {
        lastTrainingDate = recentDates[0];
    }

    let daysSinceLast = 0;
    if (lastTrainingDate) {
        const diffTime = Math.abs(now - lastTrainingDate);
        daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else {
        daysSinceLast = RESILIENCE_WINDOW_DAYS;
    }

    let score = Math.min(100, Math.round((sessionCount / RESILIENCE_TARGET_SESSIONS) * 100));

    if (daysSinceLast > 2) {
        const penaltyDays = daysSinceLast - 2;
        const penalty = penaltyDays * 10;
        score = Math.max(0, score - penalty);
    }

    let status = 'Critical';
    if (score >= 80) status = 'Strong';
    else if (score >= 50) status = 'Stable';
    else if (score >= 20) status = 'Vulnerable';

    return { score, status };
}

/**
 * Oblicza medianę.
 */
function getMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

/**
 * Analizuje historię usera i aktualizuje (lub usuwa) średnie tempo dla podanych ćwiczeń.
 */
async function calculateAndUpsertPace(client, userId, exerciseIdsToUpdate) {
    if (!exerciseIdsToUpdate || exerciseIdsToUpdate.length === 0) return;

    const query = `
        SELECT session_data
        FROM training_sessions
        WHERE user_id = $1
        ORDER BY completed_at DESC
        LIMIT 50
    `;
    const result = await client.query(query, [userId]);

    const samplesMap = {};
    exerciseIdsToUpdate.forEach(id => samplesMap[id] = []);

    for (const row of result.rows) {
        const session = row.session_data;
        if (!session || !session.sessionLog || !Array.isArray(session.sessionLog)) continue;

        const relevantLogs = session.sessionLog.filter(entry =>
            exerciseIdsToUpdate.includes(entry.exerciseId || entry.id) &&
            entry.status === 'completed' &&
            entry.duration > 0
        );

        for (const log of relevantLogs) {
            const valStr = String(log.reps_or_time || "").toLowerCase();
            if (valStr.includes('s') || valStr.includes('min') || valStr.includes(':')) continue;

            const reps = parseInt(valStr.match(/(\d+)/)?.[0] || "0", 10);
            if (reps <= 0) continue;

            const pace = log.duration / reps;
            if (pace < 1.0 || pace > 15.0) continue;

            const id = log.exerciseId || log.id;
            if (samplesMap[id].length < 10) {
                samplesMap[id].push(pace);
            }
        }
    }

    for (const exId of exerciseIdsToUpdate) {
        const samples = samplesMap[exId];
        if (samples && samples.length > 0) {
            const medianPace = getMedian(samples);
            const finalPace = Math.round(medianPace * 100) / 100;

            const upsertQuery = `
                INSERT INTO user_exercise_stats (user_id, exercise_id, avg_seconds_per_rep, sample_size, last_calculated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id)
                DO UPDATE SET
                    avg_seconds_per_rep = EXCLUDED.avg_seconds_per_rep,
                    sample_size = EXCLUDED.sample_size,
                    last_calculated_at = CURRENT_TIMESTAMP
            `;
            await client.query(upsertQuery, [userId, exId, finalPace, samples.length]);
        } else {
            const deleteQuery = `DELETE FROM user_exercise_stats WHERE user_id = $1 AND exercise_id = $2`;
            await client.query(deleteQuery, [userId, exId]);
        }
    }
}

/**
 * --- MODEL ENTROPII (SMART REHAB) ---
 * Aplikuje wygaszanie punktów affinity w czasie.
 * - Pozytywne (>0): Spadają o 2 pkt dziennie w stronę 0.
 * - Negatywne (<0): Rosną o 0.5 pkt dziennie w stronę 0 (regeneracja zaufania).
 */
async function applyEntropy(client, userId) {
    try {
        console.log(`[Entropy] Applying Time Decay for user ${userId}...`);

        // SQL wylicza różnicę w dniach i aplikuje odpowiedni wzór.
        // Jeśli affinity_score = 0, nic nie zmienia.
        // Aktualizuje 'updated_at' na TERAZ, aby "zresetować zegar" entropii.

        const query = `
            UPDATE user_exercise_preferences
            SET
                affinity_score = CASE
                    WHEN affinity_score > 0 THEN GREATEST(0, affinity_score - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) / 86400 * 2.0))
                    WHEN affinity_score < 0 THEN LEAST(0, affinity_score + (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) / 86400 * 0.5))
                    ELSE affinity_score
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
              AND affinity_score != 0
              AND updated_at < (CURRENT_TIMESTAMP - INTERVAL '12 hours') -- Optymalizacja: nie odpalaj częściej niż co 12h
        `;

        const res = await client.query(query, [userId]);
        if (res.rowCount > 0) {
            console.log(`[Entropy] Decayed scores for ${res.rowCount} exercises.`);
        }
    } catch (e) {
        console.error("[Entropy] Failed to apply decay:", e);
    }
}

module.exports = { calculateStreak, calculateResilience, calculateAndUpsertPace, applyEntropy };
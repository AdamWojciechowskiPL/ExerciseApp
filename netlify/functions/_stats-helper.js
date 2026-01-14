// netlify/functions/_stats-helper.js

// Konfiguracja Tarczy
const RESILIENCE_WINDOW_DAYS = 14;
const RESILIENCE_TARGET_SESSIONS = 10;

function calculateStreak(dates) {
    if (!dates || dates.length === 0) return 0;
    const uniqueDates = [...new Set(dates.map(d => d.toISOString().split('T')[0]))];
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

    let streak = 1;
    let currentDateStr = uniqueDates[0];
    for (let i = 1; i < uniqueDates.length; i++) {
        const prevDateStr = uniqueDates[i];
        const diffDays = Math.round(Math.abs(new Date(currentDateStr) - new Date(prevDateStr)) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) { streak++; currentDateStr = prevDateStr; }
        else if (diffDays === 0) continue;
        else break;
    }
    return streak;
}

function calculateResilience(dates) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - RESILIENCE_WINDOW_DAYS);
    const recentDates = dates.filter(d => d >= cutoffDate);
    const sessionCount = recentDates.length;
    
    let daysSinceLast = RESILIENCE_WINDOW_DAYS;
    if (recentDates.length > 0) {
        daysSinceLast = Math.floor(Math.abs(now - recentDates[0]) / (1000 * 60 * 60 * 24));
    }

    let score = Math.min(100, Math.round((sessionCount / RESILIENCE_TARGET_SESSIONS) * 100));
    if (daysSinceLast > 2) score = Math.max(0, score - (daysSinceLast - 2) * 10);

    let status = 'Critical';
    if (score >= 80) status = 'Strong';
    else if (score >= 50) status = 'Stable';
    else if (score >= 20) status = 'Vulnerable';

    return { score, status };
}

function getMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

async function calculateAndUpsertPace(client, userId, exerciseIdsToUpdate) {
    if (!exerciseIdsToUpdate || exerciseIdsToUpdate.length === 0) return;
    const query = `SELECT session_data FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50`;
    const result = await client.query(query, [userId]);
    const samplesMap = {};
    exerciseIdsToUpdate.forEach(id => samplesMap[id] = []);

    for (const row of result.rows) {
        const session = row.session_data;
        if (!session?.sessionLog) continue;
        const relevantLogs = session.sessionLog.filter(e => exerciseIdsToUpdate.includes(e.exerciseId || e.id) && e.status === 'completed' && e.duration > 0);
        
        for (const log of relevantLogs) {
            const valStr = String(log.reps_or_time || "").toLowerCase();
            if (valStr.includes('s') || valStr.includes('min') || valStr.includes(':')) continue;
            const reps = parseInt(valStr.match(/(\d+)/)?.[0] || "0", 10);
            if (reps <= 0) continue;
            const pace = log.duration / reps;
            if (pace >= 1.0 && pace <= 15.0 && samplesMap[log.exerciseId || log.id].length < 10) {
                samplesMap[log.exerciseId || log.id].push(pace);
            }
        }
    }

    for (const exId of exerciseIdsToUpdate) {
        const samples = samplesMap[exId];
        if (samples && samples.length > 0) {
            const finalPace = Math.round(getMedian(samples) * 100) / 100;
            const upsert = `INSERT INTO user_exercise_stats (user_id, exercise_id, avg_seconds_per_rep, sample_size, last_calculated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT (user_id, exercise_id) DO UPDATE SET avg_seconds_per_rep = EXCLUDED.avg_seconds_per_rep, sample_size = EXCLUDED.sample_size, last_calculated_at = CURRENT_TIMESTAMP`;
            await client.query(upsert, [userId, exId, finalPace, samples.length]);
        } else {
            await client.query(`DELETE FROM user_exercise_stats WHERE user_id = $1 AND exercise_id = $2`, [userId, exId]);
        }
    }
}

/**
 * --- MODEL ENTROPII (POPRAWIONY) ---
 * 1. Sprawdza `user_settings` aby nie odpalać się przy każdym odświeżeniu strony.
 * 2. Nie aktualizuje `updated_at` w tabeli preferencji, aby nie resetować 7-dniowego okresu ochronnego.
 */
async function applyEntropy(client, userId) {
    try {
        // 1. Sprawdź Globalny Timer (w user_settings)
        const settingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
        let settings = settingsRes.rows[0]?.settings || {};
        
        const lastRun = settings.last_entropy_run ? new Date(settings.last_entropy_run) : new Date(0);
        const now = new Date();
        const diffHours = (now - lastRun) / (1000 * 60 * 60);

        // Uruchamiaj maksymalnie raz na 12 godzin
        if (diffHours < 12) {
            return; 
        }

        console.log(`[Entropy] Applying Time Decay for user ${userId} (Last run: ${diffHours.toFixed(1)}h ago)...`);

        // 2. Aplikuj Entropię (BEZ ZMIANY updated_at!)
        // Dzięki temu 'updated_at' wskazuje datę ostatniej interakcji USERA.
        // Jeśli minęło 7 dni, ten warunek jest spełniony codziennie, powodując płynny spadek.
        const query = `
            UPDATE user_exercise_preferences
            SET
                affinity_score = CASE
                    WHEN affinity_score > 0 THEN GREATEST(0, affinity_score - 2) -- Stały spadek 2 pkt/dzień (uproszczone dla stabilności)
                    WHEN affinity_score < 0 THEN LEAST(0, affinity_score + 1)    -- Regeneracja 1 pkt/dzień
                    ELSE affinity_score
                END
            WHERE user_id = $1
              AND affinity_score != 0
              AND updated_at < (CURRENT_TIMESTAMP - INTERVAL '7 days') -- Grace Period Check
        `;

        const res = await client.query(query, [userId]);
        
        if (res.rowCount > 0) {
            console.log(`[Entropy] Decayed scores for ${res.rowCount} exercises.`);
        }

        // 3. Zapisz datę uruchomienia w Settings
        settings.last_entropy_run = now.toISOString();
        await client.query(
            `UPDATE user_settings SET settings = $1 WHERE user_id = $2`,
            [JSON.stringify(settings), userId]
        );

    } catch (e) {
        console.error("[Entropy] Failed to apply decay:", e);
    }
}

module.exports = { calculateStreak, calculateResilience, calculateAndUpsertPace, applyEntropy };
'use strict';

const { calculateStreak, calculateResilience, calculateAndUpsertPace } = require('../_stats-helper.js');

async function calculateUserStats(client, userId) {
    const historyResult = await client.query('SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC', [userId]);
    const allDates = historyResult.rows.map(r => new Date(r.completed_at));
    return {
        totalSessions: historyResult.rowCount,
        streak: calculateStreak(allDates),
        resilience: calculateResilience(allDates)
    };
}

async function updatePaceStats(client, userId, sessionLog) {
    let paceUpdateDurationMs = 0;

    try {
        if (sessionLog && Array.isArray(sessionLog)) {
            const exerciseIds = new Set();
            sessionLog.forEach(log => {
                if (log.status === 'completed' && log.duration > 0) {
                    const valStr = String(log.reps_or_time || '').toLowerCase();
                    if (!valStr.includes('s') && !valStr.includes('min') && !valStr.includes(':')) exerciseIds.add(log.exerciseId || log.id);
                }
            });
            if (exerciseIds.size > 0) {
                const startedAtMs = Date.now();
                await calculateAndUpsertPace(client, userId, Array.from(exerciseIds));
                paceUpdateDurationMs = Date.now() - startedAtMs;
            }
        }
    } catch (e) {
        console.error('Pace update failed:', e);
    }

    return paceUpdateDurationMs;
}

module.exports = { calculateUserStats, updatePaceStats };

'use strict';

async function fetchPlanGenerationData(client, userId, userData, deps) {
    const {
        normalizeExerciseRow,
        safeBuildUserContext,
        analyzeRpeTrend,
        analyzePainResponse,
        calculateFatigueProfile
    } = deps;

    const [eR, bR, pR, hR, sR, recentSessionsR, oR, fatigueProfile, settingsR] = await Promise.all([
        client.query('SELECT * FROM exercises'),
        client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
        client.query('SELECT exercise_id, affinity_score, difficulty_rating FROM user_exercise_preferences WHERE user_id = $1', [userId]),
        client.query(`SELECT session_data->'sessionLog' as logs, completed_at FROM training_sessions WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'`, [userId]),
        client.query('SELECT exercise_id, avg_seconds_per_rep FROM user_exercise_stats WHERE user_id = $1', [userId]),
        client.query(`SELECT completed_at, session_data->'feedback' as feedback FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 3`, [userId]),
        client.query('SELECT original_exercise_id, replacement_exercise_id, adjustment_type FROM user_plan_overrides WHERE user_id = $1', [userId]),
        calculateFatigueProfile(client, userId),
        client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId])
    ]);

    const exercises = eR.rows.map(r => normalizeExerciseRow(r, userData.exercise_experience));
    const ctx = safeBuildUserContext(userData);
    bR.rows.forEach(r => ctx.blockedIds.add(r.exercise_id));

    const preferencesMap = {};
    pR.rows.forEach(r => {
        preferencesMap[r.exercise_id] = { score: r.affinity_score, difficultyRating: r.difficulty_rating };
    });

    const historyMap = {};
    hR.rows.forEach(r => {
        const sessionDate = new Date(r.completed_at);
        (r.logs || []).forEach(l => {
            const id = l.exerciseId || l.id;
            if (!id) return;

            const existing = historyMap[id];
            const sameSession = existing && existing.date && sessionDate.getTime() === existing.date.getTime();
            const incomingSet = Number.isFinite(Number(l.currentSet)) ? Number(l.currentSet) : 0;
            const existingSet = Number.isFinite(Number(existing?.currentSet)) ? Number(existing.currentSet) : 0;
            const shouldReplace = !existing
                || sessionDate > existing.date
                || (sameSession && incomingSet >= existingSet);

            if (shouldReplace) {
                historyMap[id] = {
                    date: sessionDate,
                    rir: l.rir,
                    rating: l.rating,
                    difficultyDeviation: l.difficultyDeviation,
                    currentSet: l.currentSet,
                    totalSets: l.totalSets,
                    tech: l.tech
                };
            }
        });
    });

    const progressionMap = { sources: new Map(), targets: new Set(), overridesByOriginal: new Map() };
    oR.rows.forEach(r => {
        progressionMap.overridesByOriginal.set(r.original_exercise_id, r);
        if (r.adjustment_type === 'evolution' || r.adjustment_type === 'devolution') {
            progressionMap.sources.set(r.original_exercise_id, r.replacement_exercise_id);
            progressionMap.targets.add(r.replacement_exercise_id);
        }
        if (r.adjustment_type === 'micro_dose') {
            const existing = historyMap[r.original_exercise_id] || {};
            historyMap[r.original_exercise_id] = { ...existing, forceMicroDose: true };
        }
    });

    const paceMap = {};
    sR.rows.forEach(r => { paceMap[r.exercise_id] = parseFloat(r.avg_seconds_per_rep); });

    const recentSessions = recentSessionsR.rows;
    const rpeData = analyzeRpeTrend(recentSessions);
    const painData = analyzePainResponse(recentSessions);
    ctx.directionalNegative24hCount = painData.directionalNegative24hCount || 0;
    if (ctx.toleranceBias && ctx.directionalNegative24hCount >= 2) ctx.toleranceBias.strength = 1;

    const settings = settingsR.rows[0]?.settings || {};

    return {
        exercises,
        ctx,
        preferencesMap,
        historyMap,
        progressionMap,
        paceMap,
        rpeData,
        painData,
        fatigueProfile,
        settings
    };
}

module.exports = { fetchPlanGenerationData };

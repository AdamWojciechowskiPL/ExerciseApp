// netlify/functions/save-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience, calculateAndUpsertPace } = require('./_stats-helper.js');

const SCORE_LIKE_INCREMENT = 15;
const SCORE_DISLIKE_DECREMENT = 30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

async function updatePreferences(client, userId, ratings) {
    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) return;

    const scoreDeltas = new Map();
    const difficultyFlags = new Map();

    ratings.forEach(r => {
        const exId = String(r.exerciseId);
        if (r.action === 'like') scoreDeltas.set(exId, SCORE_LIKE_INCREMENT);
        else if (r.action === 'dislike') scoreDeltas.set(exId, -SCORE_DISLIKE_DECREMENT);
        else if (r.action === 'easy') difficultyFlags.set(exId, -1);
        else if (r.action === 'hard') difficultyFlags.set(exId, 1);
        else if (r.action === 'ok' || r.action === 'neutral') difficultyFlags.set(exId, 0);
    });

    for (const [exerciseId, delta] of scoreDeltas.entries()) {
        const sql = `
            INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
            VALUES ($1, $2, $3::INTEGER, 0, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                affinity_score = LEAST(${SCORE_MAX}, GREATEST(${SCORE_MIN}, COALESCE(user_exercise_preferences.affinity_score, 0) + $3::INTEGER)),
                updated_at = CURRENT_TIMESTAMP
        `;
        await client.query(sql, [userId, exerciseId, delta]);
    }

    for (const [exerciseId, difficulty] of difficultyFlags.entries()) {
        const sql = `
            INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
            VALUES ($1, $2, 0, $3::INTEGER, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                difficulty_rating = $3::INTEGER,
                updated_at = CURRENT_TIMESTAMP
        `;
        await client.query(sql, [userId, exerciseId, difficulty]);
    }
}

async function analyzeAndAdjustPlan(client, userId, sessionLog, feedback, ratings) {
    if (!ratings || !ratings.length) return null;

    const hardRating = ratings.find(r => r.action === 'hard');
    if (hardRating) {
        const currentId = hardRating.exerciseId;
        const currentNameRes = await client.query('SELECT name FROM exercises WHERE id = $1', [currentId]);
        const currentName = currentNameRes.rows[0]?.name || 'Ćwiczenie';

        const historyCheck = await client.query(`SELECT original_exercise_id FROM user_plan_overrides WHERE user_id = $1 AND replacement_exercise_id = $2 AND adjustment_type = 'evolution'`, [userId, currentId]);
        if (historyCheck.rows.length > 0) {
            await client.query(`
                INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $2, 'micro_dose', 'Ping-Pong detected', CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = $2, adjustment_type = 'micro_dose', updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId]);
            await client.query(`UPDATE user_exercise_preferences SET affinity_score = 0 WHERE user_id = $1 AND exercise_id = $2`, [userId, currentId]);
            return { original: currentName, type: 'micro_dose', newName: `${currentName} (Mikro-Serie)` };
        }

        const parentRes = await client.query(`SELECT id, name FROM exercises WHERE next_progression_id = $1 ORDER BY difficulty_level DESC LIMIT 1`, [currentId]);
        if (parentRes.rows.length > 0) {
            const parentEx = parentRes.rows[0];
            await client.query(`
                INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                VALUES ($1, $2, $3, 'devolution', 'Too Hard', CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', updated_at = CURRENT_TIMESTAMP
            `, [userId, currentId, parentEx.id]);
            return { original: currentName, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
        }
    }

    const easyRating = ratings.find(r => r.action === 'easy');
    if (easyRating) {
        const currentExRes = await client.query('SELECT id, name, next_progression_id FROM exercises WHERE id = $1', [easyRating.exerciseId]);
        if (currentExRes.rows.length > 0) {
            const currentEx = currentExRes.rows[0];
            if (currentEx.next_progression_id) {
                const nextRes = await client.query('SELECT name FROM exercises WHERE id = $1', [currentEx.next_progression_id]);
                const nextName = nextRes.rows[0]?.name || 'Trudniejszy wariant';
                await client.query(`
                    INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at)
                    VALUES ($1, $2, $3, 'evolution', 'Too Easy', CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', updated_at = CURRENT_TIMESTAMP
                `, [userId, currentEx.id, currentEx.next_progression_id]);
                return { original: currentEx.name, type: 'evolution', newId: currentEx.next_progression_id, newName: nextName };
            }
        }
    }
    return null;
}

/**
 * NOWA UNIWERSALNA FUNKCJA: INJECTION (Like) & EJECTION (Dislike)
 */
async function applyImmediatePlanAdjustments(client, userId, ratings, sessionLog) {
    const likes = ratings.filter(r => r.action === 'like');
    const dislikes = ratings.filter(r => r.action === 'dislike');

    if (likes.length === 0 && dislikes.length === 0) return false;

    // 1. Pobierz plan
    const settingsRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
    if (settingsRes.rows.length === 0) return false;
    
    const settings = settingsRes.rows[0].settings || {};
    const plan = settings.dynamicPlanData;
    
    if (!plan || !plan.days) return false;

    let planModified = false;
    const today = new Date().toISOString().split('T')[0];

    // --- LOGIKA LIKE (INJECTION) ---
    // Wstawiamy polubione ćwiczenie zamiast innych z tej samej kategorii
    if (likes.length > 0) {
        const likedIds = likes.map(l => l.exerciseId);
        const exRes = await client.query('SELECT id, name, category_id, equipment FROM exercises WHERE id = ANY($1)', [likedIds]);
        const likedExercises = exRes.rows;

        for (const likedEx of likedExercises) {
            let replacementCount = 0;
            // Parametry z logu
            const logEntry = sessionLog.find(l => (l.exerciseId === likedEx.id || l.id === likedEx.id) && l.status === 'completed');
            const templateReps = logEntry ? logEntry.reps_or_time : '10';
            const templateSets = logEntry ? logEntry.totalSets || '3' : '3';

            for (const day of plan.days) {
                if (day.date <= today || day.type === 'rest') continue;
                if (replacementCount >= 2) break;

                if (day.main) {
                    for (let i = 0; i < day.main.length; i++) {
                        const candidate = day.main[i];
                        if (candidate.category_id === likedEx.category_id && candidate.id !== likedEx.id) {
                            day.main[i] = {
                                ...candidate,
                                id: likedEx.id,
                                exerciseId: likedEx.id,
                                name: likedEx.name,
                                equipment: likedEx.equipment,
                                reps_or_time: templateReps,
                                sets: templateSets,
                                isSwapped: true,
                                description: candidate.description + "\n\n💡 ASYSTENT: Wstawiono, ponieważ lubisz to ćwiczenie."
                            };
                            planModified = true;
                            replacementCount++;
                            break; 
                        }
                    }
                }
            }
        }
    }

    // --- LOGIKA DISLIKE (EJECTION) ---
    // Szukamy w planie znienawidzonego ćwiczenia i wymieniamy na INNE z tej samej kategorii
    if (dislikes.length > 0) {
        for (const dislike of dislikes) {
            const dislikedId = dislike.exerciseId;
            let replacementFound = null;

            // Sprawdzamy czy to ćwiczenie w ogóle występuje w przyszłości
            let existsInFuture = false;
            for (const day of plan.days) {
                if (day.date <= today || day.type === 'rest') continue;
                if (day.main && day.main.some(ex => ex.id === dislikedId || ex.exerciseId === dislikedId)) {
                    existsInFuture = true;
                    break;
                }
            }

            if (existsInFuture) {
                // Szukamy zamiennika w bazie (bezpiecznego: ta sama kategoria, ten sam lub niższy poziom trudności)
                // Nie chcemy zamienić na coś jeszcze gorszego (trudniejszego)
                const replacementQuery = `
                    SELECT e.* FROM exercises e
                    JOIN exercises bad ON bad.id = $1
                    WHERE e.category_id = bad.category_id
                      AND e.id != $1
                      AND e.difficulty_level <= bad.difficulty_level
                    LIMIT 1
                `;
                const repRes = await client.query(replacementQuery, [dislikedId]);
                
                if (repRes.rows.length > 0) {
                    const newEx = repRes.rows[0];
                    replacementFound = newEx;

                    // Aplikujemy zamianę we wszystkich przyszłych dniach
                    for (const day of plan.days) {
                        if (day.date <= today || day.type === 'rest') continue;
                        if (day.main) {
                            for (let i = 0; i < day.main.length; i++) {
                                const target = day.main[i];
                                if (target.id === dislikedId || target.exerciseId === dislikedId) {
                                    console.log(`[Ejection] Removing ${dislikedId} -> ${newEx.id} on ${day.date}`);
                                    day.main[i] = {
                                        ...target,
                                        id: newEx.id,
                                        exerciseId: newEx.id,
                                        name: newEx.name,
                                        description: newEx.description,
                                        // Zachowujemy parametry starego ćwiczenia (bezpieczniej przy degradacji)
                                        // lub bierzemy domyślne, jeśli są puste
                                        reps_or_time: target.reps_or_time,
                                        sets: target.sets,
                                        isSwapped: true,
                                        description: newEx.description + "\n\n🛡️ ASYSTENT: Poprzednie ćwiczenie zostało usunięte z planu."
                                    };
                                    planModified = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (planModified) {
        await client.query(
            `UPDATE user_settings SET settings = jsonb_set(settings, '{dynamicPlanData}', $1) WHERE user_id = $2`,
            [JSON.stringify(plan), userId]
        );
        return true;
    }
    return false;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);
        const { planId, startedAt, completedAt, feedback, exerciseRatings, ...session_data } = body;

        if (!planId || !startedAt || !completedAt) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Missing required fields' }) };
        }

        const client = await pool.connect();
        let adaptationResult = null;
        let newStats = null;

        try {
            await client.query('BEGIN');

            await client.query(`
                INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, planId, startedAt, completedAt, JSON.stringify({ ...session_data, feedback, exerciseRatings })]);

            if (exerciseRatings && exerciseRatings.length > 0) {
                await updatePreferences(client, userId, exerciseRatings);
                
                // 1. Sprawdź twarde ewolucje (Too Easy/Hard)
                adaptationResult = await analyzeAndAdjustPlan(client, userId, session_data.sessionLog, feedback, exerciseRatings);
                
                // 2. Jeśli nie było ewolucji, wykonaj miękką adaptację (Like/Dislike)
                if (!adaptationResult) {
                    await applyImmediatePlanAdjustments(client, userId, exerciseRatings, session_data.sessionLog);
                }
            }

            const historyResult = await client.query('SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC', [userId]);
            const allDates = historyResult.rows.map(r => new Date(r.completed_at));
            newStats = {
                totalSessions: historyResult.rowCount,
                streak: calculateStreak(allDates),
                resilience: calculateResilience(allDates)
            };

            await client.query('COMMIT');

            try {
                if (session_data.sessionLog && Array.isArray(session_data.sessionLog)) {
                    const exerciseIds = new Set();
                    session_data.sessionLog.forEach(log => {
                        if (log.status === 'completed' && log.duration > 0) {
                            const valStr = String(log.reps_or_time || "").toLowerCase();
                            if (!valStr.includes('s') && !valStr.includes('min') && !valStr.includes(':')) exerciseIds.add(log.exerciseId || log.id);
                        }
                    });
                    if (exerciseIds.size > 0) await calculateAndUpsertPace(client, userId, Array.from(exerciseIds));
                }
            } catch (e) { console.error(e); }

            return { statusCode: 201, body: JSON.stringify({ message: "Saved", adaptation: adaptationResult, newStats }) };

        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('DB Error:', dbError);
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Handler Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Server Error: ${error.message}` }) };
    }
};
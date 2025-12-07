// netlify/functions/save-session.js

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateStreak, calculateResilience } = require('./_stats-helper.js');

/**
 * Aktualizuje preferencje ćwiczeń (Affinity Score i Difficulty) w bazie danych.
 * Wykonuje operację UPSERT (Insert lub Update).
 */
async function updatePreferences(client, userId, ratings) {
    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) return;

    for (const rating of ratings) {
        // rating: { exerciseId: string, action: 'like'|'dislike'|'hard'|'easy'|'neutral' }
        
        let scoreDelta = 0;
        let diffRating = 0; // 0 oznacza brak zmiany oceny trudności

        // Logika punktacji zgodnie z planem Affinity Engine
        switch (rating.action) {
            case 'like': 
                scoreDelta = 20; 
                break;
            case 'dislike': 
                scoreDelta = -20; 
                break;
            case 'hard': 
                scoreDelta = -10; 
                diffRating = 1; // Oznaczamy jako "Za trudne"
                break;
            case 'easy': 
                scoreDelta = -5; 
                diffRating = -1; // Oznaczamy jako "Za łatwe"
                break;
            // 'neutral' nie zmienia punktów
        }

        // Jeśli nie ma zmiany punktów ani trudności, pomijamy
        if (scoreDelta === 0 && diffRating === 0) continue;

        // Zapytanie UPSERT:
        // 1. Jeśli rekord istnieje: 
        //    - Dodajemy scoreDelta do obecnego wyniku (limitując zakres -100 do +100).
        //    - Aktualizujemy difficulty_rating TYLKO jeśli nowa ocena jest inna niż 0 (neutralna).
        // 2. Jeśli rekord nie istnieje:
        //    - Tworzymy nowy z wartościami początkowymi.
        const query = `
            INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                affinity_score = GREATEST(-100, LEAST(100, user_exercise_preferences.affinity_score + $3)),
                difficulty_rating = CASE WHEN $4 <> 0 THEN $4 ELSE user_exercise_preferences.difficulty_rating END,
                updated_at = CURRENT_TIMESTAMP
        `;

        await client.query(query, [userId, rating.exerciseId, scoreDelta, diffRating]);
    }
}

/**
 * Analizuje przebieg sesji i decyduje o Ewolucji (progresja) lub Dewolucji (regresja).
 * Priorytet mają konkretne oceny ćwiczeń, potem ogólny feedback.
 */
async function analyzeAndAdjustPlan(client, userId, sessionLog, feedback, ratings) {
    let adjustment = null;

    // ---------------------------------------------------------
    // ETAP 1: PRECYZYJNA KOREKTA (Na podstawie exerciseRatings)
    // ---------------------------------------------------------
    if (ratings && ratings.length > 0) {
        
        // A. Szukamy ćwiczeń oznaczonych jako "Za trudne" (HARD) -> Dewolucja
        // Robimy to w pierwszej kolejności dla bezpieczeństwa.
        const hardRating = ratings.find(r => r.action === 'hard');
        
        if (hardRating) {
            // Pobieramy dane ćwiczenia, aby znaleźć jego "rodzica" (łatwiejszą wersję)
            // Zakładamy, że w bazie exercises kolumna next_progression_id wskazuje NASTĘPNE.
            // Aby znaleźć POPRZEDNIE, musimy wyszukać ćwiczenie, które ma current.id jako next_progression_id.
            
            const currentExRes = await client.query('SELECT id, name FROM exercises WHERE id = $1', [hardRating.exerciseId]);
            if (currentExRes.rows.length > 0) {
                const currentEx = currentExRes.rows[0];
                
                // Szukamy ćwiczenia, które prowadzi do obecnego (Parent)
                const parentRes = await client.query('SELECT id, name FROM exercises WHERE next_progression_id = $1 LIMIT 1', [currentEx.id]);
                
                if (parentRes.rows.length > 0) {
                    const parentEx = parentRes.rows[0];
                    const reason = "User rated as Too Hard";
                    
                    await client.query(`
                        INSERT INTO user_plan_overrides 
                        (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at) 
                        VALUES ($1, $2, $3, 'devolution', $4, CURRENT_TIMESTAMP) 
                        ON CONFLICT (user_id, original_exercise_id) 
                        DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP
                    `, [userId, currentEx.id, parentEx.id, reason]);

                    return { original: currentEx.name, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
                }
            }
        }

        // B. Szukamy ćwiczeń oznaczonych jako "Za łatwe" (EASY) -> Ewolucja
        const easyRating = ratings.find(r => r.action === 'easy');
        
        if (easyRating) {
            const currentExRes = await client.query('SELECT id, name, next_progression_id FROM exercises WHERE id = $1', [easyRating.exerciseId]);
            if (currentExRes.rows.length > 0) {
                const currentEx = currentExRes.rows[0];
                
                if (currentEx.next_progression_id) {
                    const reason = "User rated as Too Easy";
                    
                    await client.query(`
                        INSERT INTO user_plan_overrides 
                        (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at) 
                        VALUES ($1, $2, $3, 'evolution', $4, CURRENT_TIMESTAMP) 
                        ON CONFLICT (user_id, original_exercise_id) 
                        DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP
                    `, [userId, currentEx.id, currentEx.next_progression_id, reason]);

                    return { original: currentEx.name, type: 'evolution', newId: currentEx.next_progression_id };
                }
            }
        }
    }

    // ---------------------------------------------------------
    // ETAP 2: GLOBALNA KOREKTA (Fallback - Stara logika)
    // ---------------------------------------------------------
    // Jeśli użytkownik nie wskazał konkretnych ćwiczeń, ale zgłosił ogólny problem.
    
    let direction = 'maintain';
    let reason = '';

    if (feedback) {
        if (feedback.type === 'tension') {
            if (feedback.value === 1) { direction = 'evolve'; reason = 'Monotony detected (Global)'; }
            else if (feedback.value === -1) { direction = 'devolve'; reason = 'Control loss (Global)'; }
        } else if (feedback.type === 'symptom') {
            if (feedback.value === -1) { direction = 'devolve'; reason = 'Flare-up (Global)'; }
        }
    }

    if (direction === 'maintain') return null;

    // Filtrujemy ćwiczenia z logu (tylko te wykonane i nierelaksacyjne)
    const candidates = sessionLog.filter(ex => !ex.isRest && ex.status !== 'skipped');
    if (candidates.length === 0) return null;
    
    const candidateIds = candidates.map(c => c.exerciseId || c.id).filter(Boolean);
    
    // Pobieramy dane kandydatów z bazy
    const exercisesResult = await client.query(`SELECT id, name, next_progression_id, difficulty_level FROM exercises WHERE id = ANY($1)`, [candidateIds]);
    let dbExercises = exercisesResult.rows;

    // Sortujemy: Dla Dewolucji szukamy najtrudniejszych, dla Ewolucji - dowolnego z progresją
    if (direction === 'devolve') {
        dbExercises.sort((a, b) => (b.difficulty_level || 0) - (a.difficulty_level || 0));
    }

    for (const dbEx of dbExercises) {
        if (direction === 'evolve' && dbEx.next_progression_id) {
            await client.query(`INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at) VALUES ($1, $2, $3, 'evolution', $4, CURRENT_TIMESTAMP) ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'evolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP`, [userId, dbEx.id, dbEx.next_progression_id, reason]);
            return { original: dbEx.name, type: 'evolution', newId: dbEx.next_progression_id };
        } else if (direction === 'devolve') {
            const parentResult = await client.query(`SELECT id, name FROM exercises WHERE next_progression_id = $1 LIMIT 1`, [dbEx.id]);
            if (parentResult.rows.length > 0) {
                const parentEx = parentResult.rows[0];
                await client.query(`INSERT INTO user_plan_overrides (user_id, original_exercise_id, replacement_exercise_id, adjustment_type, reason, updated_at) VALUES ($1, $2, $3, 'devolution', $4, CURRENT_TIMESTAMP) ON CONFLICT (user_id, original_exercise_id) DO UPDATE SET replacement_exercise_id = EXCLUDED.replacement_exercise_id, adjustment_type = 'devolution', reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP`, [userId, dbEx.id, parentEx.id, reason]);
                return { original: dbEx.name, type: 'devolution', newId: parentEx.id, newName: parentEx.name };
            }
        }
    }

    return null;
}

exports.handler = async (event) => {
    // Akceptujemy tylko POST
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const userId = await getUserIdFromEvent(event);
        const body = JSON.parse(event.body);
        
        // Destrukturyzacja z nowym polem exerciseRatings
        // exerciseRatings to tablica obiektów: { exerciseId, action }
        const { planId, startedAt, completedAt, feedback, exerciseRatings, ...session_data } = body;

        // Walidacja podstawowa
        if (!planId || !startedAt || !completedAt) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Missing required fields' }) };
        }

        const client = await pool.connect();
        let adaptationResult = null;
        let newStats = null;

        try {
            // --- POCZĄTEK TRANSAKCJI ---
            await client.query('BEGIN');

            // 1. Zapisz Sesję w Historii
            // Zapisujemy też exerciseRatings w JSON sesji, aby mieć historyczny ślad decyzji użytkownika
            const sessionDataToSave = { ...session_data, feedback, exerciseRatings };
            
            await client.query(`
                INSERT INTO training_sessions (user_id, plan_id, started_at, completed_at, session_data) 
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, planId, startedAt, completedAt, JSON.stringify(sessionDataToSave)]);

            // 2. Aktualizacja Preferencji (Affinity Score & Difficulty)
            if (exerciseRatings && exerciseRatings.length > 0) {
                await updatePreferences(client, userId, exerciseRatings);
            }

            // 3. Analiza Ewolucji / Dewolucji (Korekta Planu)
            // Uruchamiamy analizę jeśli jest feedback lub oceny ćwiczeń
            if ((feedback && feedback.value !== 0) || (exerciseRatings && exerciseRatings.length > 0)) {
                adaptationResult = await analyzeAndAdjustPlan(client, userId, session_data.sessionLog, feedback, exerciseRatings);
            }

            // 4. Rekalkulacja Statystyk Użytkownika (Streak, Resilience)
            // Pobieramy daty completed_at dla tego użytkownika
            const historyResult = await client.query(
                'SELECT completed_at FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC',
                [userId]
            );
            const allDates = historyResult.rows.map(r => new Date(r.completed_at));
            
            newStats = {
                totalSessions: historyResult.rowCount,
                streak: calculateStreak(allDates),
                resilience: calculateResilience(allDates)
            };

            // --- KONIEC TRANSAKCJI ---
            await client.query('COMMIT');
            
            return { 
                statusCode: 201, 
                body: JSON.stringify({ 
                    message: "Session saved successfully", 
                    adaptation: adaptationResult,
                    newStats: newStats
                }) 
            };

        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('Database transaction error:', dbError);
            throw dbError; // Przekazujemy błąd wyżej
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error in save-session handler:', error);
        return { statusCode: 500, body: JSON.stringify({ error: `Server Error: ${error.message}` }) };
    }
};
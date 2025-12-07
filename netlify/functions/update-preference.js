// netlify/functions/update-preference.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const userId = await getUserIdFromEvent(event);
    const { exerciseId, action, value } = JSON.parse(event.body);

    if (!exerciseId || !action) {
        return { statusCode: 400, body: "Missing parameters" };
    }

    const client = await pool.connect();
    
    let scoreDelta = 0;
    let diffRating = 0; // 0 = bez zmian/neutral, 1 = hard, -1 = easy
    let isSetOperation = false;
    let absoluteScore = 0;

    // Logika punktacji
    switch (action) {
        case 'like': scoreDelta = 20; break;
        case 'dislike': scoreDelta = -20; break;
        case 'hard': scoreDelta = -10; diffRating = 1; break;
        case 'easy': scoreDelta = -5; diffRating = -1; break;
        case 'reset_diff': diffRating = 99; break; // Kod resetu trudności
        
        // NOWOŚĆ: Tryb "SET" dla suwaka (Tuner)
        case 'set': 
            isSetOperation = true;
            absoluteScore = typeof value === 'number' ? value : 0;
            // Przy ręcznym ustawianiu suwakiem, resetujemy flagi trudności, 
            // chyba że front-end wyśle je osobno (w tym MVP zakładamy reset difficulty przy manualnym set score)
            // lub pozostawienie starej. Przyjmijmy: nie ruszamy difficulty w trybie set score, chyba że podano.
            break;
        case 'set_difficulty':
            // Specjalna akcja do zmiany samej trudności bez zmiany punktów
            diffRating = value; 
            break;
    }

    try {
        let query = '';
        let params = [];

        if (isSetOperation) {
            // Tryb SET: Nadpisujemy affinity_score konkretną wartością
            query = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, absoluteScore];
        } else if (action === 'set_difficulty') {
            // Tryb SET DIFFICULTY: Nadpisujemy tylko difficulty
            query = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    difficulty_rating = $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, diffRating];
        } else {
            // Tryb DELTA (Stary): Dodajemy/Odejmujemy
            query = `
                INSERT INTO user_exercise_preferences (user_id, exercise_id, affinity_score, difficulty_rating, updated_at)
                VALUES ($1, $2, $3, CASE WHEN $4 = 99 THEN 0 ELSE $4 END, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                    affinity_score = GREATEST(-100, LEAST(100, user_exercise_preferences.affinity_score + $3)),
                    difficulty_rating = CASE 
                        WHEN $4 = 99 THEN 0 
                        WHEN $4 <> 0 THEN $4 
                        ELSE user_exercise_preferences.difficulty_rating 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING affinity_score, difficulty_rating;
            `;
            params = [userId, exerciseId, scoreDelta, diffRating];
        }

        const result = await client.query(query, params);
        const newPref = result.rows[0];

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: "Updated",
                newScore: newPref.affinity_score,
                newDifficulty: newPref.difficulty_rating
            })
        };

    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Update Pref Error:', error);
    return { statusCode: 500, body: error.message };
  }
};
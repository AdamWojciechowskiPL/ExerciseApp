// netlify/functions/get-exercise-mastery.js
const { pool, getUserIdFromEvent } = require('./_auth-helper.js');

// Stałe do parsowania (kopia logiki z utils.js, aby funkcja była samowystarczalna)
const parseSetCount = (setsString) => {
    if (!setsString) return 1;
    const parts = String(setsString).split('-');
    return parseInt(parts[parts.length - 1].trim(), 10) || 1;
};

const getDurationOrReps = (valStr) => {
    if (!valStr) return { val: 0, type: 'reps' };
    const text = String(valStr).toLowerCase();
    
    // Mnożnik dla ćwiczeń jednostronnych
    const isUnilateral = text.includes('/str') || text.includes('stron');
    const multiplier = isUnilateral ? 2 : 1;

    // Czas
    if (text.includes('s') || text.includes('min')) {
        let seconds = 0;
        const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
        if (minMatch) {
            seconds = parseFloat(minMatch[1].replace(',', '.')) * 60;
        } else {
            const secMatch = text.match(/(\d+)/);
            if (secMatch) seconds = parseInt(secMatch[0], 10);
        }
        return { val: Math.round(seconds * multiplier), type: 'time' };
    }
    
    // Powtórzenia
    const repsMatch = text.match(/(\d+)/);
    const reps = repsMatch ? parseInt(repsMatch[0], 10) : 0;
    return { val: reps * multiplier, type: 'reps' }; // Dla powtórzeń też mnożymy, bo to suma pracy
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405 };

    try {
        const userId = await getUserIdFromEvent(event);
        const client = await pool.connect();

        try {
            // Pobieramy TYLKO logi z sesji zakończonych sukcesem
            // Używamy operatora -> 'sessionLog' aby wyciągnąć tablicę JSON
            const query = `
                SELECT session_data->'sessionLog' as logs 
                FROM training_sessions 
                WHERE user_id = $1 AND session_data->>'status' = 'completed'
            `;
            
            const result = await client.query(query, [userId]);
            
            const stats = {};

            // Agregacja w Node.js (szybsza niż skomplikowany SQL na JSONB przy tej strukturze)
            result.rows.forEach(row => {
                const logs = row.logs;
                if (!Array.isArray(logs)) return;

                logs.forEach(entry => {
                    if (entry.status === 'skipped') return;

                    // Normalizacja ID
                    const id = entry.exerciseId || entry.id || entry.name;
                    if (!id) return;

                    if (!stats[id]) {
                        stats[id] = {
                            id: id,
                            name: entry.name,
                            count: 0,
                            volume: 0,
                            maxVolume: 0,
                            type: 'reps'
                        };
                    }

                    const parsed = getDurationOrReps(entry.reps_or_time);
                    
                    // Sumujemy objętość (dla serii > 1 mnożymy? W logu mamy zazwyczaj wpis per seria lub zbiorczy)
                    // W Twoim systemie log zapisuje każdą serię osobno (chyba że to stary log).
                    // Przyjmijmy, że wpis w logu to wykonana praca.
                    
                    stats[id].type = parsed.type;
                    stats[id].count++;
                    stats[id].volume += parsed.val;
                    
                    if (parsed.val > stats[id].maxVolume) {
                        stats[id].maxVolume = parsed.val;
                    }
                });
            });

            const statsArray = Object.values(stats).sort((a, b) => b.volume - a.volume);

            return {
                statusCode: 200,
                body: JSON.stringify(statsArray)
            };

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Mastery Stats Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
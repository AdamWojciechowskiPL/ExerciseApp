// netlify/functions/get-exercise-animation.js
const { Pool } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id } = event.queryStringParameters;
    if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Exercise ID required' }) };
    }

    const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT animation_svg FROM exercises WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
        }

        const svg = result.rows[0].animation_svg;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400' // Cache na 24h w CDN
            },
            body: JSON.stringify({ svg })
        };

    } catch (error) {
        console.error('Fetch Animation Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    } finally {
        client.release();
        await pool.end();
    }
};
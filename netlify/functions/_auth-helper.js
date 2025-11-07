// netlify/functions/_auth-helper.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
const jwksRsaClient = jwksClient({ /* ... bez zmian ... */ });
function getKey(header, callback) { /* ... bez zmian ... */ }
const verifyToken = (token) => new Promise((resolve, reject) => { /* ... bez zmian ... */ });

/**
 * NOWA WERSJA: Warunkowo weryfikuje token lub ufa nagłówkowi.
 */
const getUserIdFromEvent = async (event) => {
    // Netlify automatycznie ustawia tę zmienną na 'dev' podczas `netlify dev`
    const isDevelopment = process.env.CONTEXT === 'dev';

    if (isDevelopment && event.headers['x-dev-user-id']) {
        console.log(`[DEV MODE] Trusting user ID from header: ${event.headers['x-dev-user-id']}`);
        return event.headers['x-dev-user-id'];
    }

    // W środowisku produkcyjnym ZAWSZE wykonuj pełną weryfikację
    console.log("[PROD MODE] Performing full token verification.");
    const authHeader = event.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized: No authorization header");
    
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error("Unauthorized: Bearer token not found");

    const decoded = await verifyToken(token);
    return decoded.sub;
};

module.exports = { pool, getUserIdFromEvent };
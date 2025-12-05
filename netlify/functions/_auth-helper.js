// netlify/functions/_auth-helper.js

// ZMIANA KRYTYCZNA: Importujemy Pool z oficjalnego sterownika Neon Serverless
const { Pool } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Usunięto jawną konfigurację SSL, ponieważ nowy sterownik zarządza tym automatycznie.
// Wystarczy przekazać connection string.
const pool = new Pool({
  connectionString: process.env.NETLIFY_DATABASE_URL,
});

const jwksRsaClient = jwksClient({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL.replace(/\/$/, '')}/.well-known/jwks.json`,
});

// Reszta pliku pozostaje bez żadnych zmian
function getKey(header, callback) {
  jwksRsaClient.getSigningKey(header.kid, function (err, key) {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

const verifyToken = (token) => new Promise((resolve, reject) => {
  const options = {
    audience: process.env.AUTH0_AUDIENCE,
    issuer: process.env.AUTH0_ISSUER_BASE_URL,
    algorithms: ['RS256'],
  };
  jwt.verify(token, getKey, options, (err, decoded) => {
    if (err) {
      reject(err);
    } else {
      resolve(decoded);
    }
  });
});

const getUserIdFromEvent = async (event) => {
  const isDevelopment = process.env.CONTEXT === 'dev';

  if (isDevelopment && event.headers['x-dev-user-id']) {
    return event.headers['x-dev-user-id'];
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) throw new Error("Unauthorized: No authorization header");

  const token = authHeader.split(' ')[1];
  if (!token) throw new Error("Unauthorized: Bearer token not found");

  const decoded = await verifyToken(token);
  return decoded.sub;
};

module.exports = { pool, getUserIdFromEvent };
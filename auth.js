import * as jose from 'https://cdn.jsdelivr.net/npm/jose@5/dist/browser/index.js';

let auth0Client = null;
let userPayload = null;
let userProfile = null; 

const AUTH_CONFIG = {
    domain: 'dev-2vw7d462t0vkpx5c.us.auth0.com',
    clientId: 'zHhWu3aQv8scz7TP4QtqzPjdFVHCYYo2',
    audience: 'https://excercise-app.netlify.app/'
};

const configureClient = async () => {
  try {
    auth0Client = await auth0.createAuth0Client({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: AUTH_CONFIG.audience,
        scope: 'openid profile email offline_access'
      }
    });
  } catch (err) {
    console.error("FATAL: Błąd podczas createAuth0Client:", err);
  }
};

const login = async () => {
  if (!auth0Client) return;
  try {
    await auth0Client.loginWithRedirect();
  } catch (err) {
    console.error("Błąd podczas loginWithRedirect:", err);
  }
};

const logout = () => {
  auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin
    }
  });
};

const getToken = async () => {
  if (!auth0Client) return null;
  try {
    // Ta funkcja będzie teraz wywoływana tylko wtedy, gdy jesteśmy pewni, że sesja istnieje.
    const token = await auth0Client.getTokenSilently();
    // Tutaj weryfikujemy i zapisujemy payload
    const JWKS = jose.createRemoteJWKSet(new URL(`https://${AUTH_CONFIG.domain}/.well-known/jwks.json`));
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `https://${AUTH_CONFIG.domain}/`,
      audience: AUTH_CONFIG.audience,
    });
    userPayload = payload;
    if (!userProfile) {
        userProfile = await auth0Client.getUser();
    }
    return token;
  } catch (e) {
    console.error("Błąd podczasgetTokenSilently:", e);
    return null;
  }
};

const getUserPayload = () => userPayload;
const getUserProfile = () => userProfile; 
const handleRedirectCallback = async () => {
  if (!auth0Client) return;
  try {
    await auth0Client.handleRedirectCallback();
  } catch(err) {
    console.error("Błąd w handleRedirectCallback:", err);
  }
};
const isAuthenticated = async () => {
  if (!auth0Client) return false;
  return await auth0Client.isAuthenticated();
};

export {
    configureClient,
    login,
    logout,
    getToken,
    getUserPayload,
    getUserProfile,
    handleRedirectCallback,
    isAuthenticated
};
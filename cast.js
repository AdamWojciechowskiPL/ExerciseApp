// cast.js

import { state } from './state.js';
import { getGamificationState } from './gamification.js';

/**
 * ID Aplikacji zarejestrowanej w Google Cast SDK Developer Console.
 */
const APPLICATION_ID = '9C041D7A';

/**
 * Przestrzeń nazw dla niestandardowych wiadomości JSON.
 */
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';

// Stan lokalny modułu
let castSession = null;
let isCasting = false;
let heartbeatInterval = null;

/**
 * Inicjalizuje API Google Cast.
 */
export const initializeCastApi = () => {
    if (typeof cast === 'undefined' || !cast.framework) {
        setTimeout(initializeCastApi, 250);
        return;
    }

    const context = cast.framework.CastContext.getInstance();
    
    try {
        context.setOptions({
            receiverApplicationId: APPLICATION_ID,
            autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
            language: 'pl',
            resumeSavedSession: true
        });

        context.addEventListener(
            cast.framework.CastContextEventType.SESSION_START_FAILED,
            (event) => {
                console.error('[Cast Sender] ❌ Błąd startu sesji:', event);
            }
        );

        // Listener zmian stanu sesji
        context.addEventListener(
            cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            (event) => {
                const currentCastSession = context.getCurrentSession();

                switch (event.sessionState) {
                    case cast.framework.SessionState.SESSION_STARTED:
                    case cast.framework.SessionState.SESSION_RESUMED:
                        castSession = currentCastSession;
                        isCasting = true;
                        console.log('[Cast Sender] ✅ Połączono z urządzeniem Chromecast.');
                        
                        // --- START HEARTBEAT ---
                        startHeartbeat();

                        if (state.userProgress) {
                            const stats = getGamificationState(state.userProgress);
                            sendUserStats(stats);
                        }
                        break;

                    case cast.framework.SessionState.SESSION_ENDED:
                    case cast.framework.SessionState.SESSION_ENDING:
                        castSession = null;
                        isCasting = false;
                        
                        // --- STOP HEARTBEAT ---
                        stopHeartbeat();
                        
                        console.log('[Cast Sender] 🔌 Rozłączono sesję.');
                        break;
                }
            }
        );
        
        console.log('[Cast Sender] API zainicjalizowane.');

    } catch (e) {
        console.error('[Cast Sender] Wyjątek podczas inicjalizacji:', e);
    }
};

export const getIsCasting = () => isCasting && castSession !== null;

// --- FIX: AGRESYWNY HEARTBEAT (ANTI-IDLE) ---
function startHeartbeat() {
    stopHeartbeat();
    
    // ZMIANA: Interwał zmniejszony z 240000 (4 min) na 20000 (20 sek).
    // Wiele TV z Androidem usypia połączenie po 60 sekundach braku pakietów.
    heartbeatInterval = setInterval(() => {
        if (getIsCasting()) {
            // console.log('[Cast Sender] 💓 Sending Heartbeat...'); // Opcjonalnie zakomentuj, żeby nie śmiecić w konsoli
            sendMessage({ type: 'PING' });
        }
    }, 20000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}
// -------------------------------

function sendMessage(message) {
    if (!getIsCasting()) return;
    
    try {
        castSession.sendMessage(CUSTOM_NAMESPACE, message)
            .catch(error => {
                console.error('[Cast Sender] ❌ Błąd wysyłania wiadomości:', error);
                if (error.code === 'session_error') {
                    isCasting = false;
                    stopHeartbeat();
                }
            });
    } catch (e) {
        console.error('[Cast Sender] Krytyczny błąd wysyłania:', e);
        isCasting = false;
        stopHeartbeat();
    }
}

// ============================================================
// PUBLICZNE API
// ============================================================

export const sendUserStats = (stats) => {
    sendMessage({ 
        type: 'UPDATE_USER_STATS', 
        payload: {
            level: stats.level,
            tierName: stats.tierName,
            iconPath: stats.iconPath,
            streak: stats.streak,
            totalSessions: stats.totalSessions
        } 
    });
};

export const sendTrainingStateUpdate = (payload) => {
    sendMessage({ type: 'UPDATE_STATE', payload });
};

export const sendPlayVideo = (youtubeId) => {
    sendMessage({ type: 'PLAY_VIDEO', payload: { youtubeId } });
};

export const sendStopVideo = () => {
    sendMessage({ type: 'STOP_VIDEO' });
};

export const sendShowIdle = () => {
    sendMessage({ type: 'SHOW_IDLE' });
};
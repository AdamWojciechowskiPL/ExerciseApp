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

/**
 * Inicjalizuje API Google Cast.
 */
export const initializeCastApi = () => {
    if (typeof cast === 'undefined' || !cast.framework) {
        setTimeout(initializeCastApi, 250);
        return;
    }

    const context = cast.framework.CastContext.getInstance();
    
    context.setOptions({
        receiverApplicationId: APPLICATION_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        language: 'pl',
        resumeSavedSession: true
    });

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
                    
                    // --- FIX: WYSYŁAMY STATYSTYKI OD RAZU PO POŁĄCZENIU ---
                    // Dzięki temu TV od razu pokaże rangę, a nie logo.
                    if (state.userProgress) {
                        const stats = getGamificationState(state.userProgress);
                        // Dodajemy też wynik tarczy, jeśli jest dostępny w asystencie
                        // (tutaj uproszczone, bo assistantEngine może nie być załadowany, 
                        //  ale główne stats z gamification wystarczą na start)
                        sendUserStats(stats);
                    }
                    break;

                case cast.framework.SessionState.SESSION_ENDED:
                case cast.framework.SessionState.SESSION_ENDING:
                    castSession = null;
                    isCasting = false;
                    console.log('[Cast Sender] 🔌 Rozłączono sesję.');
                    break;
            }
        }
    );
    
    console.log('[Cast Sender] API zainicjalizowane.');
};

export const getIsCasting = () => isCasting && castSession !== null;

function sendMessage(message) {
    if (!getIsCasting()) return;
    
    castSession.sendMessage(CUSTOM_NAMESPACE, message)
        .catch(error => {
            console.error('[Cast Sender] ❌ Błąd wysyłania wiadomości:', error);
            if (error.code === 'session_error') isCasting = false;
        });
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
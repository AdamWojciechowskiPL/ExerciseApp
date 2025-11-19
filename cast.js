// cast.js

const APPLICATION_ID = '9C041D7A';
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';

let castSession = null;
let isCasting = false;

/**
 * Inicjalizuje API Google Cast i zarządza cyklem życia sesji.
 */
export const initializeCastApi = () => {
    if (typeof cast === 'undefined' || !cast.framework) {
        setTimeout(initializeCastApi, 150);
        return;
    }

    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
        receiverApplicationId: APPLICATION_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        language: 'pl'
    });

    // Listener zarządza wyłącznie stanem sesji na potrzeby wysyłania wiadomości.
    context.addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
            const currentCastSession = context.getCurrentSession();

            switch (event.sessionState) {
                case cast.framework.SessionState.SESSION_STARTED:
                case cast.framework.SessionState.SESSION_RESUMED:
                    castSession = currentCastSession;
                    isCasting = true;
                    console.log('[Cast Sender] Sesja połączona i aktywna.');
                    break;

                case cast.framework.SessionState.SESSION_ENDED:
                case cast.framework.SessionState.SESSION_ENDING:
                    castSession = null;
                    isCasting = false;
                    console.log('[Cast Sender] Sesja zakończona.');
                    break;
            }
        }
    );
};

/**
 * Zwraca informację, czy sesja Cast jest aktywna.
 * @returns {boolean}
 */
export const getIsCasting = () => isCasting && castSession !== null;

/**
 * Wysyła wiadomość do aktywnego odbiornika.
 * @param {object} message - Obiekt wiadomości do wysłania.
 */
export function sendMessage(message) {
    if (!getIsCasting()) {
        return; // Ciche wyjście, jeśli sesja nie jest aktywna.
    }
    castSession.sendMessage(CUSTOM_NAMESPACE, message)
        .catch(error => console.error('[Cast Sender] Błąd wysyłania wiadomości:', error));
}

// --- Funkcje pomocnicze (API modułu) ---

export const sendTrainingStateUpdate = (payload) => sendMessage({ type: 'UPDATE_STATE', payload });
export const sendPlayVideo = (youtubeId) => sendMessage({ type: 'PLAY_VIDEO', payload: { youtubeId } });
export const sendStopVideo = () => sendMessage({ type: 'STOP_VIDEO' });
export const sendShowIdle = () => sendMessage({ type: 'SHOW_IDLE' });
export const sendSetupQueue = (payload) => sendMessage({ type: 'SETUP_QUEUE', payload });
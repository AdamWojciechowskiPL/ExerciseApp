// cast.js

/**
 * ID Aplikacji zarejestrowanej w Google Cast SDK Developer Console.
 * Musi pasować do ID użytego w pliku receivera.
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
 * Inicjalizuje API Google Cast i zarządza cyklem życia sesji.
 * Funkcja rekurencyjnie sprawdza dostępność obiektu `cast`, jeśli biblioteka się jeszcze nie załadowała.
 */
export const initializeCastApi = () => {
    if (typeof cast === 'undefined' || !cast.framework) {
        // Biblioteka jeszcze nie gotowa, spróbuj ponownie za chwilę
        setTimeout(initializeCastApi, 250);
        return;
    }

    const context = cast.framework.CastContext.getInstance();
    
    context.setOptions({
        receiverApplicationId: APPLICATION_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        language: 'pl', // Ustawia język odbiornika na polski
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
    
    console.log('[Cast Sender] API zainicjalizowane, oczekiwanie na urządzenia...');
};

/**
 * Zwraca informację, czy sesja Cast jest aktywna.
 * @returns {boolean}
 */
export const getIsCasting = () => isCasting && castSession !== null;

/**
 * Wewnętrzna funkcja pomocnicza do wysyłania wiadomości JSON do odbiornika.
 * @param {object} message - Obiekt wiadomości ({ type, payload }).
 */
function sendMessage(message) {
    if (!getIsCasting()) {
        // Ciche wyjście, jeśli sesja nie jest aktywna - zapobiega błędom w konsoli
        return; 
    }
    
    castSession.sendMessage(CUSTOM_NAMESPACE, message)
        .then(() => {
            // Opcjonalnie: console.log(`[Cast Sender] Wysłano: ${message.type}`);
        })
        .catch(error => {
            console.error('[Cast Sender] ❌ Błąd wysyłania wiadomości:', error);
            // Jeśli błąd jest krytyczny, można tu zresetować flagę isCasting
            if (error.code === 'session_error') {
                isCasting = false;
            }
        });
}

// ============================================================
// PUBLICZNE API (Metody sterujące)
// ============================================================

/**
 * Wysyła statystyki grywalizacji (Hero Dashboard) do wyświetlenia na ekranie powitalnym TV.
 * @param {object} stats - Obiekt zwrócony przez gamification.js
 */
export const sendUserStats = (stats) => {
    sendMessage({ 
        type: 'UPDATE_USER_STATS', 
        payload: {
            level: stats.level,
            tierName: stats.tierName,
            iconPath: stats.iconPath, // np. '/icons/badge-level-1.svg'
            streak: stats.streak,
            totalSessions: stats.totalSessions
        } 
    });
};

/**
 * Wysyła aktualny stan licznika i ćwiczenia podczas treningu.
 * @param {object} payload - { timerValue, exerciseName, nextExercise, isRest, ... }
 */
export const sendTrainingStateUpdate = (payload) => {
    sendMessage({ type: 'UPDATE_STATE', payload });
};

/**
 * Rozkazuje odtworzyć wideo z YouTube na TV.
 * @param {string} youtubeId - ID filmu (np. dQw4w9WgXcQ)
 */
export const sendPlayVideo = (youtubeId) => {
    sendMessage({ type: 'PLAY_VIDEO', payload: { youtubeId } });
};

/**
 * Zatrzymuje wideo i wraca do ekranu treningu (lub symulacji mediów).
 */
export const sendStopVideo = () => {
    sendMessage({ type: 'STOP_VIDEO' });
};

/**
 * Wymusza pokazanie ekranu "Idle" (Dashboardu), np. po zakończeniu treningu.
 */
export const sendShowIdle = () => {
    sendMessage({ type: 'SHOW_IDLE' });
};

/**
 * Konfiguruje "sztuczną" kolejkę mediów na odbiorniku, aby systemy Android/iOS
 * widziały kontrolki multimedialne na ekranie blokady.
 * @param {Array} queueItems - Lista kroków treningowych.
 */
export const sendSetupQueue = (queueItems) => {
    sendMessage({ type: 'SETUP_QUEUE', payload: queueItems });
};
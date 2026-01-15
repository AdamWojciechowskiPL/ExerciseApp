// sessionRecovery.js - Moduł do odzyskiwania przerwanej sesji treningowej

const STORAGE_KEY = 'training_session_backup';
const BACKUP_VERSION = 1;

/**
 * Zapisuje aktualny stan sesji do localStorage.
 * Wywoływane przy każdej zmianie ćwiczenia/postępie.
 */
export function saveSessionBackup(data) {
    const backup = {
        version: BACKUP_VERSION,
        savedAt: new Date().toISOString(),

        // Dane sesji
        sessionStartTime: data.sessionStartTime,
        totalPausedTime: data.totalPausedTime || 0,

        // Plan info
        planId: data.planId,
        planMode: data.planMode,
        currentTrainingDayId: data.currentTrainingDayId,
        trainingTitle: data.trainingTitle,

        // Dane dynamicznego planu (jeśli dotyczy)
        todaysDynamicPlan: data.todaysDynamicPlan || null,

        // Postęp
        flatExercises: data.flatExercises,
        currentExerciseIndex: data.currentExerciseIndex,
        sessionLog: data.sessionLog,

        // Timer state - PRECYZYJNY ZAPIS
        stopwatchSeconds: data.stopwatchSeconds || 0,
        timerTimeLeft: data.timerTimeLeft || 0,
        timerInitialDuration: data.timerInitialDuration || 0,

        // Session params
        sessionParams: data.sessionParams || { initialPainLevel: 0, timeFactor: 1.0 }
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
    } catch (e) {
        console.warn('[SessionRecovery] Failed to save backup:', e);
    }
}

/**
 * Pobiera backup sesji z localStorage.
 * @returns {Object|null} Dane backup lub null jeśli nie istnieje
 */
export function getSessionBackup() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const backup = JSON.parse(raw);

        // Walidacja wersji
        if (backup.version !== BACKUP_VERSION) {
            console.warn('[SessionRecovery] Backup version mismatch, clearing...');
            clearSessionBackup();
            return null;
        }

        return backup;
    } catch (e) {
        console.warn('[SessionRecovery] Failed to read backup:', e);
        return null;
    }
}

/**
 * Usuwa backup sesji z localStorage.
 * Wywoływane po zapisaniu lub anulowaniu treningu.
 */
export function clearSessionBackup() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[SessionRecovery] 🗑️ Backup cleared');
    } catch (e) {
        console.warn('[SessionRecovery] Failed to clear backup:', e);
    }
}

/**
 * Oblicza lukę czasową od momentu przerwania sesji.
 * @param {Object} backup - Dane backup
 * @returns {number} Luka w milisekundach
 */
export function calculateTimeGap(backup) {
    if (!backup || !backup.savedAt) return 0;

    const savedAt = new Date(backup.savedAt);
    const now = new Date();
    return Math.max(0, now - savedAt);
}

/**
 * Formatuje lukę czasową do czytelnego formatu.
 * @param {number} gapMs - Luka w milisekundach
 * @returns {string} Czytelny format (np. "5 minut", "2 godziny")
 */
export function formatTimeGap(gapMs) {
    const minutes = Math.floor(gapMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ${days === 1 ? 'dzień' : (days < 5 ? 'dni' : 'dni')}`;
    if (hours > 0) return `${hours} ${hours === 1 ? 'godzinę' : (hours < 5 ? 'godziny' : 'godzin')}`;
    if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minutę' : (minutes < 5 ? 'minuty' : 'minut')}`;
    return 'chwilę';
}
// dataStore.js

import { state } from './state.js';
import { getISODate } from './utils.js';

/**
 * Moduł Zarządzania Danymi
 * 
 * Odpowiada za komunikację z pamięcią przeglądarki (localStorage).
 * Hermetyzuje logikę wczytywania i zapisywania stanu aplikacji,
 * zapewniając, że dane użytkownika są trwale przechowywane między sesjami.
 */
const dataStore = {
    /**
     * Wczytuje postępy i ustawienia użytkownika z localStorage do obiektu stanu.
     * Wykonywane raz przy starcie aplikacji.
     */
    load: () => {
        // Wczytywanie postępów w treningach
        const progressData = localStorage.getItem('trainingAppProgress');
        if (progressData) {
            try {
                state.userProgress = JSON.parse(progressData);
            } catch (e) {
                console.error("Błąd podczas parsowania danych postępów:", e);
                state.userProgress = {}; // Resetuj w przypadku błędu
            }
        }
        
        // Wczytywanie ustawień
        const settingsData = localStorage.getItem('trainingAppSettings');
        if (settingsData) {
            try {
                const loadedSettings = JSON.parse(settingsData);
                // =========================================================================
                // KLUCZOWA ZMIANA: Zapewnienie kompatybilności wstecznej.
                // Łączymy domyślne ustawienia z wczytanymi. Jeśli w localStorage
                // brakuje nowego pola (np. 'activePlanId'), zostanie ono dodane
                // z domyślną wartością z obiektu `state`. Istniejące ustawienia
                // użytkownika zostaną zachowane.
                // =========================================================================
                state.settings = { ...state.settings, ...loadedSettings };
            } catch (e) {
                console.error("Błąd podczas parsowania danych ustawień:", e);
                // W przypadku błędu, ustawienia pozostaną domyślne
            }
        }
        
        // Inicjalizacja daty startowej, jeśli nie została jeszcze ustawiona
        if (!state.settings.appStartDate) {
            state.settings.appStartDate = getISODate(new Date());
            dataStore.saveSettings();
        }
    },

    /**
     * Zapisuje aktualny stan postępów użytkownika do localStorage.
     */
    saveProgress: () => {
        try {
            localStorage.setItem('trainingAppProgress', JSON.stringify(state.userProgress));
        } catch (e) {
            console.error("Nie udało się zapisać postępów w localStorage:", e);
            alert("Wystąpił błąd podczas zapisywania Twoich postępów. Możliwe, że pamięć przeglądarki jest pełna.");
        }
    },

    /**
     * Zapisuje aktualny stan ustawień aplikacji do localStorage.
     */
    saveSettings: () => {
        try {
            localStorage.setItem('trainingAppSettings', JSON.stringify(state.settings));
        } catch (e) {
            console.error("Nie udało się zapisać ustawień w localStorage:", e);
        }
    }
};

export default dataStore;
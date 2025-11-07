// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';

/**
 * Centralna funkcja do wysyłania uwierzytelnionych zapytań do API (funkcji Netlify).
 * Automatycznie dołącza token autoryzacyjny i obsługuje błędy.
 * @param {string} endpoint - Nazwa funkcji serverless do wywołania.
 * @param {object} options - Opcje dla funkcji `fetch` (np. method, body).
 * @returns {Promise<any>} - Sparsowana odpowiedź JSON lub tekst.
 */
const fetchAPI = async (endpoint, options = {}) => {
    const token = await getToken();
    if (!token) throw new Error("User not authenticated");

    const payload = getUserPayload();
    if (!payload || !payload.sub) {
      throw new Error("Token payload is invalid or missing user ID (sub).");
    }

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Dev-User-Id': payload.sub
    };

    const response = await fetch(`/.netlify/functions/${endpoint}`, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error (${response.status}) on endpoint ${endpoint}:`, errorText);
        throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    
    // Niezawodne parsowanie odpowiedzi: próbuj jako JSON, a jeśli się nie uda, zwróć tekst.
    try {
        const data = await response.clone().json();
        return data;
    } catch (e) {
        return response.text();
    }
};

const dataStore = {
    /**
     * ZMIANA: Inicjalizuje tylko podstawowe dane użytkownika (ustawienia).
     * Nie pobiera już całej historii treningów, co zapewnia błyskawiczne ładowanie aplikacji.
     */
    initialize: async () => {
        try {
            const data = await fetchAPI('get-or-create-user-data', { method: 'GET' });
            
            // Inicjujemy historię jako pusty obiekt. Będzie ona wypełniana na żądanie.
            state.userProgress = {}; 

            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
            } else {
                throw new Error("CRITICAL: Server failed to return settings.");
            }
        } catch (error) {
            console.error("Failed to initialize user data:", error);
            alert("Nie udało się wczytać danych z serwera. Spróbuj odświeżyć stronę.");
            throw error;
        }
    },

    /**
     * NOWA FUNKCJA: Pobiera historię treningów dla konkretnego miesiąca na żądanie (lazy loading).
     * @param {number} year - Rok, dla którego mają być pobrane dane.
     * @param {number} month - Miesiąc (1-12), dla którego mają być pobrane dane.
     */
    getHistoryForMonth: async (year, month) => {
        try {
            const historyData = await fetchAPI(`get-history-by-month?year=${year}&month=${month}`, { method: 'GET' });

            // Scalamy pobrane dane z istniejącym stanem w aplikacji.
            historyData.forEach(session => {
                const dateKey = new Date(session.completedAt).toISOString().split('T')[0];
                if (!state.userProgress[dateKey]) {
                    state.userProgress[dateKey] = [];
                }
                // Unikamy duplikatów na wypadek wielokrotnego wywołania.
                if (!state.userProgress[dateKey].some(s => s.sessionId === session.sessionId)) {
                    state.userProgress[dateKey].push(session);
                }
            });
        } catch (error) {
            console.error(`Failed to fetch history for ${year}-${month}:`, error);
            alert("Nie udało się pobrać historii treningów.");
        }
    },
    
    /**
     * Zapisuje ukończoną sesję treningową w bazie danych.
     * @param {object} sessionData - Obiekt zawierający dane sesji.
     */
    saveSession: async (sessionData) => {
        try {
            await fetchAPI('save-session', { method: 'POST', body: JSON.stringify(sessionData) });
        } catch (error) {
            console.error("Failed to save session:", error);
            alert("Nie udało się zapisać sesji treningowej. Sprawdź swoje połączenie z internetem.");
        }
    },

    /**
     * Zapisuje aktualne ustawienia użytkownika w bazie danych.
     */
    saveSettings: async () => {
        try {
            await fetchAPI('save-settings', { method: 'PUT', body: JSON.stringify(state.settings) });
        } catch (error) {
            console.error("Failed to save settings:", error);
        }
    },
    
    /**
     * Migruje dane z lokalnego хранилища (localStorage) na konto użytkownika w chmurze.
     * @param {object} progressData - Dane postępów z localStorage.
     */
    migrateData: async (progressData) => {
        try {
            const sessionsArray = Object.values(progressData).flat();
            if (sessionsArray.length === 0) return;
            await fetchAPI('migrate-data', { method: 'POST', body: JSON.stringify(sessionsArray) });
            console.log("Data migration was successful!");
        } catch (error) {
            console.error("Failed to migrate data:", error);
            throw error;
        }
    },

    /**
     * Wysyła żądanie usunięcia wszystkich danych konta do backendu.
     * Operacja jest nieodwracalna.
     */
    deleteAccount: async () => {
        try {
            await fetchAPI('delete-user-data', { method: 'DELETE' });
            console.log("User account data deleted successfully from the server.");
        } catch (error) {
            console.error("Failed to delete account data:", error);
            throw new Error("Nie udało się usunąć konta z serwera. Spróbuj ponownie."); 
        }
    }
};

export default dataStore;
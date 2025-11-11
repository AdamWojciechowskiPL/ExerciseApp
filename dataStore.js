// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';

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
    
    try {
        const data = await response.clone().json();
        return data;
    } catch (e) {
        return response.text();
    }
};

const dataStore = {
    initialize: async () => {
        try {
            const data = await fetchAPI('get-or-create-user-data', { method: 'GET' });
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
     * ZMODYFIKOWANA FUNKCJA: Pobiera historię i traktuje ją jako jedyne źródło prawdy,
     * nadpisując dane lokalne, aby zapobiec duplikatom z "optymistycznego UI".
     */
    getHistoryForMonth: async (year, month) => {
        try {
            const historyDataFromServer = await fetchAPI(`get-history-by-month?year=${year}&month=${month}`);

            // Krok 1: Grupujemy dane otrzymane z serwera według daty.
            const serverDataByDate = historyDataFromServer.reduce((acc, session) => {
                const dateKey = new Date(session.completedAt).toISOString().split('T')[0];
                if (!acc[dateKey]) {
                    acc[dateKey] = [];
                }
                acc[dateKey].push(session);
                return acc;
            }, {});

            // Krok 2: Dla każdej daty, dla której otrzymaliśmy dane, CAŁKOWICIE nadpisujemy
            // lokalny stan. To usuwa "optymistyczne" wpisy i zastępuje je prawdziwymi danymi z bazy.
            for (const dateKey in serverDataByDate) {
                state.userProgress[dateKey] = serverDataByDate[dateKey];
            }
        } catch (error) {
            console.error(`Failed to fetch history for ${year}-${month}:`, error);
            alert("Nie udało się pobrać historii treningów.");
        }
    },
    
    saveSession: async (sessionData) => {
        try {
            await fetchAPI('save-session', { method: 'POST', body: JSON.stringify(sessionData) });
        } catch (error) {
            console.error("Failed to save session:", error);
            alert("Nie udało się zapisać sesji treningowej. Sprawdź swoje połączenie z internetem.");
        }
    },

    saveSettings: async () => {
        try {
            await fetchAPI('save-settings', { method: 'PUT', body: JSON.stringify(state.settings) });
        } catch (error) {
            console.error("Failed to save settings:", error);
        }
    },
    
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
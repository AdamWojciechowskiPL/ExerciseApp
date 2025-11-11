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

    getHistoryForMonth: async (year, month) => {
        try {
            const historyDataFromServer = await fetchAPI(`get-history-by-month?year=${year}&month=${month}`);
            const serverDataByDate = historyDataFromServer.reduce((acc, session) => {
                const dateKey = new Date(session.completedAt).toISOString().split('T')[0];
                if (!acc[dateKey]) {
                    acc[dateKey] = [];
                }
                acc[dateKey].push(session);
                return acc;
            }, {});
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
    
    /**
     * ZMODYFIKOWANA FUNKCJA: Teraz jest odporna na nieprawidłowe dane w localStorage.
     * Spłaszcza dane, a następnie filtruje je, aby wysłać na serwer tylko poprawne obiekty sesji.
     */
    migrateData: async (progressData) => {
        try {
            // Krok 1: Spłaszcz dane. Ta linia poprawnie obsługuje strukturę {"data": [sesje]}.
            const potentiallyCorruptedSessions = Object.values(progressData).flat();

            // Krok 2: Walidacja i filtrowanie. Zachowujemy tylko obiekty, które wyglądają jak sesje.
            // Najprostszym i najpewniejszym wskaźnikiem jest obecność klucza `completedAt`.
            const validSessions = potentiallyCorruptedSessions.filter(
                session => session && typeof session === 'object' && session.hasOwnProperty('completedAt')
            );
            
            // Krok 3: Jeśli po filtracji nie ma żadnych poprawnych sesji, przerwij, aby uniknąć błędu.
            if (validSessions.length === 0) {
                console.log("No valid sessions found in localStorage to migrate. Skipping.");
                return; // Zakończ funkcję
            }

            // Krok 4: Wyślij na serwer tylko i wyłącznie poprawną, oczyszczoną listę sesji.
            await fetchAPI('migrate-data', { method: 'POST', body: JSON.stringify(validSessions) });
            console.log(`Migration successful! Migrated ${validSessions.length} sessions.`);
        } catch (error) {
            console.error("Failed to migrate data:", error);
            throw error; // Rzuć błąd dalej, aby app.js mógł go obsłużyć
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
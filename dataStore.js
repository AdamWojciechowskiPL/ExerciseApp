// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';
import { getISODate } from './utils.js'; 

/**
 * Centralna funkcja pomocnicza do wykonywania uwierzytelnionych zapytań do naszego API.
 * Automatycznie dołącza token JWT i obsługuje podstawowe błędy.
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
        'X-Dev-User-Id': payload.sub // Używane w trybie deweloperskim
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

/**
 * Obiekt dataStore, który zarządza całą komunikacją z backendem.
 */
const dataStore = {
    /**
     * Pobiera podstawową, publiczną zawartość aplikacji (ćwiczenia, plany) z serwera.
     * Wywoływana jednorazowo przy starcie aplikacji.
     */
    loadAppContent: async () => {
        try {
            const response = await fetch('/.netlify/functions/get-app-content');
            if (!response.ok) {
                throw new Error(`Failed to load app content: ${response.statusText}`);
            }
            const data = await response.json();
            
            state.exerciseLibrary = data.exercises || {};
            state.trainingPlans = data.training_plans || {};
            
            console.log('App content (exercises and plans) loaded successfully.');
        } catch (error) {
            console.error("Critical error loading application content:", error);
            alert("Nie udało się załadować podstawowych danych aplikacji. Sprawdź połączenie z internetem i spróbuj odświeżyć stronę.");
            throw error;
        }
    },

    /**
     * Pobiera dane specyficzne dla zalogowanego użytkownika (ustawienia, status integracji)
     * lub tworzy dla niego domyślny profil, jeśli loguje się po raz pierwszy.
     */
    initialize: async () => {
        try {
            const data = await fetchAPI('get-or-create-user-data', { method: 'GET' });
            state.userProgress = {}; 
            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
            } else {
                throw new Error("CRITICAL: Server failed to return settings.");
            }
            // Zapisujemy status integracji Strava do stanu globalnego
            if (data.integrations) {
                state.stravaIntegration.isConnected = data.integrations.isStravaConnected || false;
            }
            return data; // Zwróć pobrane dane na wypadek, gdyby były potrzebne
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
                // --- ZMIEŃ TĘ LINIĘ ---
                // STARA WERSJA: const dateKey = new Date(session.completedAt).toISOString().split('T')[0];
                // NOWA WERSJA:
                const dateKey = getISODate(new Date(session.completedAt));
                // --- KONIEC ZMIANY ---

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

    deleteSession: async (sessionId) => {
        try {
            // Wykonuje zapytanie typu DELETE, przekazując sessionId w URL.
            await fetchAPI(`delete-session?sessionId=${sessionId}`, {
                method: 'DELETE',
            });
            console.log(`Session ${sessionId} deleted successfully from the server.`);
        } catch (error) {
            console.error(`Failed to delete session ${sessionId}:`, error);
            alert(`Nie udało się usunąć treningu: ${error.message}`);
            // Rzuć błąd dalej, aby UI wiedziało, że operacja się nie powiodła.
            throw error;
        }
    },

    // --- METODY INTEGRACJI ZE STRAVA ---

    startStravaAuth: async () => {
        try {
            const data = await fetchAPI('strava-auth-start', { method: 'GET' });
            if (data.authorizationUrl) {
                window.location.href = data.authorizationUrl;
            }
        } catch (error) {
            console.error("Failed to start Strava authentication:", error);
            alert("Nie udało się rozpocząć procesu łączenia z kontem Strava. Spróbuj ponownie.");
        }
    },

    disconnectStrava: async () => {
        try {
            await fetchAPI('strava-disconnect', { method: 'POST' });
            state.stravaIntegration.isConnected = false;
            alert("Twoje konto Strava zostało pomyślnie odłączone.");
        } catch (error) {
            console.error("Failed to disconnect Strava account:", error);
            alert("Nie udało się odłączyć konta Strava. Spróbuj ponownie.");
            throw error;
        }
    },

    uploadToStrava: async (sessionPayload) => {
        try {
            // Obliczamy rzeczywisty, precyzyjny czas trwania sesji
            const startTime = new Date(sessionPayload.startedAt);
            const endTime = new Date(sessionPayload.completedAt);
            const durationInMilliseconds = endTime - startTime;
            const realTotalDurationSeconds = Math.round(durationInMilliseconds / 1000);

            // Tworzymy obiekt DTO (Data Transfer Object) z danymi wymaganymi przez backend
            const uploadData = {
                sessionLog: sessionPayload.sessionLog,
                title: sessionPayload.trainingTitle || 'Trening siłowy',
                totalDurationSeconds: realTotalDurationSeconds,
                startedAt: sessionPayload.startedAt, // Przekazujemy dokładny czas startu
            };

            await fetchAPI('strava-upload-activity', {
                method: 'POST',
                body: JSON.stringify(uploadData),
            });
            console.log('Trening został pomyślnie wysłany na konto Strava.');
            // W przyszłości można tu dodać nieinwazyjne powiadomienie typu "toast"
        } catch (error) {
            console.error('Failed to upload activity to Strava:', error);
            alert(`Wystąpił błąd podczas wysyłania treningu na Stravę: ${error.message}`);
        }
    },

    // --- METODY ADMINISTRACYJNE ---

    migrateData: async (progressData) => {
        try {
            const potentiallyCorruptedSessions = Object.values(progressData).flat();
            const validSessions = potentiallyCorruptedSessions.filter(
                session => session && typeof session === 'object' &&
                           session.hasOwnProperty('completedAt') &&
                           session.hasOwnProperty('planId')
            );
            
            if (validSessions.length === 0) {
                console.log("No valid sessions found in localStorage to migrate. Skipping.");
                return;
            }

            await fetchAPI('migrate-data', { method: 'POST', body: JSON.stringify(validSessions) });
            console.log(`Migration successful! Migrated ${validSessions.length} sessions.`);
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
    },
};

export default dataStore;
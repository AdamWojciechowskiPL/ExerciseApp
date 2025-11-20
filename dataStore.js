// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';
import { getISODate } from './utils.js';

/**
 * Wewnętrzny wrapper na fetch do komunikacji z Netlify Functions.
 * Automatycznie dodaje tokeny, nagłówki i obsługuje błędy HTTP.
 * 
 * @param {string} endpoint - Nazwa funkcji (np. 'get-history')
 * @param {Object} options - Opcje fetch + customowe pole 'params' dla URL query
 */
const callAPI = async (endpoint, { body, method = 'GET', params } = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Użytkownik nie jest zalogowany (brak tokena).");

    const payload = getUserPayload();
    if (!payload || !payload.sub) throw new Error("Błąd tokena: brak identyfikatora użytkownika (sub).");

    // Budowanie URL z parametrami
    let url = `/.netlify/functions/${endpoint}`;
    if (params) {
        const queryString = new URLSearchParams(params).toString();
        url += `?${queryString}`;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-Id': payload.sub
    };

    const config = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    const response = await fetch(url, config);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${endpoint}]: ${response.status} - ${errorText}`);
        throw new Error(`Błąd serwera (${response.status}): ${errorText}`);
    }

    // Obsługa pustych odpowiedzi (np. 204 No Content)
    if (response.status === 204) return null;

    try {
        return await response.json();
    } catch (e) {
        // Fallback jeśli odpowiedź nie jest JSONem
        return await response.text();
    }
};

/**
 * Główny obiekt zarządzający danymi aplikacji.
 */
const dataStore = {

    // ============================================================
    // 1. SYSTEM I DANE STATYCZNE
    // ============================================================

    /**
     * Pobiera publiczne dane aplikacji (plany treningowe, bazę ćwiczeń).
     * Nie wymaga autoryzacji.
     */
    loadAppContent: async () => {
        try {
            const response = await fetch('/.netlify/functions/get-app-content');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            state.exerciseLibrary = data.exercises || {};
            state.trainingPlans = data.training_plans || {};
            
            console.log('📦 Zasoby aplikacji załadowane pomyślnie.');
        } catch (error) {
            console.error("Critical: Failed to load app content:", error);
            alert("Błąd krytyczny: Nie udało się pobrać planów treningowych. Sprawdź połączenie.");
            throw error;
        }
    },

    // ============================================================
    // 2. UŻYTKOWNIK I USTAWIENIA
    // ============================================================

    /**
     * Inicjalizuje profil użytkownika po zalogowaniu.
     * Pobiera ustawienia, stan integracji oraz STATYSTYKI GAMIFIKACJI.
     */
    initialize: async () => {
        try {
            const data = await callAPI('get-or-create-user-data');
            
            // Reset lokalnego stanu postępu (zostanie wypełniony przez getHistory)
            state.userProgress = {}; 

            // 1. Ustawienia
            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
            }

            // 2. Integracje
            if (data.integrations) {
                state.stravaIntegration.isConnected = !!data.integrations.isStravaConnected;
            }

            // 3. Gamifikacja (Backend Backup)
            // Zapisujemy dane z serwera, które będą użyte w gamification.js jako fallback
            if (data.stats) {
                state.userStats = data.stats;
                console.log('🏆 Statystyki użytkownika (Backend):', state.userStats);
            }

            await dataStore.fetchBlacklist(); 

            return data;
        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Nie udało się pobrać profilu użytkownika.");
            throw error;
        }
    },

    /**
     * Zapisuje zmienione ustawienia użytkownika.
     */
    saveSettings: async () => {
        try {
            await callAPI('save-settings', { 
                method: 'PUT', 
                body: state.settings 
            });
            console.log('⚙️ Ustawienia zapisane.');
        } catch (error) {
            console.error("Failed to save settings:", error);
            alert("Błąd zapisu ustawień.");
        }
    },

    /**
     * Trwale usuwa konto użytkownika (RODO).
     */
    deleteAccount: async () => {
        try {
            await callAPI('delete-user-data', { method: 'DELETE' });
            console.log("🗑️ Konto usunięte.");
        } catch (error) {
            console.error("Failed to delete account:", error);
            throw new Error("Nie udało się usunąć konta. Spróbuj ponownie."); 
        }
    },

    fetchBlacklist: async () => {
        try {
            const blacklistIds = await callAPI('manage-blacklist');
            state.blacklist = blacklistIds || [];
            console.log('🚫 Czarna lista pobrana:', state.blacklist);
        } catch (error) {
            console.error("Błąd pobierania czarnej listy:", error);
            state.blacklist = [];
        }
    },

    addToBlacklist: async (exerciseId, replacementId) => {
        try {
            await callAPI('manage-blacklist', {
                method: 'POST',
                body: { exerciseId, replacementId }
            });
            // Aktualizacja lokalnego stanu
            if (!state.blacklist.includes(exerciseId)) {
                state.blacklist.push(exerciseId);
            }
        } catch (error) {
            console.error("Błąd dodawania do czarnej listy:", error);
            alert("Nie udało się zapisać wykluczenia.");
        }
    },

    removeFromBlacklist: async (exerciseId) => {
        try {
            await callAPI('manage-blacklist', {
                method: 'DELETE',
                body: { exerciseId }
            });
            // Aktualizacja lokalnego stanu
            state.blacklist = state.blacklist.filter(id => id !== exerciseId);
        } catch (error) {
            console.error("Błąd usuwania z czarnej listy:", error);
            alert("Nie udało się przywrócić ćwiczenia.");
        }
    },

    // ============================================================
    // 3. SESJE I HISTORIA
    // ============================================================

    /**
     * Pobiera historię treningów dla danego miesiąca.
     * Mapuje dane z bazy do struktury: { "YYYY-MM-DD": [sessions] }
     */
    getHistoryForMonth: async (year, month) => {
        try {
            const sessions = await callAPI('get-history-by-month', { 
                params: { year, month } 
            });

            // Transformacja tablicy w mapę dat
            const progressMap = {};
            
            sessions.forEach(session => {
                // Używamy daty zakończenia jako klucza. 
                // getISODate wyciąga YYYY-MM-DD z obiektu Date.
                const dateObj = new Date(session.completedAt);
                const dateKey = getISODate(dateObj);

                if (!progressMap[dateKey]) {
                    progressMap[dateKey] = [];
                }
                progressMap[dateKey].push(session);
            });

            // Aktualizacja stanu (merge z istniejącymi, aby nie nadpisywać innych miesięcy jeśli są w pamięci)
            state.userProgress = { ...state.userProgress, ...progressMap };
            
            console.log(`📅 Pobrano historię dla ${year}-${month}: ${sessions.length} sesji.`);
        } catch (error) {
            console.error(`Failed to fetch history for ${year}-${month}:`, error);
        }
    },
    
    /**
     * Zapisuje nową sesję treningową.
     */
    saveSession: async (sessionData) => {
        try {
            await callAPI('save-session', { 
                method: 'POST', 
                body: sessionData 
            });
            console.log('✅ Sesja zapisana na serwerze.');
        } catch (error) {
            console.error("Failed to save session:", error);
            alert("Trening zapisany lokalnie, ale wystąpił błąd synchronizacji z chmurą.");
        }
    },

    /**
     * Usuwa pojedynczą sesję.
     */
    deleteSession: async (sessionId) => {
        try {
            await callAPI('delete-session', { 
                method: 'DELETE', 
                params: { sessionId }
            });
            console.log(`🗑️ Sesja ${sessionId} usunięta.`);
        } catch (error) {
            console.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    },

    // ============================================================
    // 4. INTEGRACJE (STRAVA)
    // ============================================================

    startStravaAuth: async () => {
        try {
            const data = await callAPI('strava-auth-start');
            if (data.authorizationUrl) {
                window.location.href = data.authorizationUrl;
            }
        } catch (error) {
            console.error("Strava auth error:", error);
            alert("Błąd inicjalizacji połączenia ze Strava.");
        }
    },

    disconnectStrava: async () => {
        try {
            await callAPI('strava-disconnect', { method: 'POST' });
            state.stravaIntegration.isConnected = false;
            alert("Konto Strava odłączone.");
        } catch (error) {
            console.error("Strava disconnect error:", error);
            throw error;
        }
    },

    /**
     * Wysyła ukończony trening do Stravy.
     * Uwzględnia czas pauzy, jeśli dostępny jest parametr netDurationSeconds.
     */
    uploadToStrava: async (sessionPayload) => {
        try {
            let durationSeconds;

            // LOGIKA CZASU:
            // Jeśli frontend przekazał obliczony czas netto (bez pauz), używamy go.
            // W przeciwnym razie (np. stare wpisy, błąd logiki) obliczamy różnicę brutto.
            if (typeof sessionPayload.netDurationSeconds === 'number') {
                durationSeconds = sessionPayload.netDurationSeconds;
            } else {
                const startTime = new Date(sessionPayload.startedAt);
                const endTime = new Date(sessionPayload.completedAt);
                durationSeconds = Math.round((endTime - startTime) / 1000);
            }

            const uploadData = {
                sessionLog: sessionPayload.sessionLog,
                title: sessionPayload.trainingTitle || 'Trening siłowy',
                totalDurationSeconds: durationSeconds,
                startedAt: sessionPayload.startedAt,
                notes: sessionPayload.notes // Dodajemy notatki jeśli są
            };

            await callAPI('strava-upload-activity', {
                method: 'POST',
                body: uploadData,
            });
            console.log(`🚀 Trening wysłany do Strava (Czas: ${durationSeconds}s).`);
        } catch (error) {
            console.error('Strava upload failed:', error);
            // Nie blokujemy UI alertem tutaj, logujemy błąd. UI może pokazać status "błąd sync".
        }
    },

    // ============================================================
    // 5. MIGRACJA DANYCH (LEGACY)
    // ============================================================

    /**
     * Przenosi dane z localStorage (wersja offline aplikacji) do bazy danych.
     */
    migrateData: async (progressData) => {
        try {
            const sessionsList = Object.values(progressData).flat();
            const validSessions = sessionsList.filter(s => 
                s && typeof s === 'object' && s.completedAt && s.planId
            );
            
            if (validSessions.length === 0) {
                console.log("Brak poprawnych sesji do migracji.");
                return;
            }

            await callAPI('migrate-data', { 
                method: 'POST', 
                body: validSessions 
            });
            console.log(`📦 Zmigrowano ${validSessions.length} sesji.`);
        } catch (error) {
            console.error("Migration failed:", error);
            throw error;
        }
    },
};

export default dataStore;
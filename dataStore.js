// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';
import { getISODate } from './utils.js';

const callAPI = async (endpoint, { body, method = 'GET', params } = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Użytkownik nie jest zalogowany (brak tokena).");

    const payload = getUserPayload();
    if (!payload || !payload.sub) throw new Error("Błąd tokena: brak identyfikatora użytkownika.");

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

    const config = { method, headers, body: body ? JSON.stringify(body) : undefined };
    const response = await fetch(url, config);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${endpoint}]: ${response.status} - ${errorText}`);
        throw new Error(`Błąd serwera (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;

    try { return await response.json(); } catch (e) { return await response.text(); }
};

const dataStore = {
    loadAppContent: async () => {
        try {
            const token = await getToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch('/.netlify/functions/get-app-content', { headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            state.exerciseLibrary = data.exercises || {};
            state.trainingPlans = data.training_plans || {};
            
            console.log(token ? '📦 Zasoby PERSONALIZOWANE załadowane.' : '📦 Zasoby PUBLICZNE załadowane.');
        } catch (error) {
            console.error("Critical: Failed to load app content:", error);
            if (navigator.onLine) alert("Błąd pobierania planów. Sprawdź połączenie.");
        }
    },

    initialize: async () => {
        try {
            const data = await callAPI('get-or-create-user-data');
            
            if (!state.userProgress) state.userProgress = {}; 

            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
                // NOWOŚĆ: Synchronizacja stanu TTS z ustawieniami z bazy
                // Jeśli w bazie nie ma ustawienia (stary user), przyjmij true
                state.tts.isSoundOn = state.settings.ttsEnabled ?? true;
            }
            
            if (data.integrations) state.stravaIntegration.isConnected = !!data.integrations.isStravaConnected;

            const cachedStats = localStorage.getItem('cachedUserStats');
            if (cachedStats) {
                state.userStats = JSON.parse(cachedStats);
                console.log("📊 Załadowano statystyki z cache lokalnego.");
            } else {
                state.userStats = { totalSessions: 0, streak: 0, resilience: null }; 
            }

            if (data.recentSessions) {
                data.recentSessions.forEach(session => {
                    const dateKey = getISODate(new Date(session.completedAt));
                    if (!state.userProgress[dateKey]) state.userProgress[dateKey] = [];
                    const exists = state.userProgress[dateKey].find(s => String(s.sessionId) === String(session.sessionId));
                    if (!exists) state.userProgress[dateKey].push(session);
                });
            }

            await dataStore.fetchBlacklist(); 
            return data;
        } catch (error) {
            console.error("Initialization failed:", error);
            throw error;
        }
    },

    fetchDetailedStats: async () => {
        try {
            console.log("🔄 Pobieranie szczegółowych statystyk w tle...");
            const stats = await callAPI('get-user-stats');
            state.userStats = stats;
            localStorage.setItem('cachedUserStats', JSON.stringify(stats));
            return stats;
        } catch (error) {
            console.error("Błąd pobierania statystyk:", error);
            return null;
        }
    },

    saveSettings: async () => {
        try {
            await callAPI('save-settings', { method: 'PUT', body: state.settings });
            console.log('⚙️ Ustawienia zapisane.');
        } catch (error) {
            console.error("Failed to save settings:", error);
            alert("Błąd zapisu ustawień.");
        }
    },

    deleteAccount: async () => {
        try {
            await callAPI('delete-user-data', { method: 'DELETE' });
            console.log("🗑️ Konto usunięte.");
        } catch (error) {
            console.error("Failed to delete account:", error);
            throw new Error("Nie udało się usunąć konta."); 
        }
    },

    fetchBlacklist: async () => {
        try {
            const blacklistIds = await callAPI('manage-blacklist');
            state.blacklist = blacklistIds || [];
        } catch (error) {
            console.error("Błąd pobierania czarnej listy:", error);
            state.blacklist = [];
        }
    },

    addToBlacklist: async (exerciseId, replacementId) => {
        try {
            await callAPI('manage-blacklist', { method: 'POST', body: { exerciseId, replacementId } });
            if (!state.blacklist.includes(exerciseId)) state.blacklist.push(exerciseId);
        } catch (error) {
            console.error("Błąd dodawania do czarnej listy:", error);
            alert("Nie udało się zapisać wykluczenia.");
        }
    },

    removeFromBlacklist: async (exerciseId) => {
        try {
            await callAPI('manage-blacklist', { method: 'DELETE', body: { exerciseId } });
            state.blacklist = state.blacklist.filter(id => id !== exerciseId);
        } catch (error) {
            console.error("Błąd usuwania z czarnej listy:", error);
            alert("Nie udało się przywrócić ćwiczenia.");
        }
    },

    getHistoryForMonth: async (year, month, forceRefresh = false) => {
        const cacheKey = `${year}-${month}`;
        if (!forceRefresh && state.loadedMonths.has(cacheKey)) {
            return; 
        }

        try {
            const sessions = await callAPI('get-history-by-month', { params: { year, month } });
            
            sessions.forEach(session => {
                const dateObj = new Date(session.completedAt);
                const dateKey = getISODate(dateObj);
                
                if (!state.userProgress[dateKey]) {
                    state.userProgress[dateKey] = [];
                }
                
                const exists = state.userProgress[dateKey].find(s => String(s.sessionId) === String(session.sessionId));
                if (!exists) {
                    state.userProgress[dateKey].push(session);
                } else {
                    const idx = state.userProgress[dateKey].indexOf(exists);
                    state.userProgress[dateKey][idx] = session;
                }
            });

            state.loadedMonths.add(cacheKey);
            console.log(`📅 Pobrano historię dla ${cacheKey}`);
        } catch (error) {
            console.error(`Failed to fetch history for ${year}-${month}:`, error);
            throw error;
        }
    },

    loadRecentHistory: async (days = 90) => {
        console.log(`⏳ Pobieranie historii (ostatnie ${days} dni)...`);
        
        try {
            const sessions = await callAPI('get-recent-history', { params: { days } });
            
            if (sessions && sessions.length > 0) {
                sessions.forEach(session => {
                    const dateObj = new Date(session.completedAt);
                    const dateKey = getISODate(dateObj);
                    
                    if (!state.userProgress[dateKey]) {
                        state.userProgress[dateKey] = [];
                    }
                    
                    const exists = state.userProgress[dateKey].find(s => String(s.sessionId) === String(session.sessionId));
                    
                    if (!exists) {
                        state.userProgress[dateKey].push(session);
                    } else {
                        const idx = state.userProgress[dateKey].indexOf(exists);
                        state.userProgress[dateKey][idx] = session;
                    }
                });
            }
            
            const now = new Date();
            const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
            state.loadedMonths.add(currentKey);
            
            // --- FIX: Ustawiamy flagę na true ---
            state.isHistoryLoaded = true;
            
            console.log(`📅✅ Historia zsynchronizowana (${sessions.length} sesji).`);
        } catch (error) {
            console.error("Błąd pobierania recent history:", error);
        }
    },
    
    saveSession: async (sessionData) => {
        try {
            const result = await callAPI('save-session', { method: 'POST', body: sessionData });
            state.loadedMonths.clear();
            return result;
        } catch (error) {
            console.error("Failed to save session:", error);
            throw error;
        }
    },

    deleteSession: async (sessionId) => {
        try {
            await callAPI('delete-session', { method: 'DELETE', params: { sessionId } });
            state.loadedMonths.clear(); 
        } catch (error) {
            console.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    },

    startStravaAuth: async () => {
        try {
            const data = await callAPI('strava-auth-start');
            if (data.authorizationUrl) window.location.href = data.authorizationUrl;
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

    uploadToStrava: async (sessionPayload) => {
        try {
            let durationSeconds = typeof sessionPayload.netDurationSeconds === 'number' 
                ? sessionPayload.netDurationSeconds 
                : Math.round((new Date(sessionPayload.completedAt) - new Date(sessionPayload.startedAt)) / 1000);

            const uploadData = {
                sessionLog: sessionPayload.sessionLog,
                title: sessionPayload.trainingTitle || 'Trening siłowy',
                totalDurationSeconds: durationSeconds,
                startedAt: sessionPayload.startedAt,
                notes: sessionPayload.notes
            };

            await callAPI('strava-upload-activity', { method: 'POST', body: uploadData });
            console.log(`🚀 Trening wysłany do Strava.`);
        } catch (error) {
            console.error('Strava upload failed:', error);
        }
    },

    migrateData: async (progressData) => {
        try {
            const sessionsList = Object.values(progressData).flat();
            const validSessions = sessionsList.filter(s => s && typeof s === 'object' && s.completedAt && s.planId);
            if (validSessions.length === 0) return;
            await callAPI('migrate-data', { method: 'POST', body: validSessions });
            console.log(`📦 Zmigrowano ${validSessions.length} sesji.`);
        } catch (error) {
            console.error("Migration failed:", error);
            throw error;
        }
    },
};

export default dataStore;
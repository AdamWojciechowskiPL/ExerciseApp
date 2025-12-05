// dataStore.js

import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';
import { getISODate } from './utils.js';

const callAPI = async (endpoint, { body, method = 'GET', params } = {}) => {
    const token = await getToken();

    let headers = { 'Content-Type': 'application/json' };

    if (token) {
        const payload = getUserPayload();
        headers['Authorization'] = `Bearer ${token}`;
        if (payload && payload.sub) {
            headers['X-User-Id'] = payload.sub;
        }
    }

    let url = `/.netlify/functions/${endpoint}`;
    if (params) {
        const queryString = new URLSearchParams(params).toString();
        url += `?${queryString}`;
    }

    const config = { method, headers, body: body ? JSON.stringify(body) : undefined };
    const response = await fetch(url, config);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${endpoint}]: ${response.status} - ${errorText}`);
        throw new Error(`Błąd serwera (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;

    try {
        const text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (e) {
        console.warn('Odpowiedź nie jest JSON:', e);
        return null;
    }
};

// Helper do generowania spójnego klucza cache
const getMonthCacheKey = (year, month) => `${year}-${month}`;

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
                state.tts.isSoundOn = state.settings.ttsEnabled ?? true;

                if (!state.settings.planMode) {
                    if (state.settings.dynamicPlanData && state.settings.dynamicPlanData.days) {
                        state.settings.planMode = 'dynamic';
                    } else {
                        state.settings.planMode = 'static';
                    }
                }
            }

            if (data.integrations) state.stravaIntegration.isConnected = !!data.integrations.isStravaConnected;

            const cachedStats = localStorage.getItem('cachedUserStats');
            if (cachedStats) {
                try {
                    state.userStats = JSON.parse(cachedStats);
                } catch (e) {
                    state.userStats = { totalSessions: 0, streak: 0, resilience: null };
                }
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

    generateDynamicPlan: async (questionnaireData) => {
        try {
            console.log("🧠 Wysyłanie ankiety do generatora AI...");
            const result = await callAPI('generate-plan', {
                method: 'POST',
                body: questionnaireData
            });

            if (result && result.plan) {
                state.settings.dynamicPlanData = result.plan;
                state.settings.planMode = 'dynamic';
                state.settings.onboardingCompleted = true;
                state.settings.wizardData = questionnaireData;
                return result;
            } else {
                throw new Error("Pusta odpowiedź z generatora.");
            }
        } catch (error) {
            console.error("Generating plan failed:", error);
            throw error;
        }
    },

    fetchDetailedStats: async () => {
        try {
            // Dodajemy parametr 'ts' (timestamp), żeby oszukać cache przeglądarki
            const stats = await callAPI('get-user-stats', { 
                params: { ts: Date.now() } 
            });
            
            state.userStats = stats;
            localStorage.setItem('cachedUserStats', JSON.stringify(stats));
            return stats;
        } catch (error) {
            console.error("Błąd pobierania statystyk:", error);
            return null;
        }
    },


    // --- NOWA FUNKCJA: Pobieranie pełnych statystyk Mastery ---
    fetchMasteryStats: async (force = false) => {
        // Jeśli mamy dane w stanie i nie wymuszamy odświeżenia, zwracamy cache
        if (!force && state.masteryStats && state.masteryStats.length > 0) {
            return state.masteryStats;
        }

        try {
            console.log("📊 Pobieranie pełnych statystyk Mastery z serwera...");
            const stats = await callAPI('get-exercise-mastery');
            state.masteryStats = stats || [];
            return stats;
        } catch (error) {
            console.error("Błąd pobierania mastery stats:", error);
            return [];
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
        const cacheKey = getMonthCacheKey(year, month);
        
        if (!forceRefresh && state.loadedMonths.has(cacheKey)) {
            console.log(`CACHE HIT: Historia dla ${cacheKey} już jest.`);
            return;
        }

        try {
            console.log(`NETWORK FETCH: Historia dla ${cacheKey}...`);
            const sessions = await callAPI('get-history-by-month', { params: { year, month } });

            if (sessions) {
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

            state.loadedMonths.add(cacheKey);
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
            state.loadedMonths.add(getMonthCacheKey(now.getFullYear(), now.getMonth() + 1));

            for (let i = 1; i <= Math.ceil(days / 30); i++) {
                const pastDate = new Date();
                pastDate.setMonth(now.getMonth() - i);
                const pastKey = getMonthCacheKey(pastDate.getFullYear(), pastDate.getMonth() + 1);
                state.loadedMonths.add(pastKey);
            }

            state.isHistoryLoaded = true;
            console.log(`📅✅ Historia zsynchronizowana. Cache keys:`, Array.from(state.loadedMonths));
        } catch (error) {
            console.error("Błąd pobierania recent history:", error);
        }
    },

    saveSession: async (sessionData) => {
        try {
            const result = await callAPI('save-session', { method: 'POST', body: sessionData });
            state.loadedMonths.clear();
            state.masteryStats = null; // Czyścimy cache statystyk, aby wymusić odświeżenie po treningu
            console.log("💾 Sesja zapisana. Cache historii i statystyk wyczyszczony.");
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
            state.masteryStats = null; // Czyścimy cache statystyk
            console.log("🗑️ Sesja usunięta. Cache historii i statystyk wyczyszczony.");
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
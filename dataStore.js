import { state } from './state.js';
import { getToken, getUserPayload } from './auth.js';
import { getISODate } from './utils.js';

const SCORE_LIKE = 15;
const SCORE_DISLIKE = -30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

const callAPI = async (endpoint, { body, method = 'GET', params } = {}) => {
    const token = await getToken();
    let headers = { 'Content-Type': 'application/json' };
    if (token) {
        const payload = getUserPayload();
        headers['Authorization'] = `Bearer ${token}`;
        if (payload && payload.sub) headers['X-User-Id'] = payload.sub;
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
        throw new Error(`Błąd serwera (${response.status}): ${errorText}`);
    }
    if (response.status === 204) return null;
    try {
        const text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (e) { return null; }
};

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

            const total = Object.keys(state.exerciseLibrary).length;
            const blocked = Object.values(state.exerciseLibrary).filter(ex => ex.isAllowed === false).length;
            const allowed = total - blocked;

            console.log(token
                ? `📦 Zasoby PERSONALIZOWANE: ${allowed} dostępnych, ${blocked} zablokowanych.`
                : '📦 Zasoby PUBLICZNE załadowane.');

        } catch (error) {
            console.error("Critical: Failed to load app content:", error);
        }
    },

    fetchExerciseAnimation: async (exerciseId) => {
        if (!exerciseId) return null;
        if (state.animationCache.has(exerciseId)) {
            return state.animationCache.get(exerciseId);
        }
        try {
            const result = await callAPI('get-exercise-animation', { params: { id: exerciseId } });
            if (result && result.svg) {
                state.animationCache.set(exerciseId, result.svg);
                return result.svg;
            }
        } catch (e) {
            console.error(`Błąd pobierania animacji dla ${exerciseId}:`, e);
        }
        return null;
    },

    initialize: async () => {
        try {
            console.time("Bootstrap");
            const data = await callAPI('get-or-create-user-data');
            console.timeEnd("Bootstrap");

            if (!state.userProgress) state.userProgress = {};

            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
                if (typeof state.settings.restTimeFactor !== 'number') {
                    state.settings.restTimeFactor = 1.0;
                }
                state.tts.isSoundOn = state.settings.ttsEnabled ?? true;
                state.settings.planMode = 'dynamic';
            }

            if (data.exercisePace) {
                state.exercisePace = data.exercisePace;
                console.log("⏱️ Adaptive Pacing: Loaded stats for", Object.keys(data.exercisePace).length, "exercises.");
            }

            if (data.integrations) state.stravaIntegration.isConnected = !!data.integrations.isStravaConnected;

            if (data.userPreferences) {
                state.userPreferences = data.userPreferences;
            } else {
                state.userPreferences = {};
            }

            if (data.blacklist) {
                state.blacklist = data.blacklist;
            } else {
                state.blacklist = [];
            }

            if (data.overrides) {
                state.overrides = data.overrides;
            } else {
                state.overrides = {};
            }

            const cachedStats = localStorage.getItem('cachedUserStats');
            if (cachedStats) {
                try { state.userStats = JSON.parse(cachedStats); } catch (e) { state.userStats = { totalSessions: 0, streak: 0, resilience: null }; }
            } else { state.userStats = { totalSessions: 0, streak: 0, resilience: null }; }

            if (data.recentSessions) {
                data.recentSessions.forEach(session => {
                    const dateKey = getISODate(new Date(session.completedAt));
                    if (!state.userProgress[dateKey]) state.userProgress[dateKey] = [];
                    const exists = state.userProgress[dateKey].find(s => String(s.sessionId) === String(session.sessionId));
                    if (!exists) state.userProgress[dateKey].push(session);
                });
            }

            return data;
        } catch (error) { console.error("Initialization failed:", error); throw error; }
    },

    generateDynamicPlan: async (q) => {
        const payload = {
            ...q,
            secondsPerRep: state.settings.secondsPerRep || 6,
            restTimeFactor: state.settings.restTimeFactor || 1.0
        };

        const result = await callAPI('generate-plan', { method: 'POST', body: payload });
        if (result && result.plan) {
            state.settings.dynamicPlanData = result.plan;
            state.settings.planMode = 'dynamic';
            state.settings.onboardingCompleted = true;
            state.settings.wizardData = { ...state.settings.wizardData, ...q };
            return result;
        } else throw new Error("Pusta odpowiedź z generatora.");
    },

    fetchDetailedStats: async () => {
        try {
            const stats = await callAPI('get-user-stats', { params: { ts: Date.now() } });
            state.userStats = stats;
            localStorage.setItem('cachedUserStats', JSON.stringify(stats));
            return stats;
        } catch (error) { return null; }
    },

    fetchUserPreferences: async () => {
        try {
            const preferences = await callAPI('get-user-preferences');
            state.userPreferences = preferences || {};
            return state.userPreferences;
        } catch (error) { return {}; }
    },

    saveSettings: async () => { await callAPI('save-settings', { method: 'PUT', body: state.settings }); },
    deleteAccount: async () => { await callAPI('delete-user-data', { method: 'DELETE' }); },

    addToBlacklist: async (eid, rid) => { await callAPI('manage-blacklist', { method: 'POST', body: { exerciseId: eid, replacementId: rid } }); if (!state.blacklist.includes(eid)) state.blacklist.push(eid); },
    removeFromBlacklist: async (eid) => { await callAPI('manage-blacklist', { method: 'DELETE', body: { exerciseId: eid } }); state.blacklist = state.blacklist.filter(id => id !== eid); },

    getHistoryForMonth: async (y, m, f) => {
        const key = getMonthCacheKey(y, m);
        if (!f && state.loadedMonths.has(key)) return;
        const sessions = await callAPI('get-history-by-month', { params: { year: y, month: m } });
        if (sessions) {
            sessions.forEach(session => {
                const k = getISODate(new Date(session.completedAt));
                if (!state.userProgress[k]) state.userProgress[k] = [];
                const ex = state.userProgress[k].find(s => String(s.sessionId) === String(session.sessionId));
                if (!ex) state.userProgress[k].push(session); else { const idx = state.userProgress[k].indexOf(ex); state.userProgress[k][idx] = session; }
            });
        }
        state.loadedMonths.add(key);
    },

    loadRecentHistory: async (d) => {
        const sessions = await callAPI('get-recent-history', { params: { days: d } });
        if (sessions) {
            sessions.forEach(session => {
                const k = getISODate(new Date(session.completedAt));
                if (!state.userProgress[k]) state.userProgress[k] = [];
                const ex = state.userProgress[k].find(s => String(s.sessionId) === String(session.sessionId));
                if (!ex) state.userProgress[k].push(session); else { const idx = state.userProgress[k].indexOf(ex); state.userProgress[k][idx] = session; }
            });
        }
        state.isHistoryLoaded = true;
    },

    saveSession: async (sessionData) => {
        const result = await callAPI('save-session', { method: 'POST', body: sessionData });
        state.loadedMonths.clear();
        return result;
    },

    // NOWA FUNKCJA: Aktualizacja pojedynczego logu ćwiczenia
    updateExerciseLog: async (sessionId, exerciseId, tech, rir) => {
        return await callAPI('update-exercise-log', {
            method: 'POST',
            body: { sessionId, exerciseId, tech, rir }
        });
    },

    recalculateStats: async () => {
        return await callAPI('recalculate-stats', { method: 'POST' });
    },

    deleteSession: async (sid) => { await callAPI('delete-session', { method: 'DELETE', params: { sessionId: sid } }); state.loadedMonths.clear(); },
    startStravaAuth: async () => { const d = await callAPI('strava-auth-start'); if (d.authorizationUrl) window.location.href = d.authorizationUrl; },
    disconnectStrava: async () => { await callAPI('strava-disconnect', { method: 'POST' }); state.stravaIntegration.isConnected = false; },
    uploadToStrava: async (pl) => { await callAPI('strava-upload-activity', { method: 'POST', body: pl }); },
    migrateData: async (pd) => { await callAPI('migrate-data', { method: 'POST', body: Object.values(pd).flat() }); },

    updatePreference: async (exerciseId, action, value = null) => {
        if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = { score: 0, difficulty: 0 };

        if (action === 'set') {
            state.userPreferences[exerciseId].score = value;
        } else if (action === 'set_difficulty') {
            state.userPreferences[exerciseId].difficulty = value;
        } else if (action === 'reset_difficulty') {
            state.userPreferences[exerciseId].difficulty = 0;
        } else {
            let current = state.userPreferences[exerciseId].score || 0;
            if (action === 'like') {
                current += SCORE_LIKE;
            } else if (action === 'dislike') {
                current += SCORE_DISLIKE;
            }
            state.userPreferences[exerciseId].score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, current));

            if (action === 'hard') state.userPreferences[exerciseId].difficulty = 1;
            else if (action === 'easy') state.userPreferences[exerciseId].difficulty = -1;
        }

        state.userPreferences[exerciseId].updatedAt = new Date().toISOString();

        try {
            const res = await callAPI('update-preference', { method: 'POST', body: { exerciseId, action, value } });
            if (res) {
                if (res.newScore !== undefined) state.userPreferences[exerciseId].score = res.newScore;
                if (res.newDifficulty !== undefined) state.userPreferences[exerciseId].difficulty = res.newDifficulty;
            }
            return res;
        } catch (error) { console.error("Update pref failed:", error); }
    }
};

export default dataStore;
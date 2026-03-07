import { state } from './state.js';
import { getISODate } from './utils.js';
import { callAPI } from './apiClient.js';

const getMonthCacheKey = (year, month) => `${year}-${month}`;

const mergeSessionIntoUserProgress = (session) => {
    if (!session || !session.completedAt) return;

    const dayKey = getISODate(new Date(session.completedAt));
    if (!state.userProgress[dayKey]) state.userProgress[dayKey] = [];

    const existingIndex = state.userProgress[dayKey].findIndex(
        (savedSession) => String(savedSession.sessionId) === String(session.sessionId)
    );

    if (existingIndex === -1) {
        state.userProgress[dayKey].push(session);
        return;
    }

    state.userProgress[dayKey][existingIndex] = {
        ...state.userProgress[dayKey][existingIndex],
        ...session
    };
};

const mergeSessionsIntoUserProgress = (sessions = []) => {
    sessions.forEach(mergeSessionIntoUserProgress);
};

const applySessionLogUpdate = (sessionId, updatedLog) => {
    if (!Array.isArray(updatedLog)) return;
    Object.values(state.userProgress).forEach((sessions) => {
        const existingSession = sessions.find((session) => String(session.sessionId) === String(sessionId));
        if (existingSession) {
            existingSession.sessionLog = updatedLog;
        }
    });
};

export const historyStore = {
    mergeSessionsIntoUserProgress,

    async getHistoryForMonth(year, month, force) {
        const key = getMonthCacheKey(year, month);
        if (!force && state.loadedMonths.has(key)) return;

        const sessions = await callAPI('get-history-by-month', { params: { year, month } });
        mergeSessionsIntoUserProgress(sessions);
        state.loadedMonths.add(key);
    },

    async loadRecentHistory(days) {
        const sessions = await callAPI('get-recent-history', { params: { days } });
        mergeSessionsIntoUserProgress(sessions);
        state.isHistoryLoaded = true;
    },

    async saveSession(sessionData) {
        const result = await callAPI('save-session', { method: 'POST', body: sessionData });
        state.loadedMonths.clear();
        return result;
    },

    async patchSessionFeedback24h(sessionId, after24h, note = '') {
        const result = await callAPI('update-pain-feedback-24h', {
            method: 'POST',
            body: { sessionId, after24h, note }
        });
        state.loadedMonths.clear();
        return result;
    },

    async updateExerciseLog(sessionId, exerciseId, tech, rir, difficultyDeviation, rating) {
        const body = { sessionId, exerciseId };
        if (tech !== undefined && tech !== null) body.tech = tech;
        if (rir !== undefined && rir !== null) body.rir = rir;
        if (difficultyDeviation !== undefined) body.difficultyDeviation = difficultyDeviation;
        if (rating !== undefined) body.rating = rating;

        const response = await callAPI('update-exercise-log', {
            method: 'POST',
            body
        });

        if (response) {
            state.loadedMonths.clear();
            applySessionLogUpdate(sessionId, response.updatedLog);
        }

        return response;
    },

    async deleteSession(sessionId) {
        await callAPI('delete-session', { method: 'DELETE', params: { sessionId } });
        state.loadedMonths.clear();
    }
};

import { state, mergeSettings } from './state.js';
import { getToken } from './auth.js';
import { callAPI } from './apiClient.js';
import { historyStore } from './historyStore.js';

export const settingsStore = {
    async loadAppContent() {
        try {
            const data = await callAPI('get-app-content') || {};
            state.exerciseLibrary = data.exercises || {};

            const total = Object.keys(state.exerciseLibrary).length;
            const blocked = Object.values(state.exerciseLibrary).filter((exercise) => exercise.isAllowed === false).length;
            const allowed = total - blocked;

            console.log((await getToken())
                ? `📦 Zasoby PERSONALIZOWANE: ${allowed} dostępnych, ${blocked} zablokowanych.`
                : '📦 Zasoby PUBLICZNE załadowane.');
        } catch (error) {
            console.error('Critical: Failed to load app content:', error);
        }
    },

    async fetchExerciseAnimation(exerciseId) {
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
        } catch (error) {
            console.error(`Błąd pobierania animacji dla ${exerciseId}:`, error);
        }

        return null;
    },

    async initialize() {
        try {
            console.time('Bootstrap');
            const data = await callAPI('get-or-create-user-data');
            console.timeEnd('Bootstrap');

            if (!state.userProgress) state.userProgress = {};

            if (data.settings) {
                mergeSettings(data.settings);
                if (typeof state.settings.restTimeFactor !== 'number') {
                    state.settings.restTimeFactor = 1.0;
                }
                state.tts.isSoundOn = state.settings.ttsEnabled ?? true;
                state.settings.planMode = 'dynamic';
            }

            if (data.exercisePace) {
                state.exercisePace = data.exercisePace;
                console.log('⏱️ Adaptive Pacing: Loaded stats for', Object.keys(data.exercisePace).length, 'exercises.');
            }

            if (data.integrations) state.stravaIntegration.isConnected = !!data.integrations.isStravaConnected;
            state.userPreferences = data.userPreferences || {};
            state.blacklist = data.blacklist || [];
            state.overrides = data.overrides || {};

            const cachedStats = localStorage.getItem('cachedUserStats');
            if (cachedStats) {
                try {
                    state.userStats = JSON.parse(cachedStats);
                } catch (error) {
                    state.userStats = { totalSessions: 0, streak: 0, resilience: null };
                }
            } else {
                state.userStats = { totalSessions: 0, streak: 0, resilience: null };
            }

            historyStore.mergeSessionsIntoUserProgress(data.recentSessions);

            return data;
        } catch (error) {
            console.error('Initialization failed:', error);
            throw error;
        }
    },

    async generateDynamicPlan(questionnaire) {
        const payload = {
            ...questionnaire,
            secondsPerRep: state.settings.secondsPerRep || 6,
            restTimeFactor: state.settings.restTimeFactor || 1.0
        };

        const result = await callAPI('generate-plan', { method: 'POST', body: payload });
        if (!result || !result.plan) throw new Error('Pusta odpowiedź z generatora.');

        state.settings.dynamicPlanData = result.plan;
        state.settings.planMode = 'dynamic';
        state.settings.onboardingCompleted = true;
        state.settings.wizardData = { ...state.settings.wizardData, ...questionnaire };
        return result;
    },

    async fetchDetailedStats() {
        try {
            const stats = await callAPI('get-user-stats', { params: { ts: Date.now() } });
            state.userStats = stats;
            localStorage.setItem('cachedUserStats', JSON.stringify(stats));
            return stats;
        } catch (error) {
            return null;
        }
    },

    async saveSettings() {
        await callAPI('save-settings', { method: 'PUT', body: state.settings });
    },

    async deleteAccount() {
        await callAPI('delete-user-data', { method: 'DELETE' });
    },

    async addToBlacklist(exerciseId, replacementId) {
        await callAPI('manage-blacklist', {
            method: 'POST',
            body: { exerciseId, replacementId }
        });

        if (!state.blacklist.includes(exerciseId)) state.blacklist.push(exerciseId);
    },

    async removeFromBlacklist(exerciseId) {
        await callAPI('manage-blacklist', { method: 'DELETE', body: { exerciseId } });
        state.blacklist = state.blacklist.filter((id) => id !== exerciseId);
    },

    async recalculateStats() {
        return callAPI('recalculate-stats', { method: 'POST' });
    }
};

import { state } from './state.js';
import { callAPI } from './apiClient.js';

const SCORE_LIKE = 15;
const SCORE_DISLIKE = -30;
const SCORE_MAX = 100;
const SCORE_MIN = -100;

export const preferencesStore = {
    async fetchUserPreferences() {
        try {
            const preferences = await callAPI('get-user-preferences');
            state.userPreferences = preferences || {};
            return state.userPreferences;
        } catch (error) {
            return {};
        }
    },

    async updatePreference(exerciseId, action, value = null) {
        if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = { score: 0, difficulty: 0 };

        if (action === 'set') {
            state.userPreferences[exerciseId].score = value;
        } else if (action === 'set_difficulty') {
            state.userPreferences[exerciseId].difficulty = value;
        } else if (action === 'reset_difficulty') {
            state.userPreferences[exerciseId].difficulty = 0;
        } else {
            let current = state.userPreferences[exerciseId].score || 0;
            if (action === 'like') current += SCORE_LIKE;
            if (action === 'dislike') current += SCORE_DISLIKE;
            state.userPreferences[exerciseId].score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, current));
        }

        state.userPreferences[exerciseId].updatedAt = new Date().toISOString();

        try {
            const response = await callAPI('update-preference', { method: 'POST', body: { exerciseId, action, value } });
            if (response) {
                if (response.newScore !== undefined) state.userPreferences[exerciseId].score = response.newScore;
                if (response.newDifficulty !== undefined) state.userPreferences[exerciseId].difficulty = response.newDifficulty;
            }
            return response;
        } catch (error) {
            console.error('Update pref failed:', error);
        }
    }
};

import { state } from './state.js';
import { callAPI } from './apiClient.js';

export const integrationsStore = {
    async startStravaAuth() {
        const data = await callAPI('strava-auth-start');
        if (data.authorizationUrl) window.location.href = data.authorizationUrl;
    },

    async disconnectStrava() {
        await callAPI('strava-disconnect', { method: 'POST' });
        state.stravaIntegration.isConnected = false;
    },

    async uploadToStrava(payload) {
        await callAPI('strava-upload-activity', { method: 'POST', body: payload });
    },

    async migrateData(progressData) {
        await callAPI('migrate-data', { method: 'POST', body: Object.values(progressData).flat() });
    }
};

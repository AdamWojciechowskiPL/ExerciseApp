import { state } from './state.js';
import { getISODate } from './utils.js';
import { TRAINING_PLAN } from './training-plan.js';

const dataStore = {
    load: () => {
        const progressData = localStorage.getItem('trainingAppProgress');
        if (progressData) state.userProgress = JSON.parse(progressData);
        
        const settingsData = localStorage.getItem('trainingAppSettings');
        if (settingsData) state.settings = { ...state.settings, ...JSON.parse(settingsData) };
        
        if (!state.settings.appStartDate) {
            state.settings.appStartDate = getISODate(new Date());
            dataStore.saveSettings();
        }
    },
    saveProgress: () => {
        localStorage.setItem('trainingAppProgress', JSON.stringify(state.userProgress));
    },
    saveSettings: () => {
        localStorage.setItem('trainingAppSettings', JSON.stringify(state.settings));
    }
};

export default dataStore;
import { callAPI } from './apiClient.js';
import { settingsStore } from './settingsStore.js';
import { historyStore } from './historyStore.js';
import { preferencesStore } from './preferencesStore.js';
import { integrationsStore } from './integrationsStore.js';

const dataStore = {
    ...settingsStore,
    ...historyStore,
    ...preferencesStore,
    ...integrationsStore,
    callAPI
};

export default dataStore;

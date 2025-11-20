// js/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';

export const renderSettingsScreen = () => {
    const form = document.getElementById('settings-form');
    form['setting-start-date'].value = state.settings.appStartDate;
    form['setting-progression-factor'].value = state.settings.progressionFactor;
    document.getElementById('progression-factor-value').textContent = `${state.settings.progressionFactor}%`;
    
    const planSelector = document.getElementById('setting-training-plan');
    if (planSelector) {
        planSelector.innerHTML = '';
        Object.keys(state.trainingPlans).forEach(planId => {
            const plan = state.trainingPlans[planId];
            const option = document.createElement('option');
            option.value = planId;
            option.textContent = plan.name;
            if (planId === state.settings.activePlanId) { option.selected = true; }
            planSelector.appendChild(option);
        });
    }

    renderIntegrationSection();
    navigateTo('settings');
};

function renderIntegrationSection() {
    const dangerZone = document.getElementById('danger-zone');
    if (!dangerZone) return;
    
    const oldIntegrationSection = document.getElementById('integration-section');
    if (oldIntegrationSection) oldIntegrationSection.remove();

    const integrationSection = document.createElement('div');
    integrationSection.id = 'integration-section';
    integrationSection.className = 'settings-section';
    
    let content = '<h3>Integracje</h3>';
    if (state.stravaIntegration.isConnected) {
        content += `
            <div class="integration-status">
                <p><strong>Strava:</strong> Połączono.</p>
                <button id="disconnect-strava-btn" class="nav-btn danger-btn">Rozłącz konto Strava</button>
            </div>`;
    } else {
        content += `
            <div class="integration-status">
                <p>Połącz swoje konto, aby automatycznie przesyłać treningi.</p>
                <button id="connect-strava-btn" class="nav-btn strava-btn"><span>Połącz ze Strava</span></button>
            </div>`;
    }
    integrationSection.innerHTML = content;
    dangerZone.parentNode.insertBefore(integrationSection, dangerZone);

    if (state.stravaIntegration.isConnected) {
        document.getElementById('disconnect-strava-btn').addEventListener('click', async () => {
            if (confirm('Czy odłączyć konto Strava?')) {
                showLoader();
                try { await dataStore.disconnectStrava(); renderSettingsScreen(); } finally { hideLoader(); }
            }
        });
    } else {
        document.getElementById('connect-strava-btn').addEventListener('click', () => {
            showLoader();
            dataStore.startStravaAuth();
        });
    }
}
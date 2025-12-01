// js/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';

export const renderSettingsScreen = () => {
    const form = document.getElementById('settings-form');
    // Zabezpieczenie na wypadek, gdyby formularz nie istniał w DOM
    if (form) {
        form['setting-start-date'].value = state.settings.appStartDate || new Date().toISOString().split('T')[0];
        form['setting-progression-factor'].value = state.settings.progressionFactor || 100;
        
        const factorValueDisplay = document.getElementById('progression-factor-value');
        if (factorValueDisplay) {
            factorValueDisplay.textContent = `${state.settings.progressionFactor}%`;
        }
    }
    
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

    // --- FIX: SEKCJA INFORMACJE (Zapobieganie duplikatom) ---
    // Sprawdzamy, czy sekcja już istnieje
    if (!document.getElementById('about-section')) {
        const aboutSection = document.createElement('div');
        aboutSection.id = 'about-section'; // Nadajemy ID, żeby móc je wykryć
        aboutSection.className = 'settings-section';
        aboutSection.innerHTML = `
            <h3>Informacje</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="/terms.html" class="nav-btn" style="text-align:center;">Regulamin Usługi</a>
                <a href="/privacy.html" class="nav-btn" style="text-align:center;">Polityka Prywatności</a>
            </div>
        `;
        
        const formContainer = document.getElementById('settings-form').parentNode; // section#settings-screen
        const dangerZone = document.getElementById('danger-zone');
        
        if (dangerZone) {
            formContainer.insertBefore(aboutSection, dangerZone);
        } else {
            formContainer.appendChild(aboutSection);
        }
    }
    // ---------------------------------------------------------

    navigateTo('settings');
};

function renderIntegrationSection() {
    const dangerZone = document.getElementById('danger-zone');
    if (!dangerZone) return;
    
    // Usuwamy starą sekcję integracji, żeby odświeżyć status
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
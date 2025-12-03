// js/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js'; 

export const renderSettingsScreen = () => {
    const form = document.getElementById('settings-form');
    if (form) {
        form['setting-start-date'].value = state.settings.appStartDate || new Date().toISOString().split('T')[0];
        
        // NOWOŚĆ: Renderowanie lub aktualizacja checkboxa TTS w formularzu
        // Sprawdzamy czy element już istnieje, żeby go nie dublować przy przeładowaniu
        let ttsContainer = document.getElementById('setting-tts-container');
        if (!ttsContainer) {
            ttsContainer = document.createElement('div');
            ttsContainer.id = 'setting-tts-container';
            ttsContainer.className = 'form-group';
            ttsContainer.innerHTML = `
                <label for="setting-tts" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" id="setting-tts" style="width:20px; height:20px;">
                    <span>Włącz wskazówki głosowe (TTS)</span>
                </label>
                <p style="font-size:0.8rem; color:#666; margin-top:5px;">Lektor będzie czytał nazwy ćwiczeń i instrukcje. Możesz to tymczasowo wyłączyć podczas treningu.</p>
            `;
            // Wstawiamy przed przyciskiem zapisu
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                form.insertBefore(ttsContainer, submitBtn);
            } else {
                form.appendChild(ttsContainer);
            }
        }
        
        // Ustawienie stanu checkboxa
        const ttsCheckbox = document.getElementById('setting-tts');
        if (ttsCheckbox) {
            ttsCheckbox.checked = state.settings.ttsEnabled ?? true;
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

    // --- RE-KONFIGURACJA ---
    const wizardBtnId = 'restart-wizard-btn';
    let wizardBtn = document.getElementById(wizardBtnId);
    
    if (!wizardBtn) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'settings-section';
        btnContainer.innerHTML = `
            <h3>Twój Profil</h3>
            <p>Zaktualizuj dane o bólu, sprzęcie i dostępnym czasie.</p>
            <button id="${wizardBtnId}" class="nav-btn" style="width:100%; border-color:var(--gold-color); color:var(--primary-color);">
                ⚙️ Uruchom Asystenta Konfiguracji
            </button>
        `;
        const dangerZone = document.getElementById('danger-zone');
        if (dangerZone) {
            dangerZone.parentNode.insertBefore(btnContainer, dangerZone);
        }
        
        document.getElementById(wizardBtnId).addEventListener('click', () => {
            initWizard(true); 
        });
    }

    // --- SEKCJA INFORMACJE ---
    if (!document.getElementById('about-section')) {
        const aboutSection = document.createElement('div');
        aboutSection.id = 'about-section'; 
        aboutSection.className = 'settings-section';
        aboutSection.innerHTML = `
            <h3>Informacje</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="/terms.html" class="nav-btn" style="text-align:center;">Regulamin Usługi</a>
                <a href="/privacy.html" class="nav-btn" style="text-align:center;">Polityka Prywatności</a>
            </div>
        `;
        const formContainer = document.getElementById('settings-form').parentNode; 
        const dangerZone = document.getElementById('danger-zone');
        if (dangerZone) {
            formContainer.insertBefore(aboutSection, dangerZone);
        } else {
            formContainer.appendChild(aboutSection);
        }
    }

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
// js/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { screens } from '../../dom.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js';
import { renderMainScreen } from './dashboard.js';

export const renderSettingsScreen = () => {
    const screen = screens.settings;
    
    // Pobieramy aktualne wartości ze stanu
    const currentMode = state.settings.planMode || (state.settings.dynamicPlanData ? 'dynamic' : 'static');
    const activePlanId = state.settings.activePlanId;
    const startDate = state.settings.appStartDate || new Date().toISOString().split('T')[0];
    const ttsEnabled = state.settings.ttsEnabled ?? true;
    const isStravaConnected = state.stravaIntegration.isConnected;
    const hasDynamicData = !!state.settings.dynamicPlanData;

    // --- HTML STRUCTURE ---
    
    screen.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">Ustawienia</h2>
        
        <form id="settings-form-rebuild">
            
            <!-- SEKCJA 1: PROFIL & WIZARD -->
            <div class="settings-card">
                <div class="card-header-icon">🧬</div>
                <h3>Wirtualny Fizjoterapeuta</h3>
                <p class="settings-desc">Zaktualizuj swoje dane medyczne, sprzęt i cele, aby wygenerować nowy plan dynamiczny.</p>
                
                <button type="button" id="restart-wizard-btn" class="action-btn" style="background: var(--gold-color); color: #000; margin-top:10px;">
                    ${hasDynamicData ? '🔄 Zaktualizuj Ankietę' : '✨ Uruchom Kreatora'}
                </button>
            </div>

            <!-- SEKCJA 2: KONFIGURACJA PLANU -->
            <div class="settings-card">
                <div class="card-header-icon">📅</div>
                <h3>Plan Treningowy</h3>
                
                <!-- Tryb Planu -->
                <div class="form-group">
                    <label for="setting-plan-mode">Tryb Planu</label>
                    <select id="setting-plan-mode">
                        <option value="static" ${currentMode === 'static' ? 'selected' : ''}>Sztywny (Wybór z listy)</option>
                        <option value="dynamic" ${currentMode === 'dynamic' ? 'selected' : ''}>Dynamiczny (Virtual Physio)</option>
                    </select>
                    <p class="settings-hint" id="mode-hint">
                        ${currentMode === 'dynamic' 
                            ? 'Plan dopasowuje się automatycznie do Twojego bólu i postępów.' 
                            : 'Klasyczny plan treningowy ze stałą listą ćwiczeń.'}
                    </p>
                </div>

                <!-- Wybór Planu (Tylko dla Static) -->
                <div class="form-group ${currentMode === 'dynamic' ? 'hidden' : ''}" id="static-plan-selector-group">
                    <label for="setting-training-plan">Wybierz Szablon</label>
                    <select id="setting-training-plan">
                        ${Object.keys(state.trainingPlans).map(planId => `
                            <option value="${planId}" ${planId === activePlanId ? 'selected' : ''}>
                                ${state.trainingPlans[planId].name}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <!-- Data Startu -->
                <div class="form-group">
                    <label for="setting-start-date">Początek Cyklu</label>
                    <input type="date" id="setting-start-date" value="${startDate}" required>
                    <p class="settings-hint">Data służy do obliczania, który to dzień cyklu.</p>
                </div>
            </div>

            <!-- SEKCJA 3: PREFERENCJE (TTS) -->
            <div class="settings-card">
                <div class="card-header-icon">🔊</div>
                <h3>Preferencje Aplikacji</h3>
                
                <div class="toggle-row">
                    <div class="toggle-label">
                        <strong>Asystent Głosowy (TTS)</strong>
                        <p>Lektor czyta nazwy ćwiczeń i instrukcje.</p>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="setting-tts" ${ttsEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>

            <!-- SEKCJA 4: INTEGRACJE -->
            <div class="settings-card">
                <div class="card-header-icon">🔗</div>
                <h3>Integracje</h3>
                
                <div class="integration-row">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="/icons/strava-logo.svg" onerror="this.style.display='none'" style="height:24px;"> 
                        <strong>Strava</strong>
                    </div>
                    <div id="strava-status-badge" class="status-badge ${isStravaConnected ? 'completed' : 'skipped'}">
                        ${isStravaConnected ? 'Połączono' : 'Rozłączono'}
                    </div>
                </div>
                
                <div style="margin-top:15px;">
                    ${isStravaConnected 
                        ? `<button type="button" id="disconnect-strava-btn" class="nav-btn danger-btn" style="width:100%">Rozłącz konto</button>`
                        : `<button type="button" id="connect-strava-btn" class="nav-btn strava-btn" style="width:100%; background:#FC4C02; color:white; border:none;">Połącz ze Strava</button>`
                    }
                </div>
            </div>

            <!-- SAVE BUTTON (NORMALNY, NA DOLE) -->
            <button type="submit" class="action-btn" style="margin-top: 2rem; margin-bottom: 3rem;">Zapisz Zmiany</button>
        </form>

        <!-- SEKCJA 5: STREFA NIEBEZPIECZNA -->
        <div class="settings-card danger-zone">
            <h3 style="color:var(--danger-color);">Strefa Niebezpieczna</h3>
            <p class="settings-desc">Usunięcie konta jest nieodwracalne. Stracisz całą historię i postępy.</p>
            <button id="delete-account-btn" class="nav-btn danger-btn" style="width: 100%;">Usuń konto na stałe</button>
        </div>

        <!-- Style wstrzyknięte lokalnie dla tego ekranu -->
        <style>
            .settings-card {
                background: #fff;
                border-radius: 12px;
                padding: 1.5rem;
                margin-bottom: 1.5rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                border: 1px solid var(--border-color);
                position: relative;
                overflow: hidden;
            }
            
            /* FIX IKON */
            .card-header-icon {
                position: absolute;
                top: 1.5rem;
                right: 1.5rem;
                font-size: 1.8rem;
                opacity: 1;       
                pointer-events: none;
                line-height: 1;
            }
            
            .settings-card h3 { margin-top: 0; margin-bottom: 0.5rem; color: var(--primary-color); font-size: 1.1rem; padding-right: 40px; }
            .settings-desc { font-size: 0.85rem; color: var(--muted-text-color); margin-bottom: 0; }
            .settings-hint { font-size: 0.75rem; color: #999; margin-top: 4px; margin-bottom: 0; }
            
            /* Switch Toggle */
            .switch { position: relative; display: inline-block; width: 50px; height: 26px; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
            .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--secondary-color); }
            input:checked + .slider:before { transform: translateX(24px); }
            
            .toggle-row { display: flex; justify-content: space-between; align-items: center; }
            .toggle-label p { font-size: 0.8rem; color: #666; margin: 2px 0 0 0; }
            
            .integration-row { display: flex; justify-content: space-between; align-items: center; }
            
            .danger-zone { border: 1px solid var(--danger-color); background: #fff5f5; }
            
            .hidden { display: none; }
        </style>
    `;

    // ============================================================
    // LOGIKA INTERAKCJI
    // ============================================================

    const form = document.getElementById('settings-form-rebuild');
    const modeSelect = document.getElementById('setting-plan-mode');
    const planSelectorGroup = document.getElementById('static-plan-selector-group');
    const modeHint = document.getElementById('mode-hint');

    // 1. Obsługa zmiany trybu (Dynamic/Static)
    modeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'static') {
            planSelectorGroup.classList.remove('hidden');
            modeHint.textContent = 'Klasyczny plan treningowy ze stałą listą ćwiczeń.';
        } else {
            planSelectorGroup.classList.add('hidden');
            modeHint.textContent = 'Plan dopasowuje się automatycznie do Twojego bólu i postępów.';
        }
    });

    // 2. Obsługa Zapisu
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newMode = modeSelect.value;
        const newDate = document.getElementById('setting-start-date').value;
        const newTts = document.getElementById('setting-tts').checked;
        
        state.settings.appStartDate = newDate;
        state.settings.planMode = newMode;
        state.settings.ttsEnabled = newTts;
        state.tts.isSoundOn = newTts;

        if (newMode === 'static') {
            const staticId = document.getElementById('setting-training-plan').value;
            state.settings.activePlanId = staticId;
        }

        showLoader();
        try {
            await dataStore.saveSettings();
            alert('Ustawienia zostały zapisane.');
            renderMainScreen(); 
        } catch (err) {
            console.error(err);
            alert("Błąd zapisu.");
        } finally {
            hideLoader();
        }
    });

    // 3. Przyciski Akcji
    document.getElementById('restart-wizard-btn').addEventListener('click', () => {
        initWizard(true);
    });

    const connectStravaBtn = document.getElementById('connect-strava-btn');
    if (connectStravaBtn) {
        connectStravaBtn.addEventListener('click', () => {
            showLoader();
            dataStore.startStravaAuth();
        });
    }

    const disconnectStravaBtn = document.getElementById('disconnect-strava-btn');
    if (disconnectStravaBtn) {
        disconnectStravaBtn.addEventListener('click', async () => {
            if (confirm('Czy na pewno chcesz rozłączyć konto Strava?')) {
                showLoader();
                try {
                    await dataStore.disconnectStrava();
                    renderSettingsScreen(); 
                } finally {
                    hideLoader();
                }
            }
        });
    }

    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        const confirmation1 = prompt("Czy na pewno chcesz usunąć swoje konto? Wpisz 'usuń moje konto' aby potwierdzić.");
        if (confirmation1 !== 'usuń moje konto') return;
        
        if (!confirm("OSTATECZNE POTWIERDZENIE: Dane zostaną trwale usunięte. Nie będzie można ich przywrócić.")) return;

        showLoader();
        try {
            await dataStore.deleteAccount();
            alert("Konto usunięte. Do zobaczenia!");
            window.location.reload(); 
        } catch (error) {
            hideLoader();
            alert(error.message);
        }
    });

    navigateTo('settings');
};
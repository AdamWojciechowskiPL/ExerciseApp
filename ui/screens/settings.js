// js/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { screens } from '../../dom.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js';
import { renderMainScreen, clearPlanFromStorage } from './dashboard.js';

export const renderSettingsScreen = () => {
    const screen = screens.settings;
    if (!screen) return;

    const startDate = state.settings.appStartDate || new Date().toISOString().split('T')[0];
    const ttsEnabled = state.settings.ttsEnabled ?? true;
    const isStravaConnected = state.stravaIntegration.isConnected;
    const hasDynamicData = !!state.settings.dynamicPlanData;

    const secondsPerRep = state.settings.secondsPerRep || 6;
    const restBetweenSets = state.settings.restBetweenSets || 30;
    const restBetweenExercises = state.settings.restBetweenExercises || 30;

    screen.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">Ustawienia</h2>
        <form id="settings-form-rebuild">
            <div class="settings-card">
                <div class="card-header-icon">🧬</div>
                <h3>Wirtualny Fizjoterapeuta</h3>
                <p class="settings-desc">Zaktualizuj swoje dane medyczne, sprzęt i cele.</p>
                <button type="button" id="restart-wizard-btn" class="action-btn" style="background: var(--gold-color); color: #000; margin-top:10px;">
                    ${hasDynamicData ? '🔄 Zaktualizuj Ankietę' : '✨ Uruchom Kreatora'}
                </button>
            </div>
            <div class="settings-card">
                <div class="card-header-icon">📅</div>
                <h3>Cykl Treningowy</h3>
                <div class="form-group">
                    <label for="setting-start-date">Początek Cyklu</label>
                    <input type="date" id="setting-start-date" value="${startDate}" required>
                </div>
            </div>
            <div class="settings-card">
                <div class="card-header-icon">⏱️</div>
                <h3>Kalibracja Czasu</h3>
                <div class="form-group slider-group">
                    <label>Czas 1 powtórzenia: <span id="val-rep" style="font-weight:bold; color:var(--primary-color)">${secondsPerRep}s</span></label>
                    <input type="range" id="setting-rep-time" min="3" max="10" value="${secondsPerRep}">
                </div>
                <div class="form-group slider-group">
                    <label>Przerwa między seriami: <span id="val-rest-set" style="font-weight:bold; color:var(--primary-color)">${restBetweenSets}s</span></label>
                    <input type="range" id="setting-rest-set" min="5" max="120" step="5" value="${restBetweenSets}">
                </div>
                <div class="form-group slider-group">
                    <label>Przerwa między ćwiczeniami: <span id="val-rest-ex" style="font-weight:bold; color:var(--primary-color)">${restBetweenExercises}s</span></label>
                    <input type="range" id="setting-rest-ex" min="5" max="120" step="5" value="${restBetweenExercises}">
                </div>
                <button type="button" id="recalc-stats-btn" class="nav-btn" style="width:100%; margin-top:10px;">🔄 Przelicz Statystyki Tempa</button>
            </div>
            <div class="settings-card">
                <div class="card-header-icon">🔊</div>
                <h3>Preferencje Aplikacji</h3>
                <div class="toggle-row">
                    <div class="toggle-label"><strong>Asystent Głosowy (TTS)</strong><p>Lektor czyta instrukcje.</p></div>
                    <label class="switch">
                        <input type="checkbox" id="setting-tts" ${ttsEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>
            <div class="settings-card">
                <div class="card-header-icon">🔗</div>
                <h3>Integracje</h3>
                <div class="integration-row">
                    <div style="display:flex; align-items:center; gap:10px;"><img src="/icons/strava-logo.svg" onerror="this.style.display='none'" style="height:24px;"><strong>Strava</strong></div>
                    <div id="strava-status-badge" class="status-badge ${isStravaConnected ? 'completed' : 'skipped'}">${isStravaConnected ? 'Połączono' : 'Rozłączono'}</div>
                </div>
                <div style="margin-top:15px;">
                    ${isStravaConnected 
                        ? `<button type="button" id="disconnect-strava-btn" class="nav-btn danger-btn" style="width:100%">Rozłącz konto</button>` 
                        : `<button type="button" id="connect-strava-btn" class="nav-btn strava-btn" style="width:100%; background:#FC4C02; color:white; border:none;">Połącz ze Strava</button>`}
                </div>
            </div>
            <button type="submit" class="action-btn" style="margin-top: 2rem; margin-bottom: 3rem;">Zapisz Zmiany</button>
        </form>
        <div class="settings-card danger-zone">
            <h3 style="color:var(--danger-color);">Strefa Niebezpieczna</h3>
            <p class="settings-desc">Usunięcie konta jest nieodwracalne.</p>
            <button id="delete-account-btn" class="nav-btn danger-btn" style="width: 100%;">Usuń konto na stałe</button>
        </div>
        <style>
            .settings-card { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid var(--border-color); position: relative; overflow: hidden; }
            .card-header-icon { position: absolute; top: 1.5rem; right: 1.5rem; font-size: 1.8rem; opacity: 1; pointer-events: none; line-height: 1; }
            .switch { position: relative; display: inline-block; width: 50px; height: 26px; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
            .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--secondary-color); }
            input:checked + .slider:before { transform: translateX(24px); }
            .toggle-row { display: flex; justify-content: space-between; align-items: center; }
            .slider-group { margin-bottom: 1.5rem; }
            .slider-group input[type=range] { width: 100%; margin-top: 8px; }
            .danger-zone { border: 1px solid var(--danger-color); background: #fff5f5; }
        </style>
    `;

    // Używamy querySelector na elemencie screen, aby uniknąć problemów z document.getElementById
    const form = screen.querySelector('#settings-form-rebuild');
    const repSlider = screen.querySelector('#setting-rep-time');
    const restSetSlider = screen.querySelector('#setting-rest-set');
    const restExSlider = screen.querySelector('#setting-rest-ex');

    if (repSlider) repSlider.addEventListener('input', (e) => screen.querySelector('#val-rep').textContent = e.target.value + 's');
    if (restSetSlider) restSetSlider.addEventListener('input', (e) => screen.querySelector('#val-rest-set').textContent = e.target.value + 's');
    if (restExSlider) restExSlider.addEventListener('input', (e) => screen.querySelector('#val-rest-ex').textContent = e.target.value + 's');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newSecondsPerRep = parseInt(repSlider.value, 10);
            const newRestSet = parseInt(restSetSlider.value, 10);
            const newRestEx = parseInt(restExSlider.value, 10);

            const timingChanged = newSecondsPerRep !== state.settings.secondsPerRep || 
                                  newRestSet !== state.settings.restBetweenSets || 
                                  newRestEx !== state.settings.restBetweenExercises;

            state.settings.appStartDate = screen.querySelector('#setting-start-date').value;
            state.settings.ttsEnabled = screen.querySelector('#setting-tts').checked;
            state.tts.isSoundOn = state.settings.ttsEnabled;
            state.settings.secondsPerRep = newSecondsPerRep;
            state.settings.restBetweenSets = newRestSet;
            state.settings.restBetweenExercises = newRestEx;

            showLoader();
            try {
                await dataStore.saveSettings();
                if (timingChanged && state.settings.wizardData && Object.keys(state.settings.wizardData).length > 0) {
                    if (confirm("Parametry czasowe zmienione. Przeliczyć plan, aby dopasować go do tych ustawień?")) {
                        const payload = { 
                            ...state.settings.wizardData, 
                            secondsPerRep: newSecondsPerRep, 
                            restBetweenSets: newRestSet, 
                            restBetweenExercises: newRestEx 
                        };
                        await dataStore.generateDynamicPlan(payload);
                        clearPlanFromStorage();
                        alert('Plan został zaktualizowany.');
                    }
                } else {
                    alert('Ustawienia zostały zapisane.');
                }
                renderMainScreen();
            } catch (err) {
                console.error(err);
                alert("Błąd zapisu.");
            } finally {
                hideLoader();
            }
        });
    }

    screen.querySelector('#restart-wizard-btn').addEventListener('click', () => initWizard(true));
    
    screen.querySelector('#recalc-stats-btn').addEventListener('click', async () => {
        if (confirm("Ta operacja przeanalizuje całą Twoją historię treningową. Może to chwilę potrwać.")) {
            showLoader();
            try {
                const res = await dataStore.recalculateStats();
                if (res) { 
                    await dataStore.initialize(); 
                    alert(`Gotowe! Przeliczono statystyki dla ${res.count || 'kilku'} ćwiczeń.`); 
                }
            } catch (err) { 
                console.error(err); 
                alert("Wystąpił błąd."); 
            } finally { 
                hideLoader(); 
            }
        }
    });

    const connectStravaBtn = screen.querySelector('#connect-strava-btn');
    if (connectStravaBtn) connectStravaBtn.addEventListener('click', () => { showLoader(); dataStore.startStravaAuth(); });

    const disconnectStravaBtn = screen.querySelector('#disconnect-strava-btn');
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

    screen.querySelector('#delete-account-btn').addEventListener('click', async () => {
        const c1 = prompt("Wpisz 'usuń moje konto' aby potwierdzić.");
        if (c1 === 'usuń moje konto' && confirm("Wszystkie Twoje dane zostaną trwale usunięte.")) {
            showLoader(); 
            try { 
                await dataStore.deleteAccount(); 
                window.location.reload(); 
            } catch (e) { 
                hideLoader(); 
                alert(e.message); 
            }
        }
    });

    navigateTo('settings');
};
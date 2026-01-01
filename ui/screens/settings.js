// ExerciseApp/ui/screens/settings.js
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
    
    // Nowe ustawienie: Rest Time Factor (domyślnie 1.0)
    const restTimeFactor = state.settings.restTimeFactor || 1.0;
    const restTimePercent = Math.round(restTimeFactor * 100);

    let currentSchedule = state.settings.wizardData?.schedule_pattern || [1, 3, 5];

    const days = [
        { label: 'Pn', val: 1 },
        { label: 'Wt', val: 2 },
        { label: 'Śr', val: 3 },
        { label: 'Cz', val: 4 },
        { label: 'Pt', val: 5 },
        { label: 'So', val: 6 },
        { label: 'Nd', val: 0 }
    ];

    const daysHtml = days.map(d => `
        <div class="day-toggle settings-day-toggle ${currentSchedule.includes(d.val) ? 'active' : ''}" data-val="${d.val}">
            ${d.label}
        </div>
    `).join('');

    screen.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">Ustawienia</h2>
        <form id="settings-form-rebuild">

            <div class="settings-card">
                <div class="card-header-icon">📅</div>
                <h3>Twój Harmonogram</h3>
                <p class="settings-desc">Wybierz dni, w które chcesz ćwiczyć. Plan automatycznie dostosuje się do zmian.</p>

                <div class="day-selector-container" style="justify-content: space-between; margin-bottom: 1.5rem;">
                    ${daysHtml}
                </div>

                <div class="form-group">
                    <label for="setting-start-date">Data początkowa cyklu</label>
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
                    <label>Tempo Przerw: <span id="val-rest-factor" style="font-weight:bold; color:var(--primary-color)">${restTimePercent}%</span></label>
                    <input type="range" id="setting-rest-factor" min="50" max="150" step="10" value="${restTimePercent}">
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; opacity:0.6; margin-top:5px;">
                        <span>Szybko (Metabolic)</span>
                        <span>Standard</span>
                        <span>Spokojnie (Siła)</span>
                    </div>
                </div>

                <button type="button" id="recalc-stats-btn" class="nav-btn" style="width:100%; margin-top:10px;">🔄 Przelicz Statystyki Tempa</button>
            </div>

            <div class="settings-card">
                <div class="card-header-icon">🧬</div>
                <h3>Profil Medyczny</h3>
                <p class="settings-desc">Zaktualizuj dane o bólu, sprzęcie i celach.</p>
                <button type="button" id="restart-wizard-btn" class="action-btn" style="background: var(--gold-color); color: #000; margin-top:10px;">
                    ${hasDynamicData ? '🔄 Zaktualizuj Ankietę' : '✨ Uruchom Kreatora'}
                </button>
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
            .day-selector-container { display: flex; gap: 5px; margin-top: 10px; }
            .day-toggle {
                width: 38px; height: 38px; border-radius: 50%;
                background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 0.85rem;
            }
            .day-toggle.active {
                background: var(--primary-color); color: #fff;
                border-color: var(--primary-color); box-shadow: 0 4px 10px rgba(0, 95, 115, 0.3);
                transform: scale(1.1);
            }
        </style>
    `;

    const form = screen.querySelector('#settings-form-rebuild');
    const repSlider = screen.querySelector('#setting-rep-time');
    const restFactorSlider = screen.querySelector('#setting-rest-factor');
    const dayToggles = screen.querySelectorAll('.settings-day-toggle');

    dayToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const val = parseInt(toggle.dataset.val);
            if (currentSchedule.includes(val)) {
                currentSchedule = currentSchedule.filter(d => d !== val);
                toggle.classList.remove('active');
            } else {
                currentSchedule.push(val);
                toggle.classList.add('active');
            }
            currentSchedule.sort((a, b) => a - b);
        });
    });

    if (repSlider) repSlider.addEventListener('input', (e) => screen.querySelector('#val-rep').textContent = e.target.value + 's');
    if (restFactorSlider) restFactorSlider.addEventListener('input', (e) => screen.querySelector('#val-rest-factor').textContent = e.target.value + '%');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (currentSchedule.length === 0) {
                alert("Musisz wybrać przynajmniej jeden dzień treningowy.");
                return;
            }

            const newSecondsPerRep = parseInt(repSlider.value, 10);
            const newRestFactor = parseInt(restFactorSlider.value, 10) / 100.0;

            const timingChanged = newSecondsPerRep !== state.settings.secondsPerRep ||
                                  newRestFactor !== (state.settings.restTimeFactor || 1.0);

            const oldSchedule = (state.settings.wizardData?.schedule_pattern || []).sort().toString();
            const newScheduleStr = currentSchedule.sort().toString();
            const scheduleChanged = oldSchedule !== newScheduleStr;

            state.settings.appStartDate = screen.querySelector('#setting-start-date').value;
            state.settings.ttsEnabled = screen.querySelector('#setting-tts').checked;
            state.tts.isSoundOn = state.settings.ttsEnabled;
            
            // Zapisujemy nowe wartości
            state.settings.secondsPerRep = newSecondsPerRep;
            state.settings.restTimeFactor = newRestFactor;

            // Czyścimy stare (nieużywane już) klucze, aby nie myliły
            delete state.settings.restBetweenSets;
            delete state.settings.restBetweenExercises;

            if (!state.settings.wizardData) state.settings.wizardData = {};
            state.settings.wizardData.schedule_pattern = currentSchedule;

            showLoader();
            try {
                await dataStore.saveSettings();

                if ((scheduleChanged || timingChanged) && Object.keys(state.settings.wizardData).length > 0) {
                    let msg = "Zapisano ustawienia.";
                    if (scheduleChanged) msg = "Zmieniono dni treningowe. Plan zostanie dostosowany.";
                    else if (timingChanged) msg = "Zmieniono tempo treningu. Przeliczam plan...";

                    if (confirm(`${msg} Kontynuować?`)) {
                        const payload = {
                            ...state.settings.wizardData,
                            secondsPerRep: newSecondsPerRep,
                            restTimeFactor: newRestFactor // Wysyłamy nowy parametr
                        };
                        await dataStore.generateDynamicPlan(payload);
                        clearPlanFromStorage();
                        alert('Plan został pomyślnie zaktualizowany.');
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
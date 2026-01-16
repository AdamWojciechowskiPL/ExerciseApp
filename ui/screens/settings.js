// ExerciseApp/ui/screens/settings.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { screens } from '../../dom.js';
import dataStore from '../../dataStore.js';
import { initWizard } from '../wizard.js';
import { renderMainScreen, clearPlanFromStorage } from './dashboard.js';
import { renderHelpScreen } from './help.js'; // Dodano import

export const renderSettingsScreen = () => {
    const screen = screens.settings;
    if (!screen) return;

    const startDate = state.settings.appStartDate || new Date().toISOString().split('T')[0];
    const ttsEnabled = state.settings.ttsEnabled ?? true;
    const isStravaConnected = state.stravaIntegration.isConnected;
    const hasDynamicData = !!state.settings.dynamicPlanData;

    const secondsPerRep = state.settings.secondsPerRep || 6;
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

            <!-- NOWA SEKCJA: POMOC -->
            <div class="settings-card" style="background: linear-gradient(145deg, #ffffff 0%, #f0f9ff 100%); border-color: #bae6fd;">
                <div class="card-header-icon" style="color:#0ea5e9"><svg width="24" height="24"><use href="#icon-info"/></svg></div>
                <h3>Potrzebujesz pomocy?</h3>
                <p class="settings-desc">Dowiedz się jak działa Mikser, Tarcza Resilience i sterowanie treningiem.</p>
                <button type="button" id="open-help-btn" class="nav-btn" style="width:100%; border-color:#7dd3fc; color:#0284c7;">📖 Otwórz Centrum Wiedzy</button>
            </div>

            <div class="settings-card">
                <div class="card-header-icon"><svg width="24" height="24"><use href="#icon-calendar"/></svg></div>
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
                <div class="card-header-icon"><svg width="24" height="24"><use href="#icon-clock"/></svg></div>
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
                <div class="card-header-icon"><svg width="24" height="24"><use href="#icon-dna"/></svg></div>
                <h3>Profil Medyczny</h3>
                <p class="settings-desc">Zaktualizuj dane o bólu, sprzęcie i celach.</p>
                <button type="button" id="restart-wizard-btn" class="action-btn" style="background: var(--gold-color); color: #000; margin-top:10px;">
                    ${hasDynamicData ? '🔄 Zaktualizuj Ankietę' : '✨ Uruchom Kreatora'}
                </button>
            </div>

            <div class="settings-card">
                <div class="card-header-icon"><svg width="24" height="24"><use href="#icon-sound-on"/></svg></div>
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
                <div class="card-header-icon"><svg width="24" height="24"><use href="#icon-link"/></svg></div>
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
    `;

    // --- OBSŁUGA NOWEGO PRZYCISKU POMOCY ---
    screen.querySelector('#open-help-btn').addEventListener('click', () => {
        renderHelpScreen();
    });

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

            state.settings.secondsPerRep = newSecondsPerRep;
            state.settings.restTimeFactor = newRestFactor;

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
                            restTimeFactor: newRestFactor
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
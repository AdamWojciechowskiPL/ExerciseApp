// ExerciseApp/app.js
// === 1. IMPORTY MODUŁÓW ===
import { state } from './state.js';
import dataStore from './dataStore.js';
import { configureClient, login, logout, handleRedirectCallback, isAuthenticated, getToken, getUserProfile } from './auth.js';
import {
    renderMainScreen,
    renderHistoryScreen,
    renderSettingsScreen,
    renderDayDetailsScreen,
    renderLibraryScreen,
    renderTrainingScreen,
    navigateTo,
    showLoader,
    hideLoader,
    initWizard
} from './ui.js';
import { containers, mainNav, screens } from './dom.js';
import { moveToPreviousExercise, moveToNextExercise, resumeFromBackup } from './training.js';
import { stopTimer, togglePauseTimer, stopStopwatch } from './timer.js';
import { loadVoices } from './tts.js';
import { initializeCastApi, getIsCasting, sendShowIdle } from './cast.js';
import { getSessionBackup, clearSessionBackup, calculateTimeGap, formatTimeGap } from './sessionRecovery.js';
import { renderSessionRecoveryModal } from './ui/modals.js';
import { shouldSynchronizePlan } from './utils.js';


// === 2. POMOCNICZE FUNKCJE NAWIGACJI ===

function checkUnsavedSummaryNavigation() {
    const summaryScreen = document.getElementById('summary-screen');
    if (summaryScreen && summaryScreen.classList.contains('active')) {
        const confirmed = confirm("Twoja sesja nie została zapisana. Czy na pewno chcesz wyjść? Dane tego treningu zostaną bezpowrotnie utracone.");
        if (confirmed) {
            clearSessionBackup();
            return true;
        }
        return false;
    }
    return true;
}

function showUpdateNotification(worker) {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <div class="update-content">
            <span>Dostępna nowa wersja aplikacji!</span>
            <button id="reload-btn">Odśwież</button>
        </div>
    `;
    document.body.appendChild(notification);
    document.getElementById('reload-btn').addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
    });
}


// === 3. GŁÓWNE FUNKCJE APLIKACJI ===

function initAppLogic() {
    renderTrainingScreen();

    const brandContainer = document.querySelector('.brand-container');
    if (brandContainer) {
        brandContainer.addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            navigateTo('main');
            renderMainScreen();
        });
    }

    if (mainNav) {
        mainNav.querySelector('#nav-main').addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            navigateTo('main');
            renderMainScreen();
        });
        mainNav.querySelector('#nav-history').addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            renderHistoryScreen();
        });
        mainNav.querySelector('#nav-library').addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            renderLibraryScreen();
        });
        mainNav.querySelector('#nav-settings').addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            renderSettingsScreen();
        });
    }

    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) {
        bottomNav.addEventListener('click', (e) => {
            const button = e.target.closest('.bottom-nav-btn');
            if (!button || !checkUnsavedSummaryNavigation()) return;

            const screen = button.dataset.screen;
            bottomNav.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            switch (screen) {
                case 'main': renderMainScreen(); break;
                case 'history': renderHistoryScreen(); break;
                case 'library': renderLibraryScreen(); break;
                case 'settings': renderSettingsScreen(); break;
            }
        });
    }

    const prevMonthBtn = document.getElementById('prev-month-btn');
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1); renderHistoryScreen(); });
    const nextMonthBtn = document.getElementById('next-month-btn');
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => { state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1); renderHistoryScreen(); });
    if (containers.calendarGrid) { containers.calendarGrid.addEventListener('click', (e) => { const dayEl = e.target.closest('.calendar-day.has-entry'); if (dayEl && dayEl.dataset.date) { renderDayDetailsScreen(dayEl.dataset.date); } }); }

    const searchInput = document.getElementById('library-search-input');
    if (searchInput) searchInput.addEventListener('input', (e) => { renderLibraryScreen(e.target.value); });

    if (screens.training) {
        screens.training.addEventListener('click', (e) => {
            const target = e.target;
            const skipBtn = document.getElementById('skip-btn');

            if (skipBtn && skipBtn.classList.contains('confirm-state') && !target.closest('#skip-btn')) {
                skipBtn.classList.remove('confirm-state');
            }

            if (target.closest('#exit-training-btn')) { if (confirm('Przerwać trening?')) { stopTimer(); stopStopwatch(); if (state.tts.isSupported) state.tts.synth.cancel(); if (getIsCasting()) sendShowIdle(); clearSessionBackup(); state.currentTrainingDate = null; state.sessionLog = []; state.isPaused = false; navigateTo('main'); renderMainScreen(); } return; }

            // --- ZMIANA DLA TTS TOGGLE (SPRITE SUPPORT) ---
            const ttsBtn = target.closest('#tts-toggle-btn');
            if (ttsBtn) {
                state.tts.isSoundOn = !state.tts.isSoundOn;
                const iconUse = document.getElementById('tts-icon').querySelector('use');
                if (iconUse) {
                    iconUse.setAttribute('href', state.tts.isSoundOn ? '#icon-sound-on' : '#icon-sound-off');
                }
                if (!state.tts.isSoundOn && state.tts.isSupported) state.tts.synth.cancel();
                return;
            }

            if (target.closest('#prev-step-btn')) { moveToPreviousExercise(); return; }
            if (target.closest('#pause-resume-btn')) { togglePauseTimer(); return; }

            const skipTarget = target.closest('#skip-btn');
            if (skipTarget) {
                if (skipTarget.classList.contains('confirm-state')) {
                    skipTarget.classList.remove('confirm-state');
                    moveToNextExercise({ skipped: true });
                } else {
                    skipTarget.classList.add('confirm-state');
                }
                return;
            }

            if (target.closest('#rep-based-done-btn')) {
                moveToNextExercise({ skipped: false });
                return;
            }
        });
    }
    if (state.tts.isSupported) { loadVoices(); if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices; }
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function checkAndMigrateLocalData() {
    const localProgressRaw = localStorage.getItem('trainingAppProgress');
    if (!localProgressRaw) return;
    try {
        const parsedData = JSON.parse(localProgressRaw);
        if (Object.keys(parsedData).length > 0) {
            setTimeout(() => {
                if (confirm("Wykryliśmy dane lokalne. Przenieść na konto?")) {
                    showLoader();
                    dataStore.migrateData(parsedData).then(() => { localStorage.removeItem('trainingAppProgress'); localStorage.removeItem('trainingAppSettings'); alert("Zmigrowano!"); window.location.reload(); }).catch(e => { hideLoader(); alert("Błąd migracji."); });
                }
            }, 1000);
        }
    } catch (e) {
        localStorage.removeItem('trainingAppProgress');
    }
}

export async function main() {
    showLoader();
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoContainer = document.getElementById('user-info-container');
    const bottomNav = document.getElementById('app-bottom-nav');

    await configureClient();
    initializeCastApi();

    try {
        if (loginBtn && !loginBtn.dataset.listenerAttached) { loginBtn.addEventListener('click', login); loginBtn.dataset.listenerAttached = 'true'; }
        if (logoutBtn && !logoutBtn.dataset.listenerAttached) { logoutBtn.addEventListener('click', logout); logoutBtn.dataset.listenerAttached = 'true'; }

        const query = window.location.search;
        const isReturningFromStrava = new URLSearchParams(query).has('strava_status');
        if (query.includes("code=") && query.includes("state=") && !isReturningFromStrava) {
            try { await handleRedirectCallback(); } catch (error) { console.error("Błąd redirectu:", error); }
            window.history.replaceState({}, document.title, "/");
        }

        const isAuth = await isAuthenticated();

        if (isAuth) {
            document.getElementById('welcome-screen').classList.add('hidden');
            document.querySelector('main').classList.remove('hidden');
            if (userInfoContainer) userInfoContainer.classList.remove('hidden');
            if (mainNav) mainNav.classList.remove('hidden');

            await getToken();
            const profile = getUserProfile();
            const nameEl = document.getElementById('user-display-name');
            if (nameEl) nameEl.textContent = profile.name || profile.email || 'Użytkownik';

            await dataStore.loadAppContent();
            initAppLogic();

            try {
                localStorage.removeItem('cachedUserStats');
                await dataStore.initialize();
                state.isAppInitialized = true;

                if (bottomNav) bottomNav.classList.remove('hidden');
                hideLoader();

                const wizardData = state.settings.wizardData;
                const hasWizardData = wizardData && Object.keys(wizardData).length > 0;

                if (hasWizardData) {
                    const syncStatus = shouldSynchronizePlan(state.settings.dynamicPlanData);

                    if (syncStatus.needed) {
                        console.log(`[App] Sync needed: ${syncStatus.reason}`);
                        if (syncStatus.reason === 'missing_today') {
                            showLoader();
                            try {
                                await dataStore.generateDynamicPlan(wizardData);
                                console.log("[App] Critical Plan generated.");
                            } catch (e) {
                                console.error("[App] Critical Sync Failed:", e);
                            } finally {
                                hideLoader();
                            }
                        } else {
                            dataStore.generateDynamicPlan(wizardData)
                                .then(() => console.log("[App] Background Sync complete."))
                                .catch(e => console.warn("[App] Background Sync failed:", e));
                        }
                    }
                }

                renderMainScreen(true);

                await dataStore.loadRecentHistory(90);
                const wizardStarted = initWizard();

                if (!wizardStarted) {
                    if (isReturningFromStrava) {
                        const urlParams = new URLSearchParams(window.location.search);
                        const status = urlParams.get('strava_status');
                        if (status === 'success') alert('Strava połączona!');
                        else if (status === 'error') alert('Błąd Stravy: ' + urlParams.get('message'));
                        renderSettingsScreen();
                        window.history.replaceState({}, document.title, window.location.pathname + "#settings");
                    } else {
                        const backup = getSessionBackup();
                        if (backup) {
                            const timeGap = calculateTimeGap(backup);
                            renderSessionRecoveryModal(
                                backup,
                                formatTimeGap(timeGap),
                                () => resumeFromBackup(backup, timeGap),
                                () => { clearSessionBackup(); renderMainScreen(false); }
                            );
                        } else renderMainScreen(false);
                    }
                }

                checkAndMigrateLocalData();
                await dataStore.fetchDetailedStats();
                const mainScreen = document.getElementById('main-screen');
                if (mainScreen && mainScreen.classList.contains('active')) renderMainScreen(false);
            } catch (initError) {
                hideLoader();
                console.error(initError);
            }

        } else {
            await dataStore.loadAppContent();
            document.getElementById('welcome-screen').classList.remove('hidden');
            document.querySelector('main').classList.add('hidden');
            if (userInfoContainer) userInfoContainer.classList.add('hidden');
            if (mainNav) mainNav.classList.add('hidden');
            if (bottomNav) bottomNav.classList.add('hidden');
            hideLoader();
        }
    } catch (error) {
        hideLoader();
        console.error(error);
    }
}

window.addEventListener('DOMContentLoaded', main);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                if (registration.waiting) showUpdateNotification(registration.waiting);
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotification(newWorker);
                    });
                });
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) { window.location.reload(); refreshing = true; }
        });
    });
}

// SVG Sprite Loader
(async function loadSprite() {
    try {
        const response = await fetch('icons/sprite.svg');
        if (!response.ok) throw new Error('Sprite load failed');
        const svgContent = await response.text();
        const container = document.getElementById('svg-container');
        if (container) container.innerHTML = svgContent;
    } catch (e) {
        console.error('Failed to load icons:', e);
    }
})();
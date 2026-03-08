// ExerciseApp/app.js
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
    renderHelpScreen,
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

function checkUnsavedSummaryNavigation() {
    const summaryScreen = document.getElementById('summary-screen');
    if (summaryScreen && summaryScreen.classList.contains('active')) {
        const confirmed = confirm('Twoja sesja nie została zapisana. Czy na pewno chcesz wyjść? Dane tego treningu zostaną bezpowrotnie utracone.');
        if (confirmed) {
            clearSessionBackup();
            return true;
        }
        return false;
    }
    return true;
}

function activateWaitingServiceWorker(worker) {
    if (!worker) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
}

function wireServiceWorkerAutoActivation(registration) {
    const handleInstalledWorker = (worker) => {
        if (!worker || worker.state !== 'installed' || !navigator.serviceWorker.controller) {
            return;
        }
        activateWaitingServiceWorker(worker);
    };

    if (registration.waiting) {
        activateWaitingServiceWorker(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
            handleInstalledWorker(newWorker);
        });
    });
}

function setAppVersionInFooter() {
    const appVersionEl = document.getElementById('app-version');
    if (!appVersionEl) return;

    fetch('/package.json', { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then((pkg) => {
            appVersionEl.textContent = pkg?.version || 'nieznana';
        })
        .catch(() => {
            appVersionEl.textContent = 'nieznana';
        });
}

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
        mainNav.querySelector('#nav-help').addEventListener('click', () => {
            if (!checkUnsavedSummaryNavigation()) return;
            renderHelpScreen();
        });
    }

    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) {
        bottomNav.addEventListener('click', (e) => {
            const button = e.target.closest('.bottom-nav-btn');
            if (!button || !checkUnsavedSummaryNavigation()) return;

            const screen = button.dataset.screen;
            bottomNav.querySelectorAll('.bottom-nav-btn').forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');

            switch (screen) {
                case 'main': renderMainScreen(); break;
                case 'history': renderHistoryScreen(); break;
                case 'library': renderLibraryScreen(); break;
                case 'settings': renderSettingsScreen(); break;
                case 'help': renderHelpScreen(); break;
            }
        });
    }

    const prevMonthBtn = document.getElementById('prev-month-btn');
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1);
        renderHistoryScreen();
    });

    const nextMonthBtn = document.getElementById('next-month-btn');
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1);
        renderHistoryScreen();
    });

    if (containers.calendarGrid) {
        containers.calendarGrid.addEventListener('click', (e) => {
            const dayEl = e.target.closest('.calendar-day.has-entry');
            if (dayEl && dayEl.dataset.date) renderDayDetailsScreen(dayEl.dataset.date);
        });
    }

    const searchInput = document.getElementById('library-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderLibraryScreen(e.target.value);
        });
    }

    if (screens.training) {
        screens.training.addEventListener('click', (e) => {
            const target = e.target;
            const skipBtn = document.getElementById('skip-btn');

            if (skipBtn && skipBtn.classList.contains('confirm-state') && !target.closest('#skip-btn')) {
                skipBtn.classList.remove('confirm-state');
            }

            if (target.closest('#exit-training-btn')) {
                if (confirm('Przerwać trening?')) {
                    stopTimer();
                    stopStopwatch();
                    if (state.tts.isSupported) state.tts.synth.cancel();
                    if (getIsCasting()) sendShowIdle();
                    clearSessionBackup();
                    state.currentTrainingDate = null;
                    state.sessionLog = [];
                    state.isPaused = false;
                    navigateTo('main');
                    renderMainScreen();
                }
                return;
            }

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

            if (target.closest('#prev-step-btn')) {
                moveToPreviousExercise();
                return;
            }

            if (target.closest('#pause-resume-btn')) {
                togglePauseTimer();
                return;
            }

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
            }
        });
    }

    if (state.tts.isSupported) {
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
    }

    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    setAppVersionInFooter();
}

function checkAndMigrateLocalData() {
    const localProgressRaw = localStorage.getItem('trainingAppProgress');
    if (!localProgressRaw) return;

    try {
        const parsedData = JSON.parse(localProgressRaw);
        if (Object.keys(parsedData).length > 0) {
            setTimeout(() => {
                if (confirm('Wykryliśmy dane lokalne. Przenieść na konto?')) {
                    showLoader();
                    dataStore.migrateData(parsedData)
                        .then(() => {
                            localStorage.removeItem('trainingAppProgress');
                            localStorage.removeItem('trainingAppSettings');
                            alert('Zmigrowano!');
                            window.location.reload();
                        })
                        .catch(() => {
                            hideLoader();
                            alert('Błąd migracji.');
                        });
                }
            }, 1000);
        }
    } catch (error) {
        localStorage.removeItem('trainingAppProgress');
    }
}

async function handleAuthenticatedPostInitialization(isReturningFromStrava) {
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
                    console.log('[App] Critical Plan generated.');
                } catch (error) {
                    console.error('[App] Critical Sync Failed:', error);
                } finally {
                    hideLoader();
                }
            } else {
                dataStore.generateDynamicPlan(wizardData)
                    .then(() => console.log('[App] Background Sync complete.'))
                    .catch((error) => console.warn('[App] Background Sync failed:', error));
            }
        }
    }

    renderMainScreen(true);
    await dataStore.loadRecentHistory(90);

    const wizardStarted = initWizard();
    if (wizardStarted) return;

    if (isReturningFromStrava) {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('strava_status');
        if (status === 'success') alert('Strava połączona!');
        else if (status === 'error') alert(`Błąd Stravy: ${urlParams.get('message')}`);
        renderSettingsScreen();
        window.history.replaceState({}, document.title, `${window.location.pathname}#settings`);
        return;
    }

    const backup = getSessionBackup();
    if (backup) {
        const timeGap = calculateTimeGap(backup);
        renderSessionRecoveryModal(
            backup,
            formatTimeGap(timeGap),
            () => resumeFromBackup(backup, timeGap),
            () => {
                clearSessionBackup();
                renderMainScreen(false);
            }
        );
    } else {
        renderMainScreen(false);
    }
}

export async function initAuthenticatedFlow({ userInfoContainer, bottomNav, isReturningFromStrava }) {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.querySelector('main').classList.remove('hidden');
    if (userInfoContainer) userInfoContainer.classList.remove('hidden');
    if (mainNav) mainNav.classList.remove('hidden');

    const token = await getToken();
    const profile = getUserProfile();

    if (!token || !profile) {
        console.warn('[App] Refresh Token expired or invalid. Force Logout.');
        await logout();
        return;
    }

    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = profile.name || profile.email || 'Użytkownik';

    await dataStore.loadAppContent();
    initAppLogic();

    localStorage.removeItem('cachedUserStats');
    await dataStore.initialize();
    state.isAppInitialized = true;

    if (bottomNav) bottomNav.classList.remove('hidden');
    hideLoader();

    await handleAuthenticatedPostInitialization(isReturningFromStrava);
    checkAndMigrateLocalData();
    await dataStore.fetchDetailedStats();

    const mainScreen = document.getElementById('main-screen');
    if (mainScreen && mainScreen.classList.contains('active')) renderMainScreen(false);
}

export async function initUnauthenticatedFlow({ userInfoContainer, bottomNav }) {
    await dataStore.loadAppContent();
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.querySelector('main').classList.add('hidden');
    if (userInfoContainer) userInfoContainer.classList.add('hidden');
    if (mainNav) mainNav.classList.add('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
    hideLoader();
}

export function registerGlobalEventHandlers() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn && !loginBtn.dataset.listenerAttached) {
        loginBtn.addEventListener('click', login);
        loginBtn.dataset.listenerAttached = 'true';
    }

    if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
        logoutBtn.addEventListener('click', logout);
        logoutBtn.dataset.listenerAttached = 'true';
    }
}

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                wireServiceWorkerAutoActivation(registration);

                const checkForUpdates = () => {
                    registration.update().catch((error) => {
                        console.warn('[Service Worker] Update check failed:', error);
                    });
                };

                setInterval(checkForUpdates, 60 * 1000);
                window.addEventListener('focus', checkForUpdates);
                window.addEventListener('online', checkForUpdates);
            })
            .catch((error) => {
                console.error('[Service Worker] Registration failed:', error);
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    });
}

export async function loadSvgSprite() {
    try {
        const response = await fetch('/icons/sprite.svg');
        if (!response.ok) throw new Error('Sprite load failed');
        const svgContent = await response.text();
        const container = document.getElementById('svg-container');
        if (container) container.innerHTML = svgContent;
    } catch (error) {
        console.error('Failed to load icons:', error);
    }
}

export async function bootstrapApp() {
    showLoader();
    await configureClient();
    initializeCastApi();
    registerGlobalEventHandlers();

    const query = window.location.search;
    const isReturningFromStrava = new URLSearchParams(query).has('strava_status');

    if (query.includes('code=') && query.includes('state=') && !isReturningFromStrava) {
        try {
            await handleRedirectCallback();
        } catch (error) {
            console.error('Błąd redirectu:', error);
        }
        window.history.replaceState({}, document.title, '/');
    }

    const isAuth = await isAuthenticated();
    const userInfoContainer = document.getElementById('user-info-container');
    const bottomNav = document.getElementById('app-bottom-nav');

    if (isAuth) {
        await initAuthenticatedFlow({ userInfoContainer, bottomNav, isReturningFromStrava });
    } else {
        await initUnauthenticatedFlow({ userInfoContainer, bottomNav });
    }
}

export async function main() {
    try {
        await bootstrapApp();
    } catch (error) {
        hideLoader();
        console.error(error);
    }
}

window.addEventListener('DOMContentLoaded', main);
registerServiceWorker();
loadSvgSprite();

// ui.js

import { state } from './state.js';
import { screens, containers, mainNav, initializeFocusElements } from './dom.js';
import { getISODate, getTrainingDayForDate, applyProgression, getHydratedDay, getActiveTrainingPlan, getLocalISOString } from './utils.js';
import { startModifiedTraining } from './training.js';
import dataStore from './dataStore.js';
import { sendPlayVideo, sendStopVideo, getIsCasting, sendShowIdle, sendUserStats } from './cast.js';
import { getGamificationState } from './gamification.js';

const loadingOverlay = document.getElementById('loading-overlay');

// --- Zarządzanie Loaderem ---

export const showLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove('hidden');
    setTimeout(() => { loadingOverlay.style.opacity = '1'; }, 10);
};

export const hideLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.style.opacity = '0';
    setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 300);
};

// --- Wake Lock API (Blokada wygaszania ekranu) ---

export const wakeLockManager = {
    wakeLock: null,
    async request() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error(`Błąd Wake Lock: ${err.name}, ${err.message}`);
            }
        }
    },
    async release() {
        if (this.wakeLock !== null) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
            } catch (err) {
                console.error(`Błąd zwalniania Wake Lock: ${err.name}, ${err.message}`);
            }
        }
    }
};

// --- Obsługa Formularzy ---

export function handleSummarySubmit(e) {
    e.preventDefault();
    const dateKey = state.currentTrainingDate;
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    const trainingDay = activePlan ? activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId) : null;
    
    const now = new Date();
    const stravaCheckbox = document.getElementById('strava-sync-checkbox');

    // 1. Obliczanie czasu netto (Czas całkowity - Czas pauzy)
    const rawDuration = now - state.sessionStartTime;
    // Zabezpieczenie przed ujemnym czasem (gdyby zegar systemowy szalał)
    const netDuration = Math.max(0, rawDuration - (state.totalPausedTime || 0));
    const durationSeconds = Math.round(netDuration / 1000);

    const sessionPayload = {
        sessionId: Date.now(),
        planId: state.settings.activePlanId,
        trainingDayId: state.currentTrainingDayId,
        trainingTitle: trainingDay ? trainingDay.title : "Trening",
        status: 'completed',
        pain_during: document.getElementById('pain-during').value,
        notes: document.getElementById('general-notes').value,
        startedAt: state.sessionStartTime.toISOString(), 
        completedAt: now.toISOString(),
        sessionLog: state.sessionLog,
        // Przekazujemy czas netto dla backendu i Stravy
        netDurationSeconds: durationSeconds
    };

    // 2. Zapisz do lokalnej historii (dla widoku Kalendarza/Historii)
    if (!state.userProgress[dateKey]) {
        state.userProgress[dateKey] = [];
    }
    state.userProgress[dateKey].push(sessionPayload);
    
    // 3. FIX LICZNIKA NA DASHBOARDZIE
    // Aktualizujemy "cache" statystyk z serwera.
    // Dzięki temu funkcja gamifikacji zobaczy: "Lokalnie: 1, Serwer: StaraWartość + 1"
    // i wybierze tę większą wartość.
    if (!state.userStats) {
        state.userStats = { totalSessions: 0, streak: 0 };
    }
    
    // Rzutujemy na int (na wypadek gdyby przyszło jako string) i dodajemy 1
    const currentTotal = parseInt(state.userStats.totalSessions) || 0;
    state.userStats.totalSessions = currentTotal + 1;
    
    // 4. Zapisz w chmurze
    dataStore.saveSession(sessionPayload);

    // 5. Wyślij do Stravy (jeśli zaznaczono)
    if (stravaCheckbox && stravaCheckbox.checked) {
        dataStore.uploadToStrava(sessionPayload);
    }
    
    // 6. Reset stanu sesji
    state.currentTrainingDate = null;
    state.currentTrainingDayId = null;
    state.sessionLog = [];
    state.sessionStartTime = null;
    state.totalPausedTime = 0;
    state.isPaused = false;
    
    // 7. Powrót do ekranu głównego
    navigateTo('main');
    renderMainScreen();
}

// --- Nawigacja ---

export const navigateTo = (screenName) => {
    if (screenName === 'training') {
        wakeLockManager.request();
    } else {
        wakeLockManager.release();
    }

    const bottomNav = document.getElementById('app-bottom-nav');
    const footer = document.getElementById('app-footer');
    const header = document.querySelector('header');

    if (screenName === 'training') {
        screens.training.classList.add('active');
        // Ukrywamy elementy zewnętrzne
        if (header) header.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (footer) footer.style.display = 'none';
    } else {
        screens.training.classList.remove('active');
        // Przywracamy elementy zewnętrzne
        if (header) header.style.display = '';
        if (bottomNav) bottomNav.style.display = '';
        if (footer) footer.style.display = '';
        
        Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
        if (screens[screenName]) screens[screenName].classList.add('active');

        if (bottomNav) {
            const bottomNavButtons = bottomNav.querySelectorAll('.bottom-nav-btn');
            bottomNavButtons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.screen === screenName) {
                    btn.classList.add('active');
                }
            });
        }
    }
    window.scrollTo(0, 0);
};

// --- Renderowanie Ekranów ---

export const renderMainScreen = () => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) {
        containers.days.innerHTML = '<p>Ładowanie planu treningowego...</p>';
        return;
    }

    // --- EPIK 1: Gamifikacja / Hero Dashboard ---
    const heroContainer = document.getElementById('hero-dashboard');
    if (heroContainer) {
        const stats = getGamificationState(state.userProgress);
        
        if (getIsCasting()) {
            sendUserStats(stats);
        }

        heroContainer.classList.remove('hidden');
        heroContainer.innerHTML = generateHeroDashboardHTML(stats);
    }
    // ---------------------------------------------

    containers.days.innerHTML = '';
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const trainingDayData = getTrainingDayForDate(date);
        
        if (!trainingDayData) continue;
        
        const trainingDay = getHydratedDay(trainingDayData);
        if (!trainingDay) continue;
        
        let dateLabel = date.toLocaleString('pl-PL', { day: 'numeric', month: 'short' });
        if (i === 0) dateLabel = `DZISIAJ, ${dateLabel}`;
        if (i === 1) dateLabel = `JUTRO, ${dateLabel}`;
        
        const equipmentSet = new Set();
        [...(trainingDay.warmup || []), ...(trainingDay.main || []), ...(trainingDay.cooldown || [])].forEach(ex => {
            if (ex.equipment) ex.equipment.split(',').forEach(item => equipmentSet.add(item.trim()));
        });
        const equipmentText = equipmentSet.size > 0 ? [...equipmentSet].join(', ') : 'Brak wymaganego sprzętu';

        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
            <p class="day-card-date">${dateLabel}</p>
            <div class="card-header"><h3>Dzień ${trainingDay.dayNumber}: ${trainingDay.title}</h3></div>
            <p class="day-card-equipment"><strong>Sprzęt:</strong> ${equipmentText}</p>
            <button class="action-btn" data-day-id="${trainingDay.dayNumber}">Start treningu (Dzień ${trainingDay.dayNumber})</button>
        `;
        containers.days.appendChild(card);
    }
    navigateTo('main');
};

export const renderHistoryScreen = async () => {
    navigateTo('history');
    showLoader(); 

    try {
        const date = state.currentCalendarView;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        await dataStore.getHistoryForMonth(year, month);
        
        document.getElementById('month-year-header').textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        const grid = containers.calendarGrid;
        grid.innerHTML = '';
        
        const firstDayOfMonth = new Date(year, date.getMonth(), 1);
        const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0);
        let startDay = firstDayOfMonth.getDay();
        if (startDay === 0) startDay = 7; 
        
        for (let i = 1; i < startDay; i++) { 
            grid.innerHTML += `<div class="calendar-day other-month"></div>`; 
        }
        
        const todayISO = getISODate(new Date());
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const currentDate = new Date(year, date.getMonth(), i);
            const isoDate = getISODate(currentDate);
            const dayEntries = state.userProgress[isoDate] || [];
            
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            
            if (dayEntries.length > 0) {
                dayEl.classList.add('has-entry', 'completed');
                dayEl.dataset.date = isoDate;
            } else {
                dayEl.classList.add('not_started');
            }
            if (isoDate === todayISO) { 
                dayEl.classList.add('today'); 
            }
            
            let planHtml = '';
            const trainingDayForVisuals = getTrainingDayForDate(currentDate);
            if (trainingDayForVisuals) {
                planHtml = `<div class="day-plan">Dzień ${trainingDayForVisuals.dayNumber}</div>`;
            }

            dayEl.innerHTML = `<div class="day-number">${i}</div>${planHtml}`;
            grid.appendChild(dayEl);
        }
    } catch (error) {
        console.error("Error rendering history screen:", error);
    } finally {
        hideLoader();
    }
};

export const renderDayDetailsScreen = (isoDate) => {
    const dayEntries = state.userProgress[isoDate];
    if (!dayEntries || dayEntries.length === 0) {
        renderHistoryScreen();
        return;
    }
    const date = new Date(isoDate);
    const sessionsHtml = dayEntries.map(generateSessionCardHTML).join('');

    screens.dayDetails.innerHTML = `
        <h2 id="details-day-title">${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <div id="day-details-content">${sessionsHtml}</div>
        <button id="details-back-btn" class="action-btn">Wróć do Historii</button>
    `;

    screens.dayDetails.querySelector('#details-back-btn').addEventListener('click', renderHistoryScreen);
    
    const contentContainer = screens.dayDetails.querySelector('#day-details-content');
    contentContainer.addEventListener('click', async (e) => {
        // Obsługa kliknięcia w ikonę kosza (wyszukujemy w górę drzewa, bo to może być <path> wewnątrz <svg>)
        const btn = e.target.closest('.delete-session-btn');
        if (btn) {
            const sessionId = btn.dataset.sessionId;
            if (!confirm('Czy na pewno chcesz trwale usunąć ten trening?')) return;

            showLoader();
            try {
                await dataStore.deleteSession(sessionId);
                state.userProgress[isoDate] = state.userProgress[isoDate].filter(s => String(s.sessionId) !== String(sessionId));

                if (state.userProgress[isoDate].length > 0) {
                    renderDayDetailsScreen(isoDate);
                } else {
                    delete state.userProgress[isoDate];
                    renderHistoryScreen();
                }
            } catch (error) {
                console.error("Deletion failed:", error);
            } finally {
                hideLoader();
            }
        }
    });
    
    navigateTo('dayDetails');
};

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

export const renderLibraryScreen = (searchTerm = '') => {
    const container = containers.exerciseLibrary;
    container.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    Object.values(state.exerciseLibrary)
        .filter(exercise => 
            exercise.name.toLowerCase().includes(lowerCaseSearchTerm) || 
            exercise.description.toLowerCase().includes(lowerCaseSearchTerm)
        )
        .forEach(exercise => {
            const card = document.createElement('div');
            card.className = 'library-card';
            
            const youtubeIdMatch = exercise.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|$)/);
            const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;

            card.innerHTML = `
                <div class="card-header"><h3>${exercise.name}</h3></div>
                <p class="library-card-description">${exercise.description}</p>
                <div class="library-card-footer">
                    <p><strong>Sprzęt:</strong> ${exercise.equipment || 'Brak'}</p>
                    <div>
                        <button class="nav-btn cast-video-btn" data-youtube-id="${youtubeId}" ${!youtubeId ? 'disabled' : ''}>Rzutuj 📺</button>
                        <a href="${exercise.youtube_url}" target="_blank" rel="noopener noreferrer" class="nav-btn">Obejrzyj ↗</a>
                    </div>
                </div>`;
            container.appendChild(card);
        });

    const eventHandler = (e) => {
        if (e.target.classList.contains('cast-video-btn')) {
            const youtubeId = e.target.dataset.youtubeId;
            if (youtubeId && getIsCasting()) {
                sendPlayVideo(youtubeId);
                e.target.textContent = "Zatrzymaj ⏹️";
                e.target.classList.replace('cast-video-btn', 'stop-cast-video-btn');
            } else if (!getIsCasting()) {
                alert("Najpierw połącz się z urządzeniem Chromecast.");
            }
        } else if (e.target.classList.contains('stop-cast-video-btn')) {
            sendStopVideo();
            e.target.textContent = "Rzutuj 📺";
            e.target.classList.replace('stop-cast-video-btn', 'cast-video-btn');
        }
    };
    
    if (container.eventListener) container.removeEventListener('click', container.eventListener);
    container.addEventListener('click', eventHandler);
    container.eventListener = eventHandler;

    navigateTo('library');
};

export const renderPreTrainingScreen = (dayId) => {
    state.currentTrainingDayId = dayId;
    state.currentTrainingDate = getISODate(new Date());
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return;
    const dayData = activePlan.Days.find(d => d.dayNumber === dayId);
    if (!dayData) return;
    const trainingDay = getHydratedDay(dayData);
    if (!trainingDay) return;
    
    const screen = screens.preTraining;
    screen.innerHTML = `
        <h2 id="pre-training-title">Podgląd: ${trainingDay.title}</h2>
        <div id="pre-training-list"></div>
        <div class="pre-training-nav">
            <button id="pre-training-back-btn" class="nav-btn">Wróć</button>
            <button id="start-modified-training-btn" class="action-btn">Rozpocznij Trening</button>
        </div>
    `;
    
    const listContainer = screen.querySelector('#pre-training-list');
    const sections = [{ name: 'Rozgrzewka', exercises: trainingDay.warmup || [] }, { name: 'Część główna', exercises: trainingDay.main || [] }, { name: 'Schłodzenie', exercises: trainingDay.cooldown || [] }];
    let exerciseCounter = 0;

    sections.forEach(section => {
        if (section.exercises.length === 0) return;
        const header = document.createElement('h3');
        header.className = 'pre-training-section-header';
        header.textContent = section.name;
        listContainer.appendChild(header);
        
        section.exercises.forEach((ex) => {
            listContainer.innerHTML += generatePreTrainingCardHTML(ex, exerciseCounter, state.settings.progressionFactor);
            exerciseCounter++;
        });
    });

    screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    screen.querySelector('#start-modified-training-btn').addEventListener('click', startModifiedTraining);
    navigateTo('preTraining');
};

export const renderSummaryScreen = () => {
    if (getIsCasting()) {
        sendShowIdle();
    }
    const activePlan = state.trainingPlans[state.settings.activePlanId];
    if (!activePlan) return;
    const trainingDay = activePlan.Days.find(d => d.dayNumber === state.currentTrainingDayId);
    if (!trainingDay) return;
    const summaryScreen = screens.summary;

    let stravaHtml = '';
    if (state.stravaIntegration.isConnected) {
        stravaHtml = `
            <div class="form-group strava-sync-container">
                <label class="checkbox-label" for="strava-sync-checkbox">
                    <input type="checkbox" id="strava-sync-checkbox" checked>
                    <span>Synchronizuj ten trening ze Strava</span>
                </label>
            </div>
        `;
    }

    summaryScreen.innerHTML = `
        <h2 id="summary-title">Podsumowanie: ${trainingDay.title}</h2>
        <p>Gratulacje! Dobra robota.</p>
        <form id="summary-form">
            <div class="form-group">
                <label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label>
                <div class="slider-container">
                    <input type="range" id="pain-during" min="0" max="10" step="1" value="0">
                    <span class="slider-value" id="pain-during-value">0</span>
                </div>
            </div>
            <div class="form-group">
                <label for="general-notes">Notatki ogólne:</label>
                <textarea id="general-notes" rows="4"></textarea>
            </div>
            ${stravaHtml}
            <button type="submit" class="action-btn">Zapisz i zakończ</button>
        </form>
    `;
    const slider = summaryScreen.querySelector('#pain-during');
    const sliderValueDisplay = summaryScreen.querySelector('#pain-during-value');
    slider.addEventListener('input', () => { sliderValueDisplay.textContent = slider.value; });
    summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    navigateTo('summary');
};

export const renderTrainingScreen = () => {
    screens.training.innerHTML = `
    <div class="focus-view">
        <div class="focus-header">
            <p id="focus-section-name"></p>
            <button id="exit-training-btn">Zakończ</button>
            <p id="focus-progress"></p>
        </div>
        
        <div class="focus-timer-container">
            <p id="focus-timer-display"></p>
        </div>
        
        <div class="focus-exercise-info">
            <div class="exercise-title-container">
                <h2 id="focus-exercise-name"></h2>
                <button id="tts-toggle-btn" class="tts-button">
                    <img id="tts-icon" src="/icons/sound-on.svg" alt="Dźwięk">
                </button>
            </div>
            <p id="focus-exercise-details"></p>
        </div>
        
        <div id="focus-description" class="focus-description-container"></div>
        
        <!-- NOWY UKŁAD KONTROLEK -->
        <div class="focus-controls-wrapper">
            <!-- Rząd 1: Główna akcja (Duży przycisk) -->
            <div class="focus-main-action">
                <button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button>
            </div>
            
            <!-- Rząd 2: Nawigacja i Pauza (Ikony) -->
            <div class="focus-secondary-actions">
                <button id="prev-step-btn" class="control-icon-btn" aria-label="Cofnij">
                    <img src="/icons/control-back.svg">
                </button>
                
                <button id="pause-resume-btn" class="control-icon-btn" aria-label="Pauza">
                    <img src="/icons/control-pause.svg">
                </button>
                
                <button id="skip-btn" class="control-icon-btn" aria-label="Pomiń">
                    <img src="/icons/control-skip.svg">
                </button>
            </div>
        </div>

        <div class="focus-next-up">
            <p><strong>Następne:</strong> <span id="next-exercise-name"></span></p>
        </div>
    </div>`;
    initializeFocusElements();
};

// ============================================================
// FUNKCJE POMOCNICZE (HTML GENERATORS)
// ============================================================

function generateHeroDashboardHTML(stats) {
    return `
        <div class="hero-avatar-container">
            <img src="${stats.iconPath}" class="hero-avatar" alt="Ranga">
        </div>
        <div class="hero-stats">
            <div class="hero-header">
                <span class="hero-level">Poziom ${stats.level}</span>
                <div class="hero-streak">
                    <img src="/icons/streak-fire.svg" class="streak-icon" alt="Ogień">
                    <span>${stats.streak} dni z rzędu</span>
                </div>
            </div>
            <h3 class="hero-title">${stats.tierName}</h3>
            <div class="xp-bar-container">
                <div class="xp-bar-fill" style="width: ${stats.progressPercent}%"></div>
            </div>
            <div class="xp-text">
                ${stats.totalSessions} ukończonych treningów (Następny: ${stats.nextLevelThreshold})
            </div>
        </div>
    `;
}

function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const planForHistory = state.trainingPlans[planId];
    const trainingDay = planForHistory ? planForHistory.Days.find(d => d.dayNumber === session.trainingDayId) : null;
    const title = trainingDay ? trainingDay.title : (session.trainingTitle || 'Trening');
    
    const optionsTime = { hour: '2-digit', minute: '2-digit' };
    
    let statsHtml = '';
    let completedTimeStr = '';
    
    if (session.completedAt) {
        completedTimeStr = new Date(session.completedAt).toLocaleTimeString('pl-PL', optionsTime);
    }

    if (session.startedAt && session.completedAt) {
        const startTime = new Date(session.startedAt);
        const endTime = new Date(session.completedAt);
        const durationMs = endTime - startTime;
        
        const totalMinutes = Math.floor(durationMs / 60000);
        const totalSeconds = Math.floor((durationMs % 60000) / 1000);
        const formattedDuration = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
        
        statsHtml = `
            <div class="session-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Start</span>
                    <span class="stat-value">${startTime.toLocaleTimeString('pl-PL', optionsTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Koniec</span>
                    <span class="stat-value">${endTime.toLocaleTimeString('pl-PL', optionsTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Czas</span>
                    <span class="stat-value">${formattedDuration}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Ból</span>
                    <span class="stat-value">${session.pain_during || '-'}/10</span>
                </div>
            </div>
        `;
    } else {
        statsHtml = `
            <div class="session-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Zakończono</span>
                    <span class="stat-value">${completedTimeStr}</span>
                </div>
            </div>`;
    }

    const exercisesHtml = session.sessionLog && session.sessionLog.length > 0 
        ? session.sessionLog.map(item => {
            const isSkipped = item.status === 'skipped';
            const statusLabel = isSkipped ? 'Pominięto' : 'OK';
            const statusClass = isSkipped ? 'skipped' : 'completed';
            
            return `
            <div class="history-exercise-row ${statusClass}">
                <div class="hex-main">
                    <span class="hex-name">${item.name}</span>
                    <span class="hex-details">Seria ${item.currentSet}/${item.totalSets} • ${item.reps_or_time}</span>
                </div>
                <div class="hex-status">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
            </div>`;
        }).join('') 
        : '<p class="no-data-msg">Brak szczegółowego logu.</p>';

    return `
        <details class="details-session-card" open>
            <summary>
                <div class="summary-content">
                    <span class="summary-title">${title}</span>
                    <button class="delete-session-btn icon-btn" data-session-id="${session.sessionId}" title="Usuń wpis">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"></path>
                        </svg>
                    </button>
                </div>
            </summary>
            
            <div class="details-session-card-content">
                ${statsHtml}
                
                ${session.notes ? `
                <div class="session-notes">
                    <strong>Notatki:</strong> ${session.notes}
                </div>` : ''}

                <div class="history-exercise-list">
                    ${exercisesHtml}
                </div>
            </div>
        </details>
    `;
}

function generatePreTrainingCardHTML(ex, index, factor) {
    const uniqueId = `ex-${index}`;
    return `
        <div class="pre-training-exercise-card">
            <h4>${ex.name}</h4>
            <p class="pre-training-description">${ex.description || 'Brak opisu.'}</p>
            <a href="${ex.youtube_url}" target="_blank" rel="noopener noreferrer">Obejrzyj wideo ↗</a>
            <p class="details">Tempo: ${applyProgression(ex.tempo_or_iso, factor)} | Sprzęt: ${ex.equipment}</p>
            <div class="pre-training-inputs">
                <div class="form-group">
                    <label for="sets-${uniqueId}">Serie</label>
                    <input type="text" id="sets-${uniqueId}" value="${ex.sets}" data-exercise-index="${index}">
                </div>
                <div class="form-group">
                    <label for="reps-${uniqueId}">Powtórzenia/Czas</label>
                    <input type="text" id="reps-${uniqueId}" value="${applyProgression(ex.reps_or_time, factor)}" data-exercise-index="${index}">
                </div>
            </div>
        </div>
    `;
}
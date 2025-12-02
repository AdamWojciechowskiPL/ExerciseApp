// receiver/receiver.js - v5.0 (Game Loop Anti-Idle)

const context = cast.framework.CastReceiverContext.getInstance();
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';
const IDLE_TIMEOUT = 14400; // 4 godziny

let lastRenderedSvg = null;

// --- HACK 1: VIDEO LOOP ---
const keepAliveVideo = document.getElementById('keepAliveVideo');

function startKeepAlive() {
    if (keepAliveVideo) {
        keepAliveVideo.muted = true;
        keepAliveVideo.loop = true;
        
        if (keepAliveVideo.paused) {
            keepAliveVideo.play()
                .then(() => console.log('[Receiver] Background video running.'))
                .catch(e => console.warn("[Receiver] Video Autoplay blocked:", e));
        }
    }
}

function stopKeepAlive() {
    if (keepAliveVideo && !keepAliveVideo.paused) {
        keepAliveVideo.pause();
    }
}

// --- HACK 2: GAME LOOP (Active GPU) ---
// Wymuszamy na przeglądarce ciągłe przerysowywanie klatki
const gpuActivator = document.getElementById('gpu-activator');
let frameCount = 0;

function startGameLoop() {
    function step() {
        frameCount++;
        if (gpuActivator) {
            // Zmieniamy opacity minimalnie co klatkę, żeby wymusić redraw
            // Wartość oscyluje między 0.01 a 0.02 - niewidoczne dla oka, istotne dla GPU
            const opacity = 0.01 + (Math.sin(frameCount * 0.1) * 0.01);
            gpuActivator.style.opacity = opacity;
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// --- 1. CACHE DOM ---
const UI = {
    screens: {
        idle: document.getElementById('idle-screen'),
        training: document.getElementById('training-screen'),
        video: document.getElementById('video-screen')
    },
    idle: {
        defaultLogo: document.getElementById('default-logo-container'),
        statsContainer: document.getElementById('user-stats-container'),
        heroIcon: document.getElementById('tv-hero-icon'),
        heroLevel: document.getElementById('tv-hero-level'),
        heroTitle: document.getElementById('tv-hero-title'),
        streakCount: document.getElementById('tv-streak-count'),
        streakFire: document.getElementById('tv-streak-fire'),
        sessionCount: document.getElementById('tv-session-count')
    },
    training: {
        sectionName: document.getElementById('section-name'),
        timer: document.getElementById('timer'),
        timerContainer: document.querySelector('.timer-display'),
        animationContainer: document.getElementById('tv-animation-container'),
        exerciseName: document.getElementById('exercise-name'),
        exerciseDetails: document.getElementById('exercise-details'),
        nextExercise: document.getElementById('next-exercise')
    },
    video: {
        iframe: document.getElementById('youtube-player')
    }
};

// --- 2. LISTENER WIADOMOŚCI ---

context.addCustomMessageListener(CUSTOM_NAMESPACE, (event) => {
    const message = event.data;
    startKeepAlive(); // Upewniamy się, że wideo gra

    switch (message.type) {
        case 'UPDATE_USER_STATS':
            updateUserStats(message.payload);
            showScreen('idle');
            context.setApplicationState("Oczekiwanie na trening");
            break;

        case 'UPDATE_STATE':
            updateTrainingUI(message.payload);
            showScreen('training');
            if (message.payload.exerciseName) {
                context.setApplicationState(`Trening: ${message.payload.exerciseName}`);
            }
            break;

        case 'SHOW_IDLE':
            stopVideo(); // Zatrzymujemy YouTube (jeśli grał)
            startKeepAlive(); // Wracamy do naszego wideo tła
            showScreen('idle');
            context.setApplicationState("Gotowy");
            break;

        case 'PLAY_VIDEO':
            stopKeepAlive(); // YouTube przejmuje kontrolę
            playVideo(message.payload.youtubeId);
            showScreen('video');
            context.setApplicationState("Odtwarzanie wideo");
            break;

        case 'STOP_VIDEO':
            stopVideo();
            startKeepAlive(); // Wznawiamy hack
            showScreen('training');
            break;

        default:
            break;
    }
});

// --- 3. UI HELPERS ---

function showScreen(screenName) {
    Object.values(UI.screens).forEach(el => el.classList.remove('active'));
    if (UI.screens[screenName]) {
        UI.screens[screenName].classList.add('active');
    }
}

function updateUserStats(stats) {
    UI.idle.defaultLogo.style.display = 'none';
    UI.idle.statsContainer.classList.remove('hidden');

    if (stats.iconPath) UI.idle.heroIcon.src = stats.iconPath;
    if (stats.level) UI.idle.heroLevel.textContent = `POZIOM ${stats.level}`;
    if (stats.tierName) UI.idle.heroTitle.textContent = stats.tierName;
    if (stats.totalSessions) UI.idle.sessionCount.textContent = stats.totalSessions;
    if (stats.streak !== undefined) {
        UI.idle.streakCount.textContent = `${stats.streak} Dni z rzędu`;
        UI.idle.streakFire.style.opacity = stats.streak > 0 ? '1' : '0.3';
    }
}

function updateTrainingUI(data) {
    if (data.sectionName) UI.training.sectionName.textContent = data.sectionName;
    if (data.timerValue) UI.training.timer.textContent = data.timerValue;
    if (data.exerciseName) UI.training.exerciseName.textContent = data.exerciseName;
    if (data.exerciseDetails) UI.training.exerciseDetails.textContent = data.exerciseDetails;
    if (data.nextExercise) UI.training.nextExercise.textContent = data.nextExercise;
    
    if (data.isRest !== undefined) {
        if (data.isRest) {
            UI.training.timerContainer.classList.add('rest');
        } else {
            UI.training.timerContainer.classList.remove('rest');
        }
    }

    const isFullUpdate = data.exerciseName !== undefined;
    if (isFullUpdate) {
        const newSvg = data.animationSvg;
        if (newSvg) {
            if (newSvg !== lastRenderedSvg) {
                UI.training.animationContainer.innerHTML = newSvg;
                UI.training.animationContainer.classList.remove('hidden');
                lastRenderedSvg = newSvg;
            }
        } else {
            UI.training.animationContainer.innerHTML = '';
            UI.training.animationContainer.classList.add('hidden');
            lastRenderedSvg = null;
        }
    }
}

function playVideo(youtubeId) {
    if (youtubeId) {
        UI.video.iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=0&modestbranding=1`;
    }
}

function stopVideo() {
    UI.video.iframe.src = '';
}

// --- 4. START ---

context.addEventListener(cast.framework.system.EventType.READY, () => {
    console.log('[Receiver] Gotowy.');
    startKeepAlive(); // Uruchom wideo tła
    startGameLoop();  // Uruchom aktywność GPU
});

const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};
options.disableIdleTimeout = true; 
options.maxInactivity = IDLE_TIMEOUT;
options.touchScreenOptimizedApp = true; // Ważne dla Game Loopa

context.start(options);
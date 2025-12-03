// receiver/receiver.js - v6.0 (Input Simulation + Nuclear Anti-Idle)

const context = cast.framework.CastReceiverContext.getInstance();
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';
// Ustawiamy limit na 8 godzin
const IDLE_TIMEOUT = 28800; 

let lastRenderedSvg = null;
let silentAudioPlayer = null;
let inputSimulationInterval = null;
let mediaRefreshInterval = null;

// --- HACK 1: SILENT AUDIO LOOP (Base64 MP3) ---
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//oeAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////wAAAD9MYXZjNTguNTQuMTAwAAAAAAAAAAAA//oeAAAAAAABMgAAASAAKtDxAAAAAAAAAAAAAAAAAAAAAAAAAAAA//oeZAAAAAAAASAAAAEAAACqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//oeZAAAAAAAASAAAAEAAACqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

function startSilentAudio() {
    if (!silentAudioPlayer) {
        silentAudioPlayer = new Audio(SILENT_MP3);
        silentAudioPlayer.loop = true;
        silentAudioPlayer.volume = 0.01; 
    }
    if (silentAudioPlayer.paused) {
        silentAudioPlayer.play().catch(e => console.warn('[Receiver] Audio Play Blocked:', e));
    }
}

// --- HACK 2: VIDEO LOOP (Agresywne odświeżanie) ---
const keepAliveVideo = document.getElementById('keepAliveVideo');

function startKeepAlive() {
    if (keepAliveVideo && keepAliveVideo.paused) {
        keepAliveVideo.play().catch(e => console.warn("[Receiver] Video Play Blocked:", e));
    }
}

function stopKeepAlive() {
    if (keepAliveVideo && !keepAliveVideo.paused) {
        keepAliveVideo.pause();
    }
    // Nie pauzujemy audio, audio jest naszą "ostatnią deską ratunku"
}

// --- HACK 3: GAME LOOP (GPU Activity) ---
const gpuActivator = document.getElementById('gpu-activator');
let frameCount = 0;

function startGameLoop() {
    function step() {
        frameCount++;
        if (gpuActivator) {
            // Minimalna zmiana stylu wymusza przerysowanie klatki przez GPU
            gpuActivator.style.transform = `translateZ(0) scale(${1 + Math.sin(frameCount * 0.01) * 0.001})`;
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// --- HACK 4: INPUT SIMULATION (THE NUCLEAR OPTION) ---
// To jest kluczowe dla nowych Chromecastów. Symulujemy, że użytkownik rusza pilotem/myszką.
function startInputSimulation() {
    if (inputSimulationInterval) clearInterval(inputSimulationInterval);

    inputSimulationInterval = setInterval(() => {
        console.log('[Receiver] 🤖 Simulating User Interaction (Anti-Idle)...');
        
        // 1. Symulacja ruchu myszy
        const mouseEvent = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: 10,
            clientY: 10
        });
        document.dispatchEvent(mouseEvent);

        // 2. Symulacja dotknięcia (dla urządzeń touch)
        try {
            const touchEvent = new TouchEvent('touchstart', {
                bubbles: true,
                cancelable: true,
                view: window,
                touches: [new Touch({ identifier: Date.now(), target: document.body, clientX: 10, clientY: 10 })]
            });
            document.dispatchEvent(touchEvent);
        } catch (e) {
            // Ignoruj błąd jeśli przeglądarka TV nie obsługuje TouchEvent constructor
        }

    }, 180000); // Co 3 minuty
}

// --- HACK 5: MEDIA REFRESHER ---
// Upewnia się, że media "nie zasnęły"
function startMediaRefresher() {
    if (mediaRefreshInterval) clearInterval(mediaRefreshInterval);
    
    mediaRefreshInterval = setInterval(() => {
        startSilentAudio();
        // Jeśli wideo gra, upewnij się, że czas płynie (czasem przeglądarka zamraża wideo w tle)
        if (keepAliveVideo && !keepAliveVideo.paused && keepAliveVideo.currentTime > 10) {
            keepAliveVideo.currentTime = 0; // Reset pętli
        }
    }, 10000); // Co 10 sekund sprawdzaj stan mediów
}


// --- UI CACHE & LOGIC ---
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

context.addCustomMessageListener(CUSTOM_NAMESPACE, (event) => {
    const message = event.data;
    
    // Każda wiadomość z telefonu to też aktywność
    startSilentAudio();
    startKeepAlive();

    switch (message.type) {
        case 'PING':
            console.log('[Receiver] 💓 Heartbeat received.');
            break;

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
            stopVideo();
            showScreen('idle');
            context.setApplicationState("Gotowy");
            break;

        case 'PLAY_VIDEO':
            stopKeepAlive(); 
            // Przy YouTube wyciszamy nasze audio, ale nie zatrzymujemy go całkowicie (volume 0)
            // żeby proces nadal był aktywny w tle
            if (silentAudioPlayer) silentAudioPlayer.volume = 0.0001; 
            
            playVideo(message.payload.youtubeId);
            showScreen('video');
            context.setApplicationState("Odtwarzanie wideo");
            break;

        case 'STOP_VIDEO':
            stopVideo();
            if (silentAudioPlayer) silentAudioPlayer.volume = 0.01;
            startKeepAlive();
            showScreen('training');
            break;
    }
});

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

    if (data.exerciseName !== undefined) {
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

// --- INITIALIZATION ---

context.addEventListener(cast.framework.system.EventType.READY, () => {
    console.log('[Receiver] System Ready - Activating Anti-Idle Protocols');
    
    // 1. Audio Loop
    startSilentAudio();
    // 2. Video Loop
    startKeepAlive();
    // 3. GPU Game Loop
    startGameLoop();
    // 4. Input Simulation (Crucial for Android TV)
    startInputSimulation();
    // 5. Watchdog
    startMediaRefresher();
});

const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};

// OSTATECZNA KONFIGURACJA IDLE
options.disableIdleTimeout = true; 
options.maxInactivity = IDLE_TIMEOUT; 

context.start(options);

// DODATKOWE ZABEZPIECZENIE: Wymuszenie ustawienia na poziomie Systemu
try {
    const castMgr = cast.receiver.CastReceiverManager.getInstance();
    castMgr.setInactivityTimeout(IDLE_TIMEOUT);
} catch (e) {
    console.log("Legacy CastManager config skipped");
}
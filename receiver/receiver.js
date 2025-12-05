// receiver/receiver.js - v7.1 (Web Audio API Oscillator + Aggressive KeepAlive + GPU Activator)

const context = cast.framework.CastReceiverContext.getInstance();
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';

// Ustawiamy limit na 12 godzin (43200 sekund)
const IDLE_TIMEOUT = 43200;

let lastRenderedSvg = null;
let inputSimulationInterval = null;

// --- HACK 1: WEB AUDIO API OSCILLATOR (THE NUCLEAR OPTION) ---
// Zamiast pliku MP3, używamy generatora dźwięku. 
// Sprzęt audio nie może przejść w stan uśpienia, gdy kontekst jest "running".
let audioContext = null;
let silenceOscillator = null;

function startAudioEngine() {
    if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = new AudioContext();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!silenceOscillator) {
        // Tworzymy oscylator
        silenceOscillator = audioContext.createOscillator();
        // Częstotliwość 1Hz (niesłyszalna dla człowieka, ale aktywna dla sterownika)
        silenceOscillator.frequency.value = 1;
        const gainNode = audioContext.createGain();
        // Głośność bliska zeru, ale nie matematyczne zero (niektóre sterowniki wyłączają się przy 0)
        gainNode.gain.value = 0.0001;

        silenceOscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        silenceOscillator.start();
        console.log('[Receiver] 🔈 Audio Engine Started (Anti-Idle Mode)');
    }
}

// --- HACK 2: VIDEO LOOP (Force Repaint) ---
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
}

// --- HACK 3: INPUT SIMULATION ON PING ---
// Symulujemy aktywność tylko wtedy, gdy przyjdzie PING od sendera.
function simulateActivity() {
    // console.log('[Receiver] 🤖 Simulating Touch...');
    try {
        const touchEvent = new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            view: window,
            touches: [new Touch({ identifier: Date.now(), target: document.body, clientX: 0, clientY: 0 })]
        });
        document.dispatchEvent(touchEvent);

        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        document.body.dispatchEvent(clickEvent);

    } catch (e) { /* Ignore errors on old browsers */ }
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

    // Ożywiamy system przy KAŻDEJ wiadomości
    startAudioEngine();
    startKeepAlive();

    switch (message.type) {
        case 'PING':
            // Symulujemy interakcję tylko przy Pingu, aby zresetować wewnętrzny licznik idle TV
            simulateActivity();
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
            // Przy YouTube nie stopujemy oscylatora, niech działa w tle
            playVideo(message.payload.youtubeId);
            showScreen('video');
            context.setApplicationState("Odtwarzanie wideo");
            break;

        case 'STOP_VIDEO':
            stopVideo();
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

// --- HACK 4: GPU ACTIVATOR (Force Repaint) ---
const gpuActivator = document.getElementById('gpu-activator');

function startGpuActivator() {
    setInterval(() => {
        if (gpuActivator) {
            gpuActivator.style.opacity = gpuActivator.style.opacity === '0.01' ? '0.02' : '0.01';
        }
    }, 5000);
}

// --- HACK 5: AUDIO CONTEXT KEEP-ALIVE ---
// Niektóre urządzenia automatycznie wstrzymują AudioContext
function startAudioContextKeepAlive() {
    setInterval(() => {
        if (audioContext && audioContext.state === 'suspended') {
            console.log('[Receiver] 🔄 Resuming suspended AudioContext...');
            audioContext.resume();
        }
    }, 30000);
}

// --- INITIALIZATION ---

context.addEventListener(cast.framework.system.EventType.READY, () => {
    console.log('[Receiver] System Ready - Starting Engines');
    startAudioEngine();
    startKeepAlive();
    startGpuActivator();
    startAudioContextKeepAlive();
});

// Obsługa zdarzeń, aby zapobiec wygaszeniu, gdy użytkownik nic nie robi
context.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, () => {
    startAudioEngine();
});

const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};

// OSTATECZNA KONFIGURACJA IDLE - Wyłączenie Timeoutu
options.disableIdleTimeout = true;
// Ustawienie max czasu bezczynności na 12h (w sekundach)
options.maxInactivity = IDLE_TIMEOUT;

context.start(options);

// Legacy Fallback dla starszych urządzeń
try {
    const castMgr = cast.receiver.CastReceiverManager.getInstance();
    castMgr.setInactivityTimeout(IDLE_TIMEOUT);
} catch (e) {
    console.log("Legacy CastManager config skipped");
}
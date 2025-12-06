// receiver/receiver.js - v8.0 (MediaSession + Wake Lock + Canvas + Ultra-Aggressive KeepAlive)

const context = cast.framework.CastReceiverContext.getInstance();
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';

// Ustawiamy limit na 12 godzin (43200 sekund)
const IDLE_TIMEOUT = 43200;

let lastRenderedSvg = null;
let internalKeepAliveInterval = null;
let wakeLock = null;

// --- HACK 1: WEB AUDIO API OSCILLATOR (THE NUCLEAR OPTION) ---
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
        silenceOscillator = audioContext.createOscillator();
        silenceOscillator.frequency.value = 1;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.0001;

        silenceOscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        silenceOscillator.start();
        console.log('[Receiver] 🔈 Audio Engine Started');
    }
}

// --- HACK 2: VIDEO LOOP ---
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

// --- HACK 3: INPUT SIMULATION ---
function simulateActivity() {
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
    } catch (e) { /* Ignore */ }
}

// --- HACK 4: GPU ACTIVATOR ---
const gpuActivator = document.getElementById('gpu-activator');

function startGpuActivator() {
    setInterval(() => {
        if (gpuActivator) {
            gpuActivator.style.opacity = gpuActivator.style.opacity === '0.01' ? '0.02' : '0.01';
        }
    }, 5000);
}

// --- HACK 5: AUDIO CONTEXT KEEP-ALIVE ---
function startAudioContextKeepAlive() {
    setInterval(() => {
        if (audioContext && audioContext.state === 'suspended') {
            console.log('[Receiver] 🔄 Resuming suspended AudioContext...');
            audioContext.resume();
        }
    }, 30000);
}

// --- HACK 6: MEDIA SESSION API (KLUCZOWE DLA ANDROID TV!) ---
// To mówi systemowi, że jesteśmy "odtwarzaczem mediów" i nie powinien nas wygaszać
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Trening w toku',
            artist: 'Aplikacja Treningowa',
            album: 'Ćwiczenia'
        });

        // Ustawiamy stan na "playing" - kluczowe!
        navigator.mediaSession.playbackState = 'playing';

        // Puste handlery, ale ich obecność sygnalizuje aktywność
        navigator.mediaSession.setActionHandler('play', () => { });
        navigator.mediaSession.setActionHandler('pause', () => { });
        navigator.mediaSession.setActionHandler('stop', () => { });

        console.log('[Receiver] 🎵 MediaSession API configured');
    }
}

function updateMediaSessionState(exerciseName) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: exerciseName || 'Trening w toku',
            artist: 'Aplikacja Treningowa',
            album: 'Ćwiczenia'
        });
        navigator.mediaSession.playbackState = 'playing';
    }
}

// --- HACK 7: WAKE LOCK API ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('[Receiver] 🔒 Wake Lock acquired');

            wakeLock.addEventListener('release', () => {
                console.log('[Receiver] 🔓 Wake Lock released, re-acquiring...');
                setTimeout(requestWakeLock, 1000);
            });
        }
    } catch (e) {
        console.warn('[Receiver] Wake Lock failed:', e.message);
    }
}

// --- HACK 8: CANVAS ANIMATION (GPU Activity) ---
let canvasCtx = null;
function startCanvasAnimation() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    canvas.style.cssText = 'position:fixed;top:-10px;left:-10px;opacity:0.01;pointer-events:none;z-index:-1000;';
    document.body.appendChild(canvas);
    canvasCtx = canvas.getContext('2d');

    function animate() {
        if (canvasCtx) {
            // Zmieniamy kolor bazując na czasie - wymusza rendering GPU
            const color = Date.now() % 256;
            canvasCtx.fillStyle = `rgb(${color}, ${(color + 85) % 256}, ${(color + 170) % 256})`;
            canvasCtx.fillRect(0, 0, 2, 2);
        }
        requestAnimationFrame(animate);
    }
    animate();
    console.log('[Receiver] 🎨 Canvas Animation started');
}

// --- HACK 9: WEWNĘTRZNY KEEP-ALIVE (CO 5 SEKUND!) ---
// Niezależny od sendera - sam receiver utrzymuje aktywność
function startInternalKeepAlive() {
    if (internalKeepAliveInterval) return;

    internalKeepAliveInterval = setInterval(() => {
        // Symuluj aktywność
        simulateActivity();

        // Odśwież MediaSession
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }

        // Upewnij się, że audio działa
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Odśwież Wake Lock jeśli trzeba
        if (!wakeLock || wakeLock.released) {
            requestWakeLock();
        }

        // Log co minutę (co 12 iteracji)
        if (Date.now() % 60000 < 5000) {
            console.log('[Receiver] 💓 Internal KeepAlive pulse');
        }
    }, 5000); // Co 5 sekund!

    console.log('[Receiver] ⏱️ Internal KeepAlive started (5s interval)');
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
                updateMediaSessionState(message.payload.exerciseName);
            }
            break;

        case 'SHOW_IDLE':
            stopVideo();
            showScreen('idle');
            context.setApplicationState("Gotowy");
            break;

        case 'PLAY_VIDEO':
            stopKeepAlive();
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

// --- INITIALIZATION ---

context.addEventListener(cast.framework.system.EventType.READY, () => {
    console.log('[Receiver] System Ready - Starting ALL Engines v8.0');

    // Start wszystkich mechanizmów anti-idle
    startAudioEngine();
    startKeepAlive();
    startGpuActivator();
    startAudioContextKeepAlive();
    setupMediaSession();
    requestWakeLock();
    startCanvasAnimation();
    startInternalKeepAlive(); // Nowy: co 5 sekund!
});

context.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, () => {
    console.log('[Receiver] Sender connected - reinforcing anti-idle');
    startAudioEngine();
    requestWakeLock();
});

const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};

// KONFIGURACJA IDLE
options.disableIdleTimeout = true;
options.maxInactivity = IDLE_TIMEOUT;

context.start(options);

// Legacy Fallback
try {
    const castMgr = cast.receiver.CastReceiverManager.getInstance();
    castMgr.setInactivityTimeout(IDLE_TIMEOUT);
} catch (e) {
    console.log("Legacy CastManager config skipped");
}
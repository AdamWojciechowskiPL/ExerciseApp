// receiver/receiver.js - v3.0

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Stałe
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';
const IDLE_TIMEOUT = 3600; // 1 godzina bezczynności wyłącza aplikację

// --- 1. CACHE ELEMENTÓW DOM (Optymalizacja wydajności) ---
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
        exerciseName: document.getElementById('exercise-name'),
        exerciseDetails: document.getElementById('exercise-details'),
        nextExercise: document.getElementById('next-exercise')
    },
    video: {
        iframe: document.getElementById('youtube-player')
    }
};

// Stan aplikacji
let isMediaSimulationActive = false;
let lastQueueItems = null;
let hasReceivedStats = false;

// --- 2. GŁÓWNY LISTENER WIADOMOŚCI ---

context.addCustomMessageListener(CUSTOM_NAMESPACE, (event) => {
    const message = event.data;
    
    switch (message.type) {
        case 'UPDATE_USER_STATS':
            updateUserStats(message.payload);
            showScreen('idle');
            break;

        case 'UPDATE_STATE':
            updateTrainingUI(message.payload);
            showScreen('training');
            break;

        case 'SHOW_IDLE':
            stopMediaSimulation();
            stopVideo();
            showScreen('idle');
            break;

        case 'PLAY_VIDEO':
            stopMediaSimulation();
            playVideo(message.payload.youtubeId);
            showScreen('video');
            break;

        case 'STOP_VIDEO':
            stopVideo();
            simulateMediaPlayback(); // Przywróć "fake queue"
            showScreen('training'); // Zazwyczaj wracamy do treningu
            break;
            
        case 'SETUP_QUEUE':
            setupAndLoadQueue(message.payload);
            break;

        default:
            console.warn('[Receiver] Nieznany typ wiadomości:', message.type);
            break;
    }
});

// --- 3. ZARZĄDZANIE INTERFEJSEM (UI) ---

function showScreen(screenName) {
    // Ukryj wszystkie ekrany
    Object.values(UI.screens).forEach(el => el.classList.remove('active'));
    
    // Pokaż żądany ekran
    if (UI.screens[screenName]) {
        UI.screens[screenName].classList.add('active');
    }
}

/**
 * Aktualizuje Hero Dashboard (Gamifikacja)
 */
function updateUserStats(stats) {
    hasReceivedStats = true;
    
    // Przełącz widok z Logo na Stats
    UI.idle.defaultLogo.style.display = 'none';
    UI.idle.statsContainer.classList.remove('hidden');

    // Wypełnij dane
    if (stats.iconPath) UI.idle.heroIcon.src = stats.iconPath;
    if (stats.level) UI.idle.heroLevel.textContent = `POZIOM ${stats.level}`;
    if (stats.tierName) UI.idle.heroTitle.textContent = stats.tierName;
    if (stats.totalSessions) UI.idle.sessionCount.textContent = stats.totalSessions;
    
    if (stats.streak !== undefined) {
        UI.idle.streakCount.textContent = `${stats.streak} Dni z rzędu`;
        // Efekt wizualny: wygaszony ogień, jeśli streak = 0
        UI.idle.streakFire.style.opacity = stats.streak > 0 ? '1' : '0.3';
    }
}

/**
 * Aktualizuje ekran treningowy (Timer, Ćwiczenie)
 */
function updateTrainingUI(data) {
    if (data.sectionName) UI.training.sectionName.textContent = data.sectionName;
    if (data.timerValue) UI.training.timer.textContent = data.timerValue;
    if (data.exerciseName) UI.training.exerciseName.textContent = data.exerciseName;
    if (data.exerciseDetails) UI.training.exerciseDetails.textContent = data.exerciseDetails;
    if (data.nextExercise) UI.training.nextExercise.textContent = data.nextExercise;
    
    // Obsługa koloru timera (niebieski podczas przerwy)
    if (data.isRest !== undefined) {
        if (data.isRest) {
            UI.training.timerContainer.classList.add('rest');
        } else {
            UI.training.timerContainer.classList.remove('rest');
        }
    }
}

// --- 4. OBSŁUGA WIDEO I MEDIÓW ---

function playVideo(youtubeId) {
    if (youtubeId) {
        // Autoplay, brak kontrolek, zapętlenie playlisty (opcjonalne parametry)
        UI.video.iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=0&modestbranding=1`;
    }
}

function stopVideo() {
    UI.video.iframe.src = '';
}

/**
 * Tworzy "fałszywą" kolejkę mediów. Jest to hack, który sprawia, że Android/iOS
 * wyświetlają kontrolki (play/pause) na ekranie blokady i w powiadomieniach,
 * mimo że nie odtwarzamy "prawdziwego" filmu przez PlayerManager.
 */
function setupAndLoadQueue(items) {
    if (isMediaSimulationActive || !items || items.length === 0) return;
    
    lastQueueItems = items;
    
    // Konwersja naszych itemów na format Google Cast QueueItem
    const queueItems = items.map(item => {
        const queueItem = new cast.framework.messages.QueueItem();
        queueItem.media = new cast.framework.messages.MediaInformation();
        queueItem.media.contentId = item.id;
        queueItem.media.streamType = cast.framework.messages.StreamType.BUFFERED;
        queueItem.media.contentType = 'audio/mp3'; // Symulujemy audio, żeby system był happy
        
        const metadata = new cast.framework.messages.GenericMediaMetadata();
        metadata.title = item.title;
        metadata.subtitle = item.subtitle;
        // Można dodać images: [{url: '...'}]
        queueItem.media.metadata = metadata;
        
        return queueItem;
    });
    
    const queueData = new cast.framework.messages.QueueData();
    queueData.items = queueItems;
    
    const loadRequest = new cast.framework.messages.LoadRequestData();
    loadRequest.queueData = queueData;
    loadRequest.autoplay = false; 
    
    playerManager.load(loadRequest)
        .then(() => {
            isMediaSimulationActive = true;
            // Pauzujemy natychmiast, bo to tylko symulacja dla metadanych
            playerManager.pause();
            console.log('[Receiver] Symulacja kolejki załadowana.');
        })
        .catch(e => console.error('[Receiver] Błąd ładowania kolejki:', e));
}

function stopMediaSimulation() {
    if (isMediaSimulationActive) {
        playerManager.stop();
        isMediaSimulationActive = false;
    }
}

function simulateMediaPlayback() {
    if (lastQueueItems) {
        setupAndLoadQueue(lastQueueItems);
    }
}

// --- 5. START APLIKACJI ---

// Obsługa zdarzeń systemowych
context.addEventListener(cast.framework.system.EventType.READY, () => {
    console.log('[Receiver] Gotowy. Czekam na nadawcę.');
});

context.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, (event) => {
    // Jeśli nie ma już podłączonych nadawców, zamknij aplikację na TV
    if (context.getSenders().length === 0) {
        window.close();
    }
});

// Konfiguracja i start
const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};
options.maxInactivity = IDLE_TIMEOUT;

context.start(options);
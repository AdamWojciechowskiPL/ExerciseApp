// receiver/receiver.js - WERSJA 3.0 - OSTATECZNA, CZYSTA IMPLEMENTACJA JEDNOKIERUNKOWA

const VERSION = '3.0'; 
const versionDisplayElement = document.getElementById('version-display');
if (versionDisplayElement) {
    versionDisplayElement.textContent = `v${VERSION}`;
}

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const CUSTOM_NAMESPACE = 'urn:x-cast:com.trening.app';

// --- Elementy interfejsu ---
const idleScreen = document.getElementById('idle-screen');
const trainingScreen = document.getElementById('training-screen');
const videoScreen = document.getElementById('video-screen');
const sectionNameEl = document.getElementById('section-name');
const timerEl = document.getElementById('timer');
const timerContainerEl = timerEl.parentElement;
const exerciseNameEl = document.getElementById('exercise-name');
const exerciseDetailsEl = document.getElementById('exercise-details');
const nextExerciseEl = document.getElementById('next-exercise');
const youtubePlayerEl = document.getElementById('youtube-player');

let isMediaSimulationActive = false;
let lastQueueItems = null;

// --- GŁÓWNE LISTENERY SYSTEMOWE CAST ---

// Rejestrujemy listener dla wiadomości przychodzących od nadawcy.
// To jest rdzeń funkcjonalności odbiornika.
context.addCustomMessageListener(CUSTOM_NAMESPACE, (event) => {
    const message = event.data;
    switch (message.type) {
        case 'SETUP_QUEUE': setupAndLoadQueue(message.payload); break;
        case 'UPDATE_STATE': updateTrainingUI(message.payload); showScreen('training'); break;
        case 'SHOW_IDLE': stopMediaSimulation(); stopVideo(); showScreen('idle'); break;
        case 'PLAY_VIDEO': stopMediaSimulation(); playVideo(message.payload.youtubeId); showScreen('video'); break;
        case 'STOP_VIDEO': stopVideo(); simulateMediaPlayback(); showScreen('training'); break;
        default: if(message.type) console.warn('[Cast Receiver] Otrzymano nieznany typ wiadomości:', message.type); break;
    }
});

// Listener dla zdarzenia READY jest teraz znacznie prostszy.
context.addEventListener(cast.framework.system.EventType.READY, () => {
  console.log('[Cast Receiver] Aplikacja gotowa do przyjmowania poleceń od nadawcy.');
});

context.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, () => {
    if (context.getSenders().length === 0) {
        window.close();
    }
});


// --- FUNKCJE POMOCNICZE APLIKACJI ---

/**
 * Tworzy i ładuje "fałszywą" kolejkę mediów. Jest to kluczowe,
 * aby aktywować PlayerManager i umożliwić wyświetlanie metadanych
 * (np. nazwy ćwiczenia) na interfejsach systemowych nadawcy.
 */
function setupAndLoadQueue(items) {
    if (isMediaSimulationActive) return;
    if (!items || items.length === 0) return;
    
    lastQueueItems = items;
    const queueItems = items.map(item => {
        const queueItem = new cast.framework.messages.QueueItem();
        queueItem.media = new cast.framework.messages.MediaInformation();
        queueItem.media.contentId = item.id;
        queueItem.media.streamType = cast.framework.messages.StreamType.BUFFERED;
        queueItem.media.contentType = 'application/x-mpegurl'; // Typ symulacji
        queueItem.media.metadata = new cast.framework.messages.GenericMediaMetadata();
        queueItem.media.metadata.title = item.title;
        queueItem.media.metadata.subtitle = item.subtitle;
        return queueItem;
    });
    
    const queueData = new cast.framework.messages.QueueData();
    queueData.name = 'Kolejka Treningu';
    queueData.items = queueItems;
    
    const loadRequest = new cast.framework.messages.LoadRequestData();
    loadRequest.queueData = queueData;
    
    playerManager.load(loadRequest).then(() => {
        isMediaSimulationActive = true;
        playerManager.pause();
        console.log('[Cast Receiver] Symulacja sesji medialnej została pomyślnie załadowana.');
    }).catch(e => console.error('[Cast Receiver] Błąd ładowania dynamicznej kolejki:', e));
}

function stopMediaSimulation() { if (isMediaSimulationActive) { playerManager.stop(); isMediaSimulationActive = false; } }
function simulateMediaPlayback() { if (lastQueueItems) { setupAndLoadQueue(lastQueueItems); } }

function showScreen(screenId) {
    idleScreen.classList.remove('active');
    trainingScreen.classList.remove('active');
    videoScreen.classList.remove('active');
    if (screenId === 'training') trainingScreen.classList.add('active');
    else if (screenId === 'video') videoScreen.classList.add('active');
    else idleScreen.classList.add('active');
}

function updateTrainingUI(data) {
    if (data.sectionName !== undefined) sectionNameEl.textContent = data.sectionName;
    if (data.timerValue !== undefined) timerEl.textContent = data.timerValue;
    if (data.exerciseName !== undefined) exerciseNameEl.textContent = data.exerciseName;
    if (data.exerciseDetails !== undefined) exerciseDetailsEl.textContent = data.exerciseDetails;
    if (data.nextExercise !== undefined) nextExerciseEl.textContent = data.nextExercise;
    if (data.isRest !== undefined) {
        if (data.isRest) timerContainerEl.classList.add('rest');
        else timerContainerEl.classList.remove('rest');
    }
}

function playVideo(youtubeId) { if (youtubeId) youtubePlayerEl.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=0`; }
function stopVideo() { youtubePlayerEl.src = ''; }


// --- Uruchomienie aplikacji odbiornika ---
const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = {
    [CUSTOM_NAMESPACE]: cast.framework.system.MessageType.JSON
};
options.maxInactivity = 3600;

console.log('[Cast Receiver] Aplikacja Odbiorcy jest gotowa do uruchomienia...');
context.start(options);
// state.js

export const state = {
    userProgress: {},

    settings: {
        appStartDate: null,
        activePlanId: "l5s1-foundation",
        onboardingCompleted: false,
        painZones: [],
        equipment: [],
        schedule: {},
        ttsEnabled: true // NOWOŚĆ: Globalne ustawienie dźwięku
    },

    exerciseLibrary: {},
    trainingPlans: {},
    blacklist: [],
    
    // --- NOWA FLAGA STANU ---
    isHistoryLoaded: false, 

    stravaIntegration: {
        isConnected: false
    },
    
    currentTrainingDate: null,
    loadedMonths: new Set(),
    currentCalendarView: new Date(),
    currentExerciseIndex: null,
    flatExercises: [],
    sessionLog: [],
    sessionStartTime: null,
    totalPausedTime: 0,
    lastPauseStartTime: null,
    isPaused: false,
    breakTimeoutId: null,
    
    todaysDynamicPlan: null,

    timer: {
        interval: null,
        timeLeft: 0,
        isActive: false,
        isPaused: false,
        onTimerEnd: () => {} 
    },

    stopwatch: {
        interval: null,
        seconds: 0
    },

    audioContext: null,

    sessionParams: {
        initialPainLevel: 0,
        timeFactor: 1.0
    },

    completionSound: () => {
        if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = state.audioContext.createOscillator();
        const gainNode = state.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, state.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, state.audioContext.currentTime);
        oscillator.start();
        oscillator.stop(state.audioContext.currentTime + 0.2);
    },

    finalCompletionSound: () => {
        if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = state.audioContext.currentTime;
        const oscillator = state.audioContext.createOscillator();
        const gainNode = state.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        gainNode.gain.setValueAtTime(0.3, now);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(659.25, now); // E5
        oscillator.frequency.setValueAtTime(880.00, now + 0.2); // A5
        oscillator.start(now);
        oscillator.stop(now + 0.4);
    },

    tts: {
        synth: window.speechSynthesis,
        polishVoice: null,
        isSupported: 'speechSynthesis' in window,
        isSoundOn: true
    }
};
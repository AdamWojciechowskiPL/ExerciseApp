// ExerciseApp/state.js
// ExerciseApp/state.js

export const state = {
    isAppInitialized: false,
    userProgress: {},
    userPreferences: {}, // { score, difficulty, updatedAt }
    exercisePace: {},
    masteryStats: null,
    animationCache: new Map(),

    // NOWOŚĆ: Przechowywanie mapy nadpisań (Ewolucji/Dewolucji)
    overrides: {},

    settings: {
        appStartDate: null,
        activePlanId: null,
        planMode: 'dynamic',
        dynamicPlanData: null,
        onboardingCompleted: false,
        painZones: [],
        equipment: [],
        schedule: {},
        ttsEnabled: true,
        secondsPerRep: 6,
        restTimeFactor: 1.0,
        wizardData: {}
    },

    exerciseLibrary: {},
    blacklist: [],
    isHistoryLoaded: false,
    stravaIntegration: { isConnected: false },

    currentTrainingDate: null,
    loadedMonths: new Set(),
    currentCalendarView: new Date(),
    currentExerciseIndex: null,
    flatExercises: [],
    sessionLog: [],
    sessionStartTime: null,
    totalPausedTime: 0,
    lastPauseStartTime: null,
    breakTimeoutId: null,
    todaysDynamicPlan: null,

    // AMPS PHASE 2: Licznik ankiet w sesji
    sessionDetailPromptCount: 0,

    timer: {
        interval: null,
        timeLeft: 0,
        isActive: false,
        isPaused: false,
        onTimerEnd: () => { }
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
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }

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
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }

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
        isSoundOn: null
    }
};
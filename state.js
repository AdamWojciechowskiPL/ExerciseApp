export const state = {
    userProgress: {},
    settings: {
        appStartDate: null,
        restBetweenExercises: 60,
        progressionFactor: 100
    },
    currentTrainingDate: null,
    currentCalendarView: new Date(),
    currentExerciseIndex: null,
    flatExercises: [],
    timer: { interval: null, timeLeft: 0, isActive: false },
    audioContext: null,
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

    // =========================================================================
    // NOWA FUNKCJA: Dźwięk na zakończenie całej sesji treningowej
    // =========================================================================
    finalCompletionSound: () => {
        if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = state.audioContext.currentTime;
        const oscillator = state.audioContext.createOscillator();
        const gainNode = state.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        gainNode.gain.setValueAtTime(0.3, now);
        oscillator.type = 'sine';

        // Odtwórz dwa tony, jeden po drugim (prosta melodia)
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
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
    tts: {
        synth: window.speechSynthesis,
        polishVoice: null,
        isSupported: 'speechSynthesis' in window,
        isSoundOn: true
    }
};
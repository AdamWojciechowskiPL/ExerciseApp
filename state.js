// state.js

/**
 * Centralny Obiekt Stanu Aplikacji
 * 
 * Przechowuje wszystkie dynamiczne dane, które aplikacja wykorzystuje podczas działania.
 * Działa jako ulotna, operacyjna pamięć. Jest wypełniany danymi przez dataStore.js
 * przy starcie aplikacji i modyfikowany w trakcie interakcji użytkownika.
 */
export const state = {
    /**
     * Postępy użytkownika. Kluczem jest data w formacie ISO (YYYY-MM-DD),
     * a wartością jest tablica obiektów sesji treningowych z danego dnia.
     */
    userProgress: {},

    /**
     * Ustawienia aplikacji. Służą jako domyślny szablon, który jest
     * nadpisywany przez ustawienia wczytane z bazy danych dla zalogowanego użytkownika.
     */
    settings: {
        appStartDate: null,
        progressionFactor: 100,
        activePlanId: "l5s1-foundation"
    },

    // --- NOWE WŁAŚCIWOŚCI ---
    /**
     * Przechowuje bibliotekę ćwiczeń załadowaną z bazy danych.
     * Struktura: { "exerciseId": { name: "...", ... } }
     */
    exerciseLibrary: {},

    /**
     * Przechowuje plany treningowe załadowane z bazy danych.
     * Struktura: { "planId": { name: "...", Days: [...] } }
     */
    trainingPlans: {},

    blacklist: [],

    stravaIntegration: {
        isConnected: false
    },
    currentTrainingDate: null,
    loadedMonths: new Set(),
    /**
     * Obiekt daty używany do nawigacji w widoku kalendarza.
     */
    currentCalendarView: new Date(),

    /**
     * Indeks aktualnie wykonywanego kroku (ćwiczenia lub przerwy) w spłaszczonej liście.
     */
    currentExerciseIndex: null,

    /**
     * Spłaszczona tablica wszystkich kroków (ćwiczeń i przerw) dla bieżącej sesji.
     */
    flatExercises: [],
    
    /**
     * Szczegółowy log ćwiczeń wykonanych w bieżącej sesji.
     */
    sessionLog: [],

    sessionStartTime: null,
    /**
     * Stan timera używanego w trybie treningu.
     */
    totalPausedTime: 0, // w milisekundach
    lastPauseStartTime: null,
    isPaused: false,
    breakTimeoutId: null,
    timer: {
        interval: null,
        timeLeft: 0,
        isActive: false,
        isPaused: false,
        onTimerEnd: () => {} // Callback wywoływany po zakończeniu odliczania
    },

    /**
     * Stan stopera używanego w trybie treningu.
     */
    stopwatch: {
        interval: null,
        seconds: 0
    },

    /**
     * Kontekst audio do generowania dźwięków.
     */
    audioContext: null,

    /**
     * Parametry bieżącej sesji, ustalane na starcie (np. w pre-training).
     */
    sessionParams: {
        initialPainLevel: 0,
        timeFactor: 1.0
    },
    /**
     * Funkcja generująca krótki dźwięk na zakończenie ćwiczenia/przerwy.
     */
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

    /**
     * Funkcja generująca charakterystyczny, podwójny dźwięk na zakończenie całej sesji.
     */
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

    /**
     * Stan syntezatora mowy (Text-to-Speech).
     */
    tts: {
        synth: window.speechSynthesis,
        polishVoice: null,
        isSupported: 'speechSynthesis' in window,
        isSoundOn: true
    }
};
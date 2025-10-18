// dom.js

export const screens = {
    main: document.getElementById('main-screen'),
    history: document.getElementById('history-screen'),
    dayDetails: document.getElementById('day-details-screen'), // NAPRAWIONA CZĘŚĆ: DODANO BRAKUJĄCY SELEKTOR
    library: document.getElementById('library-screen'),
    settings: document.getElementById('settings-screen'),
    preTraining: document.getElementById('pre-training-screen'),
    training: document.getElementById('training-screen'),
    summary: document.getElementById('summary-screen'),
};

export const containers = {
    days: document.getElementById('days-container'),
    calendarGrid: document.getElementById('calendar-grid'),
    exerciseLibrary: document.getElementById('exercise-library-container'),
};

export const mainNav = document.getElementById('main-nav');

export let focus = {};

export function initializeFocusElements() {
    focus = {
        sectionName: document.getElementById('focus-section-name'),
        progress: document.getElementById('focus-progress'),
        timerDisplay: document.getElementById('focus-timer-display'),
        exerciseName: document.getElementById('focus-exercise-name'),
        exerciseDetails: document.getElementById('focus-exercise-details'),
        exerciseInfoContainer: screens.training.querySelector('.focus-exercise-info'),
        focusDescription: document.getElementById('focus-description'),
        ttsToggleBtn: document.getElementById('tts-toggle-btn'),
        nextExerciseName: document.getElementById('next-exercise-name'),
        exitTrainingBtn: document.getElementById('exit-training-btn'),
        prevStepBtn: document.getElementById('prev-step-btn'),
        pauseResumeBtn: document.getElementById('pause-resume-btn'),
        repBasedDoneBtn: document.getElementById('rep-based-done-btn'),
        skipBtn: document.getElementById('skip-btn'),
    };
}
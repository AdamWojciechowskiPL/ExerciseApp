// dom.js

export const screens = {
    main: document.getElementById('main-screen'),
    history: document.getElementById('history-screen'),
    dayDetails: document.getElementById('day-details-screen'),
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

// ZMIANA: focus jest stałą referencją (obiektem), do którego będziemy wstrzykiwać elementy
export const focus = {};

export function initializeFocusElements() {
    // Mutujemy obiekt focus, zamiast tworzyć nowy
    focus.sectionName = document.getElementById('focus-section-name');
    focus.progress = document.getElementById('focus-progress');
    focus.timerDisplay = document.getElementById('focus-timer-display');
    focus.exerciseName = document.getElementById('focus-exercise-name');
    focus.exerciseDetails = document.getElementById('focus-exercise-details');
    
    focus.exerciseInfoContainer = document.querySelector('.focus-exercise-info');
    focus.focusDescription = document.getElementById('focus-description');
    
    focus.ttsToggleBtn = document.getElementById('tts-toggle-btn');
    focus.ttsIcon = document.getElementById('tts-icon'); 
    
    focus.nextExerciseName = document.getElementById('next-exercise-name');
    focus.exitTrainingBtn = document.getElementById('exit-training-btn');
    
    focus.prevStepBtn = document.getElementById('prev-step-btn');
    focus.pauseResumeBtn = document.getElementById('pause-resume-btn');
    focus.repBasedDoneBtn = document.getElementById('rep-based-done-btn');
    focus.skipBtn = document.getElementById('skip-btn');
}
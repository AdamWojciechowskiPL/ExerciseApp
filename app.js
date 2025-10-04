document.addEventListener('DOMContentLoaded', () => {

    // =============================================
    // =========== DANE STATYCZNE APLIKACJI ==========
    // =============================================
    const APP_CONTENT = { /* PUSTE */ };

    // =============================================
    // ================ STAN APLIKACJI ===============
    // =============================================
    let state = {
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

    // =============================================
    // ================ SELEKTORY DOM ================
    // =============================================
    const screens = {
        main: document.getElementById('main-screen'),
        history: document.getElementById('history-screen'),
        settings: document.getElementById('settings-screen'),
        preTraining: document.getElementById('pre-training-screen'),
        training: document.getElementById('training-screen'),
        summary: document.getElementById('summary-screen'),
    };
    const containers = {
        days: document.getElementById('days-container'),
        calendarGrid: document.getElementById('calendar-grid'),
    };
    const mainNav = document.getElementById('main-nav');
    let focus = {}; // Pusty obiekt, zostanie wypełniony dynamicznie

    // =============================================
    // ============== LOGIKA TTS (MOWA) ==============
    // =============================================
    const loadVoices = () => {
        if (!state.tts.isSupported) return;
        const voices = state.tts.synth.getVoices();
        state.tts.polishVoice = voices.find(voice => voice.lang === 'pl-PL') || voices.find(voice => voice.lang.startsWith('pl'));
    };
    const speak = (text, interrupt = true, onEndCallback = null) => {
        if (!state.tts.isSupported || !text || !state.tts.isSoundOn) {
            if (onEndCallback) onEndCallback();
            return;
        }
        if (interrupt && state.tts.synth.speaking) {
            state.tts.synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        if (state.tts.polishVoice) {
            utterance.voice = state.tts.polishVoice;
        }
        utterance.lang = 'pl-PL';
        if (onEndCallback) {
            utterance.onend = onEndCallback;
        }
        state.tts.synth.speak(utterance);
    };

    // =============================================
    // ======== ZARZĄDZANIE DANYMI (localStorage) ========
    // =============================================
    const dataStore = {
        load: () => {
            const progressData = localStorage.getItem('trainingAppProgress');
            if (progressData) state.userProgress = JSON.parse(progressData);
            
            const settingsData = localStorage.getItem('trainingAppSettings');
            if (settingsData) state.settings = { ...state.settings, ...JSON.parse(settingsData) };
            
            if (!state.settings.appStartDate) {
                state.settings.appStartDate = getISODate(new Date());
                dataStore.saveSettings();
            }
        },
        saveProgress: () => {
            localStorage.setItem('trainingAppProgress', JSON.stringify(state.userProgress));
        },
        saveSettings: () => {
            localStorage.setItem('trainingAppSettings', JSON.stringify(state.settings));
        }
    };
    
    // =============================================
    // ============= FUNKCJE POMOCNICZE (DATY) ===========
    // =============================================
    const getISODate = (date) => date.toISOString().split('T')[0];
    const getTrainingDayForDate = (date) => {
        const startDate = new Date(state.settings.appStartDate);
        const currentDate = new Date(getISODate(date));
        const diffTime = currentDate - startDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const dayIndex = diffDays % TRAINING_PLAN.Days.length;
        const planDayNumber = (dayIndex < 0) ? dayIndex + TRAINING_PLAN.Days.length + 1 : dayIndex + 1;
        return TRAINING_PLAN.Days.find(d => d.dayNumber === planDayNumber);
    };

    // =============================================
    // ================== NAWIGACJA ==================
    // =============================================
    const navigateTo = (screenName) => {
        if (screenName === 'training') {
            screens.training.classList.add('active');
            mainNav.style.display = 'none';
        } else {
            screens.training.classList.remove('active');
            mainNav.style.display = 'flex';
            Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
            if (screens[screenName]) screens[screenName].classList.add('active');
        }
        window.scrollTo(0, 0);
    };

    // =============================================
    // ============= FUNKCJE RENDERUJĄCE =============
    // =============================================
    const renderMainScreen = () => {
        containers.days.innerHTML = '';
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const isoDate = getISODate(date);
            
            const trainingDay = getTrainingDayForDate(date);
            if (!trainingDay) continue;

            const progress = state.userProgress[isoDate] || { status: 'not_started' };
            const statusText = {
                not_started: "Nie rozpoczęto",
                in_progress: "W trakcie",
                completed: "Ukończono"
            }[progress.status];

            let dateLabel = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
            if (i === 0) dateLabel = `Dzisiaj, ${dateLabel}`;
            if (i === 1) dateLabel = `Jutro, ${dateLabel}`;

            const card = document.createElement('div');
            card.className = 'day-card';
            card.dataset.status = progress.status;
            card.innerHTML = `
                <p class="day-card-date">${dateLabel}</p>
                <div class="card-header">
                    <h3>Dzień ${trainingDay.dayNumber}: ${trainingDay.title}</h3>
                    <span class="status ${progress.status}">${statusText}</span>
                </div>
                <button class="action-btn" data-date="${isoDate}">Start treningu dnia</button>
            `;
            containers.days.appendChild(card);
        }
    };

    const renderHistoryScreen = () => {
        const date = state.currentCalendarView;
        const year = date.getFullYear();
        const month = date.getMonth();
        
        document.getElementById('month-year-header').textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        
        const grid = containers.calendarGrid;
        grid.innerHTML = '';
        
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        
        let startDay = firstDayOfMonth.getDay();
        if (startDay === 0) startDay = 7;
        
        for (let i = 1; i < startDay; i++) {
            grid.innerHTML += `<div class="calendar-day other-month"></div>`;
        }
        
        const todayISO = getISODate(new Date());
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i);
            const isoDate = getISODate(currentDate);
            const trainingDay = getTrainingDayForDate(currentDate);
            const progress = state.userProgress[isoDate] || { status: 'not_started' };
            
            const dayEl = document.createElement('div');
            dayEl.className = `calendar-day ${progress.status}`;
            if (isoDate === todayISO) {
                dayEl.classList.add('today');
            }
            
            dayEl.innerHTML = `
                <div class="day-number">${i}</div>
                <div class="day-plan">Dzień ${trainingDay.dayNumber}</div>
            `;
            grid.appendChild(dayEl);
        }
        navigateTo('history');
    };
    
    const renderSettingsScreen = () => {
        const form = document.getElementById('settings-form');
        form['setting-rest-duration'].value = state.settings.restBetweenExercises;
        form['setting-progression-factor'].value = state.settings.progressionFactor;
        document.getElementById('progression-factor-value').textContent = `${state.settings.progressionFactor}%`;
        navigateTo('settings');
    };

    const renderPreTrainingScreen = (isoDate) => {
        state.currentTrainingDate = isoDate;
        const date = new Date(isoDate);
        const trainingDay = getTrainingDayForDate(date);
        
        if (!trainingDay) return;

        const factor = state.settings.progressionFactor;
        
        const screen = screens.preTraining;
        screen.innerHTML = `
            <h2 id="pre-training-title">Podgląd: ${date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div id="pre-training-list"></div>
            <div class="pre-training-nav">
                <button id="pre-training-back-btn" class="nav-btn">Wróć</button>
                <button id="start-modified-training-btn" class="action-btn">Rozpocznij Trening</button>
            </div>
        `;
        
        const listContainer = screen.querySelector('#pre-training-list');

        const sections = [
            { name: 'Rozgrzewka', exercises: trainingDay.warmup || [] },
            { name: 'Część główna', exercises: trainingDay.main || [] },
            { name: 'Schłodzenie', exercises: trainingDay.cooldown || [] }
        ];

        let exerciseCounter = 0;
        sections.forEach(section => {
            if (section.exercises.length === 0) return;
            const header = document.createElement('h3');
            header.className = 'pre-training-section-header';
            header.textContent = section.name;
            listContainer.appendChild(header);

            section.exercises.forEach((ex) => {
                const card = document.createElement('div');
                card.className = 'pre-training-exercise-card';
                const uniqueId = `ex-${exerciseCounter}`;
                const modifiedReps = applyProgression(ex.reps_or_time, factor);
                const modifiedTempo = applyProgression(ex.tempo_or_iso, factor);
                
                card.innerHTML = `
                    <h4>${ex.name}</h4>
                    <p class="pre-training-description">${ex.description || 'Brak opisu.'}</p>
                    <a href="${ex.youtube_url}" target="_blank">Obejrzyj wideo ↗</a>
                    <p class="details">Tempo: ${modifiedTempo} | Sprzęt: ${ex.equipment}</p>
                    <div class="pre-training-inputs">
                        <div class="form-group">
                            <label for="sets-${uniqueId}">Serie</label>
                            <input type="text" id="sets-${uniqueId}" value="${ex.sets}" data-original-name="${ex.name}">
                        </div>
                        <div class="form-group">
                            <label for="reps-${uniqueId}">Powtórzenia/Czas</label>
                            <input type="text" id="reps-${uniqueId}" value="${modifiedReps}" data-original-name="${ex.name}">
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
                exerciseCounter++;
            });
        });
        
        screen.querySelector('#pre-training-back-btn').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
        screen.querySelector('#start-modified-training-btn').addEventListener('click', startModifiedTraining);
        
        navigateTo('preTraining');
    };

    const renderSummaryScreen = () => {
        const day = getTrainingDayForDate(new Date(state.currentTrainingDate));
        const dayProgress = state.userProgress[state.currentTrainingDate] || {};
        const initialPainValue = dayProgress.pain_during || 0;
        const summaryScreen = screens.summary;

        summaryScreen.innerHTML = `
            <h2 id="summary-title">Podsumowanie Dnia ${day.dayNumber}</h2>
            <p>Gratulacje! Dobra robota.</p>
            <form id="summary-form">
                <div class="form-group">
                    <label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label>
                    <div class="slider-container">
                        <input type="range" id="pain-during" min="0" max="10" step="1" value="${initialPainValue}">
                        <span class="slider-value" id="pain-during-value">${initialPainValue}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label for="general-notes">Notatki ogólne:</label>
                    <textarea id="general-notes" rows="4">${dayProgress.notes || ''}</textarea>
                </div>
                <button type="submit" class="action-btn">Zapisz i zakończ</button>
            </form>
        `;

        const slider = summaryScreen.querySelector('#pain-during');
        const sliderValueDisplay = summaryScreen.querySelector('#pain-during-value');
        slider.addEventListener('input', () => {
            sliderValueDisplay.textContent = slider.value;
        });

        summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    };

    const renderTrainingScreen = () => {
        screens.training.innerHTML = `
            <div class="focus-view">
                <div class="focus-header">
                    <p id="focus-section-name"></p>
                    <button id="exit-training-btn">Zakończ</button>
                    <p id="focus-progress"></p>
                </div>
                <div class="focus-timer-container">
                    <p id="focus-timer-display"></p>
                </div>
                <div class="focus-exercise-info">
                    <div class="exercise-title-container">
                        <h2 id="focus-exercise-name"></h2>
                        <button id="tts-toggle-btn" class="tts-button"></button>
                    </div>
                    <p id="focus-exercise-details"></p>
                </div>
                <div id="focus-description" class="focus-description-container"></div>
                <div class="focus-controls">
                    <button id="prev-step-btn" class="control-btn">Cofnij</button>
                    <button id="pause-resume-btn" class="control-btn">Pauza</button>
                    <button id="rep-based-done-btn" class="control-btn action-btn hidden">GOTOWE</button>
                    <button id="skip-btn" class="control-btn">Pomiń</button>
                </div>
                <div class="focus-next-up">
                    <p><strong>Następne:</strong> <span id="next-exercise-name"></span></p>
                </div>
            </div>`;

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
        
        focus.exitTrainingBtn.addEventListener('click', () => {
            if (confirm('Czy na pewno chcesz zakończyć trening? Dzień pozostanie oznaczony jako "W trakcie".')) {
                stopTimer();
                if (state.tts.isSupported) state.tts.synth.cancel();
                navigateTo('main');
                renderMainScreen();
            }
        });
        focus.ttsToggleBtn.addEventListener('click', () => {
            state.tts.isSoundOn = !state.tts.isSoundOn;
            focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇';
            if (!state.tts.isSoundOn) {
                if (state.tts.isSupported) state.tts.synth.cancel();
            }
        });
        focus.prevStepBtn.addEventListener('click', moveToPreviousExercise);
        focus.pauseResumeBtn.addEventListener('click', togglePauseTimer);
        focus.skipBtn.addEventListener('click', moveToNextExercise);
        focus.repBasedDoneBtn.addEventListener('click', moveToNextExercise);
    };

    // =============================================
    // ============== LOGIKA TRENINGU ================
    // =============================================
    const applyProgression = (value, factor) => {
        if (!value || factor === 100) return value;
        const multiplier = factor / 100;
        return value.replace(/(\d+)/g, (match) => {
            const num = parseInt(match, 10);
            return Math.round(num * multiplier);
        });
    };
    
    const parseSetCount = (setsString) => {
        if (!setsString) return 1;
        const parts = String(setsString).split('-');
        return parseInt(parts[parts.length - 1].trim(), 10) || 1;
    };

    const getExerciseDuration = (exercise) => {
        if (exercise.isRest) return exercise.duration;
        const repsTimeText = (exercise.reps_or_time || '').toLowerCase();
        const tempoIsoText = (exercise.tempo_or_iso || '').toLowerCase();
        if (repsTimeText.includes('min') || repsTimeText.includes('s')) {
            let match = repsTimeText.match(/(\d+)\s*min/);
            if (match) return parseInt(match[1], 10) * 60;
            match = repsTimeText.match(/(\d+)\s*s/g);
            if (match) return parseInt(match[match.length - 1], 10);
        }
        if (tempoIsoText.includes('izometria')) {
            let match = tempoIsoText.match(/(\d+)\s*s/g);
            if (match) return parseInt(match[match.length - 1], 10);
        }
        return null;
    };

    const generateFlatExercises = (dayData) => {
        const plan = [];
        const sections = [
            { name: 'Rozgrzewka', exercises: dayData.warmup || [] },
            { name: 'Część główna', exercises: dayData.main || [] },
            { name: 'Schłodzenie', exercises: dayData.cooldown || [] }
        ];
        sections.forEach(section => {
            section.exercises.forEach((exercise, exerciseIndex) => {
                const setCount = parseSetCount(exercise.sets);
                for (let i = 1; i <= setCount; i++) {
                    plan.push({ ...exercise, isWork: true, sectionName: section.name, currentSet: i, totalSets: setCount });
                    if (i < setCount) {
                        plan.push({ name: 'Odpoczynek', isRest: true, duration: TRAINING_PLAN.GlobalRules.defaultRestSecondsBetweenSets, sectionName: 'Przerwa' });
                    }
                }
                const isLastExerciseInSection = exerciseIndex === section.exercises.length - 1;
                if (!isLastExerciseInSection) {
                     plan.push({ name: 'Przerwa', isRest: true, duration: state.settings.restBetweenExercises, sectionName: 'Przerwa' });
                }
            });
        });
        return plan;
    };
    
    const startModifiedTraining = () => {
        const trainingDay = getTrainingDayForDate(new Date(state.currentTrainingDate));
        const modifiedDay = JSON.parse(JSON.stringify(trainingDay));

        const sectionKeys = ['warmup', 'main', 'cooldown'];
        const allExercises = sectionKeys.flatMap(key => modifiedDay[key] || []);

        const allInputs = screens.preTraining.querySelectorAll('input[data-original-name]');
        allInputs.forEach(input => {
            const exerciseName = input.dataset.originalName;
            const targetExercise = allExercises.find(ex => ex.name === exerciseName);
            if (targetExercise) {
                if (input.id.startsWith('sets-')) {
                    targetExercise.sets = input.value;
                } else if (input.id.startsWith('reps-')) {
                    targetExercise.reps_or_time = input.value;
                }
            }
        });
        
        const dateKey = state.currentTrainingDate;
        if (!state.userProgress[dateKey]) state.userProgress[dateKey] = {};
        if (state.userProgress[dateKey].status !== 'completed') {
            state.userProgress[dateKey].status = 'in_progress';
        }
        dataStore.saveProgress();

        state.flatExercises = [
            { name: "Przygotuj się", isRest: true, duration: 5, sectionName: "Start" },
            ...generateFlatExercises(modifiedDay)
        ];
        
        startExercise(0);
        navigateTo('training');
    };
    
    const startExercise = (index) => {
        state.currentExerciseIndex = index;
        const exercise = state.flatExercises[index];
        const nextExercise = state.flatExercises[index + 1];

        focus.ttsToggleBtn.textContent = state.tts.isSoundOn ? '🔊' : '🔇';
        focus.prevStepBtn.disabled = (index === 0);
        focus.sectionName.textContent = exercise.sectionName;
        focus.progress.textContent = `${index + 1} / ${state.flatExercises.length}`;
        const nextName = nextExercise ? (nextExercise.isWork ? `${nextExercise.name} (Seria ${nextExercise.currentSet})` : nextExercise.name) : "Koniec treningu";
        focus.nextExerciseName.textContent = nextName;
        
        if (exercise.isWork) {
            focus.exerciseName.textContent = `${exercise.name} (Seria ${exercise.currentSet} / ${exercise.totalSets})`;
            focus.exerciseDetails.textContent = `Czas/Powt: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`;
            focus.exerciseInfoContainer.style.visibility = 'visible';
            focus.focusDescription.textContent = exercise.description || '';
            focus.ttsToggleBtn.style.display = 'inline-block';

            let announcement = `Następne ćwiczenie: ${exercise.name}, seria ${exercise.currentSet} z ${exercise.totalSets}.`;
            if (exercise.reps_or_time) announcement += ` Wykonaj ${exercise.reps_or_time}.`;
            if (exercise.tempo_or_iso) announcement += ` W tempie: ${exercise.tempo_or_iso}.`;
            
            speak(announcement, true, () => {
                speak(exercise.description, false);
            });

        } else {
            focus.exerciseName.textContent = exercise.name;
            focus.exerciseInfoContainer.style.visibility = 'hidden';
            focus.focusDescription.textContent = '';
            focus.ttsToggleBtn.style.display = 'none';
        }
        
        const duration = getExerciseDuration(exercise);
        if (duration !== null) {
            focus.timerDisplay.classList.remove('rep-based-text');
            focus.timerDisplay.style.display = 'block';
            focus.repBasedDoneBtn.classList.add('hidden');
            focus.pauseResumeBtn.classList.remove('hidden');
            startTimer(duration);
        } else {
            focus.timerDisplay.classList.add('rep-based-text');
            stopTimer();
            focus.timerDisplay.textContent = "WYKONAJ";
            focus.repBasedDoneBtn.classList.remove('hidden');
            focus.pauseResumeBtn.classList.add('hidden');
        }
    };
    
    const moveToNextExercise = () => {
        if (state.tts.isSupported) state.tts.synth.cancel();
        stopTimer();
        if (state.currentExerciseIndex < state.flatExercises.length - 1) {
            startExercise(state.currentExerciseIndex + 1);
        } else {
            navigateTo('summary');
            renderSummaryScreen();
        }
    };
    
    const moveToPreviousExercise = () => {
        if (state.currentExerciseIndex > 0) {
            if (state.tts.isSupported) state.tts.synth.cancel();
            stopTimer();
            startExercise(state.currentExerciseIndex - 1);
        }
    };

    const startTimer = (seconds) => {
        stopTimer();
        state.timer.timeLeft = seconds;
        state.timer.isActive = true;
        focus.pauseResumeBtn.textContent = 'Pauza';
        updateTimerDisplay();
        state.timer.interval = setInterval(() => {
            state.timer.timeLeft--;
            updateTimerDisplay();
            if (state.timer.timeLeft <= 0) {
                state.completionSound();
                if (navigator.vibrate) navigator.vibrate(200);
                moveToNextExercise();
            }
        }, 1000);
    };

    const stopTimer = () => {
        clearInterval(state.timer.interval);
        state.timer.isActive = false;
    };
    
    const togglePauseTimer = () => {
        if (state.timer.isActive) {
            stopTimer();
            focus.pauseResumeBtn.textContent = 'Wznów';
        } else {
            if (state.timer.timeLeft > 0) {
                 startTimer(state.timer.timeLeft);
            }
        }
    };

    const updateTimerDisplay = () => {
        const minutes = Math.floor(state.timer.timeLeft / 60);
        const seconds = state.timer.timeLeft % 60;
        focus.timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    // =============================================
    // =============== OBSŁUGA ZDARZEŃ ===============
    // =============================================
    const handleSummarySubmit = (e) => {
        e.preventDefault();
        const dateKey = state.currentTrainingDate;
        if (!state.userProgress[dateKey]) state.userProgress[dateKey] = {};
        
        state.userProgress[dateKey].status = 'completed';
        state.userProgress[dateKey].pain_during = document.getElementById('pain-during').value;
        state.userProgress[dateKey].notes = document.getElementById('general-notes').value;
        state.userProgress[dateKey].lastCompletedDate = new Date().toISOString();
        
        dataStore.saveProgress();
        state.currentTrainingDate = null;
        navigateTo('main');
        renderMainScreen();
    };

    document.getElementById('nav-main').addEventListener('click', () => { navigateTo('main'); renderMainScreen(); });
    document.getElementById('nav-history').addEventListener('click', renderHistoryScreen);
    document.getElementById('nav-settings').addEventListener('click', renderSettingsScreen);
    
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() - 1);
        renderHistoryScreen();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        state.currentCalendarView.setMonth(state.currentCalendarView.getMonth() + 1);
        renderHistoryScreen();
    });

    containers.days.addEventListener('click', (e) => {
        if (e.target.matches('.action-btn')) {
            const date = e.target.dataset.date;
            renderPreTrainingScreen(date);
        }
    });

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        state.settings.restBetweenExercises = parseInt(e.target['setting-rest-duration'].value, 10);
        state.settings.progressionFactor = parseInt(e.target['setting-progression-factor'].value, 10);
        dataStore.saveSettings();
        alert('Ustawienia zostały zapisane.');
        navigateTo('main');
        renderMainScreen();
    });
    
    document.getElementById('setting-progression-factor').addEventListener('input', (e) => {
        document.getElementById('progression-factor-value').textContent = `${e.target.value}%`;
    });

    document.getElementById('backup-btn').addEventListener('click', () => {
        const dataToBackup = {
            userProgress: state.userProgress,
            settings: state.settings
        };
        const dataStr = JSON.stringify(dataToBackup, null, 2);
        const dataBlob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.download = `trening-app-backup-${getISODate(new Date())}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('restore-btn').addEventListener('click', () => {
        document.getElementById('restore-input').click();
    });

    document.getElementById('restore-input').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.userProgress && importedData.settings) {
                    if(confirm("Czy na pewno chcesz nadpisać obecne dane danymi z pliku? Strona zostanie przeładowana.")) {
                        localStorage.setItem('trainingAppProgress', JSON.stringify(importedData.userProgress));
                        localStorage.setItem('trainingAppSettings', JSON.stringify(importedData.settings));
                        alert("Dane zostały przywrócone. Aplikacja zostanie teraz przeładowana.");
                        window.location.reload();
                    }
                } else {
                    alert("Błąd: Nieprawidłowy format pliku z kopią zapasową.");
                }
            } catch (error) {
                alert("Błąd podczas wczytywania pliku. Upewnij się, że jest to prawidłowy plik JSON z backupem.");
                console.error("Restore error:", error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });
    
    // =============================================
    // ============ INICJALIZACJA APLIKACJI ===========
    // =============================================
    const init = () => {
        renderTrainingScreen();
        dataStore.load();
        renderMainScreen();
        if (state.tts.isSupported) {
            loadVoices();
            if (speechSynthesis.onvoiceschanged !== undefined) {
                speechSynthesis.onvoiceschanged = loadVoices;
            }
        }
    };

    init();
});
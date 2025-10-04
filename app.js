document.addEventListener('DOMContentLoaded', () => {

    // =============================================
    // =========== DANE STATYCZNE APLIKACJI ==========
    // =============================================
    const APP_CONTENT = {
        safetyRules: [
            "Natychmiast przerwij trening, jeśli poczujesz ostry, przeszywający ból.",
            "Nie ćwicz, jeśli odczuwasz drętwienie, mrowienie lub osłabienie siły w nogach.",
            "Zatrzymaj trening w przypadku problemów z kontrolą pęcherza lub jelit i pilnie skontaktuj się z lekarzem.",
            "Unikaj ćwiczeń, które powodują ból promieniujący w dół nogi.",
            "Jeśli ból spoczynkowy w nocy znacząco się nasila, skonsultuj się ze specjalistą."
        ],
        progressionRules: [
            "Zwiększaj czas izometrii: Jeśli standard to 8-10s, spróbuj dojść do 12-15s.",
            "Zwiększaj liczbę powtórzeń: Jeśli robisz 5-6 powtórzeń, spróbuj zrobić 7-8 w tej samej jakości.",
            "Dodaj serię: Jeśli plan zakłada 3 serie, po 2 tygodniach dobrej tolerancji dodaj czwartą serię w kluczowych ćwiczeniach.",
            "Skracaj przerwy: Zmniejsz czas odpoczynku między seriami z 60s do 45s.",
            "Dodaj utrudnienie: W ćwiczeniu Bird-dog możesz dodać lekki ruch ramieniem lub nogą w bok, utrzymując stabilny tułów.",
            "Słuchaj swojego ciała: Progresja nie jest obowiązkowa. Jeśli czujesz się gorzej, wróć do poprzedniego etapu."
        ]
    };

    // =============================================
    // ================ STAN APLIKACJI ===============
    // =============================================
    let state = {
        userProgress: {},
        currentDayIndex: null,
        currentExerciseIndex: null,
        flatExercises: [],
        timer: {
            interval: null,
            timeLeft: 0,
            isActive: false,
        },
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
            isSoundOn: true // Globalny przełącznik dźwięku
        }
    };

    // =============================================
    // ================ SELEKTORY DOM ================
    // =============================================
    const screens = {
        main: document.getElementById('main-screen'),
        preTraining: document.getElementById('pre-training-screen'),
        training: document.getElementById('training-screen'),
        summary: document.getElementById('summary-screen'),
        progression: document.getElementById('progression-screen'),
        safety: document.getElementById('safety-screen')
    };
    const containers = {
        days: document.getElementById('days-container'),
        preTrainingList: document.getElementById('pre-training-list'),
        progressionContent: document.getElementById('progression-content'),
        safetyContent: document.getElementById('safety-content')
    };
    const mainNav = document.getElementById('main-nav');
    const summaryForm = document.getElementById('summary-form');
    const focus = {
        sectionName: document.getElementById('focus-section-name'),
        progress: document.getElementById('focus-progress'),
        timerDisplay: document.getElementById('focus-timer-display'),
        exerciseName: document.getElementById('focus-exercise-name'),
        exerciseDetails: document.getElementById('focus-exercise-details'),
        exerciseInfoContainer: document.querySelector('.focus-exercise-info'),
        focusDescription: document.getElementById('focus-description'),
        ttsToggleBtn: document.getElementById('tts-toggle-btn'),
        nextExerciseName: document.getElementById('next-exercise-name'),
        exitTrainingBtn: document.getElementById('exit-training-btn'),
        prevStepBtn: document.getElementById('prev-step-btn'),
        pauseResumeBtn: document.getElementById('pause-resume-btn'),
        repBasedDoneBtn: document.getElementById('rep-based-done-btn'),
        skipBtn: document.getElementById('skip-btn'),
    };

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
            const data = localStorage.getItem('trainingAppProgress');
            if (data) {
                state.userProgress = JSON.parse(data);
            } else {
                state.userProgress = { days: {} };
                TRAINING_PLAN.Days.forEach(day => {
                    state.userProgress.days[`day_${day.dayNumber}`] = { status: 'not_started' };
                });
                dataStore.save();
            }
        },
        save: () => {
            localStorage.setItem('trainingAppProgress', JSON.stringify(state.userProgress));
        }
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
            Object.values(screens).forEach(s => s.classList.remove('active'));
            if (screens[screenName]) screens[screenName].classList.add('active');
        }
        window.scrollTo(0, 0);
    };

    // =============================================
    // ============= FUNKCJE RENDERUJĄCE =============
    // =============================================
    const renderMainScreen = () => {
        containers.days.innerHTML = '';
        TRAINING_PLAN.Days.forEach((day, index) => {
            const dayKey = `day_${day.dayNumber}`;
            const progress = state.userProgress.days[dayKey] || { status: 'not_started' };
            const statusText = {
                not_started: "Nie rozpoczęto",
                in_progress: "W trakcie",
                completed: "Ukończono"
            }[progress.status];
            
            const card = document.createElement('div');
            card.className = 'day-card';
            card.dataset.status = progress.status;
            card.innerHTML = `
                <div class="card-header">
                    <h3>Dzień ${day.dayNumber}: ${day.title}</h3>
                    <span class="status ${progress.status}">${statusText}</span>
                </div>
                <p><strong>Szacowany czas:</strong> ${day.duration_estimate_min}–${day.duration_estimate_max} min</p>
                <div><h4>Rozgrzewka</h4><h4>Część główna</h4><h4>Schłodzenie</h4></div>
                <button class="action-btn" data-day-index="${index}">Start treningu dnia</button>
            `;
            containers.days.appendChild(card);
        });
    };
    
    const renderStaticContent = () => {
        containers.safetyContent.innerHTML = `<ul>${APP_CONTENT.safetyRules.map(rule => `<li>${rule}</li>`).join('')}</ul>`;
        containers.progressionContent.innerHTML = `<ul>${APP_CONTENT.progressionRules.map(rule => `<li>${rule}</li>`).join('')}</ul>`;
    };

    const renderSummaryScreen = () => {
        const day = TRAINING_PLAN.Days[state.currentDayIndex];
        const dayProgress = state.userProgress.days[`day_${day.dayNumber}`] || {};
        const summaryScreen = screens.summary;
        summaryScreen.innerHTML = `
            <h2 id="summary-title">Podsumowanie Dnia ${day.dayNumber}</h2>
            <p>Gratulacje! Dobra robota.</p>
            <form id="summary-form">
                <div class="form-group">
                    <label for="pain-during">Ocena bólu W TRAKCIE treningu (0-10):</label>
                    <input type="number" id="pain-during" min="0" max="10" required value="${dayProgress.pain_during || ''}">
                </div>
                <div class="form-group">
                    <label for="pain-after">Ocena bólu PO 24H (wróć tu później):</label>
                    <input type="number" id="pain-after" min="0" max="10" value="${dayProgress.pain_after_24h || ''}">
                </div>
                <div class="form-group">
                    <label for="general-notes">Notatki ogólne:</label>
                    <textarea id="general-notes" rows="4">${dayProgress.notes || ''}</textarea>
                </div>
                <button type="submit" class="action-btn">Zapisz i zakończ</button>
            </form>
        `;
        summaryScreen.querySelector('#summary-form').addEventListener('submit', handleSummarySubmit);
    };

    const renderPreTrainingScreen = (dayIndex) => {
        state.currentDayIndex = dayIndex;
        const day = TRAINING_PLAN.Days[dayIndex];
        document.getElementById('pre-training-title').innerText = `Podgląd: Dzień ${day.dayNumber}`;
        
        containers.preTrainingList.innerHTML = '';

        const sections = [
            { name: 'Rozgrzewka', exercises: day.warmup || [] },
            { name: 'Część główna', exercises: day.main || [] },
            { name: 'Schłodzenie', exercises: day.cooldown || [] }
        ];

        let exerciseCounter = 0;
        sections.forEach(section => {
            if (section.exercises.length === 0) return;

            const header = document.createElement('h3');
            header.className = 'pre-training-section-header';
            header.textContent = section.name;
            containers.preTrainingList.appendChild(header);

            section.exercises.forEach((ex) => {
                const card = document.createElement('div');
                card.className = 'pre-training-exercise-card';
                const uniqueId = `ex-${exerciseCounter}`;
                card.innerHTML = `
                    <h4>${ex.name}</h4>
                    <p class="pre-training-description">${ex.description || 'Brak opisu.'}</p>
                    <a href="${ex.youtube_url}" target="_blank">Obejrzyj wideo ↗</a>
                    <p class="details">Tempo: ${ex.tempo_or_iso} | Sprzęt: ${ex.equipment}</p>
                    <div class="pre-training-inputs">
                        <div class="form-group">
                            <label for="sets-${uniqueId}">Serie</label>
                            <input type="text" id="sets-${uniqueId}" value="${ex.sets}" data-original-name="${ex.name}">
                        </div>
                        <div class="form-group">
                            <label for="reps-${uniqueId}">Powtórzenia/Czas</label>
                            <input type="text" id="reps-${uniqueId}" value="${ex.reps_or_time}" data-original-name="${ex.name}">
                        </div>
                    </div>
                `;
                containers.preTrainingList.appendChild(card);
                exerciseCounter++;
            });
        });
        navigateTo('preTraining');
    };

    // =============================================
    // ============== LOGIKA TRENINGU ================
    // =============================================

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
                     plan.push({ name: 'Przerwa', isRest: true, duration: TRAINING_PLAN.GlobalRules.defaultRestSecondsBetweenExercises, sectionName: 'Przerwa' });
                }
            });
        });
        return plan;
    };

    const startModifiedTraining = () => {
        const originalDay = TRAINING_PLAN.Days[state.currentDayIndex];
        const modifiedDay = JSON.parse(JSON.stringify(originalDay));
        const allExercises = [
            ...(modifiedDay.warmup || []),
            ...(modifiedDay.main || []),
            ...(modifiedDay.cooldown || [])
        ];

        const allInputs = containers.preTrainingList.querySelectorAll('input[data-original-name]');
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

        const dayKey = `day_${modifiedDay.dayNumber}`;
        if (!state.userProgress.days[dayKey]) state.userProgress.days[dayKey] = {};
        if (state.userProgress.days[dayKey].status !== 'completed') {
            state.userProgress.days[dayKey].status = 'in_progress';
        }
        dataStore.save();

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
            focus.timerDisplay.style.display = 'block';
            focus.repBasedDoneBtn.classList.add('hidden');
            focus.pauseResumeBtn.classList.remove('hidden');
            startTimer(duration);
        } else {
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

    // =============================================
    // ================ LOGIKA TIMERA ================
    // =============================================
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
        const dayKey = `day_${TRAINING_PLAN.Days[state.currentDayIndex].dayNumber}`;
        const progress = state.userProgress.days[dayKey];
        progress.status = 'completed';
        progress.pain_during = document.getElementById('pain-during').value;
        progress.pain_after_24h = document.getElementById('pain-after').value;
        progress.notes = document.getElementById('general-notes').value;
        progress.lastCompletedDate = new Date().toISOString();
        dataStore.save();
        state.currentDayIndex = null;
        navigateTo('main');
        renderMainScreen();
    };

    document.getElementById('nav-main').addEventListener('click', () => navigateTo('main'));
    document.getElementById('nav-progression').addEventListener('click', () => navigateTo('progression'));
    document.getElementById('nav-safety').addEventListener('click', () => navigateTo('safety'));
    
    containers.days.addEventListener('click', (e) => {
        if (e.target.matches('.action-btn')) {
            const dayIndex = parseInt(e.target.dataset.dayIndex, 10);
            renderPreTrainingScreen(dayIndex);
        }
    });

    document.getElementById('pre-training-back-btn').addEventListener('click', () => navigateTo('main'));
    document.getElementById('start-modified-training-btn').addEventListener('click', startModifiedTraining);

    focus.exitTrainingBtn.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz zakończyć trening? Dzień pozostanie oznaczony jako "W trakcie".')) {
            stopTimer();
            if (state.tts.isSupported) state.tts.synth.cancel();
            navigateTo('main');
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
    
    // =============================================
    // ============ INICJALIZACJA APLIKACJI ===========
    // =============================================
    const init = () => {
        dataStore.load();
        renderMainScreen();
        renderStaticContent();
        navigateTo('main');

        if (state.tts.isSupported) {
            loadVoices();
            if (speechSynthesis.onvoiceschanged !== undefined) {
                speechSynthesis.onvoiceschanged = loadVoices;
            }
        }
    };

    init();
});
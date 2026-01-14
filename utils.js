// ExerciseApp/utils.js

import { state } from './state.js';

// --- SVG SANITIZER ---
export const processSVG = (svgString) => {
    if (!svgString) return '';
    if (!svgString.includes('<svg')) return svgString;

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, "image/svg+xml");
        const svg = doc.querySelector('svg');

        if (!svg) return svgString;

        if (!svg.hasAttribute('viewBox')) {
            const w = svg.getAttribute('width');
            const h = svg.getAttribute('height');
            if (w && h) {
                const cleanW = parseFloat(w.replace('px', ''));
                const cleanH = parseFloat(h.replace('px', ''));
                if (!isNaN(cleanW) && !isNaN(cleanH)) {
                    svg.setAttribute('viewBox', `0 0 ${cleanW} ${cleanH}`);
                }
            }
        }

        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';

        if (!svg.hasAttribute('preserveAspectRatio')) {
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }

        return new XMLSerializer().serializeToString(svg);
    } catch (e) {
        console.error("[Utils] SVG Process Error:", e);
        return svgString;
    }
};

export const extractYoutubeId = (url) => {
    if (!url) return null;
    if (url.length === 11 && !/[:/.]/.test(url)) return url;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

export const getISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const shouldSynchronizePlan = (plan) => {
    if (!plan || !plan.days || plan.days.length === 0) return { needed: true, reason: 'missing_plan' };
    const todayISO = getISODate(new Date());
    const hasToday = plan.days.some(d => d.date === todayISO);
    if (!hasToday) return { needed: true, reason: 'missing_today' };
    const lastDayEntry = plan.days[plan.days.length - 1];
    if (!lastDayEntry.date) return { needed: true, reason: 'corrupt_data' };
    const lastDate = new Date(lastDayEntry.date);
    const bufferThresholdDate = new Date();
    bufferThresholdDate.setDate(bufferThresholdDate.getDate() + 3);
    lastDate.setHours(0,0,0,0);
    bufferThresholdDate.setHours(0,0,0,0);
    if (lastDate < bufferThresholdDate) {
        return { needed: true, reason: 'buffer_low' };
    }
    return { needed: false, reason: null };
};

export const getActiveTrainingPlan = () => {
    return state.settings.dynamicPlanData;
};

export const isTodayRestDay = () => {
    const todayISO = getISODate(new Date());
    const plan = getActiveTrainingPlan();
    if (plan && plan.days) {
        const todayEntry = plan.days.find(d => d.date === todayISO);
        if (todayEntry) return todayEntry.type === 'rest';
    }
    const todayIndex = new Date().getDay();
    const scheduleIndex = todayIndex === 0 ? 6 : todayIndex - 1;
    if (!state.settings.schedule || !state.settings.schedule[scheduleIndex]) return false;
    return !state.settings.schedule[scheduleIndex].active;
};

export const getAvailableMinutesForToday = () => {
    const todayIndex = new Date().getDay();
    const scheduleIndex = todayIndex === 0 ? 6 : todayIndex - 1;
    if (!state.settings.schedule || !state.settings.schedule[scheduleIndex]) return 60;
    return state.settings.schedule[scheduleIndex].minutes || 45;
};

export const getNextLogicalDay = () => null;
export const getTrainingDayForDate = (date) => null;

export const getHydratedDay = (dayData) => {
    if (!dayData) return null;
    const hydratedDay = JSON.parse(JSON.stringify(dayData));
    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                const exerciseId = exerciseRef.exerciseId || exerciseRef.id;
                const libraryDetails = state.exerciseLibrary[exerciseId];
                if (!libraryDetails) return exerciseRef;
                const mergedExercise = {
                    ...libraryDetails,
                    ...exerciseRef,
                    categoryId: libraryDetails.categoryId,
                    difficultyLevel: libraryDetails.difficultyLevel
                };
                if (!mergedExercise.tempo_or_iso) mergedExercise.tempo_or_iso = libraryDetails.defaultTempo || "Kontrolowane";
                if (mergedExercise.is_unilateral === undefined) mergedExercise.is_unilateral = libraryDetails.isUnilateral || false;

                // --- TASK M1: HYDRATION (LEGACY SUPPORT) ---
                // Upewnij się, że obiekt ma `calculated_timing` lub `baseRestSeconds`.
                // Jeśli backend w planie nie zapisał (stary plan), weź z biblioteki.
                if (!mergedExercise.calculated_timing) {
                    // Sprawdzamy czy biblioteka ma dane (z Tasku B3)
                    if (libraryDetails.baseRestSeconds) {
                        mergedExercise.calculated_timing = {
                            rest_sec: libraryDetails.baseRestSeconds,
                            transition_sec: libraryDetails.baseTransitionSeconds || 5
                        };
                    } else {
                        // Ostateczny fallback
                        mergedExercise.calculated_timing = { rest_sec: 30, transition_sec: 5 };
                    }
                }

                return mergedExercise;
            });
        }
    });
    return hydratedDay;
};

export const parseSetCount = (setsString) => {
    if (!setsString) return 1;
    const parts = String(setsString).split('-');
    return parseInt(parts[parts.length - 1].trim(), 10) || 1;
};

export const getExerciseDuration = (exercise) => {
    if (exercise.isRest) return exercise.duration;
    return null;
};

// --- CALCULATE SMART DURATION & LOAD METRICS ---

const parseRepsOrTime = (val) => {
    const t = String(val || '').trim().toLowerCase();
    if (t.includes('s')) return Math.max(5, parseInt(t, 10) || 30);
    if (t.includes('min')) return Math.max(10, (parseInt(t, 10) || 1) * 60);
    return parseInt(t, 10) || 10;
};

/**
 * CENTRALNA LOGIKA PRZERW (Explicit Base Rest Architecture - Task F1)
 * Zamiast zgadywać kategorię, używamy wartości z backendu.
 */
export const calculateSmartRest = (exercise, userRestFactor = 1.0) => {
    // 1. Priorytet: Jawne nadpisanie (np. z protokołu Tabata)
    if (exercise.restBetweenSets) {
        return Math.round(parseInt(exercise.restBetweenSets, 10) * userRestFactor);
    }

    // 2. Pobranie bazy z obiektu (z backendu)
    let baseRest = 30; // Fallback

    if (exercise.calculated_timing && exercise.calculated_timing.rest_sec) {
        baseRest = exercise.calculated_timing.rest_sec;
    } else if (exercise.baseRestSeconds) {
        // Fallback dla obiektów z Atlasu
        baseRest = exercise.baseRestSeconds;
    }

    // 3. Aplikacja Globalnego Faktora Użytkownika
    return Math.max(10, Math.round(baseRest * userRestFactor));
};

export const calculateSmartDuration = (dayPlan) => {
    if (!dayPlan) return 0;

    const globalSpr = state.settings.secondsPerRep || 6;
    const restFactor = state.settings.restTimeFactor || 1.0;

    const allExercises = [
        ...(dayPlan.warmup || []),
        ...(dayPlan.main || []),
        ...(dayPlan.cooldown || [])
    ];

    let totalSeconds = 0;

    allExercises.forEach((ex, index) => {
        const sets = parseSetCount(ex.sets);
        const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');
        const multiplier = isUnilateral ? 2 : 1;

        const exId = ex.id || ex.exerciseId;
        let tempoToUse = globalSpr;

        if (state.exercisePace && state.exercisePace[exId]) {
            tempoToUse = state.exercisePace[exId];
        }

        // Czas pracy
        let workTimePerSet = 0;
        const valStr = String(ex.reps_or_time).toLowerCase();

        if (valStr.includes('s') || valStr.includes('min')) {
            workTimePerSet = parseRepsOrTime(ex.reps_or_time) * multiplier;
        } else {
            const reps = parseRepsOrTime(ex.reps_or_time);
            workTimePerSet = reps * tempoToUse * multiplier;
        }

        let exDuration = sets * workTimePerSet;

        // Czas przerw między seriami
        if (sets > 1) {
            const restTime = calculateSmartRest(ex, restFactor);
            exDuration += (sets - 1) * restTime;
        }

        // Czas zmiany strony / przejścia (Task F1: używamy danych z backendu jeśli są)
        let transitionTime = Math.max(12, Math.round(12 * restFactor));
        if (ex.calculated_timing && ex.calculated_timing.transition_sec) {
             transitionTime = Math.max(5, Math.round(ex.calculated_timing.transition_sec * restFactor));
        }

        const transitionsTotal = sets * (isUnilateral ? transitionTime : 5);
        exDuration += transitionsTotal;

        totalSeconds += exDuration;

        // Przerwa między ćwiczeniami (też skalowana)
        if (index < allExercises.length - 1) {
            totalSeconds += Math.round(30 * restFactor);
        }
    });

    return Math.round(totalSeconds / 60);
};

export const calculateSystemLoad = (inputData, fromHistory = false) => {
    if (!inputData) return 0;

    let exercises = [];

    // Case A: Plan (Dashboard) - Struktura z sekcjami
    if (!fromHistory && (inputData.warmup || inputData.main || inputData.cooldown)) {
        exercises = [
            ...(inputData.warmup || []),
            ...(inputData.main || []),
            ...(inputData.cooldown || [])
        ];
    }
    // Case B: Lista (Historia/Log) - Płaska tablica
    else if (Array.isArray(inputData)) {
        exercises = inputData.filter(ex => {
            // W historii bierzemy tylko zakończone i nie będące przerwami
            if (fromHistory) return ex.status === 'completed' && !ex.isRest;
            return true;
        });
    }

    if (exercises.length === 0) return 0;

    const globalSpr = state.settings.secondsPerRep || 6;
    let totalWorkSeconds = 0;
    let weightedDifficultySum = 0;

    exercises.forEach(ex => {
        // --- DIFFICULTY LEVEL ---
        // Plan: z bazy. Historia: zapisane w logu (lub fallback 1)
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // --- UNILATERAL LOGIC ---
        // Plan: Agregowany ("3 serie po 10 powtórzeń na stronę") -> Mnożymy x2
        // Historia: Rozwinięty ("Seria 1 Lewa", "Seria 1 Prawa") -> Nie mnożymy, bo są osobne wpisy
        let multiplier = 1;
        if (!fromHistory) {
            const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');
            if (isUnilateral) multiplier = 2;
        }

        // --- SETS COUNT ---
        // Plan: "3" lub "1-3" -> parsujemy
        // Historia: Każdy wpis w logu to jedna wykonana "seria" (lub krok) -> zawsze 1
        let sets = 1;
        if (!fromHistory) {
            sets = parseSetCount(ex.sets);
        }

        // --- WORK TIME CALCULATION ---
        let singleSetWorkTime = 0;
        const valStr = String(ex.reps_or_time).toLowerCase();

        if (valStr.includes('s') || valStr.includes('min')) {
            singleSetWorkTime = parseRepsOrTime(ex.reps_or_time);
        } else {
            singleSetWorkTime = parseRepsOrTime(ex.reps_or_time) * globalSpr;
        }

        const totalExWorkTime = singleSetWorkTime * sets * multiplier;

        totalWorkSeconds += totalExWorkTime;
        weightedDifficultySum += (difficulty * totalExWorkTime);
    });

    if (totalWorkSeconds === 0) return 0;

    const avgDifficulty = weightedDifficultySum / totalWorkSeconds;
    // 7200 = Arbitralny punkt odniesienia (np. 60 min ciągłej pracy o trudności 2)
    const maxScoreRef = 7200;
    const rawScore = (avgDifficulty * totalWorkSeconds);

    let score = Math.round((rawScore / maxScoreRef) * 100);
    return Math.min(100, Math.max(1, score));
};

export const calculateClinicalProfile = (dayPlan) => {
    if (!dayPlan) return [];
    let maxSpine = 0; let maxKnee = 0; let maxImpact = 0;
    const mainEx = dayPlan.main || [];
    mainEx.forEach(ex => {
        const spine = (ex.spineLoadLevel || 'low').toLowerCase();
        if (spine === 'high') maxSpine = Math.max(maxSpine, 2); else if (spine === 'medium' || spine === 'moderate') maxSpine = Math.max(maxSpine, 1);
        const knee = (ex.kneeLoadLevel || 'low').toLowerCase();
        if (knee === 'high') maxKnee = Math.max(maxKnee, 2); else if (knee === 'medium') maxKnee = Math.max(maxKnee, 1);
        const imp = (ex.impactLevel || 'low').toLowerCase();
        if (imp === 'high') maxImpact = Math.max(maxImpact, 2); else if (imp === 'moderate') maxImpact = Math.max(maxImpact, 1);
    });
    const tags = [];
    if (maxImpact === 2) tags.push({ label: 'High Impact', color: 'red' }); else if (maxImpact === 0 && mainEx.length > 0) tags.push({ label: 'Low Impact', color: 'green' });
    if (maxSpine === 2) tags.push({ label: 'Spine Load', color: 'orange' });
    if (maxKnee === 2) tags.push({ label: 'Knee Load', color: 'orange' });
    if (tags.length === 0 && mainEx.length > 0) tags.push({ label: 'Joint Friendly', color: 'green' });
    return tags;
};

export const getSessionFocus = (dayPlan) => {
    if (!dayPlan || !dayPlan.main) return 'Ogólnorozwojowy';
    const counts = {};
    dayPlan.main.forEach(ex => {
        const cat = (ex.categoryId || '').toLowerCase();
        let group = 'Ogólne';
        if (cat.includes('core') || cat.includes('abs')) group = 'Core / Brzuch';
        else if (cat.includes('glute') || cat.includes('hip') || cat.includes('hinge')) group = 'Biodra / Pośladki';
        else if (cat.includes('spine') || cat.includes('mobility') || cat.includes('thoracic')) group = 'Mobilność';
        else if (cat.includes('strength') || cat.includes('push') || cat.includes('pull') || cat.includes('squat') || cat.includes('lunge')) group = 'Siła';
        else if (cat.includes('nerve') || cat.includes('neuro')) group = 'Neuro';
        else if (cat.includes('balance') || cat.includes('stability')) group = 'Stabilizacja';
        else if (cat.includes('conditioning') || cat.includes('cardio')) group = 'Kondycja';
        counts[group] = (counts[group] || 0) + 1;
    });
    if (Object.keys(counts).length === 0) return 'Ogólnorozwojowy';
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

export const formatForTTS = (text) => {
    if (!text) return '';
    let formattedText = String(text);
    formattedText = formattedText.replace(/\/str\.?/g, ' na stronę');
    formattedText = formattedText.replace(/\s*x\s*/g, ' razy ');
    formattedText = formattedText.replace(/(\d+)-(\d+)/g, '$1 do $2');
    formattedText = formattedText.replace(/(\d+)\s*s\b/g, (match, numberStr) => {
        const number = parseInt(numberStr, 10);
        if (number === 1) return `${number} sekunda`;
        const lastDigit = number % 10;
        const lastTwoDigits = number % 100;
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${number} sekundy`;
        return `${number} sekund`;
    });
    formattedText = formattedText.replace(/(\d+)\s*min\b/g, (match, numberStr) => {
        const number = parseInt(numberStr, 10);
        if (number === 1) return `${number} minuta`;
        const lastDigit = number % 10;
        const lastTwoDigits = number % 100;
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${number} minuty`;
        return `${number} minut`;
    });
    if (/^[\d\s-]+$/.test(formattedText.trim())) {
        const numbers = formattedText.match(/\d+/g);
        if (numbers) {
            const lastNumber = parseInt(numbers[numbers.length - 1], 10);
            if (lastNumber === 1) formattedText += ' powtórzenie';
            else {
                const lastDigit = lastNumber % 10;
                const lastTwoDigits = lastNumber % 100;
                if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) formattedText += ' powtórzenia';
                else formattedText += ' powtórzeń';
            }
        }
    }
    return formattedText;
};

export const getLocalISOString = (date) => {
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};
// utils.js

import { state } from './state.js';

export const getISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getActiveTrainingPlan = () => {
    return state.trainingPlans[state.settings.activePlanId] || state.trainingPlans['l5s1-foundation'];
};

export const isTodayRestDay = () => {
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

export const getNextLogicalDay = () => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) return null;

    let allSessions = [];
    if (state.userProgress) {
        allSessions = Object.values(state.userProgress).flat();
    }

    const planSessions = allSessions.filter(s =>
        s.planId === state.settings.activePlanId &&
        s.status === 'completed' &&
        s.completedAt
    );

    planSessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    const lastSession = planSessions[0];

    if (!lastSession) {
        console.log("[Queue] Brak historii dla tego planu. Startuję od Dnia 1.");
        return activePlan.Days.find(d => d.dayNumber === 1);
    }

    const lastDayNum = parseInt(lastSession.trainingDayId || 0);
    const totalDaysInPlan = activePlan.Days.length;

    console.log(`[Queue] Ostatni trening: Dzień ${lastDayNum} wykonany ${lastSession.completedAt.split('T')[0]}`);

    let nextDayNum = lastDayNum + 1;
    if (nextDayNum > totalDaysInPlan) {
        nextDayNum = 1;
    }

    return activePlan.Days.find(d => d.dayNumber === nextDayNum);
};

export const getTrainingDayForDate = (date) => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) return null;

    const startDate = new Date(state.settings.appStartDate);
    const currentDate = new Date(getISODate(date));

    const diffTime = currentDate - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayIndex = diffDays % activePlan.Days.length;

    const planDayNumber = (dayIndex < 0) ? dayIndex + activePlan.Days.length + 1 : dayIndex + 1;

    return activePlan.Days.find(d => d.dayNumber === planDayNumber);
};

// --- FIX: POPRAWIONA HYDRACJA ---
export const getHydratedDay = (dayData) => {
    if (!dayData) return null;

    // Tworzymy głęboką kopię, aby nie modyfikować oryginału w state/storage
    const hydratedDay = JSON.parse(JSON.stringify(dayData));

    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                // Pobieramy pełne dane z biblioteki na podstawie ID
                const exerciseId = exerciseRef.exerciseId || exerciseRef.id;
                const libraryDetails = state.exerciseLibrary[exerciseId];

                // DEBUG: Sprawdź czy mixer przekazał zmienioną nazwę
                if (exerciseRef.name && libraryDetails && exerciseRef.name !== libraryDetails.name) {
                    console.log(`🔍 [Hydration] Mixer swap detected: ${exerciseRef.name} (from mixer) vs ${libraryDetails.name} (from library)`);
                }

                if (!libraryDetails) {
                    console.warn(`⚠️ Ostrzeżenie: Ćwiczenie ${exerciseId} jest w planie, ale brak go w bibliotece.`);
                    return exerciseRef;
                }

                // 1. Scalamy dane z biblioteki z danymi z planu (plan ma priorytet w kwestii sets/reps)
                const mergedExercise = {
                    ...libraryDetails,
                    ...exerciseRef,
                    categoryId: libraryDetails.categoryId,
                    difficultyLevel: libraryDetails.difficultyLevel
                };

                // 2. Uzupełniamy TEMPO (jeśli brak w planie, bierzemy domyślne z biblioteki)
                if (!mergedExercise.tempo_or_iso) {
                    mergedExercise.tempo_or_iso = libraryDetails.defaultTempo || "Kontrolowane";
                }

                // 3. Uzupełniamy UNILATERAL (jeśli brak w planie, bierzemy z biblioteki)
                if (mergedExercise.is_unilateral === undefined) {
                    mergedExercise.is_unilateral = libraryDetails.isUnilateral || false;
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

/**
 * Parsuje czas trwania z formatu stringa.
 */
export const getExerciseDuration = (exercise) => {
    if (exercise.isRest) {
        return exercise.duration;
    }

    const text = (exercise.reps_or_time || '').trim().toLowerCase();

    const isUnilateralStr = text.includes('/str') || text.includes('stron');
    const isUnilateralProp = exercise.isUnilateral || false;
    const multiplier = (isUnilateralStr || isUnilateralProp) ? 2 : 1;

    // 1. Wykrywanie MINUT
    const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
    if (minMatch) {
        const minutes = parseFloat(minMatch[1].replace(',', '.'));
        return Math.round(minutes * 60 * multiplier);
    }

    // 2. Wykrywanie SEKUND
    const secMatch = text.match(/(\d+)\s*s\b/);
    if (secMatch) {
        const seconds = parseInt(secMatch[1], 10);
        return seconds * multiplier;
    }

    return null;
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
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
            return `${number} sekundy`;
        }
        return `${number} sekund`;
    });
    formattedText = formattedText.replace(/(\d+)\s*min\b/g, (match, numberStr) => {
        const number = parseInt(numberStr, 10);
        if (number === 1) return `${number} minuta`;
        const lastDigit = number % 10;
        const lastTwoDigits = number % 100;
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
            return `${number} minuty`;
        }
        return `${number} minut`;
    });
    if (/^[\d\s-]+$/.test(formattedText.trim())) {
        const numbers = formattedText.match(/\d+/g);
        if (numbers) {
            const lastNumber = parseInt(numbers[numbers.length - 1], 10);
            if (lastNumber === 1) {
                formattedText += ' powtórzenie';
            } else {
                const lastDigit = lastNumber % 10;
                const lastTwoDigits = lastNumber % 100;
                if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
                    formattedText += ' powtórzenia';
                } else {
                    formattedText += ' powtórzeń';
                }
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
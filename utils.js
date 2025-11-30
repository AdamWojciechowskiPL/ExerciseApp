// utils.js

import { state } from './state.js';
// ZMIANA: Usunięto importy statycznych plików z danymi.
// import { TRAINING_PLANS } from './training-plans.js';
// import { EXERCISE_LIBRARY } from './exercise-library.js';

export const getISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ZMIANA: Funkcja korzysta teraz z `state.trainingPlans`.
export const getActiveTrainingPlan = () => {
    return state.trainingPlans[state.settings.activePlanId] || state.trainingPlans['l5s1-foundation'];
};

// BEZ ZMIAN: Ta funkcja korzysta z `getActiveTrainingPlan`, więc automatycznie używa nowego źródła danych.
export const getTrainingDayForDate = (date) => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) return null; // Zabezpieczenie na wypadek, gdyby plany nie zostały jeszcze załadowane.
    
    const startDate = new Date(state.settings.appStartDate);
    const currentDate = new Date(getISODate(date));
    
    const diffTime = currentDate - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayIndex = diffDays % activePlan.Days.length;
    
    const planDayNumber = (dayIndex < 0) ? dayIndex + activePlan.Days.length + 1 : dayIndex + 1;
    
    return activePlan.Days.find(d => d.dayNumber === planDayNumber);
};

// ZMIANA: Funkcja korzysta teraz z `state.exerciseLibrary`.
export const getHydratedDay = (dayData) => {
    if (!dayData) return null;
    
    // Głęboka kopia struktury dnia
    const hydratedDay = JSON.parse(JSON.stringify(dayData));

    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                // Pobieramy pełne dane z biblioteki na podstawie ID
                const libraryDetails = state.exerciseLibrary[exerciseRef.exerciseId];

                if (!libraryDetails) {
                    console.warn(`⚠️ Ostrzeżenie: Ćwiczenie ${exerciseRef.exerciseId} jest w planie, ale brak go w bibliotece.`);
                    return exerciseRef;
                }

                // Łączymy dane (Merge):
                // 1. libraryDetails daje: name, categoryId, difficultyLevel, youtube_url
                // 2. exerciseRef daje: sets, reps_or_time (nadpisuje domyślne jeśli są)
                return {
                    ...libraryDetails, 
                    ...exerciseRef,
                    // Upewniamy się, że categoryId jest przekazane jawnie
                    categoryId: libraryDetails.categoryId,
                    difficultyLevel: libraryDetails.difficultyLevel
                };
            });
        }
    });
    return hydratedDay;
};

export const applyProgression = (value, factor) => {
    if (!value || factor === 100) return value;
    const multiplier = factor / 100;
    return value.replace(/(\d+)/g, (match) => {
        const num = parseInt(match, 10);
        return Math.round(num * multiplier);
    });
};

export const parseSetCount = (setsString) => {
    if (!setsString) return 1;
    const parts = String(setsString).split('-');
    return parseInt(parts[parts.length - 1].trim(), 10) || 1;
};

export const getExerciseDuration = (exercise) => {
    if (exercise.isRest) {
        return exercise.duration;
    }
    const repsTimeText = (exercise.reps_or_time || '').trim().toLowerCase();
    const minMatch = repsTimeText.match(/^(\d+)\s*min\b$/);
    if (minMatch) {
        return parseInt(minMatch[1], 10) * 60;
    }
    const secMatch = repsTimeText.match(/^(\d+)\s*s\b$/);
    if (secMatch) {
        return parseInt(secMatch[1], 10);
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

/**
 * Konwertuje obiekt Date na ciąg znaków w formacie ISO 8601,
 * ale używając LOKALNEJ strefy czasowej i usuwając informację o strefie ('Z').
 * Zwraca format: YYYY-MM-DDTHH:mm:ss
 * @param {Date} date Obiekt daty do sformatowania.
 * @returns {string} Sformatowany ciąg znaków.
 */
export const getLocalISOString = (date) => {
  const pad = (num) => String(num).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1); // getMonth() jest 0-indeksowane
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};
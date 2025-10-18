// utils.js

import { state } from './state.js';
// ZMIANA: Importujemy nowe, modularne pliki zamiast starego, monolitycznego planu.
import { TRAINING_PLANS } from './training-plans.js';
import { EXERCISE_LIBRARY } from './exercise-library.js';

export const getISODate = (date) => date.toISOString().split('T')[0];

// NOWOŚĆ: Funkcja pomocnicza, która centralizuje logikę pobierania aktywnego planu.
// Zapewnia rezerwowy plan, gdyby wybrany w ustawieniach nie istniał.
export const getActiveTrainingPlan = () => {
    return TRAINING_PLANS[state.settings.activePlanId] || TRAINING_PLANS['l5s1-foundation'];
};

// ZMIANA: Funkcja została przepisana, aby działać na aktywnym planie treningowym.
export const getTrainingDayForDate = (date) => {
    const activePlan = getActiveTrainingPlan();
    const startDate = new Date(state.settings.appStartDate);
    const currentDate = new Date(getISODate(date));
    
    // Różnica dni jest teraz obliczana modulo długość aktywnego planu.
    const diffTime = currentDate - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayIndex = diffDays % activePlan.Days.length;
    
    const planDayNumber = (dayIndex < 0) ? dayIndex + activePlan.Days.length + 1 : dayIndex + 1;
    
    return activePlan.Days.find(d => d.dayNumber === planDayNumber);
};

// NOWOŚĆ: Kluczowa funkcja, która "nawadnia" dane.
// Bierze dane dnia z planu (które mają tylko exerciseId) i łączy je
// z pełnymi opisami i linkami z biblioteki ćwiczeń.
export const getHydratedDay = (dayData) => {
    if (!dayData) return null;
    
    // Tworzymy głęboką kopię, aby nie modyfikować oryginalnego obiektu planu.
    const hydratedDay = JSON.parse(JSON.stringify(dayData));

    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                // Znajdź szczegóły w bibliotece, użyj pustego obiektu jako fallback.
                const libraryDetails = EXERCISE_LIBRARY[exerciseRef.exerciseId] || {};
                // Połącz dane z biblioteki (opis, url) z danymi z planu (serie, powtórzenia).
                return { ...libraryDetails, ...exerciseRef };
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
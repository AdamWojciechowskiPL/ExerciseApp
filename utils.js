// utils.js

import { state } from './state.js';
import { TRAINING_PLAN } from './training-plan.js';

export const getISODate = (date) => date.toISOString().split('T')[0];

export const getTrainingDayForDate = (date) => {
    const startDate = new Date(state.settings.appStartDate);
    const currentDate = new Date(getISODate(date));
    const diffTime = currentDate - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayIndex = diffDays % TRAINING_PLAN.Days.length;
    const planDayNumber = (dayIndex < 0) ? dayIndex + TRAINING_PLAN.Days.length + 1 : dayIndex + 1;
    return TRAINING_PLAN.Days.find(d => d.dayNumber === planDayNumber);
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

// =========================================================================
// OSTATECZNA POPRAWKA: Precyzyjna i restrykcyjna logika wykrywania czasu
// =========================================================================
export const getExerciseDuration = (exercise) => {
    if (exercise.isRest) {
        return exercise.duration;
    }

    const repsTimeText = (exercise.reps_or_time || '').trim().toLowerCase();

    // Wyrażenie regularne, które pasuje TYLKO do formatu "liczba + jednostka"
    // ^ - początek stringu, $ - koniec stringu
    const minMatch = repsTimeText.match(/^(\d+)\s*min\b$/);
    if (minMatch) {
        return parseInt(minMatch[1], 10) * 60;
    }

    const secMatch = repsTimeText.match(/^(\d+)\s*s\b$/);
    if (secMatch) {
        return parseInt(secMatch[1], 10);
    }
    
    // Jeśli tekst nie pasuje DOKŁADNIE do powyższych wzorców
    // (np. zawiera 'x', '/', '-', lub jest samą liczbą),
    // jest to ćwiczenie na powtórzenia.
    return null;
};


export const formatForTTS = (text) => {
    if (!text) return '';
    let formattedText = String(text);

    // Krok 1: Przetwarzaj najbardziej złożone modyfikatory
    formattedText = formattedText.replace(/\/str\.?/g, ' na stronę');
    
    // Krok 2: Przetwarzaj ogólne separatory
    formattedText = formattedText.replace(/\s*x\s*/g, ' razy ');
    formattedText = formattedText.replace(/(\d+)-(\d+)/g, '$1 do $2');
    
    // Krok 3: Przetwarzaj podstawowe jednostki (s, min)
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

    // Krok 4: Na końcu sprawdź, czy to tylko liczba/zakres - jeśli tak, dodaj "powtórzeń"
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
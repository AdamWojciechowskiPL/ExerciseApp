// utils.js

import { state } from './state.js';

// --- ZADANIE 10: SVG SANITIZER & SCALER ---
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

// ZMIANA: Zawsze zwraca dynamicPlanData
export const getActiveTrainingPlan = () => {
    return state.settings.dynamicPlanData;
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
    if (!activePlan || !activePlan.days) return null;

    // Pobieramy historię dla obecnego planu dynamicznego
    let allSessions = [];
    if (state.userProgress) {
        allSessions = Object.values(state.userProgress).flat();
    }

    const currentPlanId = activePlan.id;
    const planSessions = allSessions.filter(s =>
        s.planId === currentPlanId &&
        s.status === 'completed'
    );

    // Liczba ukończonych sesji = indeks następnej sesji
    const completedCount = planSessions.length;
    const totalDays = activePlan.days.length;

    if (completedCount >= totalDays) {
        // Plan ukończony
        return null; 
    }

    // Zwracamy następny dzień z tablicy (indeks 0-based)
    return activePlan.days[completedCount];
};

// ZMIANA: Deprecated/Simplified for dynamic logic context
export const getTrainingDayForDate = (date) => {
    // W systemie dynamicznym nie ma sztywnego mapowania daty na dzień.
    // Zwracamy null, aby historia korzystała z danych zapisanych w sesji (snapshots).
    return null; 
};

export const getHydratedDay = (dayData) => {
    if (!dayData) return null;

    const hydratedDay = JSON.parse(JSON.stringify(dayData));

    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                const exerciseId = exerciseRef.exerciseId || exerciseRef.id;
                const libraryDetails = state.exerciseLibrary[exerciseId];

                if (exerciseRef.name && libraryDetails && exerciseRef.name !== libraryDetails.name) {
                    console.log(`🔍 [Hydration] Mixer swap detected: ${exerciseRef.name} (from mixer) vs ${libraryDetails.name} (from library)`);
                }

                if (!libraryDetails) {
                    console.warn(`⚠️ Ostrzeżenie: Ćwiczenie ${exerciseId} jest w planie, ale brak go w bibliotece.`);
                    return exerciseRef;
                }

                const mergedExercise = {
                    ...libraryDetails,
                    ...exerciseRef,
                    categoryId: libraryDetails.categoryId,
                    difficultyLevel: libraryDetails.difficultyLevel
                };

                if (!mergedExercise.tempo_or_iso) {
                    mergedExercise.tempo_or_iso = libraryDetails.defaultTempo || "Kontrolowane";
                }

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

export const getExerciseDuration = (exercise) => {
    if (exercise.isRest) {
        return exercise.duration;
    }

    const text = (exercise.reps_or_time || '').trim().toLowerCase();

    const isUnilateralStr = text.includes('/str') || text.includes('stron');
    const isUnilateralProp = exercise.isUnilateral || false;
    const multiplier = (isUnilateralStr || isUnilateralProp) ? 2 : 1;

    const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
    if (minMatch) {
        const minutes = parseFloat(minMatch[1].replace(',', '.'));
        return Math.round(minutes * 60 * multiplier);
    }

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
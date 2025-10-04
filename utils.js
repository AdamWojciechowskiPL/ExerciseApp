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

export const getExerciseDuration = (exercise) => {
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
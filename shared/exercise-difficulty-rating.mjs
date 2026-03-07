export const DIFFICULTY_RATING = Object.freeze({
    EASY: -1,
    NEUTRAL: 0,
    HARD: 1
});

export function mapDifficultySelectionToRating(selectionType) {
    if (selectionType === 'easy') return DIFFICULTY_RATING.EASY;
    if (selectionType === 'hard') return DIFFICULTY_RATING.HARD;
    return DIFFICULTY_RATING.NEUTRAL;
}

export function normalizeDifficultyRating(value) {
    const parsed = Number(value);
    if (parsed === DIFFICULTY_RATING.EASY || parsed === DIFFICULTY_RATING.NEUTRAL || parsed === DIFFICULTY_RATING.HARD) {
        return parsed;
    }
    return null;
}

export function buildExerciseDifficultyRatingsPayload(difficultyByExercise) {
    if (!difficultyByExercise || typeof difficultyByExercise !== 'object') return [];

    return Object.entries(difficultyByExercise)
        .map(([exerciseId, rawRating]) => {
            const difficultyRating = normalizeDifficultyRating(rawRating);
            if (!exerciseId || difficultyRating === null) return null;
            return { exerciseId, difficultyRating };
        })
        .filter(Boolean);
}

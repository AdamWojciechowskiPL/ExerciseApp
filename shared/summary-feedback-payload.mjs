const SCORE_LIKE = 15;
const SCORE_DISLIKE = -30;

export function buildExerciseRatingsPayload(affinityDeltasByExerciseId = {}, exerciseIds = []) {
    const ratings = [];

    exerciseIds.forEach((exerciseId) => {
        const delta = affinityDeltasByExerciseId[exerciseId];
        if (delta === SCORE_LIKE) {
            ratings.push({ exerciseId, action: 'like' });
        } else if (delta === SCORE_DISLIKE) {
            ratings.push({ exerciseId, action: 'dislike' });
        }
    });

    return ratings;
}


import { state } from '../state.js';
import { focus } from '../dom.js';
import { getIsCasting, sendTrainingStateUpdate } from '../cast.js';
import { processSVG } from '../utils.js';

function findNextWorkExercise(startIndex) {
    for (let i = startIndex + 1; i < state.flatExercises.length; i++) {
        if (state.flatExercises[i].isWork) return state.flatExercises[i];
    }
    return null;
}

export function syncStateToChromecast() {
    if (!getIsCasting()) return;

    const exercise = state.flatExercises[state.currentExerciseIndex];
    if (!exercise) return;

    const nextWorkExercise = findNextWorkExercise(state.currentExerciseIndex);

    const payload = {
        sectionName: exercise.sectionName || '',
        timerValue: focus.timerDisplay?.textContent || '0:00',
        exerciseName: exercise.isWork ? `${exercise.name} (Seria ${exercise.currentSet}/${exercise.totalSets})` : exercise.name,
        exerciseDetails: exercise.isWork
            ? `Cel: ${exercise.reps_or_time} | Tempo: ${exercise.tempo_or_iso}`
            : `Następne: ${(state.flatExercises[state.currentExerciseIndex + 1] || {}).name || ''}`,
        nextExercise: nextWorkExercise ? nextWorkExercise.name : 'Koniec',
        isRest: !exercise.isWork,
        animationSvg: exercise.animationSvg ? processSVG(exercise.animationSvg) : null
    };

    sendTrainingStateUpdate(payload);
}

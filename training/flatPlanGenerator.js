import { parseSetCount, calculateSmartRest } from '../utils.js';

export function generateFlatExercises(dayData, restFactor = 1.0) {
    const plan = [];
    const restBetweenSections = Math.round(60 * restFactor);

    let unilateralGlobalIndex = 0;
    let globalStepCounter = 0;

    const sections = [
        { name: 'Rozgrzewka', exercises: dayData.warmup || [] },
        { name: 'Część główna', exercises: dayData.main || [] },
        { name: 'Schłodzenie', exercises: dayData.cooldown || [] }
    ];

    sections.forEach((section, sectionIndex) => {
        section.exercises.forEach((exercise, exerciseIndex) => {
            const totalSetsDeclared = parseSetCount(exercise.sets);
            const isUnilateral =
                exercise.isUnilateral ||
                exercise.is_unilateral ||
                String(exercise.reps_or_time).includes('/str') ||
                String(exercise.reps_or_time).includes('stron');

            const forcedTransitionBase = 12;
            const finalTransitionTime = Math.max(5, Math.round(forcedTransitionBase * restFactor));
            const smartRestTime = calculateSmartRest(exercise, restFactor);

            let loopLimit = totalSetsDeclared;
            let displayTotalSets = totalSetsDeclared;

            if (isUnilateral && totalSetsDeclared > 0) {
                loopLimit = Math.ceil(totalSetsDeclared / 2);
                displayTotalSets = totalSetsDeclared % 2 === 0 ? totalSetsDeclared / 2 : loopLimit;
            }

            let startSide = 'Lewa';
            let secondSide = 'Prawa';

            if (isUnilateral) {
                if (unilateralGlobalIndex % 2 !== 0) {
                    startSide = 'Prawa';
                    secondSide = 'Lewa';
                }
                unilateralGlobalIndex++;
            }

            let singleSideDuration = 0;
            let singleSideRepsOrTime = exercise.reps_or_time;

            if (isUnilateral) {
                const text = String(exercise.reps_or_time).toLowerCase();
                singleSideRepsOrTime = exercise.reps_or_time.replace(/\/str\.?|\s*stron.*/gi, '').trim();

                if (text.includes('s') || text.includes('min')) {
                    const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min/);
                    if (minMatch) {
                        singleSideDuration = parseFloat(minMatch[1].replace(',', '.')) * 60;
                    } else {
                        const secMatch = text.match(/(\d+)/);
                        if (secMatch) singleSideDuration = parseInt(secMatch[0], 10);
                    }
                }
            }

            for (let i = 1; i <= loopLimit; i++) {
                if (isUnilateral) {
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: displayTotalSets,
                        name: `${exercise.name} (${startSide})`,
                        reps_or_time: singleSideRepsOrTime,
                        duration: singleSideDuration > 0 ? singleSideDuration : undefined,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });

                    plan.push({
                        name: 'Zmiana Strony',
                        isRest: true,
                        isWork: false,
                        duration: finalTransitionTime,
                        sectionName: 'Przejście',
                        description: `Przygotuj stronę: ${secondSide}`,
                        uniqueId: `rest_transition_${globalStepCounter++}`
                    });

                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: displayTotalSets,
                        name: `${exercise.name} (${secondSide})`,
                        reps_or_time: singleSideRepsOrTime,
                        duration: singleSideDuration > 0 ? singleSideDuration : undefined,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });
                } else {
                    plan.push({
                        ...exercise,
                        isWork: true,
                        sectionName: section.name,
                        currentSet: i,
                        totalSets: totalSetsDeclared,
                        uniqueId: `${exercise.id || exercise.exerciseId}_step${globalStepCounter++}`
                    });
                }

                if (i < loopLimit) {
                    const interSetRest = isUnilateral ? Math.max(smartRestTime, finalTransitionTime) : smartRestTime;
                    plan.push({
                        name: 'Odpoczynek',
                        isRest: true,
                        isWork: false,
                        duration: interSetRest,
                        sectionName: 'Przerwa między seriami',
                        uniqueId: `rest_set_${globalStepCounter++}`
                    });
                }
            }

            const isLastExerciseInSection = exerciseIndex === section.exercises.length - 1;
            const isLastSection = sectionIndex === sections.length - 1;

            if (!isLastExerciseInSection) {
                plan.push({
                    name: 'Przerwa',
                    isRest: true,
                    isWork: false,
                    duration: smartRestTime,
                    sectionName: 'Przerwa',
                    uniqueId: `rest_exercise_${globalStepCounter++}`
                });
            } else if (!isLastSection) {
                const nextSectionName = sections[sectionIndex + 1].name;
                plan.push({
                    name: `Start: ${nextSectionName}`,
                    isRest: true,
                    isWork: false,
                    duration: restBetweenSections,
                    sectionName: 'Zmiana Sekcji',
                    description: 'Przygotuj sprzęt do kolejnej części.',
                    uniqueId: `rest_section_${globalStepCounter++}`
                });
            }
        });
    });

    if (plan.length > 0 && plan[plan.length - 1].isRest) {
        plan.pop();
    }

    return plan;
}

import { state } from './state.js';

// --- SVG SANITIZER ---
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

export const shouldSynchronizePlan = (plan) => {
    if (!plan || !plan.days || plan.days.length === 0) return { needed: true, reason: 'missing_plan' };
    const todayISO = getISODate(new Date());
    const hasToday = plan.days.some(d => d.date === todayISO);
    if (!hasToday) return { needed: true, reason: 'missing_today' };
    const lastDayEntry = plan.days[plan.days.length - 1];
    if (!lastDayEntry.date) return { needed: true, reason: 'corrupt_data' };
    const lastDate = new Date(lastDayEntry.date);
    const bufferThresholdDate = new Date();
    bufferThresholdDate.setDate(bufferThresholdDate.getDate() + 3);
    lastDate.setHours(0,0,0,0);
    bufferThresholdDate.setHours(0,0,0,0);
    if (lastDate < bufferThresholdDate) {
        return { needed: true, reason: 'buffer_low' };
    }
    return { needed: false, reason: null };
};

export const getActiveTrainingPlan = () => {
    return state.settings.dynamicPlanData;
};

export const getHydratedDay = (dayData) => {
    if (!dayData) return null;
    const hydratedDay = JSON.parse(JSON.stringify(dayData));
    ['warmup', 'main', 'cooldown'].forEach(section => {
        if (hydratedDay[section]) {
            hydratedDay[section] = hydratedDay[section].map(exerciseRef => {
                const exerciseId = exerciseRef.exerciseId || exerciseRef.id;
                const libraryDetails = state.exerciseLibrary[exerciseId];
                if (!libraryDetails) return exerciseRef;
                const mergedExercise = {
                    ...libraryDetails,
                    ...exerciseRef,
                    categoryId: libraryDetails.categoryId,
                    difficultyLevel: libraryDetails.difficultyLevel
                };
                if (!mergedExercise.tempo_or_iso) mergedExercise.tempo_or_iso = libraryDetails.defaultTempo || "Kontrolowane";
                if (mergedExercise.is_unilateral === undefined) mergedExercise.is_unilateral = libraryDetails.isUnilateral || false;
                
                // TASK 3: Propagate requiresSideSwitch
                if (mergedExercise.requiresSideSwitch === undefined) {
                    mergedExercise.requiresSideSwitch = !!libraryDetails.requiresSideSwitch;
                }

                // --- PRIORYTET DLA DANYCH Z PLANU (BACKEND) ---
                if (!mergedExercise.restAfterExercise) {
                    // Fallback jeśli plan jest stary i nie ma tych danych
                    if (mergedExercise.calculated_timing) {
                        mergedExercise.restAfterExercise = mergedExercise.calculated_timing.rest_sec;
                        mergedExercise.transitionTime = mergedExercise.calculated_timing.transition_sec;
                    } else if (libraryDetails.baseRestSeconds) {
                        mergedExercise.restAfterExercise = libraryDetails.baseRestSeconds;
                        mergedExercise.transitionTime = libraryDetails.baseTransitionSeconds || (mergedExercise.requiresSideSwitch ? 12 : 5);
                    } else {
                        mergedExercise.restAfterExercise = 30; // Absolutny fallback
                        mergedExercise.transitionTime = 5;
                    }
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

const parseRepsOrTime = (val) => {
    const t = String(val || '').trim().toLowerCase();
    // FIX: Tutaj też sanityzujemy, chociaż ta funkcja jest prosta
    if (t.includes('s') && !t.includes('/str')) return Math.max(5, parseInt(t, 10) || 30);
    if (t.includes('min')) return Math.max(10, (parseInt(t, 10) || 1) * 60);
    return parseInt(t, 10) || 10;
};

export const calculateSmartRest = (exercise, userRestFactor = 1.0) => {
    // To jest "intra-set rest" (pomiędzy seriami TEGO SAMEGO ćwiczenia)
    // Zgodnie z backendem: intra-set rest = restAfterExercise (chyba że conditioning interval)

    if (exercise.restBetweenSets) {
        return Math.round(parseInt(exercise.restBetweenSets, 10) * userRestFactor);
    }

    let baseRest = 30;
    if (exercise.restAfterExercise) {
        baseRest = exercise.restAfterExercise;
    } else if (exercise.calculated_timing && exercise.calculated_timing.rest_sec) {
        baseRest = exercise.calculated_timing.rest_sec;
    } else if (exercise.baseRestSeconds) {
        baseRest = exercise.baseRestSeconds;
    }

    return Math.max(10, Math.round(baseRest * userRestFactor));
};

// --- FIX: POPRAWIONA LOGIKA OBLICZANIA CZASU (ZGODNOŚĆ Z BACKENDEM + LOGI) ---
export const calculateSmartDuration = (dayPlan) => {
    if (!dayPlan) return 0;

    const globalSpr = state.settings.secondsPerRep || 6;
    const restFactor = state.settings.restTimeFactor || 1.0;

    // --- LOG START ---
    console.groupCollapsed(`⏱️ FRONTEND TIMING AUDIT (RestFactor: ${restFactor}, SPR: ${globalSpr})`);
    console.log(`   + Global Session Start Buffer: 5s`);
    // --- LOG END ---

    const allExercises = [
        ...(dayPlan.warmup || []),
        ...(dayPlan.main || []),
        ...(dayPlan.cooldown || [])
    ];

    // Global buffer startowy (zgodnie z backendem)
    let totalSeconds = 5;

    allExercises.forEach((ex, index) => {
        const sets = parseSetCount(ex.sets);
        const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');
        const multiplier = isUnilateral ? 2 : 1;

        const exId = ex.id || ex.exerciseId;
        let tempoToUse = globalSpr;

        if (state.exercisePace && state.exercisePace[exId]) {
            tempoToUse = state.exercisePace[exId];
        }

        let workTimePerSet = 0;
        let typeLabel = "Time"; // Do logów

        // --- FIX: SANITYZACJA PRZED SPRAWDZENIEM TYPU ---
        const rawStr = String(ex.reps_or_time).toLowerCase();
        const cleanStr = rawStr.replace(/\/str\.?|stron.*/g, '').trim();

        if (cleanStr.includes('s') || cleanStr.includes('min') || cleanStr.includes(':')) {
            // Czasówka
            workTimePerSet = parseRepsOrTime(cleanStr) * multiplier;
        } else {
            // Powtórzenia
            const reps = parseRepsOrTime(cleanStr);
            workTimePerSet = reps * tempoToUse * multiplier;
            typeLabel = "Reps";
        }

        let exDuration = sets * workTimePerSet;

        const restBase = ex.restAfterExercise || 30;
        const smartRestTime = Math.round(restBase * restFactor);

        let intraSetRestLog = 0; // Do logów

        if (sets > 1) {
            exDuration += (sets - 1) * smartRestTime;
            intraSetRestLog = smartRestTime;
        }

        // TASK 3: Use requiresSideSwitch for transition logic
        let transitionTime = 0;
        if (ex.transitionTime) {
            transitionTime = ex.transitionTime;
        } else if (ex.calculated_timing && ex.calculated_timing.transition_sec) {
            transitionTime = ex.calculated_timing.transition_sec;
        } else {
            // Frontend fallback based on data (requiresSideSwitch overrides explicit unilateral)
            transitionTime = (ex.requiresSideSwitch || (ex.calculated_timing && ex.calculated_timing.transition_sec === 12)) ? 12 : 5;
        }

        const transitionsTotal = sets * transitionTime;
        exDuration += transitionsTotal;

        // --- LOG EXERCISE ---
        console.log(`[Ex] ${ex.name} [${typeLabel}]: ${sets}x(${Math.round(workTimePerSet)}s work + ${intraSetRestLog}s rest) + ${transitionsTotal}s transition = ${Math.round(exDuration)}s`);
        // --- LOG END ---

        totalSeconds += exDuration;

        // Rest after exercise (zanim zacznie się następne)
        if (index < allExercises.length - 1) {
            totalSeconds += smartRestTime;
            // --- LOG REST AFTER ---
            console.log(`   + Rest After Exercise: ${smartRestTime}s`);
            // --- LOG END ---
        }
    });

    // --- LOG TOTAL ---
    const totalMinutes = Math.round(totalSeconds / 60);
    console.log(`%c=== TOTAL: ${totalSeconds}s (${totalMinutes} min) ===`, 'color: #0ea5e9; font-weight: bold;');
    console.groupEnd();
    // --- LOG END ---

    return totalMinutes;
};

// --- FIX: POPRAWIONA LOGIKA OBLICZANIA OBCIĄŻENIA ---
export const calculateSystemLoad = (inputData, fromHistory = false) => {
    if (!inputData) return 0;

    let exercises = [];

    if (!fromHistory && (inputData.warmup || inputData.main || inputData.cooldown)) {
        exercises = [
            ...(inputData.warmup || []),
            ...(inputData.main || []),
            ...(inputData.cooldown || [])
        ];
    }
    else if (Array.isArray(inputData)) {
        exercises = inputData.filter(ex => {
            if (fromHistory) return ex.status === 'completed' && !ex.isRest;
            return true;
        });
    }

    if (exercises.length === 0) return 0;

    const globalSpr = state.settings.secondsPerRep || 6;
    let totalWorkSeconds = 0;
    let weightedDifficultySum = 0;

    exercises.forEach(ex => {
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);
        let multiplier = 1;
        if (!fromHistory) {
            const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');
            if (isUnilateral) multiplier = 2;
        }

        let sets = 1;
        if (!fromHistory) {
            sets = parseSetCount(ex.sets);
        }

        let singleSetWorkTime = 0;

        // --- FIX: SANITYZACJA ---
        const rawStr = String(ex.reps_or_time).toLowerCase();
        const cleanStr = rawStr.replace(/\/str\.?|stron.*/g, '').trim();

        if (cleanStr.includes('s') || cleanStr.includes('min') || cleanStr.includes(':')) {
            singleSetWorkTime = parseRepsOrTime(cleanStr);
        } else {
            singleSetWorkTime = parseRepsOrTime(cleanStr) * globalSpr;
        }

        const totalExWorkTime = singleSetWorkTime * sets * multiplier;

        totalWorkSeconds += totalExWorkTime;
        weightedDifficultySum += (difficulty * totalExWorkTime);
    });

    if (totalWorkSeconds === 0) return 0;

    const avgDifficulty = weightedDifficultySum / totalWorkSeconds;
    // Referencja: 60 minut pracy (3600s) przy średniej trudności 2.0 = 7200 punktów
    const maxScoreRef = 7200;
    const rawScore = (avgDifficulty * totalWorkSeconds);

    let score = Math.round((rawScore / maxScoreRef) * 100);
    return Math.min(100, Math.max(1, score));
};

export const calculateClinicalProfile = (dayPlan) => {
    if (!dayPlan) return [];
    let maxSpine = 0; let maxKnee = 0; let maxImpact = 0;
    const mainEx = dayPlan.main || [];
    mainEx.forEach(ex => {
        const spine = (ex.spineLoadLevel || 'low').toLowerCase();
        if (spine === 'high') maxSpine = Math.max(maxSpine, 2); else if (spine === 'medium' || spine === 'moderate') maxSpine = Math.max(maxSpine, 1);
        const knee = (ex.kneeLoadLevel || 'low').toLowerCase();
        if (knee === 'high') maxKnee = Math.max(maxKnee, 2); else if (knee === 'medium') maxKnee = Math.max(maxKnee, 1);
        const imp = (ex.impactLevel || 'low').toLowerCase();
        if (imp === 'high') maxImpact = Math.max(maxImpact, 2); else if (imp === 'moderate') maxImpact = Math.max(maxImpact, 1);
    });
    const tags = [];
    if (maxImpact === 2) tags.push({ label: 'High Impact', color: 'red' }); else if (maxImpact === 0 && mainEx.length > 0) tags.push({ label: 'Low Impact', color: 'green' });
    if (maxSpine === 2) tags.push({ label: 'Spine Load', color: 'orange' });
    if (maxKnee === 2) tags.push({ label: 'Knee Load', color: 'orange' });
    if (tags.length === 0 && mainEx.length > 0) tags.push({ label: 'Joint Friendly', color: 'green' });
    return tags;
};

export const getSessionFocus = (dayPlan) => {
    if (!dayPlan || !dayPlan.main) return 'Ogólnorozwojowy';
    const counts = {};
    dayPlan.main.forEach(ex => {
        const cat = (ex.categoryId || '').toLowerCase();
        let group = 'Ogólne';
        if (cat.includes('core') || cat.includes('abs')) group = 'Core / Brzuch';
        else if (cat.includes('glute') || cat.includes('hip') || cat.includes('hinge')) group = 'Biodra / Pośladki';
        else if (cat.includes('spine') || cat.includes('mobility') || cat.includes('thoracic')) group = 'Mobilność';
        else if (cat.includes('strength') || cat.includes('push') || cat.includes('pull') || cat.includes('squat') || cat.includes('lunge')) group = 'Siła';
        else if (cat.includes('nerve') || cat.includes('neuro')) group = 'Neuro';
        else if (cat.includes('balance') || cat.includes('stability')) group = 'Stabilizacja';
        else if (cat.includes('conditioning') || cat.includes('cardio')) group = 'Kondycja';
        counts[group] = (counts[group] || 0) + 1;
    });
    if (Object.keys(counts).length === 0) return 'Ogólnorozwojowy';
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
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
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${number} sekundy`;
        return `${number} sekund`;
    });
    formattedText = formattedText.replace(/(\d+)\s*min\b/g, (match, numberStr) => {
        const number = parseInt(numberStr, 10);
        if (number === 1) return `${number} minuta`;
        const lastDigit = number % 10;
        const lastTwoDigits = number % 100;
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${number} minuty`;
        return `${number} minut`;
    });
    if (/^[\d\s-]+$/.test(formattedText.trim())) {
        const numbers = formattedText.match(/\d+/g);
        if (numbers) {
            const lastNumber = parseInt(numbers[numbers.length - 1], 10);
            if (lastNumber === 1) formattedText += ' powtórzenie';
            else {
                const lastDigit = lastNumber % 10;
                const lastTwoDigits = lastNumber % 100;
                if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) formattedText += ' powtórzenia';
                else formattedText += ' powtórzeń';
            }
        }
    }
    return formattedText;
};
// ExerciseApp/utils.js
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
    lastDate.setHours(0, 0, 0, 0);
    bufferThresholdDate.setHours(0, 0, 0, 0);
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

                // --- PRIORYTET DLA DANYCH Z PLANU (BACKEND) ---
                if (!mergedExercise.restAfterExercise) {
                    if (mergedExercise.calculated_timing) {
                        mergedExercise.restAfterExercise = mergedExercise.calculated_timing.rest_sec;
                        mergedExercise.transitionTime = mergedExercise.calculated_timing.transition_sec;
                    } else if (libraryDetails.baseRestSeconds) {
                        mergedExercise.restAfterExercise = libraryDetails.baseRestSeconds;
                        mergedExercise.transitionTime = libraryDetails.baseTransitionSeconds || (mergedExercise.is_unilateral ? 12 : 5);
                    } else {
                        mergedExercise.restAfterExercise = 30; // Fallback
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
    if (t.includes('s') && !t.includes('/str')) return Math.max(5, parseInt(t, 10) || 30);
    if (t.includes('min')) return Math.max(10, (parseInt(t, 10) || 1) * 60);
    return parseInt(t, 10) || 10;
};

export const calculateSmartRest = (exercise, userRestFactor = 1.0) => {
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

// --- SIMPLIFIED UNILATERAL LOGIC ---
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

    let totalSeconds = 5;

    allExercises.forEach((ex, index) => {
        const rawSets = parseSetCount(ex.sets);
        const isUnilateral = ex.isUnilateral || ex.is_unilateral || String(ex.reps_or_time).includes('/str');

        // Synchronizacja z training.js: Jeśli unilateral, dzielimy liczbę serii przez 2 (zaokrąglając w górę).
        const sets = isUnilateral ? Math.ceil(rawSets / 2) : rawSets;

        const exId = ex.id || ex.exerciseId;
        let tempoToUse = globalSpr;

        if (state.exercisePace && state.exercisePace[exId]) {
            tempoToUse = state.exercisePace[exId];
        }

        // 1. Obliczanie Czasu Pracy (Work Time)
        let singleSideWorkTime = 0;
        let typeLabel = "Time";

        const rawStr = String(ex.reps_or_time).toLowerCase();
        const cleanStr = rawStr.replace(/\/str\.?|stron.*/g, '').trim();

        if (cleanStr.includes('s') || cleanStr.includes('min') || cleanStr.includes(':')) {
            singleSideWorkTime = parseRepsOrTime(cleanStr);
        } else {
            const reps = parseRepsOrTime(cleanStr);
            singleSideWorkTime = reps * tempoToUse;
            typeLabel = "Reps";
        }

        // Jeśli unilateral, mnożymy czas pracy x2 (L + P)
        const sidesMultiplier = isUnilateral ? 2 : 1;
        const totalWorkTime = sets * singleSideWorkTime * sidesMultiplier;

        // 2. Obliczanie Czasu Przejść (Transition)
        // Unilateral: ZAWSZE 12s na zmianę strony L->P (wewnątrz serii)
        // Bilateral: 0s
        const transitionPerSet = isUnilateral ? 12 : 0;
        const totalTransition = sets * transitionPerSet;

        // 3. Obliczanie Przerw (Rest)
        // Przerwa tylko pomiędzy pełnymi seriami (effective sets).
        const restBase = ex.restAfterExercise || 30;
        const smartRestTime = Math.round(restBase * restFactor);

        let effectiveRestTime = smartRestTime;
        if (isUnilateral) {
            // Czas przejścia (np. 12s * restFactor), minimum 5s
            const finalTransitionTime = Math.max(5, Math.round(12 * restFactor));
            effectiveRestTime = Math.max(smartRestTime, finalTransitionTime);
        }

        const totalRest = (sets > 1) ? (sets - 1) * effectiveRestTime : 0;

        // SUMA
        const exDuration = totalWorkTime + totalTransition + totalRest;

        // --- LOG EXERCISE ---
        console.log(`[Ex] ${ex.name} [${typeLabel}]: ${sets} eff.sets x (${Math.round(singleSideWorkTime * sidesMultiplier)}s work + ${transitionPerSet}s trans) + ${totalRest}s rest = ${Math.round(exDuration)}s`);
        // --- LOG END ---

        totalSeconds += exDuration;

        if (index < allExercises.length - 1) {
            totalSeconds += smartRestTime;
            console.log(`   + Rest After Exercise: ${smartRestTime}s`);
        }
    });

    const totalMinutes = Math.round(totalSeconds / 60);
    console.log(`%c=== TOTAL: ${totalSeconds}s (${totalMinutes} min) ===`, 'color: #0ea5e9; font-weight: bold;');
    console.groupEnd();

    return totalMinutes;
};

/**
 * SCIENCE-BASED LOAD CALCULATOR (Modified Foster Method)
 * Źródło: Foster et al. (2001), McGuigan et al. (2004)
 * Jednostka: Arbitrary Units (AU) = Czas (min) * RPE (1-10)
 */
export const calculateSystemLoad = (inputData, fromHistory = false) => {
    if (!inputData) return 0;

    // 1. Ekstrakcja listy ćwiczeń
    let exercises = [];
    if (!fromHistory && (inputData.warmup || inputData.main || inputData.cooldown)) {
        exercises = [
            ...(inputData.warmup || []),
            ...(inputData.main || []),
            ...(inputData.cooldown || [])
        ];
    } else if (Array.isArray(inputData)) {
        exercises = inputData.filter(ex => {
            if (fromHistory) return ex.status === 'completed' && !ex.isRest;
            return true;
        });
    }

    if (exercises.length === 0) return 0;

    let totalLoadAU = 0;

    // 2. Pobranie globalnego tempa (jeśli brak specyficznego)
    const globalSpr = state.settings.secondsPerRep || 6;

    exercises.forEach(ex => {
        // --- A. Mapowanie Difficulty (1-5) na RPE (1-10) ---
        // Zgodnie ze skalą Borga CR10, wzrost nie jest liniowy.
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);
        // Mapowanie: Lvl 1->2, Lvl 2->4, Lvl 3->6, Lvl 4->8, Lvl 5->10
        let rpe = difficulty * 2;

        // --- B. Korekta Metaboliczna (Badanie: Senna et al.) ---
        // Ćwiczenia o wysokiej intensywności metabolicznej (krótkie przerwy) są bardziej obciążające.
        const metabolicIntensity = parseInt(ex.metabolicIntensity || 1, 10);
        if (metabolicIntensity >= 3) {
            rpe += 1.5; // Bonus za "zadyszkę"
        }

        // Clamp RPE do logicznych ram (max 10)
        rpe = Math.min(10, Math.max(1, rpe));

        // --- C. Obliczanie Czasu Pracy (Time Under Tension) ---
        // To jest nasz "Czas Trwania" do wzoru Fostera.

        let sets = 1;
        let multiplier = 1; // Mnożnik dla Unilateral

        if (!fromHistory) {
            const isUnilateral = ex.isUnilateral || String(ex.reps_or_time).includes('/str');
            if (isUnilateral) multiplier = 2; // Lewa + Prawa to 2x więcej czasu pracy
            sets = parseSetCount(ex.sets);

            // Korekta zgodna z Twoją logiką w training.js (jeśli sets obejmuje obie strony, dzielimy)
            // Ale dla Load interesuje nas CAŁKOWITA liczba wykonanych serii (work bouts).
            // Jeśli w planie jest "3 serie" (oznaczające 3xL + 3xP), to realnie mamy 6 okresów pracy.
            // W training.js pętla jest do `sets`, więc tutaj `sets` to liczba powtórzeń pętli.
            // Jeśli unilateral: sets = "3" oznacza 3 pętle (L+P). Czyli 3 * 2 * czas.
            // Zostawiamy multiplier = 2.
        } else {
            sets = 1; // W historii każdy wpis to osobna wykonana seria
        }

        let durationSeconds = 0;
        const rawStr = String(ex.reps_or_time).toLowerCase();
        const cleanStr = rawStr.replace(/\/str\.?|stron.*/g, '').trim();

        if (cleanStr.includes('s') || cleanStr.includes('min')) {
            // Czasówka
            if (cleanStr.includes('min')) durationSeconds = parseFloat(cleanStr) * 60;
            else durationSeconds = parseInt(cleanStr) || 30;
        } else {
            // Powtórzenia -> Estymacja czasu (TUT)
            let pace = globalSpr;
            // Adaptive Pacing (Personalizacja)
            const exId = ex.id || ex.exerciseId;
            if (state.exercisePace && state.exercisePace[exId]) {
                pace = state.exercisePace[exId];
            } else if (ex.tempo_or_iso) {
                // Próba parsowania tempa "3-0-1"
                const tempoMatch = ex.tempo_or_iso.match(/(\d+)-(\d+)-(\d+)/);
                if (tempoMatch) {
                    pace = parseInt(tempoMatch[1]) + parseInt(tempoMatch[2]) + parseInt(tempoMatch[3]);
                }
            }

            const reps = parseInt(cleanStr) || 10;
            durationSeconds = reps * pace;
        }

        // Całkowity czas pracy w minutach dla tego ćwiczenia
        const totalWorkMinutes = (durationSeconds * sets * multiplier) / 60;

        // Wzór Fostera: Load = Minutes * RPE
        totalLoadAU += (totalWorkMinutes * rpe);
    });

    // 3. Ustalenie Pojemności Użytkownika (Capacity)
    // Aby wyliczyć %, musimy wiedzieć, ile AU to "100% możliwości" danego usera.
    const experience = state.settings.wizardData?.exercise_experience || 'regular';

    // Referencyjne wartości AU dla 100% obciążenia sesji (tzw. Maximum Recoverable Volume na sesję)
    const capacityTable = {
        'none': 250,       // np. 50 min lekkiej pracy (RPE 5)
        'occasional': 400, // np. 60 min średniej pracy (RPE 6-7)
        'regular': 600,    // np. 75 min ciężkiej pracy (RPE 8)
        'advanced': 850    // np. 90+ min ciężkiej pracy
    };

    const userCapacity = capacityTable[experience] || 500;

    // 4. Wynik procentowy
    let loadPercent = Math.round((totalLoadAU / userCapacity) * 100);

    // Safety clamp (aby nie straszyć usera wynikami > 120%)
    return Math.min(120, Math.max(1, loadPercent));
};

export const calculateClinicalProfile = (dayPlan) => {
    if (!dayPlan) return [];
    let maxSpine = 0; let maxKnee = 0; let maxImpact = 0;
    const mainEx = dayPlan.main || [];
    mainEx.forEach(ex => {
        const spine = (ex.spineLoadLevel || 'low').toLowerCase();
        if (spine === 'high') maxSpine = Math.max(maxSpine, 2); else if (spine === 'medium') maxSpine = Math.max(maxSpine, 1);
        const knee = (ex.kneeLoadLevel || 'low').toLowerCase();
        if (knee === 'high') maxKnee = Math.max(maxKnee, 2); else if (knee === 'medium') maxKnee = Math.max(maxKnee, 1);
        const imp = (ex.impactLevel || 'low').toLowerCase();
        if (imp === 'high') maxImpact = Math.max(maxImpact, 2); else if (imp === 'medium') maxImpact = Math.max(maxImpact, 1);
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

// --- CONSOLIDATED STORAGE HELPER ---
export const savePlanToStorage = (plan, date = null) => {
    try {
        const dateKey = date || getISODate(new Date());
        const storageKey = `todays_plan_cache_${dateKey}`;
        localStorage.setItem(storageKey, JSON.stringify(plan));
    } catch (e) {
        console.error("Błąd zapisu planu:", e);
    }
};
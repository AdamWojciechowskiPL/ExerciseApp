import { state } from './state.js';
import { checkExerciseAvailability, buildClinicalContext } from './clinicalEngine.js';
import { getISODate } from './utils.js';

// --- Task F2: Symulacja Pacing Engine dla protokołów klienckich ---
const calculateLocalTiming = (ex, mode) => {
    let baseRest = 30;
    const cat = (ex.categoryId || '').toLowerCase();
    const load = parseInt(ex.difficultyLevel || 1, 10);

    // Nadpisania specyficzne dla trybów
    if (mode === 'sos' || mode === 'calm') baseRest = 20; // Wolniejsze tempo, ale nie siłowe
    else if (mode === 'booster' || mode === 'burn') baseRest = 15; // Krótkie przerwy
    else if (cat.includes('neuro')) baseRest = 35;
    else if (load >= 4) baseRest = 60;
    else if (cat.includes('mobility')) baseRest = 20;

    // SIMPLIFIED LOGIC: Unilateral always implies 12s transition
    const isUnilateral = ex.isUnilateral || String(ex.reps_or_time || '').includes('/str');
    const transitionSec = isUnilateral ? 12 : 5;

    return {
        rest_sec: baseRest,
        transition_sec: transitionSec
    };
};

/**
 * PROTOCOL GENERATOR v6.3 (Simplified Unilateral Logic)
 */

const ZONE_MAP = {
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant', 'lumbar_radiculopathy'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing', 'lumbar_radiculopathy'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation', 'femoral_nerve'] },
    'legs': { type: 'cat', keys: ['stretching', 'nerve_flossing'] },
    'knee': { type: 'mixed', keys: ['knee', 'knee_anterior', 'knee_stability', 'vmo_activation', 'terminal_knee_extension', 'eccentric_control'] },
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] },
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },
    'core': { type: 'cat', keys: ['core_anti_extension', 'core_anti_rotation', 'core_anti_flexion', 'core_anti_lateral_flexion'] },
    'glute': { type: 'cat', keys: ['glute_activation'] },
    'full_body': { type: 'all', keys: [] },
    'metabolic': { type: 'tag', keys: ['fat_loss', 'conditioning'] }
};

// Mapowanie Tryb Protokołu -> Kolumna w Bazie (CamelCase w Frontendzie)
const TEMPO_COLUMN_MAP = {
    'sos': 'tempoRehab',
    'neuro': 'tempoRehab',
    'calm': 'tempoControl',
    'flow': 'tempoMobility',
    'reset': 'tempoMobility',
    'ladder': 'tempoControl',
    'burn': 'tempoMetabolic',
    'booster': 'tempoStrength'
};

const TIMING_CONFIG = {
    'sos': { work: 60, rest: 15 },
    'reset': { work: 45, rest: 10 },
    'booster': { work: 40, rest: 20 },
    'calm': { work: 120, rest: 10 },
    'flow': { work: 40, rest: 5 },
    'neuro': { work: 25, rest: 20 },
    'ladder': { work: 50, rest: 20 },
    'burn': { work: 30, rest: 15 }
};

const DEFAULT_MAX_DURATION = 60;
const DEFAULT_MAX_REPS = 15;

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v6.3: ${mode} / ${focusZone}`);

    // --- CNS SAFETY NET LOGIC (INTEGRATED WITH BACKEND METRICS) ---
    let actualMode = mode;
    let safetyMessage = null;

    const fatigueScore = state.userStats?.fatigueScore || 0;
    const highLoadModes = ['burn', 'booster', 'ladder'];

    if (highLoadModes.includes(mode)) {
        if (fatigueScore >= 80) {
            console.warn(`[ProtocolGenerator] 🛡️ CRITICAL FATIGUE (${fatigueScore}). Forcing CALM.`);
            actualMode = 'calm';
            focusZone = 'sleep';
            safetyMessage = `🚨 ALARM PRZETRENOWANIA (Score: ${fatigueScore})\nTwój układ nerwowy jest przeciążony. Wymuszono tryb regeneracji (Calm), aby zapobiec kontuzji.`;
        }
        else if (fatigueScore >= 50) {
            safetyMessage = `⚠️ OSTRZEŻENIE (HIGH RISK)\nTwoje skumulowane zmęczenie wynosi ${fatigueScore}/120. Zalecamy zmianę na tryb "Flow" lub "Reset", jeśli nie czujesz się w pełni sił.`;
        }
        else if (fatigueScore >= 35) {
            safetyMessage = `ℹ️ INFO: Narastające zmęczenie (${fatigueScore}). Pamiętaj o technice i nie forsuj tempa ponad siły.`;
        }
    }
    // --- SAFETY INTERVENTION END ---

    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[actualMode] || TIMING_CONFIG['reset'];
    const globalRestFactor = state.settings.restTimeFactor || 1.0;

    const clinicalCtx = buildClinicalContext(userContext);
    clinicalCtx.blockedIds = new Set(state.blacklist || []);

    let candidates = getCandidates(actualMode, focusZone, { ignoreEquipment: false, clinicalCtx });

    if (candidates.length === 0) candidates = getCandidates(actualMode, focusZone, { ignoreEquipment: true, clinicalCtx });
    if (candidates.length === 0) candidates = getCandidatesSafeFallback(actualMode, clinicalCtx);
    if (candidates.length === 0) throw new Error("Brak bezpiecznych ćwiczeń.");

    // Wzbogacamy kandydatów o lokalny timing
    candidates.forEach(c => {
        c.calculated_timing = calculateLocalTiming(c, actualMode);
    });

    scoreCandidates(candidates, actualMode, userContext);

    const { sequence, generatedSeconds } = selectExercisesByMode(candidates, actualMode, targetSeconds, config, timeFactor, globalRestFactor);

    let finalTimeFactor = timeFactor;
    if (generatedSeconds > 0 && generatedSeconds < targetSeconds) {
        const stretchRatio = targetSeconds / generatedSeconds;
        finalTimeFactor = timeFactor * Math.min(stretchRatio, 3.0);
    }

    const flatExercises = buildSteps(sequence, config, actualMode, finalTimeFactor, globalRestFactor);

    const realTotalDuration = flatExercises.reduce((sum, step) => {
        const sets = parseInt(step.sets) || 1;
        const duration = step.duration || 0;
        const intraSetRest = Math.round((step.restBetweenSets || 15) * globalRestFactor);

        if (step.isWork) {
            return sum + (duration * sets) + ((sets - 1) * intraSetRest);
        }
        return sum + duration;
    }, 0);

    let finalDescription = generateDescription(actualMode, durationMin);
    if (safetyMessage) {
        finalDescription = `${safetyMessage}\n\n${finalDescription}`;
    }

    return {
        id: `proto_${actualMode}_${focusZone}_${Date.now()}`,
        title: generateTitle(actualMode, focusZone) + (actualMode !== mode ? " (Safety Override)" : ""),
        description: finalDescription,
        type: 'protocol',
        mode: actualMode,
        totalDuration: realTotalDuration,
        targetDuration: durationMin,
        xpReward: calculateXP(actualMode, durationMin),
        resilienceBonus: calculateResilienceBonus(actualMode),
        flatExercises: flatExercises
    };
}

function selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor, globalRestFactor) {
    const scaledRest = config.rest * globalRestFactor;
    const baseCycleTime = (config.work * timeFactor) + scaledRest;

    const maxSteps = Math.ceil(targetSeconds / baseCycleTime) + 15;

    let sequence = [];
    let currentSeconds = 0;
    const usedIds = new Set();

    const addToSequence = (ex) => {
        sequence.push(ex);
        usedIds.add(ex.id);
        const mult = (ex.isUnilateral || String(ex.reps_or_time).includes('/str')) ? 2 : 1;

        let cycleDuration = baseCycleTime;
        if (mode === 'burn' && ex.recommendedInterval) {
            const rec = ex.recommendedInterval;
            cycleDuration = (rec.work * timeFactor) + (rec.rest * timeFactor * globalRestFactor);
        }
        currentSeconds += cycleDuration * mult;
    };

    const runStrategy = (poolMain, poolFallback) => {
        let loop = 0;
        while (currentSeconds < targetSeconds && loop < maxSteps) {
            let ex = null;
            if (poolMain) ex = getStrictUnique(poolMain, usedIds);
            if (!ex && poolFallback) ex = getStrictUnique(poolFallback, usedIds);
            if (!ex) ex = getStrictUnique(candidates, usedIds);

            if (!ex) break;
            addToSequence(ex);
            loop++;
        }
    };

    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');
        runStrategy([...breathing, ...relax], candidates);
    }
    else if (mode === 'burn') {
        const highIntensity = candidates.filter(ex => (ex.metabolicIntensity || 1) >= 3);
        const mediumIntensity = candidates.filter(ex => (ex.metabolicIntensity || 1) === 2);
        runStrategy(highIntensity, mediumIntensity);
    }
    else {
        runStrategy(candidates, null);
    }

    return { sequence, generatedSeconds: currentSeconds };
}

function getStrictUnique(pool, usedIds) {
    if (!pool) return null;
    const available = pool.filter(ex => !usedIds.has(ex.id));
    if (available.length > 0) {
        const top = available.slice(0, Math.min(3, available.length));
        return top[Math.floor(Math.random() * top.length)];
    }
    return null;
}

// Helper do wyboru tempa
function resolveTempoForMode(ex, mode) {
    const targetColumn = TEMPO_COLUMN_MAP[mode];
    // 1. Sprawdź specyficzną kolumnę (np. tempoStrength)
    if (targetColumn && ex[targetColumn]) {
        return ex[targetColumn];
    }
    // 2. Fallback do defaultTempo
    if (ex.defaultTempo) {
        return ex.defaultTempo;
    }
    // 3. Ostateczny fallback
    return "Kontrolowane";
}

function buildSteps(exercises, config, mode, timeFactor, globalRestFactor) {
    const SECONDS_PER_REP_ESTIMATE = state.settings.secondsPerRep || 6;
    const INTRA_SET_REST = Math.round(15 * globalRestFactor);

    const steps = [];

    steps.push({
        name: "Start Protokołu",
        isWork: false,
        isRest: true,
        duration: 5,
        sectionName: "Start",
        description: generateDescription(mode, 0)
    });

    let driftCompensation = 0;

    exercises.forEach((ex, index) => {
        let baseWork = config.work * timeFactor;
        let transitionRest = Math.round(config.rest * timeFactor * globalRestFactor);

        if (mode === 'burn' && ex.recommendedInterval) {
            baseWork = ex.recommendedInterval.work * timeFactor;
            transitionRest = Math.round(ex.recommendedInterval.rest * timeFactor * globalRestFactor);
        }

        const randomJitter = 0.7 + (Math.random() * 0.6);
        const lvl = parseInt(ex.difficultyLevel || 1);
        let difficultyMod = 1.0;
        if (lvl >= 4) difficultyMod = 0.85;
        if (lvl === 1) difficultyMod = 1.15;

        let targetTotalSeconds = mode === 'burn'
            ? baseWork
            : (baseWork * randomJitter * difficultyMod) - (driftCompensation * 0.3);

        targetTotalSeconds = Math.max(15, targetTotalSeconds);

        // --- ZMIANA LOGIKI TEMPA ---
        const tempoDisplay = resolveTempoForMode(ex, mode);

        const rawReps = String(ex.reps_or_time || "").toLowerCase();
        const hasTimeUnits = rawReps.includes('s') || rawReps.includes('min');
        const tempoStr = (tempoDisplay || ex.defaultTempo || "").toLowerCase();
        const isIso = tempoStr.includes("izo") || tempoStr.includes("iso");
        const hasMaxDuration = (ex.maxDuration > 0) || (ex.max_recommended_duration > 0);

        const isTimeBased = hasTimeUnits || isIso || hasMaxDuration || mode === 'burn';
        const isRepBased = !isTimeBased;

        let sets = 1;
        let displayValue = "";
        let durationPerSet = 0;

        if (isRepBased) {
            let totalReps = Math.round(targetTotalSeconds / SECONDS_PER_REP_ESTIMATE);
            totalReps = Math.max(4, totalReps);
            const maxReps = ex.maxReps || ex.max_recommended_reps || DEFAULT_MAX_REPS;

            sets = Math.ceil(totalReps / maxReps);
            const repsPerSet = Math.max(4, Math.round(totalReps / sets));

            displayValue = `${repsPerSet}`;
            durationPerSet = Math.round(repsPerSet * SECONDS_PER_REP_ESTIMATE * 1.1);
        } else {
            let totalSeconds = Math.round(targetTotalSeconds);
            const maxDuration = ex.maxDuration || ex.max_recommended_duration || DEFAULT_MAX_DURATION;

            sets = Math.ceil(totalSeconds / maxDuration);
            const secondsPerSet = Math.round(totalSeconds / sets / 5) * 5;

            displayValue = `${secondsPerSet} s`;
            durationPerSet = secondsPerSet;
        }

        const totalDurationCreated = (durationPerSet * sets) + ((sets - 1) * INTRA_SET_REST);
        driftCompensation += (totalDurationCreated - baseWork);

        const isUnilateral = ex.isUnilateral || String(ex.reps_or_time).includes('/str');

        const createCompactStep = (suffix) => ({
            ...ex,
            exerciseId: ex.id,
            name: `${ex.name}${suffix}`,
            isWork: true,
            isRest: false,
            sets: sets.toString(),
            currentSet: 1,
            totalSets: sets,
            sectionName: mapModeToSectionName(mode),
            reps_or_time: displayValue,
            duration: durationPerSet,
            tempo_or_iso: tempoDisplay, // Używamy pobranego z bazy
            uniqueId: `${ex.id}_p${index}${suffix ? suffix.replace(/[\s()]/g, '') : ''}`,
            restBetweenSets: INTRA_SET_REST,
            calculated_timing: ex.calculated_timing
        });

        if (isUnilateral) {
            steps.push(createCompactStep(' (Lewa)'));

            // SIMPLIFIED LOGIC: Always insert transition for unilateral exercises
            const transitionTime = Math.max(5, Math.round(5 * globalRestFactor));
            steps.push({ name: "Zmiana Strony", isWork: false, isRest: true, duration: transitionTime, sectionName: "Przejście", description: "Druga strona" });

            steps.push(createCompactStep(' (Prawa)'));
        } else {
            steps.push(createCompactStep(''));
        }

        if (index < exercises.length - 1 && transitionRest > 0) {
            steps.push({
                name: getRestName(mode), isWork: false, isRest: true, duration: transitionRest, sectionName: "Przejście", description: `Następnie: ${exercises[index + 1].name}`
            });
        }
    });

    return steps;
}

function getCandidates(mode, focusZone, ctx = {}) {
    const { ignoreEquipment, clinicalCtx } = ctx;
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const zoneConfig = ZONE_MAP[focusZone];

    if (!zoneConfig) return [];

    return library.filter(ex => {
        const result = checkExerciseAvailability(ex, clinicalCtx, { ignoreEquipment });
        if (!result.allowed) {
            if (ignoreEquipment && result.reason === 'missing_equipment') { /* pass */ }
            else return false;
        }

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        if (mode === 'burn') {
            const hasTag = (ex.goalTags && (ex.goalTags.includes('fat_loss') || ex.goalTags.includes('conditioning')));
            const isCat = ex.categoryId === 'conditioning_low_impact';
            if (!hasTag && !isCat) return false;
            if ((ex.metabolicIntensity || 1) < 2) return false;
            return true;
        }

        if (mode === 'sos' && difficulty > 2) return false;
        if (mode === 'booster' && difficulty < 2) return false;
        if (mode === 'reset' && difficulty > 3) return false;

        if (focusZone === 'knee') {
            if (mode === 'sos') {
                if (ex.kneeLoadLevel === 'high' || ex.kneeLoadLevel === 'medium') return false;
            }
        }

        if (mode === 'calm') {
            if (difficulty > 2) return false;
            if (!['breathing_control', 'breathing', 'muscle_relaxation'].includes(ex.categoryId)) return false;
            if (ex.position && !['supine', 'sitting', 'side_lying'].includes(ex.position)) return false;
        }
        if (mode === 'flow') {
            if (difficulty > 3) return false;
            if (!['spine_mobility', 'hip_mobility', 'lumbar_extension_mobility', 'lumbar_rotation_mobility'].includes(ex.categoryId)) {
                if (!ex.painReliefZones || !ex.painReliefZones.includes(focusZone)) return false;
            }
        }
        if (mode === 'neuro') {
            if (difficulty > 3) return false;
            if (ex.categoryId !== 'nerve_flossing' && !(ex.painReliefZones && ex.painReliefZones.some(z => ['sciatica', 'lumbar_radiculopathy', 'femoral_nerve'].includes(z)))) return false;
        }
        if (mode === 'ladder') {
            if (difficulty > 3) return false;
        }

        if (mode === 'calm') return true;
        if (zoneConfig.type === 'zone') return ex.painReliefZones && ex.painReliefZones.some(z => zoneConfig.keys.includes(z));
        else if (zoneConfig.type === 'cat') return zoneConfig.keys.includes(ex.categoryId);
        else if (zoneConfig.type === 'mixed') return zoneConfig.keys.includes(ex.categoryId) || (ex.painReliefZones && ex.painReliefZones.some(z => zoneConfig.keys.includes(z)));
        else if (zoneConfig.type === 'tag') return ex.goalTags && ex.goalTags.some(t => zoneConfig.keys.includes(t));
        else if (zoneConfig.type === 'all') return true;
        return false;
    });
}

function getCandidatesSafeFallback(mode, clinicalCtx) {
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    return library.filter(ex => {
        const result = checkExerciseAvailability(ex, clinicalCtx, { ignoreEquipment: true, ignoreDifficulty: true });
        if (!result.allowed) return false;

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);
        if (mode === 'sos' && difficulty > 2) return false;
        if (mode === 'calm' && difficulty > 2) return false;
        return true;
    }).slice(0, 15);
}

function scoreCandidates(candidates, mode, userContext) {
    const recentSessions = userContext?.recentSessionIds || [];
    candidates.forEach(ex => {
        let score = 0;
        const pref = state.userPreferences[ex.id] || { score: 0 };
        score += (pref.score || 0);
        if (recentSessions.includes(ex.id)) score -= 50;
        if (mode === 'booster') score += (parseInt(ex.difficultyLevel || 1) * 5);
        if (mode === 'burn') {
            score += (ex.metabolicIntensity || 1) * 10;
            if (ex.conditioningStyle === 'interval') score += 15;
        }
        score += Math.random() * 20;
        ex._genScore = score;
    });
    candidates.sort((a, b) => b._genScore - a._genScore);
}

function generateTitle(mode, zone) {
    const zoneName = {
        'cervical': 'Szyja', 'thoracic': 'Plecy (Góra)', 'lumbar': 'Odcinek Lędźwiowy',
        'sciatica': 'Nerw Kulszowy', 'hips': 'Biodra', 'core': 'Brzuch / Core',
        'office': 'Anty-Biuro', 'sleep': 'Sen', 'glute': 'Pośladki', 'full_body': 'Całe Ciało',
        'legs': 'Nogi',
        'knee': 'Kolana',
        'metabolic': 'Kondycja'
    }[zone] || 'Bio-Protokół';
    const suffix = {
        'sos': 'Ratunkowy', 'booster': 'Power', 'reset': 'Flow',
        'calm': 'Wyciszenie', 'flow': 'Mobility Flow', 'neuro': 'Neuro-Ślizgi', 'ladder': 'Progresja',
        'burn': 'Fat Burner'
    }[mode] || '';
    return `${zoneName}: ${suffix}`;
}

function generateDescription(mode, duration) {
    if (mode === 'sos') return `Sesja ratunkowa (${duration} min). Ruchy powolne, bezbólowe.`;
    if (mode === 'calm') return `Głęboki relaks (${duration} min). Regulacja układu nerwowego.`;
    if (mode === 'neuro') return `Praca z układem nerwowym (${duration} min). Delikatne zakresy.`;
    if (mode === 'ladder') return `Budowanie techniki (${duration} min). Stopniowanie trudności.`;
    if (mode === 'booster') return `Intensywny trening (${duration} min). Utrzymuj technikę.`;
    if (mode === 'burn') return `Kondycja Low-Impact (${duration} min). Spalanie bez skoków.`;
    return `Regeneracja (${duration} min). Skup się na oddechu.`;
}

function mapModeToSectionName(mode) {
    if (mode === 'sos') return 'Terapia';
    if (mode === 'calm') return 'Wyciszenie';
    if (mode === 'booster') return 'Ogień';
    if (mode === 'ladder') return 'Wyzwanie';
    if (mode === 'burn') return 'Cardio';
    return 'Regeneracja';
}

function getRestName(mode) {
    if (mode === 'booster') return 'Szybka Przerwa';
    if (mode === 'burn') return 'Aktywna Przerwa';
    if (mode === 'calm') return 'Przejście';
    if (mode === 'flow') return 'Płynna zmiana';
    return 'Rozluźnienie';
}

function calculateXP(mode, minutes) {
    const base = minutes * 10;
    if (mode === 'booster') return Math.round(base * 1.5);
    if (mode === 'burn') return Math.round(base * 1.6);
    if (mode === 'ladder') return Math.round(base * 1.2);
    if (mode === 'calm') return Math.round(base * 0.6);
    return base;
}

function calculateResilienceBonus(mode) {
    if (mode === 'sos' || mode === 'reset') return 5;
    if (mode === 'calm') return 7;
    if (mode === 'neuro') return 6;
    if (mode === 'burn') return 8;
    return 1;
}
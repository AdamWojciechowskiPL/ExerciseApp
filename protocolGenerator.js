// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v5.0 (Natural Reps & Variance)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 *
 * ZMIANY v5.0:
 * - Natural Reps: Powtórzenia są liczone z dokładnego czasu (bez zaokrąglania do 5s),
 *   co daje większą różnorodność (np. 11, 12, 13 powt zamiast tylko 10, 15).
 * - Stronger Jitter: Zwiększona losowość czasowa (+/- 30%).
 * - Smart Rounding: Zaokrąglanie czasu tylko dla ćwiczeń "na czas".
 */

// ============================================================
// KONFIGURACJA (STREFY I TRYBY)
// ============================================================

const ZONE_MAP = {
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant', 'lumbar_radiculopathy'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing', 'lumbar_radiculopathy'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation', 'femoral_nerve'] },
    'legs': { type: 'cat', keys: ['stretching', 'nerve_flossing'] },
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] },
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },
    'core': { type: 'cat', keys: ['core_anti_extension', 'core_anti_rotation', 'core_anti_flexion'] },
    'glute': { type: 'cat', keys: ['glute_activation'] },
    'full_body': { type: 'all', keys: [] }
};

const TIMING_CONFIG = {
    'sos': { work: 60, rest: 15, tempo: 'Wolne / Oddechowe' },
    'reset': { work: 45, rest: 10, tempo: 'Płynne' },
    'booster': { work: 40, rest: 20, tempo: 'Dynamiczne' },
    'calm': { work: 120, rest: 10, tempo: 'Wolne / nos / przepona' },
    'flow': { work: 40, rest: 5, tempo: 'Płynne / kontrola zakresu' },
    'neuro': { work: 25, rest: 20, tempo: 'Delikatne / bez bólu' },
    'ladder': { work: 50, rest: 20, tempo: 'Technika / kontrola' }
};

const SECONDS_PER_REP_ESTIMATE = 4;

// ============================================================
// GŁÓWNA FUNKCJA GENERUJĄCA
// ============================================================

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v5.0 (Natural): ${mode} / ${focusZone}`);

    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];

    // 1. Dobór kandydatów
    let candidates = getCandidates(mode, focusZone, { ignoreEquipment: false, userContext });

    if (candidates.length === 0) {
        candidates = getCandidates(mode, focusZone, { ignoreEquipment: true, userContext });
    }
    if (candidates.length === 0) {
        candidates = getCandidatesSafeFallback(mode, userContext);
    }
    if (candidates.length === 0) {
        throw new Error("Brak bezpiecznych ćwiczeń.");
    }

    scoreCandidates(candidates, mode, userContext);

    // 2. Selekcja sekwencji
    const { sequence, generatedSeconds } = selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor);

    // 3. Time Stretch (Globalne skalowanie, jeśli brakuje czasu)
    let finalTimeFactor = timeFactor;
    if (generatedSeconds > 0 && generatedSeconds < targetSeconds) {
        const stretchRatio = targetSeconds / generatedSeconds;
        finalTimeFactor = timeFactor * Math.min(stretchRatio, 2.0); // Max x2
    }

    // 4. Budowa finalnego planu (Organic Variance w środku)
    const flatExercises = buildSteps(sequence, config, mode, finalTimeFactor);

    // 5. Finalny czas
    const realTotalDuration = flatExercises.reduce((sum, step) => sum + (step.duration || 0), 0);

    return {
        id: `proto_${mode}_${focusZone}_${Date.now()}`,
        title: generateTitle(mode, focusZone),
        description: generateDescription(mode, durationMin),
        type: 'protocol',
        mode: mode,
        totalDuration: realTotalDuration,
        xpReward: calculateXP(mode, durationMin),
        resilienceBonus: calculateResilienceBonus(mode),
        flatExercises: flatExercises
    };
}

// ============================================================
// LOGIKA SELEKCJI
// ============================================================

function selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor) {
    const baseCycleTime = (config.work + config.rest) * timeFactor;
    const maxSteps = Math.ceil(targetSeconds / baseCycleTime) + 15;

    let sequence = [];
    let currentSeconds = 0;
    const usedIds = new Set();

    const addToSequence = (ex) => {
        sequence.push(ex);
        usedIds.add(ex.id);
        const mult = (ex.isUnilateral || String(ex.reps_or_time).includes('/str')) ? 2 : 1;
        currentSeconds += baseCycleTime * mult;
    };

    const runStrategy = (poolMain, poolFallback) => {
        let loop = 0;
        while (currentSeconds < targetSeconds && loop < maxSteps) {
            let ex = null;
            if (poolMain) ex = getStrictUnique(poolMain, usedIds);
            if (!ex && poolFallback) ex = getStrictUnique(poolFallback, usedIds);
            if (!ex) ex = getStrictUnique(candidates, usedIds); // Ostateczny fallback

            if (!ex) break; // Brak unikalnych -> koniec
            addToSequence(ex);
            loop++;
        }
    };

    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');
        runStrategy([...breathing, ...relax], candidates);
    } else {
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

// ============================================================
// BUDOWANIE KROKÓW (Z NATURALNYM FORMATOWANIEM)
// ============================================================

function buildSteps(exercises, config, mode, timeFactor) {
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
        const baseWork = config.work * timeFactor;
        const restDuration = Math.round(config.rest * timeFactor);

        // --- ORGANIC VARIANCE ---
        // Losowość +/- 30% dla każdego ćwiczenia z osobna
        const randomJitter = 0.7 + (Math.random() * 0.6); // 0.7 do 1.3

        // Difficulty Nuance
        const lvl = parseInt(ex.difficultyLevel || 1);
        let difficultyMod = 1.0;
        if (lvl >= 4) difficultyMod = 0.85; // Hard -> krócej/mniej
        if (lvl === 1) difficultyMod = 1.15; // Easy -> dłużej/więcej

        // Celowany czas trwania (niezaokrąglony)
        let targetDurationRaw = (baseWork * randomJitter * difficultyMod) - (driftCompensation * 0.3);
        targetDurationRaw = Math.max(15, Math.min(180, targetDurationRaw));

        // Sprawdzenie typu: Powtórzenia czy Czas?
        const rawReps = String(ex.reps_or_time).toLowerCase();
        const isRepBased = !rawReps.includes('s') && !rawReps.includes('min');

        let finalDurationForTimer = 0;
        let displayValue = "";

        if (isRepBased) {
            // DLA POWTÓRZEŃ:
            // 1. Wyliczamy liczbę powtórzeń z SUROWEGO czasu (bez zaokrąglania do 5s)
            let estimatedReps = Math.round(targetDurationRaw / SECONDS_PER_REP_ESTIMATE);
            estimatedReps = Math.max(4, estimatedReps); // Min 4 powtórzenia

            // 2. Ustalamy czas timera na podstawie powtórzeń (żeby timer był sensowny)
            // Dodajemy mały bufor (np. 10%) żeby użytkownik zdążył
            finalDurationForTimer = Math.round(estimatedReps * SECONDS_PER_REP_ESTIMATE * 1.1);

            displayValue = `${estimatedReps}`; // Czysta liczba
        } else {
            // DLA CZASU:
            // 1. Zaokrąglamy czas do 5s dla estetyki (np. 45s, 50s)
            finalDurationForTimer = Math.round(targetDurationRaw / 5) * 5;
            displayValue = `${finalDurationForTimer} s`;
        }

        // Aktualizacja dryfu (o ile przesunęliśmy się względem planu)
        driftCompensation += (finalDurationForTimer - baseWork);

        const isUnilateral = ex.isUnilateral || String(ex.reps_or_time).includes('/str');
        const tempoDisplay = config.tempo;

        const createWorkStep = (suffix, setId, totalSets) => ({
            ...ex,
            exerciseId: ex.id,
            name: `${ex.name}${suffix}`,
            isWork: true,
            isRest: false,
            currentSet: setId,
            totalSets: totalSets,
            sectionName: mapModeToSectionName(mode),
            reps_or_time: displayValue,
            duration: finalDurationForTimer,
            sets: "1",
            tempo_or_iso: tempoDisplay,
            uniqueId: `${ex.id}_p${index}${suffix ? suffix.replace(/[\s()]/g, '') : ''}`
        });

        if (isUnilateral) {
            steps.push(createWorkStep(' (Lewa)', 1, 2));
            steps.push({ name: "Zmiana Strony", isWork: false, isRest: true, duration: 5, sectionName: "Przejście", description: "Druga strona" });
            steps.push(createWorkStep(' (Prawa)', 2, 2));
        } else {
            steps.push(createWorkStep('', 1, 1));
        }

        if (index < exercises.length - 1 && restDuration > 0) {
            steps.push({
                name: getRestName(mode), isWork: false, isRest: true, duration: restDuration, sectionName: "Przejście", description: `Następnie: ${exercises[index + 1].name}`
            });
        }
    });

    return steps;
}

// ============================================================
// HELPERY DANYCH (BEZ ZMIAN)
// ============================================================

function violatesProtocolRestrictions(ex, restrictions) {
    if (!restrictions || restrictions.length === 0) return false;
    const plane = ex.primaryPlane || 'multi';
    const pos = ex.position || null;
    const cat = ex.categoryId || '';

    if (restrictions.includes('no_kneeling') && (pos === 'kneeling' || pos === 'quadruped')) return true;
    if (restrictions.includes('no_twisting') && plane === 'rotation') return true;
    if (restrictions.includes('no_floor_sitting') && pos === 'sitting') return true;

    if (restrictions.includes('foot_injury')) {
        const blockedPositions = ['standing', 'kneeling', 'quadruped', 'lunge'];
        if (blockedPositions.includes(pos)) return true;
        const blockedCategories = ['squats', 'lunges', 'cardio', 'plyometrics', 'calves'];
        if (blockedCategories.includes(cat)) return true;
        const name = (ex.name || '').toLowerCase();
        if (name.includes('przysiad') || name.includes('wykrok') || name.includes('bieg')) return true;
    }
    return false;
}

function getCandidates(mode, focusZone, ctx = {}) {
    const { ignoreEquipment, userContext } = ctx;
    const restrictions = userContext?.physical_restrictions || [];
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const zoneConfig = ZONE_MAP[focusZone];
    const blacklist = state.blacklist || [];

    if (!zoneConfig) return [];

    return library.filter(ex => {
        if (blacklist.includes(ex.id)) return false;
        if (violatesProtocolRestrictions(ex, restrictions)) return false;
        if (ex.isAllowed !== true) {
            if (ignoreEquipment && ex.isAllowed === false && ex.rejectionReason === 'missing_equipment') { /* pass */ }
            else { return false; }
        }

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);
        if (mode === 'sos' && difficulty > 2) return false;
        if (mode === 'booster' && difficulty < 2) return false;
        if (mode === 'reset' && difficulty > 3) return false;
        if (mode === 'calm') {
            if (difficulty > 2) return false;
            if (!['breathing_control', 'breathing', 'muscle_relaxation'].includes(ex.categoryId)) return false;
            if (ex.position && !['supine', 'sitting'].includes(ex.position)) return false;
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
        else if (zoneConfig.type === 'all') return true;
        return false;
    });
}

function getCandidatesSafeFallback(mode, userContext) {
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const restrictions = userContext?.physical_restrictions || [];
    return library.filter(ex => {
        if (ex.isAllowed !== true) return false;
        if (violatesProtocolRestrictions(ex, restrictions)) return false;
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
        score += Math.random() * 20;
        ex._genScore = score;
    });
    candidates.sort((a, b) => b._genScore - a._genScore);
}

// ============================================================
// FORMATOWANIE TEKSTÓW
// ============================================================

function generateTitle(mode, zone) {
    const zoneName = {
        'cervical': 'Szyja', 'thoracic': 'Plecy (Góra)', 'lumbar': 'Odcinek Lędźwiowy',
        'sciatica': 'Nerw Kulszowy', 'hips': 'Biodra', 'core': 'Brzuch / Core',
        'office': 'Anty-Biuro', 'sleep': 'Sen', 'glute': 'Pośladki', 'full_body': 'Całe Ciało',
        'legs': 'Nogi'
    }[zone] || 'Bio-Protokół';
    const suffix = {
        'sos': 'Ratunkowy', 'booster': 'Power', 'reset': 'Flow',
        'calm': 'Wyciszenie', 'flow': 'Mobility Flow', 'neuro': 'Neuro-Ślizgi', 'ladder': 'Progresja'
    }[mode] || '';
    return `${zoneName}: ${suffix}`;
}

function generateDescription(mode, duration) {
    if (mode === 'sos') return `Sesja ratunkowa (${duration} min). Ruchy powolne, bezbólowe.`;
    if (mode === 'calm') return `Głęboki relaks (${duration} min). Regulacja układu nerwowego.`;
    if (mode === 'neuro') return `Praca z układem nerwowym (${duration} min). Delikatne zakresy.`;
    if (mode === 'ladder') return `Budowanie techniki (${duration} min). Stopniowanie trudności.`;
    if (mode === 'booster') return `Intensywny trening (${duration} min). Utrzymuj technikę.`;
    return `Regeneracja (${duration} min). Skup się na oddechu.`;
}

function mapModeToSectionName(mode) {
    if (mode === 'sos') return 'Terapia';
    if (mode === 'calm') return 'Wyciszenie';
    if (mode === 'booster') return 'Ogień';
    if (mode === 'ladder') return 'Wyzwanie';
    return 'Regeneracja';
}

function getRestName(mode) {
    if (mode === 'booster') return 'Szybka Przerwa';
    if (mode === 'calm') return 'Przejście';
    if (mode === 'flow') return 'Płynna zmiana';
    return 'Rozluźnienie';
}

function calculateXP(mode, minutes) {
    const base = minutes * 10;
    if (mode === 'booster') return Math.round(base * 1.5);
    if (mode === 'ladder') return Math.round(base * 1.2);
    if (mode === 'calm') return Math.round(base * 0.6);
    return base;
}

function calculateResilienceBonus(mode) {
    if (mode === 'sos' || mode === 'reset') return 5;
    if (mode === 'calm') return 7;
    if (mode === 'neuro') return 6;
    return 1;
}

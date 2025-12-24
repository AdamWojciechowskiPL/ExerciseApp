// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v4.8 (Smart Formats)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 *
 * CECHY:
 * - Time-Boxing: Dopychanie ćwiczeń do zadanego czasu.
 * - Strict No-Repeat: Absolutny zakaz powtarzania ćwiczeń.
 * - Time-Stretch: Wydłużanie sesji, gdy brakuje unikalnych ćwiczeń.
 * - Smart Formats: Rozróżnianie ćwiczeń na czas (Plank) i na powtórzenia (Przysiad).
 */

// ============================================================
// KONFIGURACJA (STREFY I TRYBY)
// ============================================================

const ZONE_MAP = {
    // SOS & RESET & NEURO
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant', 'lumbar_radiculopathy'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing', 'lumbar_radiculopathy'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation', 'femoral_nerve'] },
    'legs': { type: 'cat', keys: ['stretching', 'nerve_flossing'] },

    // MIXED
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] },
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },

    // BOOSTER
    'core': { type: 'cat', keys: ['core_anti_extension', 'core_anti_rotation', 'core_anti_flexion'] },
    'glute': { type: 'cat', keys: ['glute_activation'] },
    'full_body': { type: 'all', keys: [] }
};

const TIMING_CONFIG = {
    // Klasyczne
    'sos': { work: 60, rest: 15, tempo: 'Wolne / Oddechowe' },
    'reset': { work: 45, rest: 10, tempo: 'Płynne' },
    'booster': { work: 40, rest: 20, tempo: 'Dynamiczne' },

    // Nowoczesne
    'calm': { work: 120, rest: 10, tempo: 'Wolne / nos / przepona' },
    'flow': { work: 40, rest: 5, tempo: 'Płynne / kontrola zakresu' },
    'neuro': { work: 25, rest: 20, tempo: 'Delikatne / bez bólu' },
    'ladder': { work: 50, rest: 20, tempo: 'Technika / kontrola' }
};

const SECONDS_PER_REP_ESTIMATE = 4; // Średni czas na 1 powtórzenie w tempie kontrolowanym

// ============================================================
// GŁÓWNA FUNKCJA GENERUJĄCA
// ============================================================

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v4.8 (Smart Formats): ${mode} / ${focusZone} (${durationMin} min, x${timeFactor})`);

    // 1. Obliczenie docelowego czasu w sekundach
    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];

    // 2. Pobranie kandydatów z uwzględnieniem restrykcji klinicznych
    let candidates = getCandidates(mode, focusZone, { ignoreEquipment: false, userContext });

    // Fallback 1: Poluzowanie wymogów sprzętowych
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Brak kandydatów. Poluzowanie wymogów sprzętowych.");
        candidates = getCandidates(mode, focusZone, { ignoreEquipment: true, userContext });
    }

    // Fallback 2: Ostateczny ratunek (Dowolne bezpieczne z bazy)
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Krytyczny brak. Fallback na dowolne bezpieczne.");
        candidates = getCandidatesSafeFallback(mode, userContext);
    }

    if (candidates.length === 0) {
        throw new Error("Brak bezpiecznych ćwiczeń w bazie dla Twoich restrykcji zdrowotnych.");
    }

    // 3. Ocena i sortowanie kandydatów
    scoreCandidates(candidates, mode, userContext);

    // 4. Selekcja ćwiczeń (Zwraca obiekt: { sequence, generatedSeconds })
    const selectionResult = selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor);
    const sequence = selectionResult.sequence;
    const generatedSeconds = selectionResult.generatedSeconds;

    // 5. OBSŁUGA "TIME STRETCH" (WYPEŁNIANIE CZASU)
    let finalTimeFactor = timeFactor;

    if (generatedSeconds > 0 && generatedSeconds < targetSeconds) {
        // Obliczamy ile razy musimy wydłużyć, żeby wypełnić czas
        const stretchRatio = targetSeconds / generatedSeconds;
        // Aplikujemy to do bazowego timeFactor. Limitujemy stretch do rozsądnych 200% (x2.0)
        finalTimeFactor = timeFactor * Math.min(stretchRatio, 2.0);
        console.log(`⏱️ [ProtocolGenerator] Time Stretch: x${stretchRatio.toFixed(2)} -> FinalFactor: ${finalTimeFactor.toFixed(2)}`);
    }

    // 6. Budowa osi czasu (Timeline) - Tutaj dzieje się magia formatowania (Reps vs Time)
    const flatExercises = buildSteps(sequence, config, mode, finalTimeFactor);

    // 7. Obliczenie finalnego czasu trwania
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
    const maxSteps = Math.ceil(targetSeconds / baseCycleTime) + 15; // +15 marginesu

    let sequence = [];
    let currentSeconds = 0;
    const usedIds = new Set();

    const calculateExDuration = (ex) => {
        const isUnilateral = ex.isUnilateral ||
                             String(ex.reps_or_time).includes('/str') ||
                             String(ex.reps_or_time).includes('stron');
        const mult = isUnilateral ? 2 : 1;
        return baseCycleTime * mult;
    };

    const addToSequence = (ex) => {
        sequence.push(ex);
        usedIds.add(ex.id);
        currentSeconds += calculateExDuration(ex);
    };

    // --- STRATEGIA: CALM ---
    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');
        const poolA = breathing.length > 0 ? breathing : candidates;
        const poolB = relax.length > 0 ? relax : candidates;

        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const isRelaxPhase = (sequence.length + 1) % 3 === 0;
            const currentPool = isRelaxPhase ? poolB : poolA;
            let ex = getStrictUnique(currentPool, usedIds);
            if (!ex) ex = getStrictUnique(candidates, usedIds);
            if (!ex) break; // Strict No-Repeat

            addToSequence(ex);
            safetyLoop++;
        }
    }
    // --- STRATEGIA: FLOW ---
    else if (mode === 'flow') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const last = sequence.length > 0 ? sequence[sequence.length - 1] : null;
            let ex = null;
            if (last) {
                const diversityPool = candidates.filter(c => c.primaryPlane && last.primaryPlane && c.primaryPlane !== last.primaryPlane);
                ex = getStrictUnique(diversityPool, usedIds);
            }
            if (!ex) ex = getStrictUnique(candidates, usedIds);
            if (!ex) break;

            addToSequence(ex);
            safetyLoop++;
        }
    }
    // --- STRATEGIA: NEURO ---
    else if (mode === 'neuro') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            let ex = getStrictUnique(candidates, usedIds);
            if (!ex) break;
            addToSequence(ex);
            safetyLoop++;
        }
    }
    // --- STRATEGIA: LADDER ---
    else if (mode === 'ladder') {
        const sorted = candidates.sort((a,b) => (a.difficultyLevel || 1) - (b.difficultyLevel || 1));
        const baseEx = sorted[0];
        if (baseEx) {
            let currentEx = baseEx;
            let safetyLoop = 0;
            while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
                if (usedIds.has(currentEx.id)) break;
                addToSequence(currentEx);

                let nextExCandidate = null;
                if (currentEx.nextProgressionId) {
                    const nextExDef = state.exerciseLibrary[currentEx.nextProgressionId];
                    const inCandidates = candidates.find(c => c.id === nextExDef?.id);
                    if (inCandidates && !usedIds.has(inCandidates.id)) nextExCandidate = inCandidates;
                }
                if (!nextExCandidate) nextExCandidate = getStrictUnique(candidates, usedIds);
                if (!nextExCandidate) break;
                currentEx = nextExCandidate;
                safetyLoop++;
            }
        }
    }
    // --- STRATEGIA: STANDARD ---
    else {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            let ex = getStrictUnique(candidates, usedIds);
            if (!ex) break;
            addToSequence(ex);
            safetyLoop++;
        }
    }

    return { sequence, generatedSeconds: currentSeconds };
}

function getStrictUnique(pool, usedIds) {
    if (!pool || pool.length === 0) return null;
    const available = pool.filter(ex => !usedIds.has(ex.id));
    if (available.length > 0) {
        const topCount = Math.min(3, available.length);
        const topPool = available.slice(0, topCount);
        return topPool[Math.floor(Math.random() * topPool.length)];
    }
    return null;
}

// ============================================================
// BUDOWANIE KROKÓW (TIMELINE Z INTELIGENTNYM FORMATOWANIEM)
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

    exercises.forEach((ex, index) => {
        // Czas trwania wg konfiguracji i czynnika rozciągnięcia
        const workDuration = Math.round(config.work * timeFactor);
        const restDuration = Math.round(config.rest * timeFactor);

        const isUnilateral = ex.isUnilateral ||
                             String(ex.reps_or_time).includes('/str') ||
                             String(ex.reps_or_time).includes('stron');

        // --- SMART FORMATTING LOGIC ---
        // Decydujemy czy pokazać "45 s" czy "12 powtórzeń"
        let displayValue = `${workDuration} s`;
        let tempoDisplay = config.tempo;

        // Sprawdzamy definicję w bazie - jeśli nie ma 's' ani 'min', to powtórzenia
        const rawReps = String(ex.reps_or_time).toLowerCase();
        const isRepBased = !rawReps.includes('s') && !rawReps.includes('min');

        if (isRepBased) {
            // Przeliczamy czas na powtórzenia
            const estimatedReps = Math.max(4, Math.floor(workDuration / SECONDS_PER_REP_ESTIMATE));
            displayValue = `${estimatedReps}`; // Bez dopisków typu "/str" bo to jest w nazwie kroku L/P
        }

        // Helper budujący obiekt kroku
        const createWorkStep = (suffix, setId, totalSets) => ({
            ...ex,
            exerciseId: ex.id,
            name: `${ex.name}${suffix}`,
            isWork: true,
            isRest: false,
            currentSet: setId,
            totalSets: totalSets,
            sectionName: mapModeToSectionName(mode),
            reps_or_time: displayValue, // Tutaj trafia przeliczona wartość!
            duration: workDuration,     // Timer zawsze liczy czas
            sets: "1",
            tempo_or_iso: tempoDisplay,
            uniqueId: `${ex.id}_p${index}${suffix ? suffix.replace(/[\s()]/g, '') : ''}`
        });

        if (isUnilateral) {
            steps.push(createWorkStep(' (Lewa)', 1, 2));
            steps.push({
                name: "Zmiana Strony",
                isWork: false,
                isRest: true,
                duration: 5,
                sectionName: "Przejście",
                description: "Przygotuj drugą stronę"
            });
            steps.push(createWorkStep(' (Prawa)', 2, 2));
        } else {
            steps.push(createWorkStep('', 1, 1));
        }

        if (index < exercises.length - 1 && restDuration > 0) {
            steps.push({
                name: getRestName(mode),
                isWork: false,
                isRest: true,
                duration: restDuration,
                sectionName: "Przejście",
                description: `Przygotuj się do: ${exercises[index + 1].name}`
            });
        }
    });

    return steps;
}

// ============================================================
// HELPERY DANYCH I RESTRYKCJE (BEZ ZMIAN)
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
        if (recentSessions.includes(ex.id)) score -= (mode === 'calm' ? 60 : 50);
        if (mode === 'booster') score += (parseInt(ex.difficultyLevel || 1) * 5);
        else if (mode === 'sos') score -= (parseInt(ex.difficultyLevel || 1) * 20);
        else if (mode === 'reset' && ex.categoryId === 'breathing') score += 40;
        score += Math.random() * (mode === 'sos' ? 5 : 20);
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
// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v4.7 (Time-Stretch Strategy)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 *
 * CECHY:
 * - Time-Boxing: Dopychanie ćwiczeń do zadanego czasu.
 * - Strict No-Repeat: Absolutny zakaz powtarzania ćwiczeń (A-A ani A-B-A).
 * - Time-Stretch: Jeśli brakuje unikalnych ćwiczeń, wydłużamy te już wylosowane,
 *   zamiast powtarzać lub kończyć przed czasem.
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

// ============================================================
// GŁÓWNA FUNKCJA GENERUJĄCA
// ============================================================

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v4.7 (Stretch): ${mode} / ${focusZone} (${durationMin} min, x${timeFactor})`);

    // 1. Obliczenie docelowego czasu w sekundach
    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];

    // 2. Pobranie kandydatów z uwzględnieniem restrykcji klinicznych (userContext)
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

    // 3. Ocena i sortowanie kandydatów (Affinity, Freshness)
    scoreCandidates(candidates, mode, userContext);

    // 4. Selekcja ćwiczeń (Zwraca obiekt: { sequence, generatedSeconds })
    const selectionResult = selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor);
    const sequence = selectionResult.sequence;
    const generatedSeconds = selectionResult.generatedSeconds;

    // 5. OBSŁUGA "TIME STRETCH" (WYPEŁNIANIE CZASU)
    // Jeśli wygenerowany czas jest krótszy niż cel (bo zabrakło unikalnych ćwiczeń),
    // zwiększamy mnożnik czasu dla wszystkich ćwiczeń.
    let finalTimeFactor = timeFactor;

    if (generatedSeconds > 0 && generatedSeconds < targetSeconds) {
        // Obliczamy ile razy musimy wydłużyć, żeby wypełnić czas
        const stretchRatio = targetSeconds / generatedSeconds;

        // Aplikujemy to do bazowego timeFactor
        finalTimeFactor = timeFactor * stretchRatio;

        console.log(`⏱️ [ProtocolGenerator] Time Stretch Active: Generated ${Math.round(generatedSeconds)}s vs Target ${targetSeconds}s. Applying stretch ratio: ${stretchRatio.toFixed(2)}x`);
    }

    // 6. Budowa osi czasu (Timeline) z nowym, potencjalnie wydłużonym czasem
    const flatExercises = buildSteps(sequence, config, mode, finalTimeFactor);

    // 7. Obliczenie finalnego czasu trwania (powinien być bliski targetSeconds)
    const realTotalDuration = flatExercises.reduce((sum, step) => sum + (step.duration || 0), 0);

    // 8. Zwrócenie gotowego obiektu protokołu
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
// LOGIKA SELEKCJI (STRATEGIE DOBORU)
// ============================================================

function selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor) {
    // Czas bazowy jednego cyklu (praca + przerwa)
    const baseCycleTime = (config.work + config.rest) * timeFactor;

    // Zabezpieczenie przed nieskończoną pętlą
    const maxSteps = Math.ceil(targetSeconds / baseCycleTime) + 10;

    let sequence = [];
    let currentSeconds = 0;

    // KLUCZOWE: Zbiór użytych ID w tej sesji (dla unikalności)
    const usedIds = new Set();

    // Helper do dodawania czasu (uwzględnia x2 dla unilateral)
    const calculateExDuration = (ex) => {
        const isUnilateral = ex.isUnilateral ||
                             String(ex.reps_or_time).includes('/str') ||
                             String(ex.reps_or_time).includes('stron');
        const mult = isUnilateral ? 2 : 1;
        return baseCycleTime * mult;
    };

    // Helper pętli - dodaje ćwiczenie i aktualizuje czas
    const addToSequence = (ex) => {
        sequence.push(ex);
        usedIds.add(ex.id);
        currentSeconds += calculateExDuration(ex);
    };

    // --- STRATEGIA: CALM (Przeplatanka Oddech / Relaks) ---
    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');

        const poolA = breathing.length > 0 ? breathing : candidates;
        const poolB = relax.length > 0 ? relax : candidates;

        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            // Co trzecie ćwiczenie to głęboki relaks
            const isRelaxPhase = (sequence.length + 1) % 3 === 0;
            const currentPool = isRelaxPhase ? poolB : poolA;

            // 1. Szukamy unikalnego w dedykowanej puli
            let ex = getStrictUnique(currentPool, usedIds);

            // 2. Jeśli brak, szukamy w ogólnej puli
            if (!ex) ex = getStrictUnique(candidates, usedIds);

            // 3. STRICT NO-REPEAT: Jeśli nadal brak, przerywamy pętlę
            if (!ex) break;

            addToSequence(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: FLOW (Różnorodność Ruchu) ---
    else if (mode === 'flow') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const last = sequence.length > 0 ? sequence[sequence.length - 1] : null;
            let ex = null;

            // 1. Próba znalezienia unikalnego w INNEJ płaszczyźnie niż poprzednie
            if (last) {
                const diversityPool = candidates.filter(c =>
                    c.primaryPlane && last.primaryPlane && c.primaryPlane !== last.primaryPlane
                );
                ex = getStrictUnique(diversityPool, usedIds);
            }

            // 2. Próba znalezienia dowolnego unikalnego
            if (!ex) ex = getStrictUnique(candidates, usedIds);

            if (!ex) break;

            addToSequence(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: NEURO (Nerve Glides) ---
    else if (mode === 'neuro') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            let ex = getStrictUnique(candidates, usedIds);
            if (!ex) break;

            addToSequence(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: LADDER (Progresja Trudności) ---
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
                    if (inCandidates && !usedIds.has(inCandidates.id)) {
                        nextExCandidate = inCandidates;
                    }
                }

                if (!nextExCandidate) {
                    nextExCandidate = getStrictUnique(candidates, usedIds);
                }

                if (!nextExCandidate) break;
                currentEx = nextExCandidate;
                safetyLoop++;
            }
        }
    }

    // --- STRATEGIA: STANDARD (SOS, RESET, BOOSTER) ---
    else {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            let ex = getStrictUnique(candidates, usedIds);
            if (!ex) break; // Kończymy, jeśli brak unikalnych

            addToSequence(ex);
            safetyLoop++;
        }
    }

    return { sequence, generatedSeconds: currentSeconds };
}

// ============================================================
// HELPERY UNIKALNOŚCI (STRICT UNIQUE)
// ============================================================

function getStrictUnique(pool, usedIds) {
    if (!pool || pool.length === 0) return null;

    // Filtrujemy tylko te, których ID nie ma w zbiorze użytych
    const available = pool.filter(ex => !usedIds.has(ex.id));

    if (available.length > 0) {
        // Losujemy z najlepszych dostępnych (top 3 dla różnorodności)
        const topCount = Math.min(3, available.length);
        const topPool = available.slice(0, topCount);
        return topPool[Math.floor(Math.random() * topPool.length)];
    }
    return null;
}

// ============================================================
// BUDOWANIE KROKÓW (TIMELINE)
// ============================================================

function buildSteps(exercises, config, mode, timeFactor) {
    const steps = [];

    // Krok 0: Start
    steps.push({
        name: "Start Protokołu",
        isWork: false,
        isRest: true,
        duration: 5,
        sectionName: "Start",
        description: generateDescription(mode, 0)
    });

    exercises.forEach((ex, index) => {
        // Aplikujemy timeFactor (który może być zwiększony przez stretch ratio)
        const workDuration = Math.round(config.work * timeFactor);
        const restDuration = Math.round(config.rest * timeFactor);

        const isUnilateral = ex.isUnilateral ||
                             String(ex.reps_or_time).includes('/str') ||
                             String(ex.reps_or_time).includes('stron');

        if (isUnilateral) {
            // STRONA LEWA
            steps.push({
                ...ex,
                exerciseId: ex.id,
                name: `${ex.name} (Lewa)`,
                isWork: true,
                isRest: false,
                currentSet: 1,
                totalSets: 2,
                sectionName: mapModeToSectionName(mode),
                reps_or_time: `${workDuration} s`,
                duration: workDuration,
                sets: "1",
                tempo_or_iso: config.tempo,
                uniqueId: `${ex.id}_p${index}_L`
            });

            // ZMIANA STRONY
            steps.push({
                name: "Zmiana Strony",
                isWork: false,
                isRest: true,
                duration: 5,
                sectionName: "Przejście",
                description: "Przygotuj drugą stronę"
            });

            // STRONA PRAWA
            steps.push({
                ...ex,
                exerciseId: ex.id,
                name: `${ex.name} (Prawa)`,
                isWork: true,
                isRest: false,
                currentSet: 2,
                totalSets: 2,
                sectionName: mapModeToSectionName(mode),
                reps_or_time: `${workDuration} s`,
                duration: workDuration,
                sets: "1",
                tempo_or_iso: config.tempo,
                uniqueId: `${ex.id}_p${index}_R`
            });

        } else {
            // STANDARDOWE
            steps.push({
                ...ex,
                exerciseId: ex.id,
                isWork: true,
                isRest: false,
                currentSet: 1,
                totalSets: 1,
                sectionName: mapModeToSectionName(mode),
                reps_or_time: `${workDuration} s`,
                duration: workDuration,
                sets: "1",
                tempo_or_iso: config.tempo,
                uniqueId: `${ex.id}_p${index}`
            });
        }

        // PRZERWA (jeśli nie ostatnie)
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
// HELPERY DANYCH I RESTRYKCJE KLINICZNE
// ============================================================

function violatesProtocolRestrictions(ex, restrictions) {
    if (!restrictions || restrictions.length === 0) return false;

    const plane = ex.primaryPlane || 'multi';
    const pos = ex.position || null;
    const cat = ex.categoryId || '';

    // 1. Typowe restrykcje ruchowe
    if (restrictions.includes('no_kneeling') && (pos === 'kneeling' || pos === 'quadruped')) return true;
    if (restrictions.includes('no_twisting') && plane === 'rotation') return true;
    if (restrictions.includes('no_floor_sitting') && pos === 'sitting') return true;

    // 2. URAZ STOPY (Krytyczne!)
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
        // A. Blacklist check
        if (blacklist.includes(ex.id)) return false;

        // B. Clinical Safety Check
        if (violatesProtocolRestrictions(ex, restrictions)) {
            return false;
        }

        // C. Standard Checks (IsAllowed)
        if (ex.isAllowed !== true) {
            if (ignoreEquipment && ex.isAllowed === false && ex.rejectionReason === 'missing_equipment') {
                // Pass fallback
            } else {
                return false;
            }
        }

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // 2. FILTR TRYBU
        if (mode === 'sos') { if (difficulty > 2) return false; }
        if (mode === 'booster') { if (difficulty < 2) return false; }
        if (mode === 'reset') { if (difficulty > 3) return false; }

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
            const isFlossing = ex.categoryId === 'nerve_flossing';
            const matchesZone = ex.painReliefZones && ex.painReliefZones.some(z => ['sciatica', 'lumbar_radiculopathy', 'femoral_nerve'].includes(z));
            if (!isFlossing && !matchesZone) return false;
        }
        if (mode === 'ladder') {
            if (difficulty > 3) return false;
        }

        // 3. DOPASOWANIE DO STREFY
        if (mode === 'calm') return true;

        if (zoneConfig.type === 'zone') {
            const reliefZones = ex.painReliefZones || [];
            return reliefZones.some(z => zoneConfig.keys.includes(z));
        }
        else if (zoneConfig.type === 'cat') {
            return zoneConfig.keys.includes(ex.categoryId);
        }
        else if (zoneConfig.type === 'mixed') {
            const reliefZones = ex.painReliefZones || [];
            return zoneConfig.keys.includes(ex.categoryId) || reliefZones.some(z => zoneConfig.keys.includes(z));
        }
        else if (zoneConfig.type === 'all') {
            return true;
        }

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
        if (mode === 'reset' && difficulty > 3) return false;
        return true;
    }).slice(0, 15);
}

function scoreCandidates(candidates, mode, userContext) {
    const recentSessions = userContext?.recentSessionIds || [];

    candidates.forEach(ex => {
        let score = 0;
        const pref = state.userPreferences[ex.id] || { score: 0 };
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // Baza
        score += (pref.score || 0);

        // Recent Penalty
        if (recentSessions.includes(ex.id)) {
            if (mode === 'calm') score -= 60;
            else if (mode !== 'sos') score -= 50;
        }

        // Mode Specific Scoring
        if (mode === 'booster') score += difficulty * 5;
        else if (mode === 'sos') {
            score -= difficulty * 20;
            if (ex.animationSvg) score += 20;
            if (ex.painReliefZones && ex.painReliefZones.length > 0) score += 15;
        }
        else if (mode === 'reset') {
            if (ex.categoryId === 'breathing') score += 40;
            if (difficulty > 2) score -= 10;
        }
        else if (mode === 'calm') {
            if (ex.youtube_url || ex.animationSvg) score += 15;
            if (ex.maxDuration && ex.maxDuration > 60) score += 10;
        }
        else if (mode === 'flow') {
            if (ex.categoryId.includes('mobility')) score += 10;
        }
        else if (mode === 'neuro') {
            if (ex.categoryId === 'nerve_flossing') score += 30;
            if (ex.isUnilateral) score += 20;
        }
        else if (mode === 'ladder') {
            if (ex.nextProgressionId) score += 20;
        }

        // Randomness
        const randomFactor = (mode === 'sos' || mode === 'neuro' || mode === 'ladder') ? 5 : 20;
        score += Math.random() * randomFactor;

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
        'sos': 'Ratunkowy',
        'booster': 'Power',
        'reset': 'Flow',
        'calm': 'Wyciszenie',
        'flow': 'Mobility Flow',
        'neuro': 'Neuro-Ślizgi',
        'ladder': 'Progresja'
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
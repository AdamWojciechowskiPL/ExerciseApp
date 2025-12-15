// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v4.2 (No-Repeat Fix)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 *
 * ZMIANY v4.2:
 * - Fix: Globalna unikalność ćwiczeń w sesji. Algorytm zapamiętuje użyte ID
 *   i nie losuje ich ponownie, dopóki nie wyczerpie puli kandydatów.
 */

// Konfiguracja mapowania stref na kategorie/tagi
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

// Parametry czasu (Konfiguracja trybów)
const TIMING_CONFIG = {
    // Stare
    'sos': { work: 60, rest: 15, tempo: 'Wolne / Oddechowe' },
    'reset': { work: 45, rest: 10, tempo: 'Płynne' },
    'booster': { work: 40, rest: 20, tempo: 'Dynamiczne' },

    // Nowe
    'calm': { work: 150, rest: 10, tempo: 'Wolne / nos / przepona' }, // work średnio 120-180s
    'flow': { work: 40, rest: 5, tempo: 'Płynne / kontrola zakresu' },
    'neuro': { work: 25, rest: 20, tempo: 'Delikatne / bez bólu' },
    'ladder': { work: 50, rest: 20, tempo: 'Technika / kontrola' }
};

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v4.2 (No-Repeat): ${mode} / ${focusZone} (${durationMin} min, TimeFactor=${timeFactor})`);

    // 1. POPRAWKA TIMINGU (Time Factor Fix)
    const targetSeconds = durationMin * 60;

    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];

    // 2. Pobierz Kandydatów
    let candidates = getCandidates(mode, focusZone, { ignoreEquipment: false });

    // Fallback 1: Poluzowanie wymogów sprzętowych
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Brak kandydatów. Poluzowanie wymogów sprzętowych.");
        candidates = getCandidates(mode, focusZone, { ignoreEquipment: true });
    }

    // Fallback 2: Ostateczny ratunek
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Krytyczny brak. Fallback na dowolne bezpieczne.");
        candidates = getCandidatesSafeFallback(mode);
    }

    if (candidates.length === 0) {
        throw new Error("Brak bezpiecznych ćwiczeń w bazie dla Twojego profilu.");
    }

    // 3. Sortowanie / Ważenie
    scoreCandidates(candidates, mode, userContext);

    // 4. Wybór ćwiczeń zgodnie ze strategią trybu
    const selectedExercises = selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor);

    // 5. Budowa Kroków (Timeline) - Teraz z obsługą Unilateral dla wszystkich trybów
    const flatExercises = buildSteps(selectedExercises, config, mode, timeFactor);

    // 6. Obliczenie realnego czasu
    const realTotalDuration = flatExercises.reduce((sum, step) => sum + (step.duration || 0), 0);

    // 7. Budowa Obiektu
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
// LOGIKA SELEKCJI (STRATEGIE)
// ============================================================

function selectExercisesByMode(candidates, mode, targetSeconds, config, timeFactor) {
    // Obliczamy cykl bazowy
    const baseCycleTime = (config.work + config.rest) * timeFactor;

    // Safety margin loop limit
    const maxSteps = Math.ceil(targetSeconds / baseCycleTime) + 5;
    let sequence = [];
    let currentSeconds = 0;

    // Helper do liczenia czasu z uwzględnieniem unilateral
    const addTime = (ex) => {
        const isUnilateral = ex.isUnilateral || String(ex.reps_or_time).includes('/str') || String(ex.reps_or_time).includes('stron');
        // Jeśli unilateral, to mamy: Work(L) + Switch(5s) + Work(R) + Rest
        // Aproksymacja: 2 * baseCycleTime (trochę nadmiarowe, ale bezpieczne)
        const mult = isUnilateral ? 2 : 1;
        currentSeconds += baseCycleTime * mult;
    };

    // --- STRATEGIA: CALM (Downshift) ---
    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');

        // Upewniamy się, że pule nie są puste, fallback do ogólnych kandydatów
        const poolA = breathing.length > 0 ? breathing : candidates;
        const poolB = relax.length > 0 ? relax : candidates;

        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const isRelaxPhase = (sequence.length + 1) % 3 === 0; // Co trzecie ćwiczenie to relaks mięśni
            const currentPool = isRelaxPhase ? poolB : poolA;

            const ex = getUniqueOrFallback(currentPool, sequence);
            sequence.push(ex);
            addTime(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: FLOW (Mobility) ---
    else if (mode === 'flow') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const last = sequence.length > 0 ? sequence[sequence.length - 1] : null;

            // Filtrujemy, aby nie powtarzać płaszczyzny ruchu pod rząd (jeśli to możliwe)
            // Ale priorytetem jest unikalność ID
            let valid = candidates.filter(ex => {
                // Pomiń te, które już były w sesji (jeśli możliwe)
                if (sequence.some(s => s.id === ex.id)) return false;

                // Próba urozmaicenia płaszczyzny ruchu
                if (last && ex.primaryPlane && last.primaryPlane && ex.primaryPlane === last.primaryPlane && ex.primaryPlane !== 'multi') {
                    // To jest miękki filtr - jeśli zabraknie kandydatów, getUniqueOrFallback go zignoruje,
                    // bo tutaj filtrujemy 'candidates' lokalnie.
                    // W tym przypadku lepiej użyć getUniqueOrFallback na pełnej liście z logiką 'diverse'
                    return true; 
                }
                return true;
            });

            // Jeśli filtr zbyt restrykcyjny, wróć do pełnej listy
            if (valid.length === 0) valid = candidates;

            const ex = getUniqueOrFallback(valid, sequence);
            sequence.push(ex);
            addTime(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: NEURO (Nerve Glide) ---
    else if (mode === 'neuro') {
        // Neuro często ma mało ćwiczeń (np. 3 flossingi).
        // Staramy się dać unikalne, ale jak braknie, to zapętlamy w sposób inteligentny.
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const ex = getUniqueOrFallback(candidates, sequence);
            sequence.push(ex);
            addTime(ex);
            safetyLoop++;
        }
    }

    // --- STRATEGIA: LADDER (Progression) ---
    else if (mode === 'ladder') {
        // Ladder jest specyficzny - TU MOŻE BYĆ POWTÓRZENIE, bo to progresja.
        // Ale postaramy się, żeby baza była ciekawa.
        const sorted = candidates.sort((a,b) => (a.difficultyLevel || 1) - (b.difficultyLevel || 1));
        const baseEx = sorted[0]; // Najłatwiejsze

        if (!baseEx) return selectExercisesByMode(candidates, 'booster', targetSeconds, config, timeFactor);

        let currentEx = baseEx;
        let safetyLoop = 0;

        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            sequence.push(currentEx);
            addTime(currentEx);

            // Próba znalezienia progresji
            if (currentEx.nextProgressionId) {
                const nextEx = state.exerciseLibrary[currentEx.nextProgressionId];
                // Sprawdź czy progresja jest dozwolona i czy jest w kandydatach (bezpieczna)
                // Jeśli nie ma w kandydatach, to znaczy że może być za trudna/niebezpieczna
                const inCandidates = candidates.find(c => c.id === nextEx?.id);
                
                if (inCandidates) {
                    currentEx = inCandidates;
                } else {
                    // Brak progresji w bezpiecznej puli -> dobierz inne unikalne ćwiczenie
                    // aby nie robić w kółko tego samego na tym samym poziomie
                    const nextUnique = getUniqueOrFallback(candidates, sequence);
                    if (nextUnique) currentEx = nextUnique;
                }
            } else {
                // Brak zdefiniowanej progresji -> dobierz inne unikalne
                const nextUnique = getUniqueOrFallback(candidates, sequence);
                if (nextUnique) currentEx = nextUnique;
            }
            safetyLoop++;
        }
    }

    // --- STRATEGIA: SOS i RESET i BOOSTER (Standard Uniqueness) ---
    else {
        // Dla SOS, Reset i Booster stosujemy ogólną zasadę unikalności
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const ex = getUniqueOrFallback(candidates, sequence);
            sequence.push(ex);
            addTime(ex);
            safetyLoop++;
        }
    }

    return sequence;
}

// ============================================================
// HELPERY UNIKALNOŚCI (NO-REPEAT LOGIC)
// ============================================================

/**
 * Wybiera unikalne ćwiczenie z puli.
 * Jeśli pula unikalnych się wyczerpie, wybiera cokolwiek, co nie było OSTATNIE (unika A-A).
 */
function getUniqueOrFallback(pool, currentSequence) {
    if (!pool || pool.length === 0) return null;

    // 1. Zbiór użytych ID w tej sesji
    const usedIds = new Set(currentSequence.map(s => s.id));

    // 2. Filtrujemy pulę o te, których nie ma w użytych
    const available = pool.filter(ex => !usedIds.has(ex.id));

    // A. Mamy unikalne kandydatury
    if (available.length > 0) {
        // Wybieramy losowo z najlepszych (top 3 lub cała pula jeśli mała)
        // Zakładamy, że pool jest już posortowany po wyniku (Score)
        const topCount = Math.min(3, available.length);
        const topPool = available.slice(0, topCount);
        return topPool[Math.floor(Math.random() * topPool.length)];
    }

    // B. Brak unikalnych (wyczerpaliśmy pulę) -> Fallback
    // Wybieramy cokolwiek, co nie jest identyczne z ostatnim ćwiczeniem
    const last = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null;
    
    let fallbackPool = pool;
    if (last) {
        const notLast = pool.filter(ex => ex.id !== last.id);
        if (notLast.length > 0) fallbackPool = notLast;
    }

    // Z fallbacku też bierzemy "najlepsze" (początek listy)
    const topFallbackCount = Math.min(3, fallbackPool.length);
    const topFallback = fallbackPool.slice(0, topFallbackCount);
    
    return topFallback[Math.floor(Math.random() * topFallback.length)];
}

// ============================================================
// BUILD STEPS (TIMELINE)
// ============================================================

function buildSteps(exercises, config, mode, timeFactor) {
    const steps = [];

    // Krok 0: Start Protokołu
    steps.push({
        name: "Start Protokołu",
        isWork: false,
        isRest: true,
        duration: 5,
        sectionName: "Start",
        description: generateDescription(mode, 0)
    });

    exercises.forEach((ex, index) => {
        const workDuration = Math.round(config.work * timeFactor);
        const restDuration = Math.round(config.rest * timeFactor);

        // Obsługa Unilateral dla WSZYSTKICH trybów
        const isUnilateral = ex.isUnilateral ||
                             String(ex.reps_or_time).includes('/str') ||
                             String(ex.reps_or_time).includes('stron');

        if (isUnilateral) {
            // Krok LEWA
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

            // Krótka przerwa na zmianę strony (5s hardcoded)
            steps.push({
                name: "Zmiana Strony",
                isWork: false,
                isRest: true,
                duration: 5,
                sectionName: "Przejście",
                description: "Przygotuj drugą stronę"
            });

            // Krok PRAWA
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
            // Standardowy Krok (Bilateral)
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

        // REST STEP (jeśli nie ostatnie)
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
// HELPERY DANYCH (GET CANDIDATES)
// ============================================================

function getCandidates(mode, focusZone, ctx = { ignoreEquipment: false }) {
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const zoneConfig = ZONE_MAP[focusZone];
    const blacklist = state.blacklist || [];

    if (!zoneConfig) return [];

    return library.filter(ex => {
        if (blacklist.includes(ex.id)) return false;

        // 1. STRICT SAFETY CHECK
        if (ex.isAllowed !== true) {
            if (ctx.ignoreEquipment && ex.isAllowed === false && ex.rejectionReason === 'missing_equipment') {
                // Pass fallback
            } else {
                return false;
            }
        }

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // 2. FILTR TRYBU (Specyfika)
        if (mode === 'sos') {
            if (difficulty > 2) return false;
        }
        if (mode === 'booster') {
            if (difficulty < 2) return false;
        }
        if (mode === 'reset') {
            if (difficulty > 3) return false;
        }

        // NOWE TRYBY
        if (mode === 'calm') {
            if (difficulty > 2) return false;
            if (!['breathing_control', 'breathing', 'muscle_relaxation'].includes(ex.categoryId)) return false;
            // Preferuj pozycje leżące/siedzące dla Calm
            if (ex.position && !['supine', 'sitting'].includes(ex.position)) return false;
        }
        if (mode === 'flow') {
            if (difficulty > 3) return false;
            if (!['spine_mobility', 'hip_mobility', 'lumbar_extension_mobility', 'lumbar_rotation_mobility'].includes(ex.categoryId)) {
                // Dopuszczamy inne kategorie jeśli pasują do strefy bólu, ale generalnie Flow to mobilność
                if (!ex.painReliefZones || !ex.painReliefZones.includes(focusZone)) return false;
            }
        }
        if (mode === 'neuro') {
            if (difficulty > 3) return false; 
            const isFlossing = ex.categoryId === 'nerve_flossing';
            const matchesZone = ex.painReliefZones && ex.painReliefZones.some(z =>
                ['sciatica', 'lumbar_radiculopathy', 'femoral_nerve'].includes(z)
            );
            if (!isFlossing && !matchesZone) return false;
        }
        if (mode === 'ladder') {
            // Startujemy od łatwych/średnich
            if (difficulty > 3) return false;
        }

        // 3. DOPASOWANIE DO STREFY (Zone Logic)
        if (mode === 'calm') return true; // Calm ignoruje strefy anatomiczne (działa systemowo)

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

function getCandidatesSafeFallback(mode) {
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    return library.filter(ex => {
        if (ex.isAllowed !== true) return false;
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
            if (mode === 'calm') score -= 60; // Calm musi być świeży
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
        // NOWE TRYBY
        else if (mode === 'calm') {
            if (ex.youtube_url || ex.animationSvg) score += 15;
            if (ex.maxDuration && ex.maxDuration > 60) score += 10; // Promuj długie
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

    // Sortowanie malejące po wyniku
    candidates.sort((a, b) => b._genScore - a._genScore);
}

// ============================================================
// FORMATOWANIE
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
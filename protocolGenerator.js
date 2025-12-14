// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v3.1 (Time Factor in Protocols)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 * 
 * ZMIANY v3.1:
 * - Dodano Time Factor (Suwak Czasu) do protokołów.
 */

// Konfiguracja mapowania stref na kategorie/tagi
const ZONE_MAP = {
    // SOS & RESET
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation'] },
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] },
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },

    // BOOSTER
    'core': { type: 'cat', keys: ['core_anti_extension', 'core_anti_rotation', 'core_anti_flexion'] },
    'glute': { type: 'cat', keys: ['glute_activation'] },
    'full_body': { type: 'all', keys: [] }
};

// Parametry czasu
const TIMING_CONFIG = {
    'sos': { work: 60, rest: 15, tempo: 'Wolne / Oddechowe' },
    'reset': { work: 45, rest: 10, tempo: 'Płynne' },
    'booster': { work: 40, rest: 20, tempo: 'Dynamiczne' }
};

export function generateBioProtocol({ mode, focusZone, durationMin, userContext, timeFactor = 1.0 }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie v3.1: ${mode} / ${focusZone} (${durationMin} min, TimeFactor=${timeFactor})`);

    const targetSeconds = durationMin * 60 * timeFactor; // A. Poprawka: uwzględniamy timeFactor
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];

    // 1. Pobierz Kandydatów (Strict Mode)
    let candidates = getCandidates(mode, focusZone, { ignoreEquipment: false });

    // Fallback 1: Poluzowanie wymogów sprzętowych (TYLKO jeśli błąd to missing_equipment)
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Brak kandydatów. Poluzowanie wymogów sprzętowych.");
        candidates = getCandidates(mode, focusZone, { ignoreEquipment: true });
    }

    // Fallback 2: Ostateczny ratunek (Dowolne bezpieczne ćwiczenia)
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Krytyczny brak. Fallback na dowolne bezpieczne.");
        candidates = getCandidatesSafeFallback(mode);
    }

    if (candidates.length === 0) {
        throw new Error("Brak bezpiecznych ćwiczeń w bazie dla Twojego profilu.");
    }

    // 2. Sortowanie / Ważenie (z uwzględnieniem userContext/recent)
    scoreCandidates(candidates, mode, userContext);

    // 3. Wybór ćwiczeń zgodnie ze strategią trybu
    const selectedExercises = selectExercisesByMode(candidates, mode, targetSeconds, config);

    // 4. Budowa Kroków (Timeline)
    const flatExercises = buildSteps(selectedExercises, config, mode, timeFactor); // B. Time Factor przekazujemy do buildSteps

    // 5. Obliczenie realnego czasu
    const realTotalDuration = flatExercises.reduce((sum, step) => sum + (step.duration || 0), 0);

    // 6. Budowa Obiektu
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

function selectExercisesByMode(candidates, mode, targetSeconds, config) {
    const cycleTime = config.work + config.rest;
    // Dynamiczny limit iteracji + bufor
    const maxSteps = Math.ceil(targetSeconds / cycleTime) + 2; 
    let sequence = [];
    let currentSeconds = 0;

    // --- STRATEGIA 1: SOS (Stabilność i Powtarzalność) ---
    if (mode === 'sos') {
        // Wybierz TOP N (np. 4) najlepszych, bezpiecznych ćwiczeń
        const topN = candidates.slice(0, 4);
        
        let poolIndex = 0;
        let safetyLoop = 0;

        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const ex = topN[poolIndex % topN.length]; // Zapętlanie tylko TOP N
            sequence.push(ex);
            currentSeconds += cycleTime;
            poolIndex++;
            safetyLoop++;
        }
    }
    
    // --- STRATEGIA 2: RESET (Struktura Blokowa) ---
    else if (mode === 'reset') {
        // Filtrowanie podgrup
        const breathing = candidates.filter(ex => ['breathing', 'muscle_relaxation'].includes(ex.categoryId));
        const mobility = candidates.filter(ex => ['spine_mobility', 'hip_mobility', 'thoracic'].includes(ex.categoryId) || ex.painReliefZones.length > 0);
        const relax = candidates.filter(ex => ['stretching', 'muscle_relaxation'].includes(ex.categoryId));

        // Fallbacki wewnętrzne, jeśli brak specyficznych
        const poolA = breathing.length > 0 ? breathing : candidates.slice(0, 3);
        const poolB = mobility.length > 0 ? mobility : candidates;
        const poolC = relax.length > 0 ? relax : candidates.slice(0, 3);

        // Podział czasu: 20% Wstęp, 60% Główna, 20% Koniec
        const stepsA = Math.max(1, Math.round((maxSteps * 0.2)));
        const stepsC = Math.max(1, Math.round((maxSteps * 0.2)));
        const stepsB = Math.max(1, maxSteps - stepsA - stepsC);

        const fillPhase = (pool, count) => {
            for(let i=0; i<count; i++) {
                if (currentSeconds >= targetSeconds) return;
                // Losowość w obrębie bloku, ale bez powtórzeń bezpośrednich
                const ex = getNextUnique(pool, sequence); 
                sequence.push(ex);
                currentSeconds += cycleTime;
            }
        };

        fillPhase(poolA, stepsA);
        fillPhase(poolB, stepsB);
        fillPhase(poolC, stepsC);
    }

    // --- STRATEGIA 3: BOOSTER (Obwód i Różnorodność) ---
    else {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            // Próba znalezienia ćwiczenia o innej kategorii niż poprzednie
            let ex = getNextDiverse(candidates, sequence);
            
            // Fatigue mechanism: pod koniec sesji (ostatnie 25%) bierzemy te z niższym difficulty
            if (currentSeconds > targetSeconds * 0.75 && ex.difficultyLevel > 3) {
               const easier = candidates.find(c => c.difficultyLevel <= 3 && c.id !== ex.id);
               if (easier) ex = easier;
            }

            sequence.push(ex);
            currentSeconds += cycleTime;
            safetyLoop++;
        }
    }

    return sequence;
}

// Helper: Wybierz następy unikalny (bez powtórzenia ostatniego)
function getNextUnique(pool, currentSequence) {
    const last = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null;
    // Filtrujemy tylko bezpośrednie powtórzenie
    const available = pool.filter(ex => !last || ex.id !== last.id);
    if (available.length === 0) return pool[0]; // Nie powinno się zdarzyć przy dobrej puli
    return available[Math.floor(Math.random() * available.length)];
}

// Helper: Wybierz następny z różną kategorią (dla Boostera)
function getNextDiverse(pool, currentSequence) {
    const last = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null;
    
    // 1. Próba znalezienia innej kategorii
    let valid = pool.filter(ex => !last || ex.categoryId !== last.categoryId);
    
    // 2. Jeśli nie ma, próba znalezienia innego ID
    if (valid.length === 0) {
        valid = pool.filter(ex => !last || ex.id !== last.id);
    }
    
    // 3. Ostateczny fallback (tylko 1 ćwiczenie w puli)
    if (valid.length === 0) return pool[0];

    // Losuj z top 5 dostępnych (zachowujemy quality score)
    const candidates = valid.slice(0, 5);
    return candidates[Math.floor(Math.random() * candidates.length)];
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
        duration: 5, // Jawne duration
        sectionName: "Start",
        description: generateDescription(mode, 0) // Opis ogólny
    });

    exercises.forEach((ex, index) => {
        const workDuration = Math.round(config.work * timeFactor);  // C. Skalowanie czasu

        // WORK STEP
        steps.push({
            ...ex,
            exerciseId: ex.id,
            isWork: true,
            isRest: false,
            currentSet: 1,
            totalSets: 1,
            sectionName: mapModeToSectionName(mode),
            reps_or_time: `${workDuration} s`, // Tekst dla UI
            duration: workDuration,            // Liczba dla Timera
            sets: "1",
            tempo_or_iso: config.tempo,
            uniqueId: `${ex.id}_p${index}`
        });

        const restDuration = Math.round(config.rest * timeFactor); // C. Skalowanie Rest Time

        // REST STEP (jeśli nie jest to ostatnie ćwiczenie)
        if (index < exercises.length - 1) {
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
        // 1. Blacklist (Zawsze honorowana)
        if (blacklist.includes(ex.id)) return false;

        // 2. STRICT SAFETY CHECK (A1)
        // Tylko ćwiczenia jawnie dozwolone przez backend
        if (ex.isAllowed !== true) {
            // Wyjątek: Fallback sprzętowy
            if (ctx.ignoreEquipment && ex.isAllowed === false && ex.rejectionReason === 'missing_equipment') {
                // Przepuszczamy
            } else {
                // Odrzucamy wszystkie inne powody (safety, restrictions)
                return false;
            }
        }

        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // 3. Filtr Trybu (Specyfika Protokołu)
        if (mode === 'sos') {
            if (difficulty > 2) return false; // Tylko łatwe
        }
        if (mode === 'booster') {
            if (difficulty < 2) return false; // Tylko > 1
        }
        if (mode === 'reset') {
            if (difficulty > 3) return false; // Max średnie
        }

        // 4. Dopasowanie do Strefy (Zone Logic)
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
        // 1. Musi być dozwolone medycznie
        if (ex.isAllowed !== true) return false;

        // 2. Limity trudności per tryb
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);
        if (mode === 'sos' && difficulty > 2) return false;
        if (mode === 'reset' && difficulty > 3) return false;

        return true;
    }).slice(0, 15); // Bierzemy szerszą pulę do sortowania
}

function scoreCandidates(candidates, mode, userContext) {
    const recentSessions = userContext?.recentSessionIds || []; // "Short-term memory" (C)

    candidates.forEach(ex => {
        let score = 0;
        const pref = state.userPreferences[ex.id] || { score: 0 };
        const difficulty = parseInt(ex.difficultyLevel || 1, 10);

        // Baza: Affinity Score (-100 do +100)
        score += (pref.score || 0);

        // C. Short-term memory penalty (nie dotyczy SOS)
        if (mode !== 'sos' && recentSessions.includes(ex.id)) {
            score -= 50; 
        }

        // Mode Specific Scoring
        if (mode === 'booster') {
            // Booster lubi trudniejsze, ale różnorodne
            score += difficulty * 5; 
        }
        else if (mode === 'sos') {
            // SOS: Kara za trudność (agresywna)
            score -= difficulty * 20; 
            // Bonus za animację (instruktaż)
            if (ex.animationSvg) score += 20;
            // Bonus za strefy ulgi (nawet jeśli już przefiltrowane, te "bardziej" pasujące wyżej)
            if (ex.painReliefZones && ex.painReliefZones.length > 0) score += 15;
        }
        else if (mode === 'reset') {
            if (ex.categoryId === 'breathing') score += 40; // Priorytet oddechu
            if (difficulty > 2) score -= 10; // Lekka kara za trudność
        }

        // Randomness Control (A3)
        // SOS musi być stabilny (mały random). Booster może szaleć.
        const randomFactor = mode === 'sos' ? 5 : (mode === 'reset' ? 15 : 30);
        score += Math.random() * randomFactor;

        ex._genScore = score;
    });

    candidates.sort((a, b) => b._genScore - a._genScore);
}

// ============================================================
// FORMATOWANIE
// ============================================================

function generateTitle(mode, zone) {
    const zoneName = {
        'cervical': 'Szyja', 'thoracic': 'Plecy (Góra)', 'lumbar': 'Odcinek Lędźwiowy',
        'sciatica': 'Nerw Kulszowy', 'hips': 'Biodra', 'core': 'Brzuch / Core',
        'office': 'Anty-Biuro', 'sleep': 'Sen', 'glute': 'Pośladki', 'full_body': 'Całe Ciało'
    }[zone] || 'Bio-Protokół';

    const suffix = { 'sos': 'Ratunkowy', 'booster': 'Power', 'reset': 'Flow' }[mode] || '';
    return `${zoneName}: ${suffix}`;
}

function generateDescription(mode, duration) {
    if (mode === 'sos') return `Sesja ratunkowa (${duration} min). Ruchy powolne, bezbólowe.`;
    if (mode === 'booster') return `Intensywny trening (${duration} min). Utrzymuj technikę.`;
    return `Regeneracja (${duration} min). Skup się na oddechu.`;
}

function mapModeToSectionName(mode) {
    if (mode === 'sos') return 'Terapia';
    if (mode === 'booster') return 'Ogień';
    return 'Regeneracja';
}

function getRestName(mode) {
    if (mode === 'booster') return 'Szybka Przerwa';
    return 'Rozluźnienie';
}

function calculateXP(mode, minutes) {
    const base = minutes * 10;
    if (mode === 'booster') return Math.round(base * 1.5);
    return base;
}

function calculateResilienceBonus(mode) {
    if (mode === 'sos' || mode === 'reset') return 5;
    return 1;
}
// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR v4.0 (Enhanced Modes)
 * Moduł odpowiedzialny za dynamiczne tworzenie sesji "Bio-Protocols".
 *
 * ZMIANY v4.0:
 * - Fix: TimeFactor zmienia tempo, a nie długość sesji.
 * - Nowe tryby: CALM, FLOW, NEURO, LADDER.
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
    console.log(`🧪 [ProtocolGenerator] Generowanie v4.0: ${mode} / ${focusZone} (${durationMin} min, TimeFactor=${timeFactor})`);

    // 1. POPRAWKA TIMINGU (Time Factor Fix)
    // TimeFactor zmienia tempo (długość ćwiczeń), ale NIE zmienia całkowitego czasu trwania sesji.
    // Dzięki temu 5 minut to zawsze 5 minut, ale przy timeFactor=1.5 robimy mniej ćwiczeń, wolniej.
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

    // 5. Budowa Kroków (Timeline)
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
    // Obliczamy cykl skalowany przez TimeFactor, aby wiedzieć ile ćwiczeń się zmieści
    const cycleTime = (config.work + config.rest) * timeFactor;
    
    const maxSteps = Math.ceil(targetSeconds / cycleTime) + 2;
    let sequence = [];
    let currentSeconds = 0;

    // --- STRATEGIA: CALM (Downshift) ---
    if (mode === 'calm') {
        const breathing = candidates.filter(ex => ['breathing_control', 'breathing'].includes(ex.categoryId));
        const relax = candidates.filter(ex => ex.categoryId === 'muscle_relaxation');
        
        // Pula zapasowa
        const poolA = breathing.length > 0 ? breathing : candidates.slice(0, 3);
        const poolB = relax.length > 0 ? relax : candidates.slice(0, 3);

        // Proporcja 70/30 (ale Calm ma długie czasy, więc mało kroków)
        // Po prostu przeplatamy: A, A, B...
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const isRelaxPhase = (sequence.length + 1) % 3 === 0; // co trzeci to B
            const pool = isRelaxPhase ? poolB : poolA;
            
            // Losuj z top 3
            const subPool = pool.slice(0, 3);
            const ex = subPool[Math.floor(Math.random() * subPool.length)];
            
            sequence.push(ex);
            currentSeconds += cycleTime;
            safetyLoop++;
        }
    }

    // --- STRATEGIA: FLOW (Mobility) ---
    else if (mode === 'flow') {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            // Reguła: Unikaj powtórzenia tej samej płaszczyzny (plane) i pozycji
            const last = sequence.length > 0 ? sequence[sequence.length - 1] : null;
            
            let valid = candidates.filter(ex => {
                if (last && ex.id === last.id) return false; // Bez bezpośrednich powtórzeń
                
                // Unikaj tej samej płaszczyzny pod rząd
                if (last && ex.primaryPlane && last.primaryPlane && ex.primaryPlane === last.primaryPlane && ex.primaryPlane !== 'multi') {
                    return false; 
                }
                return true;
            });

            // Jeśli filtr zbyt restrykcyjny, poluzuj
            if (valid.length === 0) valid = candidates.filter(ex => !last || ex.id !== last.id);
            if (valid.length === 0) valid = candidates;

            // Losuj z Top 5
            const subPool = valid.slice(0, 5);
            const ex = subPool[Math.floor(Math.random() * subPool.length)];
            
            sequence.push(ex);
            currentSeconds += cycleTime;
            safetyLoop++;
        }
    }

    // --- STRATEGIA: NEURO (Nerve Glide) ---
    else if (mode === 'neuro') {
        // Wybierz 2 główne ćwiczenia (najlepiej dopasowane do strefy)
        const mainPool = candidates.slice(0, 3); // Top 3 scored (scoring promuje strefę)
        
        let poolIndex = 0;
        let safetyLoop = 0;
        
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            const ex = mainPool[poolIndex % mainPool.length];
            
            // Jeśli unilateralne, zajmuje "więcej czasu" w percepcji użytkownika (L+P)
            // W buildSteps rozbijemy to na 2 kroki, ale tutaj liczymy czas logicznie
            const durationMult = (ex.isUnilateral || String(ex.reps_or_time).includes('/str')) ? 2 : 1;
            
            sequence.push(ex);
            currentSeconds += cycleTime * durationMult;
            
            // Nie powtarzaj tego samego częściej niż co 2 kroki (chyba że pula mała)
            if (mainPool.length > 1) poolIndex++;
            safetyLoop++;
        }
    }

    // --- STRATEGIA: LADDER (Progression) ---
    else if (mode === 'ladder') {
        // Znajdź bazę (najłatwiejsze z topki)
        const baseEx = candidates.slice(0, 5).sort((a,b) => (a.difficultyLevel || 1) - (b.difficultyLevel || 1))[0];
        
        if (!baseEx) {
            // Fallback do Boostera jeśli pusto
            return selectExercisesByMode(candidates, 'booster', targetSeconds, config, timeFactor);
        }

        let currentEx = baseEx;
        let safetyLoop = 0;

        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            sequence.push(currentEx);
            currentSeconds += cycleTime;

            // Próba progresji
            if (currentEx.nextProgressionId) {
                const nextEx = state.exerciseLibrary[currentEx.nextProgressionId];
                // Sprawdź czy nextEx istnieje, jest dozwolone i nie za trudne
                if (nextEx && nextEx.isAllowed !== false && (nextEx.difficultyLevel || 1) <= (currentEx.difficultyLevel + 1)) {
                    // Sprawdź czy mamy sprzęt do progresji (używając simple check, bo ex z library nie ma przefiltrowanych flag)
                    // Zakładamy optymistycznie lub sprawdzamy w candidates
                    const inCandidates = candidates.find(c => c.id === nextEx.id);
                    if (inCandidates) {
                        currentEx = inCandidates; // Awansuj
                    } else {
                        // Zostań przy obecnym lub weź inne bazowe
                        // Reset do innego bazowego co jakiś czas dla urozmaicenia
                        if (Math.random() > 0.6 && candidates.length > 2) {
                             currentEx = candidates[Math.floor(Math.random() * 3)];
                        }
                    }
                }
            } else {
                // Koniec drabiny, losuj nowe
                currentEx = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
            }
            safetyLoop++;
        }
    }

    // --- STRATEGIA: SOS (Istniejąca) ---
    else if (mode === 'sos') {
        const topN = candidates.slice(0, 4);
        let poolIndex = 0;
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            sequence.push(topN[poolIndex % topN.length]);
            currentSeconds += cycleTime;
            poolIndex++;
            safetyLoop++;
        }
    }

    // --- STRATEGIA: RESET (Istniejąca) ---
    else if (mode === 'reset') {
        const breathing = candidates.filter(ex => ['breathing', 'muscle_relaxation'].includes(ex.categoryId));
        const mobility = candidates.filter(ex => ['spine_mobility', 'hip_mobility', 'thoracic'].includes(ex.categoryId) || ex.painReliefZones.length > 0);
        const relax = candidates.filter(ex => ['stretching', 'muscle_relaxation'].includes(ex.categoryId));

        const poolA = breathing.length > 0 ? breathing : candidates.slice(0, 3);
        const poolB = mobility.length > 0 ? mobility : candidates;
        const poolC = relax.length > 0 ? relax : candidates.slice(0, 3);

        const stepsA = Math.max(1, Math.round((maxSteps * 0.2)));
        const stepsC = Math.max(1, Math.round((maxSteps * 0.2)));
        const stepsB = Math.max(1, maxSteps - stepsA - stepsC);

        const fillPhase = (pool, count) => {
            for(let i=0; i<count; i++) {
                if (currentSeconds >= targetSeconds) return;
                const ex = getNextUnique(pool, sequence);
                sequence.push(ex);
                currentSeconds += cycleTime;
            }
        };
        fillPhase(poolA, stepsA);
        fillPhase(poolB, stepsB);
        fillPhase(poolC, stepsC);
    }

    // --- STRATEGIA: BOOSTER (Istniejąca) ---
    else {
        let safetyLoop = 0;
        while (currentSeconds < targetSeconds && safetyLoop < maxSteps) {
            let ex = getNextDiverse(candidates, sequence);
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

// Helper: Wybierz następy unikalny
function getNextUnique(pool, currentSequence) {
    const last = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null;
    const available = pool.filter(ex => !last || ex.id !== last.id);
    if (available.length === 0) return pool[0];
    return available[Math.floor(Math.random() * available.length)];
}

// Helper: Wybierz następny z różną kategorią
function getNextDiverse(pool, currentSequence) {
    const last = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null;
    let valid = pool.filter(ex => !last || ex.categoryId !== last.categoryId);
    if (valid.length === 0) valid = pool.filter(ex => !last || ex.id !== last.id);
    if (valid.length === 0) return pool[0];
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
        duration: 5,
        sectionName: "Start",
        description: generateDescription(mode, 0)
    });

    exercises.forEach((ex, index) => {
        const workDuration = Math.round(config.work * timeFactor);
        const restDuration = Math.round(config.rest * timeFactor);

        // Obsługa Unilateral dla NEURO (Rozbicie na L i P)
        const isUnilateral = ex.isUnilateral || String(ex.reps_or_time).includes('/str');
        
        if (mode === 'neuro' && isUnilateral) {
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
            
            // Krótka przerwa na zmianę strony (opcjonalna, dajemy 5s hardcoded)
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
            // Standardowy Krok
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
            if (difficulty > 3) return false; // Neuro może być trudniejsze technicznie, ale nie siłowo
            // Jeśli focus to rwa/biodra, szukamy nerve_flossing
            const isFlossing = ex.categoryId === 'nerve_flossing';
            const matchesZone = ex.painReliefZones && ex.painReliefZones.some(z => 
                ['sciatica', 'lumbar_radiculopathy', 'femoral_nerve'].includes(z)
            );
            
            // Jeśli nie flossing i nie pasuje do strefy neuro, odrzuć
            if (!isFlossing && !matchesZone) return false;
        }
        if (mode === 'ladder') {
            // Startujemy od łatwych/średnich
            if (difficulty > 3) return false; 
        }

        // 3. DOPASOWANIE DO STREFY (Zone Logic)
        // Dla trybów ogólnych (Calm/Flow) strefa ma mniejsze znaczenie jako hard-filter, 
        // ale wciąż używamy jej do zawężenia puli jeśli zdefiniowana.
        
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
            // Tutaj ciężko ocenić "zmienność" bo nie mamy kontekstu poprzedniego kroku
            // Promujemy po prostu dobre ćwiczenia mobilnościowe
            if (ex.categoryId.includes('mobility')) score += 10;
        }
        else if (mode === 'neuro') {
            // Bonus za strefę i unilateralność
            if (ex.categoryId === 'nerve_flossing') score += 30;
            if (ex.isUnilateral) score += 20;
        }
        else if (mode === 'ladder') {
            // Promuj te, które mają dalszą progresję
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
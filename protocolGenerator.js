// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR (v2.0 - Server-Side Validation Aware)
 * Moduł odpowiedzialny za dynamiczne tworzenie krótkich sesji "Bio-Protocols".
 * Ufa walidacji z backendu (isAllowed), zamiast sprawdzać warunki lokalnie.
 */

// Konfiguracja mapowania stref na kategorie/tagi
const ZONE_MAP = {
    // SOS & RESET (Opiera się na pain_relief_zones lub kategoriach relaksacyjnych)
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation'] },
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] },
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },

    // BOOSTER (Opiera się na kategoriach biomechanicznych)
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

export function generateBioProtocol({ mode, focusZone, durationMin, userContext }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie: ${mode} / ${focusZone} (${durationMin} min)`);

    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];
    
    // 1. Pobierz Kandydatów (Respektując walidację serwerową)
    let candidates = getCandidates(mode, focusZone, { ignoreEquipment: false });

    // Fallback: Jeśli brak kandydatów, spróbuj poluzować wymogi sprzętowe
    // (ale NADAL respektuj zakazy medyczne!)
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Brak kandydatów. Poluzowanie wymogów sprzętowych.");
        candidates = getCandidates(mode, focusZone, { ignoreEquipment: true });
    }

    if (candidates.length === 0) {
        // Ostateczny fallback: Daj cokolwiek bezpiecznego medycznie (niezależnie od strefy)
        console.warn("[ProtocolGenerator] Krytyczny brak. Fallback na dowolne bezpieczne.");
        candidates = getCandidatesSafeFallback();
    }

    if (candidates.length === 0) {
        throw new Error("Brak bezpiecznych ćwiczeń w bazie dla Twojego profilu.");
    }

    // 2. Sortowanie / Ważenie (Affinity & Difficulty)
    scoreCandidates(candidates, mode);

    // 3. Time-Boxing
    const protocolExercises = buildTimeline(candidates, targetSeconds, config, mode);

    // 4. Budowa Obiektu
    const protocol = {
        id: `proto_${mode}_${focusZone}_${Date.now()}`,
        title: generateTitle(mode, focusZone),
        description: generateDescription(mode, durationMin),
        type: 'protocol',
        mode: mode,
        totalDuration: durationMin * 60,
        xpReward: calculateXP(mode, durationMin),
        resilienceBonus: calculateResilienceBonus(mode),
        flatExercises: protocolExercises.flatMap((ex, index) => {
            const steps = [];
            
            // Work
            steps.push({
                ...ex,
                exerciseId: ex.id, 
                isWork: true,
                isRest: false,
                currentSet: 1,
                totalSets: 1,
                sectionName: mapModeToSectionName(mode),
                reps_or_time: `${config.work} s`,
                sets: "1",
                tempo_or_iso: config.tempo,
                uniqueId: `${ex.id}_p${index}` 
            });

            // Transition
            if (index < protocolExercises.length - 1) {
                steps.push({
                    name: getRestName(mode),
                    isWork: false,
                    isRest: true,
                    duration: config.rest,
                    sectionName: "Przejście",
                    description: `Przygotuj się do: ${protocolExercises[index + 1].name}`
                });
            }
            return steps;
        })
    };

    // Wstęp
    protocol.flatExercises.unshift({
        name: "Start Protokołu",
        isWork: false,
        isRest: true,
        duration: 5,
        sectionName: "Start",
        description: protocol.description
    });

    return protocol;
}

// ============================================================
// HELPERY LOGIKI
// ============================================================

function getCandidates(mode, focusZone, ctx = { ignoreEquipment: false }) {
    // Pobieramy ID poprawnie (entries -> map)
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    
    const zoneConfig = ZONE_MAP[focusZone];
    const blacklist = state.blacklist || [];

    if (!zoneConfig) return [];

    return library.filter(ex => {
        // 1. Blacklist (Lokalna preferencja usera - zawsze ważna)
        if (blacklist.includes(ex.id)) return false;

        // 2. SERVER-SIDE VALIDATION (Kluczowa zmiana)
        // Flaga isAllowed pochodzi z backendu (_clinical-rule-engine.js)
        if (ex.isAllowed === false) {
            // Wyjątek: Jeśli to błąd sprzętu A my pozwalamy go ignorować (Fallback)
            if (ctx.ignoreEquipment && ex.rejectionReason === 'missing_equipment') {
                // Puszczamy dalej (User może być np. na siłowni mimo profilu Home)
            } 
            // Każdy inny powód (restrykcja fizyczna, ból, severity) -> BLOKUJEMY BEZWZGLĘDNIE
            else {
                return false;
            }
        }

        // 3. Filtr Trybu (Specyfika Protokołu)
        if (mode === 'sos') {
            if ((ex.difficultyLevel || 1) > 2) return false; 
        }
        if (mode === 'booster') {
            if ((ex.difficultyLevel || 1) < 2) return false; 
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

/**
 * Zwraca cokolwiek, co jest bezpieczne medycznie (isAllowed === true), 
 * ignorując temat (strefę), byle user mógł cokolwiek zrobić.
 */
function getCandidatesSafeFallback() {
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    // Bierzemy tylko te dozwolone przez serwer (sprzęt i zdrowie)
    return library.filter(ex => ex.isAllowed === true).slice(0, 10);
}

function scoreCandidates(candidates, mode) {
    candidates.forEach(ex => {
        let score = 0;
        const pref = state.userPreferences[ex.id] || { score: 0 };
        
        score += (pref.score || 0);

        if (mode === 'booster') score += (ex.difficultyLevel || 1) * 5;
        if (mode === 'sos') {
            score -= (ex.difficultyLevel || 1) * 10; 
            if (ex.animationSvg) score += 20;
        }
        if (mode === 'reset' && ex.categoryId === 'breathing') score += 30;

        score += Math.random() * 25;
        ex._genScore = score;
    });

    candidates.sort((a, b) => b._genScore - a._genScore);
}

function buildTimeline(pool, targetSeconds, config, mode) {
    const selected = [];
    let currentSeconds = 0;
    let poolIndex = 0;
    
    let safetyCounter = 0;

    while (currentSeconds + config.work <= targetSeconds && safetyCounter < 50) {
        if (poolIndex >= pool.length) {
            if (mode === 'booster') poolIndex = 0; 
            else break; 
        }

        const candidate = pool[poolIndex];
        selected.push(candidate);
        currentSeconds += config.work;
        
        if (currentSeconds + config.rest <= targetSeconds) {
            currentSeconds += config.rest;
        }

        poolIndex++;
        safetyCounter++;
    }

    return selected;
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
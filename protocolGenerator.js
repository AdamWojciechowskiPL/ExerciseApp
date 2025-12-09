// protocolGenerator.js
import { state } from './state.js';

/**
 * PROTOCOL GENERATOR
 * Moduł odpowiedzialny za dynamiczne tworzenie krótkich sesji "Bio-Protocols" (SOS, Booster, Reset).
 */

// Konfiguracja mapowania stref na kategorie/tagi
const ZONE_MAP = {
    // SOS & RESET (Opiera się na pain_relief_zones lub kategoriach relaksacyjnych)
    'cervical': { type: 'zone', keys: ['cervical', 'neck', 'upper_traps'] },
    'thoracic': { type: 'zone', keys: ['thoracic', 'posture', 'shoulder_mobility'] },
    'lumbar': { type: 'zone', keys: ['lumbar_general', 'lumbar_extension_intolerant', 'lumbar_flexion_intolerant'] },
    'sciatica': { type: 'zone', keys: ['sciatica', 'piriformis', 'nerve_flossing'] },
    'hips': { type: 'cat', keys: ['hip_mobility', 'glute_activation'] },
    'office': { type: 'mixed', keys: ['thoracic', 'hip_mobility', 'neck'] }, // Combo biurowe
    'sleep': { type: 'cat', keys: ['breathing', 'muscle_relaxation', 'stretching'] },

    // BOOSTER (Opiera się na kategoriach biomechanicznych)
    'core': { type: 'cat', keys: ['core_anti_extension', 'core_anti_rotation', 'core_anti_flexion'] },
    'glute': { type: 'cat', keys: ['glute_activation'] },
    'full_body': { type: 'all', keys: [] }
};

// Domyślne parametry czasu dla różnych trybów (w sekundach)
const TIMING_CONFIG = {
    'sos': { work: 60, rest: 15, tempo: 'Wolne / Oddechowe' },
    'reset': { work: 45, rest: 10, tempo: 'Płynne' },
    'booster': { work: 40, rest: 20, tempo: 'Dynamiczne' }
};

/**
 * Główna funkcja generująca protokół.
 * @param {Object} params - Konfiguracja protokołu
 * @param {string} params.mode - 'sos' | 'booster' | 'reset'
 * @param {string} params.focusZone - np. 'cervical', 'core', 'office'
 * @param {number} params.durationMin - Czas trwania w minutach (np. 5)
 * @param {Object} [params.userContext] - Opcjonalne nadpisanie kontekstu (sprzęt, kontuzje)
 */
export function generateBioProtocol({ mode, focusZone, durationMin, userContext }) {
    console.log(`🧪 [ProtocolGenerator] Generowanie: ${mode} / ${focusZone} (${durationMin} min)`);

    const targetSeconds = durationMin * 60;
    const config = TIMING_CONFIG[mode] || TIMING_CONFIG['reset'];
    
    // 1. Pobierz Kandydatów
    let candidates = getCandidates(mode, focusZone, userContext);

    // Jeśli brak kandydatów (np. przez filtry sprzętu), poluzuj filtry (fallback)
    if (candidates.length === 0) {
        console.warn("[ProtocolGenerator] Brak kandydatów. Uruchamiam fallback.");
        candidates = getCandidates(mode, focusZone, { ...userContext, ignoreEquipment: true });
    }

    if (candidates.length === 0) {
        // Ostateczny fallback - cokolwiek z bazy, byle nie crash
        // Pobieramy ID poprawnie również tutaj
        candidates = Object.entries(state.exerciseLibrary)
            .map(([id, data]) => ({ id, ...data }))
            .slice(0, 10);
    }

    // 2. Sortowanie / Ważenie (Logika Affinity i Difficulty)
    scoreCandidates(candidates, mode);

    // 3. Time-Boxing (Dobór ćwiczeń do czasu)
    const protocolExercises = buildTimeline(candidates, targetSeconds, config, mode);

    // 4. Budowa Obiektu Wynikowego
    const protocol = {
        id: `proto_${mode}_${focusZone}_${Date.now()}`,
        title: generateTitle(mode, focusZone),
        description: generateDescription(mode, durationMin),
        type: 'protocol', // Flaga dla UI
        mode: mode,
        totalDuration: durationMin * 60,
        
        // Metadane Gamifikacji
        xpReward: calculateXP(mode, durationMin),
        resilienceBonus: calculateResilienceBonus(mode),

        // Lista ćwiczeń gotowa dla training.js
        flatExercises: protocolExercises.flatMap((ex, index) => {
            const steps = [];
            
            // A. Ćwiczenie (Work)
            steps.push({
                ...ex,
                // KLUCZOWE: Upewniamy się, że exerciseId jest ustawione
                exerciseId: ex.id, 
                isWork: true,
                isRest: false,
                currentSet: 1,
                totalSets: 1,
                sectionName: mapModeToSectionName(mode),
                reps_or_time: `${config.work} s`,
                sets: "1",
                tempo_or_iso: config.tempo,
                // Zachowujemy oryginalne ID, ale dodajemy suffix dla unikalności w pętli
                uniqueId: `${ex.id}_p${index}` 
            });

            // B. Przerwa (Transition) - chyba że to ostatnie ćwiczenie
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

    // Dodanie wstępu "Przygotuj się"
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

function getCandidates(mode, focusZone, ctx = {}) {
    // --- FIX: POPRAWNE POBIERANIE ID ---
    // Zamiast Object.values(), używamy entries i mapujemy, aby 'id' stało się częścią obiektu.
    // Bez tego 'ex.id' było undefined, co psuło logowanie w Summary.
    const library = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    
    const zoneConfig = ZONE_MAP[focusZone];
    const userEquipment = state.settings.equipment || [];
    const blacklist = state.blacklist || [];

    if (!zoneConfig) {
        console.error(`Nieznana strefa: ${focusZone}`);
        return [];
    }

    return library.filter(ex => {
        // 1. Czarna lista
        if (blacklist.includes(ex.id)) return false;

        // 2. Sprzęt (chyba że ignorujemy w fallbacku)
        if (!ctx.ignoreEquipment && !checkEquipment(ex, userEquipment)) return false;

        // 3. Filtr Trybu (Safety First dla SOS)
        if (mode === 'sos') {
            if ((ex.difficultyLevel || 1) > 2) return false; // Tylko łatwe
        }
        if (mode === 'booster') {
            if ((ex.difficultyLevel || 1) < 2) return false; // Bez za łatwych (chyba że brak innych)
        }

        // 4. Dopasowanie do Strefy
        if (zoneConfig.type === 'zone') {
            // Szukamy w pain_relief_zones
            const reliefZones = ex.painReliefZones || ex.pain_relief_zones || [];
            return reliefZones.some(z => zoneConfig.keys.includes(z));
        } 
        else if (zoneConfig.type === 'cat') {
            // Szukamy w kategorii
            return zoneConfig.keys.includes(ex.categoryId);
        }
        else if (zoneConfig.type === 'mixed') {
            // Mix: sprawdź kategorię LUB strefę
            const reliefZones = ex.painReliefZones || [];
            return zoneConfig.keys.includes(ex.categoryId) || reliefZones.some(z => zoneConfig.keys.includes(z));
        }
        else if (zoneConfig.type === 'all') {
            return true;
        }

        return false;
    });
}

function checkEquipment(ex, userEquipment) {
    if (!ex.equipment) return true;
    const reqEq = ex.equipment.toLowerCase();
    if (reqEq.includes('brak') || reqEq.includes('none') || reqEq.includes('bodyweight')) return true;
    
    const requirements = reqEq.split(',').map(s => s.trim());
    return requirements.every(req => {
        return userEquipment.some(owned => owned.toLowerCase().includes(req) || req.includes(owned.toLowerCase()));
    });
}

function scoreCandidates(candidates, mode) {
    candidates.forEach(ex => {
        let score = 0;
        const pref = state.userPreferences[ex.id] || { score: 0 };
        
        // Affinity Score (User Likes)
        score += (pref.score || 0);

        // Booster promuje wyższe affinity
        if (mode === 'booster') {
            score += (ex.difficultyLevel || 1) * 5; // Promuj trudniejsze
        }
        
        // SOS promuje łatwiejsze i sprawdzone
        if (mode === 'sos') {
            score -= (ex.difficultyLevel || 1) * 10; // Promuj łatwiejsze
            if (ex.animationSvg) score += 20; // Lepiej te z animacją dla pewności techniki
        }

        // Reset lubi ćwiczenia oddechowe
        if (mode === 'reset' && ex.categoryId === 'breathing') {
            score += 30;
        }

        // Random Factor (żeby nie było nudno)
        score += Math.random() * 25;

        ex._genScore = score;
    });

    // Sortowanie malejąco (najlepsze na początku)
    candidates.sort((a, b) => b._genScore - a._genScore);
}

function buildTimeline(pool, targetSeconds, config, mode) {
    const selected = [];
    let currentSeconds = 0;
    let poolIndex = 0;
    
    // Bezpiecznik pętli
    let safetyCounter = 0;

    while (currentSeconds + config.work <= targetSeconds && safetyCounter < 50) {
        if (poolIndex >= pool.length) {
            // Jeśli skończyły się unikalne ćwiczenia:
            if (mode === 'booster') poolIndex = 0; // W boosterze robimy obwód
            else break; // W SOS/Reset kończymy wcześniej
        }

        const candidate = pool[poolIndex];
        
        // Dodaj do listy
        selected.push(candidate);
        
        // Aktualizuj czas
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
// FORMATOWANIE TEKSTÓW I NAGRÓD
// ============================================================

function generateTitle(mode, zone) {
    const zoneName = {
        'cervical': 'Szyja',
        'thoracic': 'Plecy (Góra)',
        'lumbar': 'Odcinek Lędźwiowy',
        'sciatica': 'Nerw Kulszowy',
        'hips': 'Biodra',
        'core': 'Brzuch / Core',
        'office': 'Anty-Biuro',
        'sleep': 'Sen',
        'glute': 'Pośladki',
        'full_body': 'Całe Ciało'
    }[zone] || 'Bio-Protokół';

    const suffix = {
        'sos': 'Ratunkowy',
        'booster': 'Power',
        'reset': 'Flow'
    }[mode] || '';

    return `${zoneName}: ${suffix}`;
}

function generateDescription(mode, duration) {
    if (mode === 'sos') return `Krótka sesja (${duration} min) nastawiona na redukcję bólu i napięcia. Wykonuj ruchy powoli, w zakresie bezbolesnym.`;
    if (mode === 'booster') return `Intensywne ${duration} minut dla Twoich mięśni. Utrzymuj tempo i technikę.`;
    return `Zestaw regeneracyjny (${duration} min). Skup się na głębokim oddechu i rozluźnieniu.`;
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
    if (mode === 'sos' || mode === 'reset') return 5; // +5% regeneracji tarczy
    return 1; // Minimalny bonus za booster
}
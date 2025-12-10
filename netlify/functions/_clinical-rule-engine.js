// netlify/functions/_clinical-rule-engine.js

/**
 * CLINICAL RULE ENGINE
 * Centralny moduł walidacji bezpieczeństwa ćwiczeń.
 * Używany przez generator planów oraz endpointy dostarczające content do aplikacji.
 */

const DIFFICULTY_MAP = {
    'none': 1,
    'occasional': 2,
    'regular': 3,
    'advanced': 4
};

// --- POMOCNICZE FUNKCJE ANALIZY ---

function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];

    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) {
        return 'flexion_intolerant';
    }
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) {
        return 'extension_intolerant';
    }
    return 'neutral';
}

/**
 * Buduje znormalizowany kontekst użytkownika na podstawie surowych danych z Wizarda.
 * Oblicza severity, patterns, difficulty caps itp.
 */
function buildUserContext(userData) {
    // 1. Wzorce ruchu
    const tolerancePattern = detectTolerancePattern(userData.trigger_movements, userData.relief_movements);

    // 2. Analiza bólu i Severity
    const painChar = userData.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');

    const painInt = parseInt(userData.pain_intensity) || 0;
    const impact = parseInt(userData.daily_impact) || 0;

    let severityScore = (painInt + impact) / 2;
    if (isPainSharp) severityScore *= 1.2;

    const isSevere = severityScore >= 6.5;

    // 3. Difficulty Cap
    const experienceKey = userData.exercise_experience;
    const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;
    let difficultyCap = baseDifficultyCap;

    if (isSevere) {
        difficultyCap = Math.min(baseDifficultyCap, 2);
    } else if (isPainSharp && severityScore >= 4) {
        difficultyCap = Math.min(baseDifficultyCap, 3);
    }

    // 4. Pain Filters (Lokalizacja)
    const painLocs = userData.pain_locations || [];
    const painFilters = new Set();
    if (painLocs.length > 0) {
        painLocs.forEach(loc => painFilters.add(loc));
        // Rozszerzanie kontekstu lędźwi
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
    } else {
        // Fallback
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    // 5. Sprzęt i Restrykcje
    const userEquipment = (userData.equipment_available || []).map(e => e.toLowerCase());
    const physicalRestrictions = userData.physical_restrictions || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        difficultyCap,
        painFilters, // Set
        userEquipment, // Array lowercased
        physicalRestrictions,
        blockedIds: new Set() // Do uzupełnienia z zewnątrz (blacklist)
    };
}

// --- FUNKCJE WALIDUJĄCE (ZASADY) ---

function checkEquipment(ex, userEquipment) {
    if (!ex.equipment || ex.equipment.length === 0) return true;
    
    // Normalizacja do tablicy stringów (jeśli jeszcze nie jest)
    let exEquip = Array.isArray(ex.equipment) ? ex.equipment : ex.equipment.split(',').map(e => e.trim());
    
    // Sprawdzenie "braku sprzętu"
    const isNone = exEquip.some(e => {
        const el = e.toLowerCase();
        return el.includes('brak') || el.includes('masa własna') || el.includes('none') || el === '';
    });
    if (isNone) return true;

    // Weryfikacja posiadania
    const hasAll = exEquip.every(req => {
        const reqLower = req.toLowerCase();
        return userEquipment.some(owned => owned.includes(reqLower) || reqLower.includes(owned));
    });

    return hasAll;
}

function violatesRestrictions(ex, restrictions) {
    const plane = ex.primary_plane || 'multi';
    const pos = ex.position || null;

    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped') return true;
    }
    if (restrictions.includes('no_twisting')) {
        if (plane === 'rotation') return true;
    }
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }
    // Nowe restrykcje można dodawać tutaj
    if (restrictions.includes('no_high_impact')) {
        // Zakładamy, że high impact to np. skoki (można dodać tag w bazie w przyszłości)
        // Na razie placeholder
    }

    return false;
}

function passesTolerancePattern(ex, tolerancePattern) {
    const plane = ex.primary_plane || 'multi';
    const zones = ex.pain_relief_zones || [];

    if (tolerancePattern === 'flexion_intolerant') {
        // Jeśli ruch to zgięcie, a ćwiczenie NIE jest oznaczone jako bezpieczne/lecznicze dla zgięciowców
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) {
            return false;
        }
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) {
            return false;
        }
    }
    return true;
}

/**
 * Sprawdza czy ćwiczenie jest dozwolone dla danego użytkownika (Main Check).
 * 
 * @param {Object} ex - Obiekt ćwiczenia z bazy
 * @param {Object} ctx - Kontekst użytkownika (z buildUserContext)
 * @param {Object} options - Opcje (np. { ignoreDifficulty: true, ignoreEquipment: false })
 * @returns {Object} { allowed: boolean, reason: string|null }
 */
function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;

    // 1. Blacklist
    if (ctx.blockedIds.has(ex.id)) {
        return { allowed: false, reason: 'blacklisted' };
    }

    // 2. Sprzęt
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) {
        return { allowed: false, reason: 'missing_equipment' };
    }

    // 3. Poziom trudności (Cap)
    const exLevel = ex.difficulty_level || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) {
        return { allowed: false, reason: 'too_hard_calculated' };
    }

    // 4. Restrykcje fizyczne (pozycja, ruch)
    if (violatesRestrictions(ex, ctx.physicalRestrictions)) {
        return { allowed: false, reason: 'physical_restriction' };
    }

    // 5. Wzorce tolerancji (Biomechanika)
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) {
        return { allowed: false, reason: 'biomechanics_mismatch' };
    }

    // 6. Severity (Tryb ostry)
    // W trybie ostrym (severe) dopuszczamy TYLKO ćwiczenia, które są w strefie ulgi
    if (strictSeverity && ctx.isSevere) {
        const zones = ex.pain_relief_zones || [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) {
            return { allowed: false, reason: 'severity_filter' };
        }
    }

    return { allowed: true, reason: null };
}

module.exports = {
    buildUserContext,
    checkExerciseAvailability,
    // Eksport helperów, jeśli potrzebne oddzielnie:
    checkEquipment,
    detectTolerancePattern
};
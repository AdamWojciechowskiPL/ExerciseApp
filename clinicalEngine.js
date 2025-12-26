// ExerciseApp/clinicalEngine.js
// Frontendowa wersja silnika reguł (Ported from _clinical-rule-engine.js)
// Dostosowana do struktury danych camelCase używanej w state.js

export const KNOWN_POSITIONS = [
    'standing',
    'sitting',
    'kneeling',
    'quadruped',
    'supine',
    'prone',
    'side_lying'
];

const DIFFICULTY_MAP = {
    'none': 1,
    'occasional': 2,
    'regular': 3,
    'advanced': 4
};

// --- HELPERY KONTEKSTU ---

export function detectTolerancePattern(triggers, reliefs) {
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

export function buildClinicalContext(wizardData) {
    if (!wizardData) return null;

    const tolerancePattern = detectTolerancePattern(wizardData.trigger_movements, wizardData.relief_movements);
    const painChar = wizardData.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');
    const painInt = parseInt(wizardData.pain_intensity) || 0;
    const impact = parseInt(wizardData.daily_impact) || 0;

    let severityScore = (painInt + impact) / 2;
    if (isPainSharp) severityScore *= 1.2;
    const isSevere = severityScore >= 6.5;

    const experienceKey = wizardData.exercise_experience;
    const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;
    let difficultyCap = baseDifficultyCap;

    if (isSevere) {
        difficultyCap = Math.min(baseDifficultyCap, 2);
    } else if (isPainSharp && severityScore >= 4) {
        difficultyCap = Math.min(baseDifficultyCap, 3);
    }

    const painLocs = wizardData.pain_locations || [];
    const painFilters = new Set();
    if (painLocs.length > 0) {
        painLocs.forEach(loc => painFilters.add(loc));
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
    } else {
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    const userEquipment = (wizardData.equipment_available || []).map(e => e.toLowerCase());
    const physicalRestrictions = wizardData.physical_restrictions || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        difficultyCap,
        painFilters,
        userEquipment,
        physicalRestrictions
    };
}

// --- LOGIKA WALIDACJI (Core Rules) ---

export function checkEquipment(ex, userEquipment) {
    if (!userEquipment) return true; // Brak danych usera = nie sprawdzamy (lub domyślnie true)
    
    let requirements = [];
    if (Array.isArray(ex.equipment)) {
        requirements = ex.equipment;
    } else if (typeof ex.equipment === 'string') {
        requirements = ex.equipment.split(',').map(e => e.trim());
    } else {
        return true; // Brak wymagań
    }

    if (requirements.length === 0) return true;

    // Sprawdź czy "brak sprzętu"
    const isNone = requirements.some(req => {
        const r = req.toLowerCase();
        return r.includes('brak') || r.includes('none') || r.includes('masa') || r === '';
    });
    if (isNone) return true;

    // Weryfikacja
    return requirements.every(req => {
        const reqLower = req.toLowerCase();
        return userEquipment.some(owned => owned.includes(reqLower) || reqLower.includes(owned));
    });
}

export function violatesRestrictions(ex, restrictions) {
    const plane = ex.primaryPlane || 'multi';
    const pos = ex.position || null;
    const cat = ex.categoryId || '';

    // 1. Klękanie
    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped') return true;
    }

    // 2. Skręty
    if (restrictions.includes('no_twisting')) {
        if (plane === 'rotation') return true;
    }

    // 3. Siedzenie na podłodze
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }

    // 4. Uderzenia / Skoki
    if (restrictions.includes('no_high_impact')) {
        const highImpactCats = ['plyometrics', 'cardio'];
        if (highImpactCats.includes(cat)) return true;
    }

    // 5. Uraz stopy (Non-weight bearing)
    if (restrictions.includes('foot_injury')) {
        // A. Twarda flaga (Frontend property: isFootLoading)
        if (ex.isFootLoading === true) return true;

        // B. Fallback na pozycje
        const blockedPositions = ['standing', 'kneeling', 'quadruped', 'lunge'];
        if (blockedPositions.includes(pos)) return true;

        // C. Fallback na kategorie
        const blockedCategories = ['squats', 'lunges', 'calves', 'plyometrics', 'cardio'];
        if (blockedCategories.includes(cat)) return true;

        // D. Specyficzne przypadki
        if (cat === 'glute_activation' && pos === 'supine') return true;
        const name = (ex.name || '').toLowerCase();
        if (name.includes('przysiad') || name.includes('wykrok') || name.includes('bieg')) return true;
    }

    return false;
}

export function passesTolerancePattern(ex, tolerancePattern) {
    const plane = ex.primaryPlane || 'multi';
    const zones = Array.isArray(ex.painReliefZones) ? ex.painReliefZones : [];

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) return false;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) return false;
    }
    return true;
}

/**
 * Główna funkcja walidująca ćwiczenie.
 * @param {Object} ex - Ćwiczenie (format frontendowy, camelCase)
 * @param {Object} ctx - Kontekst kliniczny (z buildClinicalContext)
 * @param {Object} options - { ignoreDifficulty, ignoreEquipment, strictSeverity }
 */
export function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;

    // 1. Blacklist (opcjonalnie sprawdzane na zewnątrz, ale dodajemy tu dla kompletności jeśli ctx ma blockedIds)
    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) return { allowed: false, reason: 'blacklisted' };

    // 2. Sprzęt
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) return { allowed: false, reason: 'missing_equipment' };

    // 3. Trudność
    const exLevel = ex.difficultyLevel || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) return { allowed: false, reason: 'too_hard_calculated' };

    // 4. Restrykcje
    if (violatesRestrictions(ex, ctx.physicalRestrictions)) return { allowed: false, reason: 'physical_restriction' };

    // 5. Wzorce
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) return { allowed: false, reason: 'biomechanics_mismatch' };

    // 6. Severity (Tryb ostry)
    if (strictSeverity && ctx.isSevere) {
        const zones = Array.isArray(ex.painReliefZones) ? ex.painReliefZones : [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) return { allowed: false, reason: 'severity_filter' };
    }

    return { allowed: true, reason: null };
}
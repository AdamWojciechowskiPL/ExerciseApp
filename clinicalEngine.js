// ExerciseApp/clinicalEngine.js
// Frontendowa wersja silnika reguł (Ported from _clinical-rule-engine.js)

export const KNOWN_POSITIONS = [
    'standing', 'sitting', 'kneeling', 'half_kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
];

const DIFFICULTY_MAP = {
    'none': 1, 'occasional': 2, 'regular': 3, 'advanced': 4
};

// --- HELPERY KONTEKSTU ---

export const isRotationalPlane = (p) => {
    const plane = String(p || '').toLowerCase();
    return plane === 'rotation' || plane === 'transverse';
};

export function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];

    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) return 'flexion_intolerant';
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) return 'extension_intolerant';
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
        if (painLocs.includes('sciatica')) painFilters.add('sciatica');
        if (painLocs.includes('knee')) painFilters.add('knee');
    } else {
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    // P1.1: Normalizacja sprzętu usera (Set dla szybkiego lookupu)
    // Trim + Lowercase. Żadnych synonimów "w locie".
    const userEquipment = new Set(
        (wizardData.equipment_available || []).map(e => String(e).trim().toLowerCase()).filter(Boolean)
    );

    const physicalRestrictions = wizardData.physical_restrictions || [];
    const medicalDiagnosis = wizardData.medical_diagnosis || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        difficultyCap,
        painFilters,
        userEquipment,
        physicalRestrictions,
        medicalDiagnosis
    };
}

// --- LOGIKA WALIDACJI (Core Rules) ---

export function checkEquipment(ex, userEquipmentSet) {
    // Jeśli userEquipment nie jest podany (lub null), zakładamy brak sprzętu (lub ignorujemy check w zależności od kontekstu)
    // Tutaj zakładamy, że jeśli null, to pomijamy walidację (chyba że wywołujący wymusi).
    // Ale w kontekście P1.1: strict matching.
    if (!userEquipmentSet) return true;

    // Normalizacja wymagań ćwiczenia
    let requirements = [];
    if (Array.isArray(ex.equipment)) {
        requirements = ex.equipment.map(e => String(e).trim().toLowerCase());
    } else if (typeof ex.equipment === 'string') {
        requirements = ex.equipment.split(',').map(e => String(e).trim().toLowerCase());
    } else {
        // Brak pola equipment = brak wymagań
        return true;
    }

    // Filtrowanie pustych
    requirements = requirements.filter(Boolean);
    if (requirements.length === 0) return true;

    // P1.1: Lista ignorowanych (ujednolicona z backendem)
    // 'mat' usunięte z ignorowanych (jest to realny sprzęt)
    const ignorable = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    
    // Sprawdzamy czy wymóg nie jest trywialny
    const isNone = requirements.some(req => ignorable.includes(req));
    if (isNone) return true;

    // Strict check: User MUSI posiadać każdy wymagany element
    // P1.1: Zastąpienie `includes` (substring) przez `Set.has` (exact match)
    return requirements.every(req => userEquipmentSet.has(req));
}

export function violatesRestrictions(ex, ctx) {
    const restrictions = ctx.physicalRestrictions;
    const diagnosis = ctx.medicalDiagnosis || [];

    const plane = String(ex.primaryPlane || 'multi').toLowerCase();
    const pos = String(ex.position || '').toLowerCase();
    const impact = String(ex.impactLevel || 'low').toLowerCase();
    const kneeLoad = String(ex.kneeLoadLevel || 'low').toLowerCase();

    // 1. Klękanie - P1.2 (dodano half_kneeling)
    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped' || pos === 'half_kneeling') return true;
    }

    // 2. Skręty - P0.2
    if (restrictions.includes('no_twisting')) {
        if (isRotationalPlane(plane)) return true;
    }

    // 3. Siedzenie na podłodze
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }

    // 4. Uderzenia / Skoki (High Impact) - P0.1, P0.6
    if (restrictions.includes('no_high_impact')) {
        if (impact === 'high') return true;
    }

    // 5. Uraz stopy (Non-weight bearing) - P0.1, P0.6
    if (restrictions.includes('foot_injury')) {
        if (ex.isFootLoading === true) return true;
        if (impact === 'medium' || impact === 'high') return true;
        
        const blockedPositions = ['standing', 'lunge', 'squat', 'half_kneeling']; // P1.2 updated
        if (blockedPositions.includes(pos)) return true;
    }

    // 6. Ochrona Kolan (Knee Protection Logic)
    const hasKneeIssue = ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior');
    const isChondromalacia = diagnosis.includes('chondromalacia') || diagnosis.includes('runners_knee');

    if (hasKneeIssue && ctx.isSevere && kneeLoad === 'high') return true;
    if (isChondromalacia && kneeLoad === 'high') return true;
    if (restrictions.includes('no_deep_squat') && kneeLoad === 'high') return true;

    return false;
}

export function passesTolerancePattern(ex, tolerancePattern) {
    const plane = String(ex.primaryPlane || 'multi').toLowerCase();
    
    // P0.3 Tolerance Tags Logic
    const tags = Array.isArray(ex.toleranceTags) ? ex.toleranceTags : (ex.tolerance_tags || []);

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return false;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return false;
    }
    return true;
}

export function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;

    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) return { allowed: false, reason: 'blacklisted' };

    // P1.1 Equipment Check (ctx.userEquipment is now a Set)
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) return { allowed: false, reason: 'missing_equipment' };

    const exLevel = ex.difficultyLevel || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) return { allowed: false, reason: 'too_hard_calculated' };

    if (violatesRestrictions(ex, ctx)) return { allowed: false, reason: 'physical_restriction' };
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) return { allowed: false, reason: 'biomechanics_mismatch' };

    if (strictSeverity && ctx.isSevere) {
        const spineLoad = String(ex.spineLoadLevel || 'low').toLowerCase();
        if (spineLoad === 'high') return { allowed: false, reason: 'severity_filter' };

        const kneeLoad = String(ex.kneeLoadLevel || 'low').toLowerCase();
        if ((ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior')) && kneeLoad === 'high') {
            return { allowed: false, reason: 'severity_filter' };
        }

        const zones = Array.isArray(ex.painReliefZones) ? ex.painReliefZones : [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) return { allowed: false, reason: 'severity_filter' };
    }

    return { allowed: true, reason: null };
}
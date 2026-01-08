// netlify/functions/_clinical-rule-engine.js

const DIFFICULTY_MAP = {
    'none': 1, 'occasional': 2, 'regular': 3, 'advanced': 4
};

// P1.2: Dodano half_kneeling
const KNOWN_POSITIONS = [
    'standing', 'sitting', 'kneeling', 'half_kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
];

const isRotationalPlane = (p) => {
    const plane = String(p || '').toLowerCase();
    return plane === 'rotation' || plane === 'transverse';
};

function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];

    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) return 'flexion_intolerant';
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) return 'extension_intolerant';
    return 'neutral';
}

function buildUserContext(userData) {
    const tolerancePattern = detectTolerancePattern(userData.trigger_movements, userData.relief_movements);
    const painChar = userData.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');
    const painInt = parseInt(userData.pain_intensity) || 0;
    const impact = parseInt(userData.daily_impact) || 0;

    let severityScore = (painInt + impact) / 2;
    if (isPainSharp) severityScore *= 1.2;
    const isSevere = severityScore >= 6.5;

    const experienceKey = userData.exercise_experience;
    const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;
    let difficultyCap = baseDifficultyCap;

    if (isSevere) {
        difficultyCap = Math.min(baseDifficultyCap, 2);
    } else if (isPainSharp && severityScore >= 4) {
        difficultyCap = Math.min(baseDifficultyCap, 3);
    }

    const painLocs = userData.pain_locations || [];
    const painFilters = new Set();
    if (painLocs.length > 0) {
        painLocs.forEach(loc => painFilters.add(loc));
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
        if (painLocs.includes('knee')) painFilters.add('knee');
    } else {
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    // P1.1: Strict normalization to Set (lowercase, trim)
    const userEquipment = new Set(
        (userData.equipment_available || []).map(e => String(e).trim().toLowerCase()).filter(Boolean)
    );

    const physicalRestrictions = userData.physical_restrictions || [];
    const medicalDiagnosis = userData.medical_diagnosis || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        difficultyCap,
        painFilters,
        userEquipment,
        physicalRestrictions,
        medicalDiagnosis,
        blockedIds: new Set()
    };
}

function checkEquipment(ex, userEquipmentSet) {
    if (!userEquipmentSet) return true; // Fail open if no context (safety handled elsewhere)

    const exEquipRaw = Array.isArray(ex.equipment) ? ex.equipment : (ex.equipment ? ex.equipment.split(',') : []);
    const requirements = exEquipRaw.map(e => String(e).trim().toLowerCase()).filter(Boolean);

    if (requirements.length === 0) return true;

    // P1.1 Unified Ignorable List ('mat' removed)
    const ignorable = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    
    const isNone = requirements.some(req => ignorable.includes(req));
    if (isNone) return true;

    // P1.1 Exact Match (Set.has)
    return requirements.every(req => userEquipmentSet.has(req));
}

function violatesRestrictions(ex, ctx) {
    const restrictions = ctx.physicalRestrictions;
    const diagnosis = ctx.medicalDiagnosis || [];

    const plane = String(ex.primary_plane || 'multi').toLowerCase();
    const pos = String(ex.position || '').toLowerCase();
    
    const impact = String(ex.impact_level || 'low').toLowerCase();
    const kneeLoad = String(ex.knee_load_level || 'low').toLowerCase();

    // 1. Klękanie - P1.2 (+ half_kneeling)
    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped' || pos === 'half_kneeling') return true;
    }

    // 2. Skręty
    if (restrictions.includes('no_twisting')) {
        if (isRotationalPlane(plane)) return true;
    }

    // 3. Siedzenie na podłodze
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }

    // 4. Uderzenia / Skoki
    if (restrictions.includes('no_high_impact')) {
        if (impact === 'high') return true;
    }

    // 5. Uraz stopy
    if (restrictions.includes('foot_injury')) {
        if (ex.is_foot_loading === true) return true;
        if (impact === 'moderate' || impact === 'high') return true;

        const blockedPositions = ['standing', 'lunge', 'squat', 'half_kneeling']; // P1.2 updated
        if (blockedPositions.includes(pos)) return true;
    }

    // 6. Ochrona Kolan
    const hasKneeIssue = ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior');
    const isChondromalacia = diagnosis.includes('chondromalacia') || diagnosis.includes('runners_knee');

    if (hasKneeIssue && ctx.isSevere && kneeLoad === 'high') return true;
    if (isChondromalacia && kneeLoad === 'high') return true;
    if (restrictions.includes('no_deep_squat') && kneeLoad === 'high') return true;

    return false;
}

function passesTolerancePattern(ex, tolerancePattern) {
    const plane = String(ex.primary_plane || 'multi').toLowerCase();
    const tags = Array.isArray(ex.tolerance_tags) ? ex.tolerance_tags : [];

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return false;
    } 
    else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return false;
    }
    
    return true;
}

function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;

    if (ctx.blockedIds.has(ex.id)) return { allowed: false, reason: 'blacklisted' };
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) return { allowed: false, reason: 'missing_equipment' };

    const exLevel = ex.difficulty_level || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) return { allowed: false, reason: 'too_hard_calculated' };

    if (violatesRestrictions(ex, ctx)) return { allowed: false, reason: 'physical_restriction' };
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) return { allowed: false, reason: 'biomechanics_mismatch' };

    if (strictSeverity && ctx.isSevere) {
        const spineLoad = String(ex.spine_load_level || 'low').toLowerCase();
        if (spineLoad === 'high') return { allowed: false, reason: 'severity_filter' };

        const kneeLoad = String(ex.knee_load_level || 'low').toLowerCase();
        if ((ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior')) && kneeLoad === 'high') {
            return { allowed: false, reason: 'severity_filter' };
        }

        const zones = Array.isArray(ex.pain_relief_zones) ? ex.pain_relief_zones : [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) return { allowed: false, reason: 'severity_filter' };
    }

    return { allowed: true, reason: null };
}

module.exports = {
    buildUserContext,
    checkExerciseAvailability,
    checkEquipment,
    detectTolerancePattern,
    KNOWN_POSITIONS,
    isRotationalPlane
};
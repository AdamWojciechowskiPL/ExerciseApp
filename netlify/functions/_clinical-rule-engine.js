// ExerciseApp/netlify/functions/_clinical-rule-engine.js
// netlify/functions/_clinical-rule-engine.js

const { derivePainZoneSet } = require('./_pain-taxonomy.js');

const DIFFICULTY_MAP = {
    'none': 1, 'occasional': 2, 'regular': 3, 'advanced': 4
};

const KNOWN_POSITIONS = [
    'standing', 'sitting', 'kneeling', 'half_kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
];

const isRotationalPlane = (p) => {
    const plane = String(p || '').toLowerCase();
    return plane === 'rotation' || plane === 'transverse';
};

const HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES = new Set([
    'chondromalacia', 'meniscus_tear', 'acl_rehab', 'mcl_rehab', 'lcl_rehab', 'knee_oa'
]);

const HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES = new Set([
    'disc_herniation', 'spondylolisthesis',
]);

const KNEEFLEXIONSAFETYLIMITS = {
    CKC_SEVERE: 45,      // Closed chain, severe pain
    CKC_MODERATE: 60,    // Closed chain, moderate pain
    OKC_SEVERE: 90,      // Open chain, severe pain
    OKC_MODERATE: 90     // Open chain, moderate pain
};

function getKneeFlexionLimit(ex, ctx) {
    const isFootLoading = ex.is_foot_loading === true;
    if (isFootLoading) {
        return ctx.isSevere ? KNEEFLEXIONSAFETYLIMITS.CKC_SEVERE : KNEEFLEXIONSAFETYLIMITS.CKC_MODERATE;
    }
    return ctx.isSevere ? KNEEFLEXIONSAFETYLIMITS.OKC_SEVERE : KNEEFLEXIONSAFETYLIMITS.OKC_MODERATE;
}

function violatesDiagnosisHardContraindications(ex, diagnosisSet, ctx) {
    const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
    const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
    const impact = (ex.impact_level || 'low').toLowerCase();

    if (kneeLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
    if (spineLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
    if (impact === 'high' && diagnosisSet.has('disc_herniation')) return true;

    const hasKneeDiagnosis = [...diagnosisSet].some(d => HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d));
    const hasKneePain = ctx.painFilters && (ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior') || ctx.painFilters.has('patella'));

    // US-01: Safer Logic for Knee Flexion
    if (hasKneeDiagnosis || hasKneePain) {
        if (ex.kneeFlexionApplicability) {
            const safetyLimit = getKneeFlexionLimit(ex, ctx);
            if (ex.kneeFlexionMaxDeg === null) return true; // Block if unlimited flexion
            if (ex.kneeFlexionMaxDeg > safetyLimit) return true;
        }
    }

    const hasNeckOrShoulderPain = ctx.painFilters && (
        ctx.painFilters.has('cervical') || ctx.painFilters.has('neck') || ctx.painFilters.has('shoulder')
    );

    // US-03: Overhead Restriction with Scapular Stability Exception
    if (hasNeckOrShoulderPain && ctx.isSevere) {
        if (ex.overheadRequired) {
            const cat = (ex.category_id || ex.categoryid || '').toLowerCase(); // Fallback for different object shapes
            const isScapularStability = cat === 'scapularstability' || cat === 'scapular_stability';
            const isLowLoad = (ex.difficulty_level || 1) <= 2;
            const plane = (ex.primary_plane || '').toLowerCase();
            const isControlled = plane === 'sagittal' || plane === 'multi';

            if (isScapularStability && isLowLoad && isControlled) {
                return false; // Allow exception
            }
            return true; // Block other overheads
        }
    }

    return false;
}

function violatesSeverePainRules(ex, ctx) {
    if (!ctx.isSevere) return false;

    // US-04: Allow Lvl 3 if therapeutic category + controlled tempo
    const therapeuticCategories = [
        'coreantiextension', 'core_anti_extension',
        'coreantirotation', 'core_anti_rotation',
        'corestability', 'core_stability',
        'gluteactivation', 'glute_activation',
        'scapularstability', 'scapular_stability',
        'nerveflossing', 'nerve_flossing',
        'breathing', 'breathing_control',
        'hipmobility', 'hip_mobility',
        'spinemobility', 'spine_mobility'
    ];

    const cat = (ex.category_id || ex.categoryid || '').toLowerCase();
    const isTherapeutic = therapeuticCategories.includes(cat);

    // Check for controlled tempo (not dynamic)
    const tempo = (ex.default_tempo || ex.defaulttempo || '').toLowerCase();
    const isControlled = tempo && !tempo.includes('dynamicznie') && !tempo.includes('fast');

    if ((ex.difficulty_level || 1) === 3 && isTherapeutic && isControlled) {
        return false; // Safe exception for therapeutic Level 3
    }

    if ((ex.difficulty_level || 1) > 2) return true; // Block other Lvl 3+
    if ((ex.metabolic_intensity || 1) >= 4) return true;

    return false;
}

function isExerciseSafeForFatigue(ex, strictLevel = 0) {
    const impact = (ex.impact_level || 'low').toLowerCase();
    const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
    const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
    const diff = ex.difficulty_level || 1;
    const met = ex.metabolic_intensity || 1;
    const style = ex.conditioning_style || 'none';

    if (strictLevel === 0) {
        if (impact === 'high') return false;
        if (spineLoad === 'high') return false;
        if (kneeLoad === 'high') return false;
        if (diff >= 4) return false;
        if (met >= 4) return false;
        if (style === 'interval') return false;
    }
    else if (strictLevel === 1) {
        if (impact === 'high') return false;
        if (spineLoad === 'high') return false;
        if (kneeLoad === 'high') return false;
        if (diff >= 5) return false;
        if (met >= 4) return false;
        if (style === 'interval') return false;
    }
    else if (strictLevel === 2) {
        if (impact === 'high') return false;
        if (spineLoad === 'high') return false;
        if (kneeLoad === 'high') return false;
        if (diff >= 5) return false;
        if (met >= 5) return false;
        if (style === 'interval') return false;
    }
    return true;
}

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

    // Legacy fallback
    if (painLocs.length > 0) {
        painLocs.forEach(loc => painFilters.add(loc));
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
        if (painLocs.includes('knee')) painFilters.add('knee');
    } else {
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    const painZoneSet = derivePainZoneSet(painLocs);

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
        painZoneSet,
        userEquipment,
        physicalRestrictions,
        medicalDiagnosis,
        blockedIds: new Set()
    };
}

function checkEquipment(ex, userEquipmentSet) {
    if (!userEquipmentSet) return true;
    const exEquipRaw = Array.isArray(ex.equipment) ? ex.equipment : (ex.equipment ? ex.equipment.split(',') : []);
    const requirements = exEquipRaw.map(e => String(e).trim().toLowerCase()).filter(Boolean);
    if (requirements.length === 0) return true;
    const ignorable = new Set(['none', 'brak', '', 'brak sprzętu', 'masa własna', 'bodyweight']);
    const required = requirements.filter(x => !ignorable.has(x));
    if (required.length === 0) return true;
    if (!userEquipmentSet || userEquipmentSet.size === 0) return false;
    for (const item of required) { if (!userEquipmentSet.has(item)) return false; }
    return true;
}

function violatesRestrictions(ex, ctx) {
    const restrictions = ctx.physicalRestrictions;
    const diagnosis = ctx.medicalDiagnosis || [];

    const plane = String(ex.primary_plane || 'multi').toLowerCase();
    const pos = String(ex.position || '').toLowerCase();
    const impact = String(ex.impact_level || 'low').toLowerCase();
    const kneeLoad = String(ex.knee_load_level || 'low').toLowerCase();

    // 1. Klękanie
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
        if (impact === 'medium' || impact === 'high') return true;
        const blockedPositions = ['standing', 'lunge', 'squat', 'half_kneeling'];
        if (blockedPositions.includes(pos)) return true;
    }

    // 6. Ochrona Kolan
    const hasKneeIssue = ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior');
    const isChondromalacia = diagnosis.includes('chondromalacia') || diagnosis.includes('runners_knee');

    // Strict Knee Control: Block High Load (Deep Flexion/High Force) for ANY knee pain.
    // Originally this checked ctx.isSevere, but clinically moderate knee pain also requires ROM restriction.
    if (hasKneeIssue && kneeLoad === 'high') return true;

    if (isChondromalacia && kneeLoad === 'high') return true;
    if (restrictions.includes('no_deep_squat') && kneeLoad === 'high') return true;

    // --- US-11: Overhead Restriction in Severe Neck Pain ---
    const hasNeckIssue = ctx.painFilters && (ctx.painFilters.has('cervical') || ctx.painFilters.has('neck') || ctx.painFilters.has('shoulder'));

    if (hasNeckIssue && ctx.isSevere) {
        if (ex.overheadRequired) {
            const sLoad = (ex.shoulderLoadLevel || ex.shoulder_load_level || 'low').toLowerCase();

            if (sLoad === 'high') return true;

            // EXCEPTION LOGIC (Mirroring US-03):
            const cat = (ex.category_id || ex.categoryid || '').toLowerCase();
            const isScapularStability = cat === 'scapularstability' || cat === 'scapular_stability';
            if (sLoad === 'low' && isScapularStability) return false;

            return true;
        }
    }

    return false;
}

function passesTolerancePattern(ex, tolerancePattern) {
    const plane = String(ex.primary_plane || 'multi').toLowerCase();
    const tags = Array.isArray(ex.tolerance_tags) ? ex.tolerance_tags : [];

    // US-11: Użycie spineMotionProfile (jeśli dostępny)
    const profile = ex.spineMotionProfile || 'neutral';

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return false;
        if (profile === 'lumbar_flexion_loaded') return false;
    }
    else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return false;
        if (profile === 'lumbar_extension_loaded') return false;
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

        // Note: Knee Load check for severe is now redundant here as it's covered in violatesRestrictions for ALL knee pain,
        // but we keep it for safety consistency or if painFilters logic changes.
        const kneeLoad = String(ex.knee_load_level || 'low').toLowerCase();
        if ((ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior')) && kneeLoad === 'high') {
            return { allowed: false, reason: 'severity_filter' };
        }

        const zones = Array.isArray(ex.pain_relief_zones) ? ex.pain_relief_zones : [];
        const helpsZone = zones.some(z => ctx.painZoneSet.has(z));

        if (!helpsZone) {
            return { allowed: false, reason: 'severity_filter' };
        }
    }

    return { allowed: true, reason: null };
}

module.exports = {
    buildUserContext,
    checkExerciseAvailability,
    checkEquipment,
    detectTolerancePattern,
    KNOWN_POSITIONS,
    isRotationalPlane,
    passesTolerancePattern, // Export for testing
    violatesDiagnosisHardContraindications,
    violatesSeverePainRules,
    isExerciseSafeForFatigue
};
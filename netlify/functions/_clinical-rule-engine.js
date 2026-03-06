// ExerciseApp/netlify/functions/_clinical-rule-engine.js

const { derivePainZoneSet, normalizeDiagnosisArray } = require('./_pain-taxonomy.js');
const { normalizeWizardPayload } = require('./_wizard-canonical.js');
const { createClinicalRules, KNOWN_POSITIONS, isRotationalPlane } = require('../../shared/clinical-core/index.js');

const HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES = new Set([
    'chondromalacia', 'meniscus_tear', 'acl_rehab', 'mcl_rehab', 'lcl_rehab', 'knee_oa'
]);

const HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES = new Set([
    'disc_herniation', 'spondylolisthesis'
]);

const KNEE_FLEXION_SAFETY_LIMITS = {
    CKC_SEVERE: 45,
    CKC_MODERATE: 60,
    OKC_SEVERE: 90,
    OKC_MODERATE: 90
};

function getKneeFlexionLimit(ex, ctx) {
    const isFootLoading = ex.is_foot_loading === true;
    if (isFootLoading) {
        return ctx.isSevere ? KNEE_FLEXION_SAFETY_LIMITS.CKC_SEVERE : KNEE_FLEXION_SAFETY_LIMITS.CKC_MODERATE;
    }
    return ctx.isSevere ? KNEE_FLEXION_SAFETY_LIMITS.OKC_SEVERE : KNEE_FLEXION_SAFETY_LIMITS.OKC_MODERATE;
}

function violatesDiagnosisHardContraindications(ex, diagnosisSet, ctx) {
    const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
    const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
    const impact = (ex.impact_level || 'low').toLowerCase();

    if (kneeLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
    if (spineLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
    if (impact === 'high' && diagnosisSet.has('disc_herniation')) return true;

    const hasKneeDiagnosis = [...diagnosisSet].some((d) => HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d));
    const hasKneePain = ctx.painFilters && (ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior') || ctx.painFilters.has('patella'));

    if ((hasKneeDiagnosis || hasKneePain) && ex.kneeFlexionApplicability) {
        const safetyLimit = getKneeFlexionLimit(ex, ctx);
        if (ex.kneeFlexionMaxDeg === null) return true;
        if (ex.kneeFlexionMaxDeg > safetyLimit) return true;
    }

    const hasNeckOrShoulderPain = ctx.painFilters && (
        ctx.painFilters.has('cervical') || ctx.painFilters.has('neck') || ctx.painFilters.has('shoulder')
    );

    if (hasNeckOrShoulderPain && ctx.isSevere && ex.overheadRequired) {
        const cat = (ex.category_id || ex.categoryid || '').toLowerCase();
        const isScapularStability = cat === 'scapularstability' || cat === 'scapular_stability';
        const isLowLoad = (ex.difficulty_level || 1) <= 2;
        const plane = (ex.primary_plane || '').toLowerCase();
        const isControlled = plane === 'sagittal' || plane === 'multi';

        if (isScapularStability && isLowLoad && isControlled) return false;
        return true;
    }

    return false;
}

function violatesSeverePainRules(ex, ctx) {
    if (!ctx.isSevere) return false;

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
    const tempo = (ex.default_tempo || ex.defaulttempo || '').toLowerCase();
    const isControlled = tempo && !tempo.includes('dynamicznie') && !tempo.includes('fast');

    if ((ex.difficulty_level || 1) === 3 && isTherapeutic && isControlled) return false;
    if ((ex.difficulty_level || 1) > 2) return true;
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
        if (impact === 'high' || spineLoad === 'high' || kneeLoad === 'high' || diff >= 4 || met >= 4 || style === 'interval') return false;
    } else if (strictLevel === 1) {
        if (impact === 'high' || spineLoad === 'high' || kneeLoad === 'high' || diff >= 5 || met >= 4 || style === 'interval') return false;
    } else if (strictLevel === 2) {
        if (impact === 'high' || spineLoad === 'high' || kneeLoad === 'high' || diff >= 5 || met >= 5 || style === 'interval') return false;
    }
    return true;
}

const sharedClinicalRules = createClinicalRules({
    normalizeWizardData: normalizeWizardPayload,
    derivePainZoneSet,
    normalizeDiagnosisArray
});

function detectTolerancePattern(triggers, reliefs) {
    return sharedClinicalRules.detectTolerancePattern(triggers, reliefs);
}

function buildUserContext(userData) {
    return sharedClinicalRules.buildClinicalContext(userData);
}

function checkEquipment(ex, userEquipmentSet) {
    return sharedClinicalRules.checkEquipment(ex, userEquipmentSet);
}

function violatesRestrictions(ex, ctx) {
    return sharedClinicalRules.violatesRestrictions(ex, ctx);
}

function passesTolerancePattern(ex, tolerancePattern) {
    return sharedClinicalRules.passesTolerancePattern(ex, tolerancePattern);
}

function checkExerciseAvailability(ex, ctx, options = {}) {
    return sharedClinicalRules.checkExerciseAvailability(ex, ctx, options);
}

module.exports = {
    buildUserContext,
    checkExerciseAvailability,
    checkEquipment,
    detectTolerancePattern,
    KNOWN_POSITIONS,
    isRotationalPlane,
    passesTolerancePattern,
    violatesDiagnosisHardContraindications,
    violatesSeverePainRules,
    isExerciseSafeForFatigue
};

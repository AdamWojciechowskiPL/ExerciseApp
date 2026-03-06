// ExerciseApp/netlify/functions/_clinical-rule-engine.js
// netlify/functions/_clinical-rule-engine.js

const { derivePainZoneSet, normalizeDiagnosisArray } = require('./_pain-taxonomy.js');
const { normalizeWizardPayload } = require('./_wizard-canonical.js');
const { createClinicalRules, KNOWN_POSITIONS, isRotationalPlane } = require('../../shared/clinical-rules-core.js');

const DIFFICULTY_MAP = {
    'none': 1, 'occasional': 2, 'regular': 3, 'advanced': 4
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


function computeAcuteGuard(normalizedData) {
    const onset = normalizedData.symptom_onset;
    const duration = normalizedData.symptom_duration;
    const trend = normalizedData.symptom_trend;
    const isAcute = onset === 'sudden' || onset === 'post_traumatic' || duration === 'lt_6_weeks';
    const isWorsening = trend === 'worsening';
    return { isAcute, isWorsening, isAcuteWorsening: isAcute && isWorsening };
}

function getToleranceBias(tolerancePattern, confirmedDirectionalIntolerance) {
    const strength = confirmedDirectionalIntolerance ? 1 : (tolerancePattern === 'neutral' ? 0 : 0.35);
    return { pattern: tolerancePattern, strength, confirmed: confirmedDirectionalIntolerance };
}

const sharedClinicalRules = createClinicalRules({
    normalizeWizardData: normalizeWizardPayload,
    derivePainZoneSet,
    normalizeDiagnosisArray
});

function isDirectionalMismatch(ex, tolerancePattern) {
    const plane = String(ex.primary_plane || 'multi').toLowerCase();
    const tags = Array.isArray(ex.tolerance_tags) ? ex.tolerance_tags : [];
    const profile = ex.spineMotionProfile || 'neutral';

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return true;
        if (profile === 'lumbar_flexion_loaded') return true;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return true;
        if (profile === 'lumbar_extension_loaded') return true;
    }

    return false;
}

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
    passesTolerancePattern, // Export for testing
    violatesDiagnosisHardContraindications,
    violatesSeverePainRules,
    isExerciseSafeForFatigue
};
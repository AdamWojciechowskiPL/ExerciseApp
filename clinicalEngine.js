// ExerciseApp/clinicalEngine.js

import CANONICAL_VALUES from './shared/wizard-canonical-values.js';

export const KNOWN_POSITIONS = [
    'standing', 'sitting', 'kneeling', 'half_kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
];

const DIFFICULTY_MAP = { none: 1, occasional: 2, regular: 3, advanced: 4 };
const DIAGNOSIS_ALIAS_MAP = { runners_knee: 'chondromalacia', patellofemoral: 'chondromalacia' };
const PAIN_MAPPING = {
    lumbar: ['low_back', 'lumbar_general', 'lumbosacral', 'sciatica'],
    lumbar_general: ['low_back', 'lumbar_general', 'lumbosacral'],
    low_back: ['low_back', 'lumbar_general', 'lumbosacral', 'sciatica'],
    si_joint: ['si_joint', 'lumbosacral', 'low_back'],
    sciatica: ['sciatica', 'piriformis', 'lumbar_radiculopathy'],
    hip: ['hip', 'piriformis', 'glute'],
    piriformis: ['piriformis', 'sciatica', 'glute'],
    knee: ['knee', 'patella', 'knee_stability'],
    knee_anterior: ['patella', 'knee_anterior', 'knee'],
    patella: ['patella', 'knee_anterior'],
    cervical: ['cervical', 'neck', 'upper_traps'],
    neck: ['cervical', 'neck', 'upper_traps'],
    thoracic: ['thoracic', 'posture', 'shoulder_mobility'],
    shoulder: ['shoulder', 'thoracic'],
    ankle: ['ankle', 'calves', 'foot'],
    foot: ['foot', 'ankle', 'plantar_fascia']
};

const norm = (v) => String(v || '').trim().toLowerCase();
const normalizeDiagnosisArray = (raw = []) => Array.isArray(raw)
    ? raw.map(norm).filter(Boolean).map((d) => DIAGNOSIS_ALIAS_MAP[d] || d)
    : [];

const normalizeCanonicalValue = (value, group) => {
    const allowed = new Set((CANONICAL_VALUES[group] || []).map(norm));
    const v = norm(value);
    return allowed.has(v) ? v : '';
};

const derivePainZoneSet = (painLocations = []) => {
    const inputs = new Set((Array.isArray(painLocations) ? painLocations : []).map(norm).filter(Boolean));
    const out = new Set(inputs);
    for (const input of inputs) {
        const mapped = PAIN_MAPPING[input] || [];
        mapped.forEach((zone) => out.add(zone));
    }
    return out;
};

const getField = (ex, snake, camel, fallback = '') => ex[snake] ?? ex[camel] ?? fallback;

export const isRotationalPlane = (p) => {
    const plane = norm(p);
    return plane === 'rotation' || plane === 'transverse';
};

export function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];
    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) return 'flexion_intolerant';
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) return 'extension_intolerant';
    return 'neutral';
}

function computeAcuteGuard(data) {
    const isAcute = data.symptom_onset === 'sudden' || data.symptom_onset === 'post_traumatic' || data.symptom_duration === 'lt_6_weeks';
    const isWorsening = data.symptom_trend === 'worsening';
    return { isAcuteWorsening: isAcute && isWorsening };
}

function isDirectionalMismatch(ex, tolerancePattern) {
    const plane = norm(getField(ex, 'primary_plane', 'primaryPlane', 'multi'));
    const tags = Array.isArray(ex.tolerance_tags) ? ex.tolerance_tags : (Array.isArray(ex.toleranceTags) ? ex.toleranceTags : []);
    const profile = getField(ex, 'spineMotionProfile', 'spineMotionProfile', 'neutral');

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return true;
        if (profile === 'lumbar_flexion_loaded') return true;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return true;
        if (profile === 'lumbar_extension_loaded') return true;
    }

    return false;
}

export function buildClinicalContext(wizardData) {
    if (!wizardData) return null;
    const data = {
        ...wizardData,
        symptom_onset: normalizeCanonicalValue(wizardData.symptom_onset, 'symptom_onset'),
        symptom_duration: normalizeCanonicalValue(wizardData.symptom_duration, 'symptom_duration'),
        symptom_trend: normalizeCanonicalValue(wizardData.symptom_trend, 'symptom_trend')
    };

    const tolerancePattern = detectTolerancePattern(data.trigger_movements, data.relief_movements);
    const directionalNegative24hCount = Math.max(0, parseInt(data.directional_negative_24h_count, 10) || 0);
    const painChar = data.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');

    let severityScore = ((parseInt(data.pain_intensity, 10) || 0) + (parseInt(data.daily_impact, 10) || 0)) / 2;
    if (isPainSharp) severityScore *= 1.2;
    const isSevere = severityScore >= 6.5;

    let difficultyCap = DIFFICULTY_MAP[data.exercise_experience] || 2;
    if (isSevere) difficultyCap = Math.min(difficultyCap, 2);
    else if (isPainSharp && severityScore >= 4) difficultyCap = Math.min(difficultyCap, 3);

    if (computeAcuteGuard(data).isAcuteWorsening) {
        difficultyCap = Math.min(difficultyCap, 2);
        severityScore = Math.max(severityScore, 6);
    }

    const painLocs = Array.isArray(data.pain_locations) ? data.pain_locations : [];
    const painFilters = new Set();
    if (painLocs.length) {
        painLocs.forEach((l) => painFilters.add(l));
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('low_back');
        if (painLocs.includes('low_back') || painLocs.includes('lumbar') || painLocs.includes('lumbar_general')) {
            painFilters.add('low_back');
            painFilters.add('lumbar_general');
        }
        if (painLocs.includes('knee')) painFilters.add('knee');
    } else {
        ['low_back', 'lumbar_general', 'thoracic'].forEach((z) => painFilters.add(z));
    }

    return {
        tolerancePattern,
        toleranceBias: { pattern: tolerancePattern, strength: directionalNegative24hCount >= 2 ? 1 : (tolerancePattern === 'neutral' ? 0 : 0.35) },
        isSevere,
        severityScore,
        difficultyCap,
        painFilters,
        painZoneSet: derivePainZoneSet(painLocs),
        userEquipment: new Set((data.equipment_available || []).map(norm).filter(Boolean)),
        physicalRestrictions: data.physical_restrictions || [],
        medicalDiagnosis: normalizeDiagnosisArray(data.medical_diagnosis),
        blockedIds: new Set()
    };
}

export function checkEquipment(ex, userEquipmentSet) {
    if (!userEquipmentSet) return true;
    const exEquipRaw = Array.isArray(ex.equipment) ? ex.equipment : (ex.equipment ? ex.equipment.split(',') : []);
    const requirements = exEquipRaw.map(norm).filter(Boolean);
    const ignorable = new Set(['none', 'brak', '', 'brak sprzętu', 'masa własna', 'bodyweight']);
    const required = requirements.filter((x) => !ignorable.has(x));
    return required.every((item) => userEquipmentSet.has(item));
}

export function violatesRestrictions(ex, ctx) {
    const plane = norm(getField(ex, 'primary_plane', 'primaryPlane', 'multi'));
    const pos = norm(ex.position);
    const impact = norm(getField(ex, 'impact_level', 'impactLevel', 'low'));
    const kneeLoad = norm(getField(ex, 'knee_load_level', 'kneeLoadLevel', 'low'));

    if (ctx.physicalRestrictions.includes('no_kneeling') && ['kneeling', 'quadruped', 'half_kneeling'].includes(pos)) return true;
    if (ctx.physicalRestrictions.includes('no_twisting') && isRotationalPlane(plane)) return true;
    if (ctx.physicalRestrictions.includes('no_floor_sitting') && pos === 'sitting') return true;
    if (ctx.physicalRestrictions.includes('no_high_impact') && impact === 'high') return true;
    if (ctx.physicalRestrictions.includes('foot_injury')) {
        if (ex.is_foot_loading === true || ex.isFootLoading === true) return true;
        if (impact === 'medium' || impact === 'high') return true;
        if (['standing', 'lunge', 'squat', 'half_kneeling'].includes(pos)) return true;
    }

    const hasKneeIssue = ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior');
    if (hasKneeIssue && kneeLoad === 'high') return true;
    if ((ctx.medicalDiagnosis || []).includes('chondromalacia') && kneeLoad === 'high') return true;
    if (ctx.physicalRestrictions.includes('no_deep_squat') && kneeLoad === 'high') return true;

    const hasNeckIssue = ctx.painFilters && (ctx.painFilters.has('cervical') || ctx.painFilters.has('neck') || ctx.painFilters.has('shoulder'));
    if (hasNeckIssue && ctx.isSevere && ex.overheadRequired) {
        const sLoad = norm(getField(ex, 'shoulder_load_level', 'shoulderLoadLevel', 'low'));
        if (sLoad === 'high') return true;
        const cat = norm(getField(ex, 'category_id', 'categoryId', getField(ex, 'categoryid', 'categoryId', '')));
        const isScapularStability = cat === 'scapularstability' || cat === 'scapular_stability';
        if (sLoad === 'low' && isScapularStability) return false;
        return true;
    }

    return false;
}

export function passesTolerancePattern(ex, tolerancePattern) {
    return !isDirectionalMismatch(ex, tolerancePattern);
}

export function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;
    if (ctx.blockedIds?.has(ex.id)) return { allowed: false, reason: 'blacklisted' };
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) return { allowed: false, reason: 'missing_equipment' };
    const exLevel = getField(ex, 'difficulty_level', 'difficultyLevel', 1) || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) return { allowed: false, reason: 'too_hard_calculated' };
    if (violatesRestrictions(ex, ctx)) return { allowed: false, reason: 'physical_restriction' };

    const mismatch = isDirectionalMismatch(ex, ctx.tolerancePattern);
    if (mismatch && (ctx.toleranceBias?.strength || 0) >= 1) return { allowed: false, reason: 'biomechanics_mismatch' };

    if (strictSeverity && ctx.isSevere) {
        if (norm(getField(ex, 'spine_load_level', 'spineLoadLevel', 'low')) === 'high') return { allowed: false, reason: 'severity_filter' };
        const kneeLoad = norm(getField(ex, 'knee_load_level', 'kneeLoadLevel', 'low'));
        if ((ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior')) && kneeLoad === 'high') return { allowed: false, reason: 'severity_filter' };
        const zones = ex.pain_relief_zones || ex.painReliefZones || [];
        if (!zones.some((z) => ctx.painZoneSet.has(z))) return { allowed: false, reason: 'severity_filter' };
    }

    return mismatch ? { allowed: true, reason: 'directional_bias' } : { allowed: true, reason: null };
}

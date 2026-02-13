// ExerciseApp/netlify/functions/generate-plan.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const {
    buildUserContext,
    checkExerciseAvailability,
    violatesDiagnosisHardContraindications,
    violatesSeverePainRules,
    isExerciseSafeForFatigue
} = require('./_clinical-rule-engine.js');
const { calculateTiming } = require('./_pacing-engine.js');
const { calculateFatigueProfile } = require('./_fatigue-calculator.js');
const { applyMicroLoading } = require('./_amps-engine.js');
const { derivePainZoneSet, normalizeStringArray, normalizeLowerSet } = require('./_pain-taxonomy.js');
const { validateTempoString, enforceTempoByPhaseIntent, SAFE_FALLBACK_TEMPO } = require('./_tempo-validator.js');

const {
    initializePhaseState,
    resolveActivePhase,
    applySuggestedUpdate,
    applyGoalChangePolicy
} = require('./_phase-manager.js');

const {
    getPhaseConfig,
    pickTargetSessions,
    PHASE_IDS
} = require('./phase-catalog.js');

// ============================================================================
// 1. CONSTANTS & CONFIG
// ============================================================================

const DEFAULT_SECONDS_PER_REP = 6;
const DEFAULT_TARGET_MIN = 30;
const DEFAULT_SCHEDULE_PATTERN = [1, 3, 5];

const MIN_MAIN_EXERCISES = 2;
const MAX_SETS_MAIN = 6;
const MAX_SETS_MOBILITY = 3;
const GLOBAL_MAX_REPS = 25;
const MAX_BUCKET_CAPACITY = 120;

const PAIN_CONFIG = {
    maxPainDuring: {
        green: 5,
        amber: 7
    },
    maxPainAfter24h: {
        green: 2,
        amber: 4
    },
    maxDeltaFromBaseline: {
        green: 1,
        amber: 3
    },
    redRequiresConsecutiveSessions: 2,
    modifiers: {
        green: 1.0,
        amber: 0.9,
        red: 0.75
    }
};

// ============================================================================
// 2. UTILITY HELPERS
// ============================================================================

function safeJsonParse(body) {
    if (!body) return {};
    try { return JSON.parse(body); } catch (e) { return null; }
}

function toNumber(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function intersectionCount(aArr, bSet) {
    let c = 0;
    for (const a of aArr) {
        if (bSet.has(String(a).toLowerCase())) c++;
    }
    return c;
}

function cleanString(str) {
    return String(str || '').trim().toLowerCase();
}

function normalizeEquipmentList(raw) {
    const items = normalizeStringArray(raw).map(cleanString).filter(Boolean);
    const ignore = new Set(['none', 'brak', '', 'brak sprzętu', 'masa własna', 'bodyweight']);
    const set = new Set();
    for (const it of items) {
        if (ignore.has(it)) continue;
        set.add(it);
    }
    return set;
}

function resolveValidTempo(rawTempo, fallbackTempo = null) {
    const check = validateTempoString(rawTempo);
    if (check.ok) return check.sanitized;
    return fallbackTempo;
}

function normalizeExerciseRow(row, userExperience = 'intermediate') {
    const isUnilateral = !!row.is_unilateral;

    let validDefaultTempo = SAFE_FALLBACK_TEMPO;
    const defCheck = validateTempoString(row.default_tempo);
    if (defCheck.ok) {
        validDefaultTempo = defCheck.sanitized;
    }

    const validControl = resolveValidTempo(row.tempo_control);
    const validRehab = resolveValidTempo(row.tempo_rehab);
    const validDeload = validControl || validRehab || validDefaultTempo;

    let kneeFlexionMaxDeg = null;
    let kneeFlexionApplicability = false;

    const rawKneeDeg = row.knee_flexion_max_deg;
    const kneeLoad = row.knee_load_level ? String(row.knee_load_level).toLowerCase() : 'none';
    const isFootLoading = !!row.is_foot_loading;

    if (rawKneeDeg !== null && rawKneeDeg !== undefined) {
        const parsedDeg = parseInt(rawKneeDeg, 10);
        if (!isNaN(parsedDeg) && parsedDeg >= 0 && parsedDeg <= 150) {
            kneeFlexionMaxDeg = parsedDeg;
            kneeFlexionApplicability = true;
        }
    } else {
        if (kneeLoad !== 'none' || isFootLoading) {
            kneeFlexionApplicability = true;
        }
    }

    let spineMotionProfile = 'neutral';
    const allowedSpineProfiles = [
        'neutral', 'lumbar_flexion_loaded', 'lumbar_extension_loaded',
        'lumbar_rotation_loaded', 'lumbar_lateral_flexion_loaded', 'thoracic_rotation_loaded'
    ];
    if (row.spine_motion_profile && allowedSpineProfiles.includes(row.spine_motion_profile)) {
        spineMotionProfile = row.spine_motion_profile;
    }

    const overheadRequired = (row.overhead_required === true);
    const shoulderLoadLevel = row.shoulder_load_level ? String(row.shoulder_load_level).toLowerCase() : 'low';
    const intendedPainResponse = row.intended_pain_response ? String(row.intended_pain_response).toLowerCase() : 'painfree';

    const ex = {
        id: row.id,
        name: row.name,
        description: row.description,
        equipment: normalizeStringArray(row.equipment).map(cleanString).filter(Boolean),
        is_unilateral: isUnilateral,
        is_foot_loading: row.is_foot_loading,
        category_id: row.category_id ? String(row.category_id) : 'uncategorized',
        difficulty_level: clamp(toNumber(row.difficulty_level, 1), 1, 5),
        pain_relief_zones: normalizeStringArray(row.pain_relief_zones).map(s => s.toLowerCase()),
        tolerance_tags: normalizeStringArray(row.tolerance_tags).map(s => s.toLowerCase()),
        primary_plane: row.primary_plane ? String(row.primary_plane).toLowerCase() : null,
        position: row.position ? String(row.position).toLowerCase() : null,
        knee_load_level: row.knee_load_level ? String(row.knee_load_level).toLowerCase() : null,
        spine_load_level: row.spine_load_level ? String(row.spine_load_level).toLowerCase() : null,
        impact_level: row.impact_level ? String(row.impact_level).toLowerCase() : null,
        metabolic_intensity: clamp(toNumber(row.metabolic_intensity, 1), 1, 5),
        max_recommended_duration: toNumber(row.max_recommended_duration, 0),
        max_recommended_reps: toNumber(row.max_recommended_reps, 0),
        conditioning_style: row.conditioning_style ? String(row.conditioning_style).toLowerCase() : 'none',
        recommended_interval_sec: row.recommended_interval_sec,

        kneeFlexionMaxDeg,
        kneeFlexionApplicability,
        spineMotionProfile,
        overheadRequired,
        shoulderLoadLevel,
        intendedPainResponse,

        default_tempo: validDefaultTempo,

        tempos: {
            control: validControl,
            mobility: resolveValidTempo(row.tempo_mobility),
            capacity: resolveValidTempo(row.tempo_capacity),
            strength: resolveValidTempo(row.tempo_strength),
            metabolic: resolveValidTempo(row.tempo_metabolic),
            rehab: validRehab,
            deload: validDeload
        }
    };

    ex.calculated_timing = calculateTiming(ex, userExperience);
    return ex;
}

function validateExerciseRecord(ex) {
    if (!ex.id) return { valid: false, error: 'missing_id' };
    if (!ex.impact_level) return { valid: false, error: 'missing_impact_level' };
    if (!ex.position) return { valid: false, error: 'missing_position' };
    if (ex.is_foot_loading === null || ex.is_foot_loading === undefined) return { valid: false, error: 'missing_foot_loading' };

    if (ex.conditioning_style === 'interval') {
        const i = ex.recommended_interval_sec;
        if (!i || typeof i !== 'object') return { valid: false, error: 'invalid_interval_object' };
        if (typeof i.work !== 'number' || i.work <= 0) return { valid: false, error: 'invalid_interval_work' };
        if (typeof i.rest !== 'number' || i.rest < 0) return { valid: false, error: 'invalid_interval_rest' };
    }
    return { valid: true };
}

function isBreathingCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('breathing') || s.includes('breath') || s.includes('relax') || s.includes('parasymp'); }
function isMobilityCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('mobility') || s.includes('stretch') || s.includes('flexor') || s.includes('decompression'); }
function isConditioningCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('conditioning') || s.includes('cardio') || s.includes('aerobic'); }
function isCoreCategory(cat) { const s = String(cat || '').toLowerCase(); return s.startsWith('core_') || s === 'core' || s.includes('core_stability') || s.includes('anti_'); }
function isLowerLimbCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('knee') || s.includes('vmo') || s.includes('calf') || s.includes('calves') || s.includes('ankle') || s.includes('glute') || s.includes('hip_extension') || s.includes('unilateral') || s.includes('hamstring') || s.includes('quad') || s.includes('eccentric') || s.includes('nerve'); }

function weightedPick(items, weightFn) {
    const weights = [];
    let total = 0;
    for (const it of items) {
        const w = Math.max(0, weightFn(it));
        weights.push(w);
        total += w;
    }
    if (total <= 0) return null;
    const r = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
        acc += weights[i];
        if (r <= acc) return items[i];
    }
    return items[items.length - 1];
}

function safeBuildUserContext(userData) {
    let ctx = {};
    try { ctx = buildUserContext(userData) || {}; } catch (e) { ctx = {}; }

    const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
    const dailyImpact = clamp(toNumber(userData?.daily_impact, 0), 0, 10);
    const fallbackSeverity = clamp(Math.round((painIntensity * 0.6) + (dailyImpact * 0.4)), 0, 10);

    if (!Number.isFinite(ctx.severityScore)) ctx.severityScore = fallbackSeverity;
    if (typeof ctx.isSevere !== 'boolean') ctx.isSevere = ctx.severityScore >= 7;
    if (!ctx.blockedIds) ctx.blockedIds = new Set();
    if (!ctx.painFilters) ctx.painFilters = new Set();
    if (typeof ctx.tolerancePattern !== 'string') ctx.tolerancePattern = 'unknown';

    return ctx;
}

// ============================================================================
// 3. WEIGHTING LOGIC
// ============================================================================
function initCategoryWeightsFromExercises(exercises) {
    const weights = Object.create(null);
    for (const ex of exercises) {
        const cat = ex.category_id || 'uncategorized';
        if (weights[cat] == null) weights[cat] = 1.0;
    }
    return weights;
}

function boost(weights, categoryId, delta) { const key = String(categoryId); if (weights[key] != null) { weights[key] += delta; } }
function multiplyMatching(weights, predicateFn, factor) { for (const cat of Object.keys(weights)) { if (predicateFn(cat)) { weights[cat] = weights[cat] * factor; } } }

function buildDynamicCategoryWeights(exercises, userData, ctx) {
    const weights = initCategoryWeightsFromExercises(exercises);
    const painLocs = normalizeLowerSet(userData?.pain_locations);
    const focusLocs = normalizeLowerSet(userData?.focus_locations);
    const diagnosis = normalizeLowerSet(userData?.medical_diagnosis);
    const restrictions = normalizeLowerSet(userData?.physical_restrictions);
    const componentWeights = normalizeLowerSet(userData?.session_component_weights);
    const workType = String(userData?.work_type || '').toLowerCase();
    const hobby = String(userData?.hobby || '').toLowerCase();
    const primaryGoal = String(userData?.primary_goal || '').toLowerCase();

    // 1. Pain Based Boosts
    if (painLocs.has('knee') || painLocs.has('knee_anterior')) {
        boost(weights, 'vmo_activation', 1.0);
        boost(weights, 'glute_activation', 2.0);
        boost(weights, 'hip_extension', 1.5);
        boost(weights, 'knee_stability', 2.2);
        boost(weights, 'patellofemoralcontrol', 2.5);

        const tkeBoost = ctx.isSevere ? 1.1 : 1.3;
        boost(weights, 'terminal_knee_extension', tkeBoost);

        boost(weights, 'hip_mobility', 0.2);

        const condMult = ctx.isSevere ? 0.70 : 0.9;
        multiplyMatching(weights, (cat) => isConditioningCategory(cat), condMult);
    }

    if (painLocs.has('lumbar') || painLocs.has('low_back')) {
        boost(weights, 'breathing', 0.8);
        boost(weights, 'spine_mobility', 0.6);
        const coreBoost = ctx.isSevere ? 1.5 : 1.8;
        boost(weights, 'core_anti_extension', coreBoost);
        boost(weights, 'hip_mobility', 0.6);
    }

    if (diagnosis.has('disc_herniation') || diagnosis.has('spondylolisthesis')) {
        boost(weights, 'core_anti_extension', 1.2);
    }

    if (painLocs.has('hip')) { boost(weights, 'hip_mobility', 1.0); boost(weights, 'glute_activation', 0.8); }

    if (painLocs.has('neck') || painLocs.has('cervical')) {
        boost(weights, 'thoracic_mobility', 0.8);
        boost(weights, 'scapular_stability', 1.3);
        boost(weights, 'cervical_motor_control', 1.5);
        boost(weights, 'breathing_control', 0.6);
        boost(weights, 'muscle_relaxation', 0.4);
    }

    if (diagnosis.has('chondromalacia') || diagnosis.has('patellofemoral')) {
        boost(weights, 'patellofemoralcontrol', 2.0);
    }

    if (painLocs.has('ankle') || painLocs.has('foot')) { boost(weights, 'calves', 0.6); boost(weights, 'ankle_mobility', 0.8); boost(weights, 'balance_proprioception', 0.5); }

    // 2. Focus/Goal
    if (focusLocs.has('glutes')) { boost(weights, 'glute_activation', 1.5); boost(weights, 'hip_extension', 1.5); }
    if (focusLocs.has('abs')) { boost(weights, 'core_stability', 1.2); boost(weights, 'core_anti_extension', 1.0); }

    // 3. Work/Hobby
    if (workType === 'sedentary') { boost(weights, 'thoracic_mobility', 0.7); boost(weights, 'hip_flexor_stretch', 0.5); boost(weights, 'glute_activation', 0.6); }
    else if (workType === 'standing') { boost(weights, 'spine_mobility', 0.4); boost(weights, 'calves', 0.4); }

    if (hobby === 'running') { boost(weights, 'core_stability', 1.0); boost(weights, 'vmo_activation', 0.3); }
    else if (hobby === 'cycling') { boost(weights, 'thoracic_mobility', 0.8); boost(weights, 'hip_flexor_stretch', 0.9); }

    // 4. Diagnosis
    if (diagnosis.has('chondromalacia') || diagnosis.has('osteoarthritis')) {
        boost(weights, 'vmo_activation', 0.3); boost(weights, 'glute_activation', 1.2); boost(weights, 'hip_extension', 0.8);
        multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.9);
    }
    if (diagnosis.has('scoliosis')) { boost(weights, 'core_anti_rotation', 0.6); boost(weights, 'core_anti_lateral_flexion', 0.6); }
    if (diagnosis.has('piriformis') || painLocs.has('sciatica') || ctx.painFilters.has('sciatica')) {
        const nfBoost = ctx.isSevere ? 1.5 : 2.0;
        boost(weights, 'nerve_flossing', nfBoost); boost(weights, 'glute_activation', 0.4);
    }

    // 5. Restrictions
    if (restrictions.has('foot_injury')) { multiplyMatching(weights, (cat) => isLowerLimbCategory(cat), 0.85); multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.85); }
    if (restrictions.has('no_kneeling')) { boost(weights, 'core_stability', 0.3); }

    // 6. User Preferences
    if (componentWeights.has('mobility')) multiplyMatching(weights, (cat) => isMobilityCategory(cat), 1.35);
    if (componentWeights.has('strength')) multiplyMatching(weights, (cat) => isCoreCategory(cat) || isLowerLimbCategory(cat), 1.25);
    if (componentWeights.has('conditioning')) multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.45);

    if (primaryGoal === 'pain_relief') {
        multiplyMatching(weights, (cat) => isBreathingCategory(cat) || isMobilityCategory(cat) || String(cat).toLowerCase().includes('nerve') || cat === 'breathing_control' || cat === 'muscle_relaxation', 1.2);
        multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.8);
        multiplyMatching(weights, (cat) => isCoreCategory(cat), 1.15);

    } else if (primaryGoal === 'fat_loss') {
        multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.3);
    }

    for (const cat of Object.keys(weights)) { weights[cat] = Math.max(0.05, weights[cat]); }
    return weights;
}

// ============================================================================
// 4. FILTERING & SCORING
// ============================================================================

function parseNoPositionRestrictions(restrictionsSet) {
    const disallowed = new Set();
    for (const r of restrictionsSet) {
        if (r.startsWith('no_')) { const pos = r.replace('no_', '').trim(); if (pos) disallowed.add(pos); }
    }
    return disallowed;
}

function isExerciseCompatibleWithEquipment(ex, userEquipmentSet) {
    if (!ex.equipment || ex.equipment.length === 0) return true;
    const req = ex.equipment.map(cleanString).filter(Boolean);
    const ignorable = new Set(['none', 'bodyweight', 'brak', 'brak sprzętu', 'masa własna', '']);
    const required = req.filter(x => !ignorable.has(x));
    if (required.length === 0) return true;
    if (!userEquipmentSet || userEquipmentSet.size === 0) return false;
    for (const item of required) { if (!userEquipmentSet.has(item)) return false; }
    return true;
}

function violatesPhysicalRestrictions(ex, restrictionsSet) {
    const disallowedPositions = parseNoPositionRestrictions(restrictionsSet);
    const pos = (ex.position || '').toLowerCase();
    if (pos && disallowedPositions.has(pos)) return true;
    if (restrictionsSet.has('no_kneeling') && (pos === 'kneeling' || pos === 'quadruped' || pos === 'half_kneeling')) return true;
    if (restrictionsSet.has('foot_injury') && ex.is_foot_loading) return true;
    return false;
}

function filterExerciseCandidates(exercises, userData, ctx, fatigueProfile, rpeData) {
    const userEquipment = normalizeEquipmentList(userData?.equipment_available);
    const diagnosisSet = normalizeLowerSet(userData?.medical_diagnosis);
    const restrictionsSet = normalizeLowerSet(userData?.physical_restrictions);

    const isFatigued = fatigueProfile.fatigueScoreNow >= fatigueProfile.fatigueThresholdFilter;
    const isRelevantVolume = (fatigueProfile.weekLoad7d || 0) >= 1400;

    const isMonotonySpike = fatigueProfile.isMonotonyRelevant &&
        fatigueProfile.monotony7d >= 2.0 &&
        fatigueProfile.strain7d >= fatigueProfile.p85_strain_56d &&
        isRelevantVolume;

    const applySafetyGate = isFatigued || isMonotonySpike;

    if (isMonotonySpike) {
        console.log(`[PlanGen] Monotony Spike Filter Active (Load=${fatigueProfile.weekLoad7d}, M=${fatigueProfile.monotony7d})`);
    }

    const passesClinical = (ex) => {
        if (!ex || !ex.id) return false;
        const validation = validateExerciseRecord(ex);
        if (!validation.valid) return false;
        if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) return false;

        const safetyCheck = checkExerciseAvailability(ex, ctx, userData);
        if (!safetyCheck.allowed) return false;

        if (!isExerciseCompatibleWithEquipment(ex, userEquipment)) return false;
        if (violatesPhysicalRestrictions(ex, restrictionsSet)) return false;
        if (violatesDiagnosisHardContraindications(ex, diagnosisSet, ctx)) return false;
        if (violatesSeverePainRules(ex, ctx)) return false;
        return true;
    };

    let filtered = [];
    for (const ex of exercises) {
        if (!passesClinical(ex)) continue;
        if (applySafetyGate) {
            if (!isExerciseSafeForFatigue(ex, 0)) continue;
        }
        filtered.push(ex);
    }

    if (applySafetyGate && filtered.length < 5) {
        console.warn(`[PlanGen] Fatigue filter too strict. Relaxing rules (Level 1)...`);
        filtered = [];
        for (const ex of exercises) {
            if (!passesClinical(ex)) continue;
            if (!isExerciseSafeForFatigue(ex, 1)) continue;
            filtered.push(ex);
        }
    }
    return filtered;
}

function sectionCategoryFitMultiplier(section, categoryId) {
    const cat = String(categoryId || '').toLowerCase();
    if (section === 'main' && isBreathingCategory(cat)) return 0.0;
    if (section === 'warmup') {
        if (isBreathingCategory(cat)) return 1.35;
        if (isMobilityCategory(cat)) return 1.30;
        if (isConditioningCategory(cat)) return 0.50;
        return 0.95;
    }
    if (section === 'cooldown') {
        if (isBreathingCategory(cat)) return 1.30;
        if (isMobilityCategory(cat)) return 1.25;
        if (isConditioningCategory(cat)) return 0.40;
        return 0.85;
    }
    if (isBreathingCategory(cat)) return 0.0;
    if (isMobilityCategory(cat)) return 0.85;
    return 1.15;
}

function goalMultiplierForExercise(ex, userData, ctx) {
    const primaryGoal = String(userData?.primary_goal || '').toLowerCase();
    let m = 1.0;
    if (primaryGoal === 'pain_relief') {
        const cat = ex.category_id || '';

        // US-08 Check: Use ctx.painStatus (injected in main handler)
        if (ctx.painStatus === 'green' || !ctx.painStatus) {
            if (ex.intendedPainResponse === 'acceptable') m *= 1.1;
        }

        if (isBreathingCategory(cat) || isMobilityCategory(cat)) m *= 1.25;
        else if (cat === 'breathing_control' || cat === 'muscle_relaxation') m *= 1.25;
    }
    return m;
}

function painSafetyPenalty(ex, userData, ctx) {
    const painLocs = normalizeLowerSet(userData?.pain_locations);
    const diagnosisSet = normalizeLowerSet(userData?.medical_diagnosis);
    const painChar = userData?.pain_character || [];
    const isRadiating = painChar.includes('radiating') || painChar.includes('burning');

    let p = 1.0;
    const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
    if (painLocs.has('knee') && kneeLoad === 'high') p *= 0.10;

    const hasKneeIssue = painLocs.has('knee') || painLocs.has('knee_anterior') || diagnosisSet.has('chondromalacia') || diagnosisSet.has('knee_oa');
    if (hasKneeIssue && ex.kneeFlexionApplicability && !ctx.isSevere) {
        if (ex.kneeFlexionMaxDeg === null) p *= 0.75;
        else if (ex.kneeFlexionMaxDeg > 60) p *= 0.65;
        else p *= 1.10;
    }

    if (diagnosisSet.has('disc_herniation') && isRadiating) {
        if (ex.spineMotionProfile === 'lumbar_rotation_loaded') {
            p *= 0.60;
        }
    }

    const hasNeckIssue = painLocs.has('cervical') || painLocs.has('neck') || painLocs.has('shoulder');
    if (hasNeckIssue && ex.overheadRequired && !ctx.isSevere) {
        if (ex.shoulderLoadLevel === 'high') p *= 0.7;
        if (ex.shoulderLoadLevel === 'low') p *= 1.1;
        if (!ex.shoulderLoadLevel) p *= 0.75;
    }

    return p;
}

function painReliefFitMultiplier(ex, section, painZoneSet) {
    if (!painZoneSet || painZoneSet.size === 0) return 1.0;
    const matchCount = intersectionCount(ex.pain_relief_zones || [], painZoneSet);
    if (matchCount <= 0) return 1.0;
    if (section === 'warmup' || section === 'cooldown') return 1.0 + Math.min(1.0, matchCount * 0.55);
    return 1.0 + Math.min(0.4, matchCount * 0.15);
}

function deriveFamilyKey(ex) {
    if (!ex) return "unknown";
    const cat = ex.category_id || "uncategorized";
    const plane = ex.primary_plane || "multi";
    const pos = ex.position || "standing";
    const uni = ex.is_unilateral ? "uni" : "bi";
    return `${cat}|${plane}|${pos}|${uni}`;
}

function varietyPenalty(ex, state, section) {
    let p = 1.0;
    const weeklyUsed = state.weeklyUsage.get(ex.id) || 0;
    const familyKey = deriveFamilyKey(ex);
    const isAnchor = state.anchorFamilies && state.anchorFamilies.has(familyKey);

    if (isAnchor) {
        const familyUsage = state.weeklyFamilyUsage.get(familyKey) || 0;
        const targetExposure = state.anchorTargetExposure || 2;
        if (familyUsage < targetExposure) { p = 1.0; }
        else { p *= 1.0 / (1.0 + (familyUsage - targetExposure + 1) * 1.2); }
    } else {
        p *= 1.0 / (1.0 + weeklyUsed * 1.5);
    }

    const sessionCat = state.sessionCategoryUsage.get(ex.category_id) || 0;
    const sessionFamily = state.sessionFamilyUsage.get(familyKey) || 0;

    if (sessionFamily > 0) { p *= 0.1; }
    else { p *= 1.0 / (1.0 + sessionCat * (section === 'main' ? 0.9 : 0.6)); }
    return p;
}

function calculatePhaseFit(ex, phaseContext) {
    if (!phaseContext || !phaseContext.config) return 1.0;
    const config = phaseContext.config;
    const diff = ex.difficulty_level || 1;
    const intensity = ex.metabolic_intensity || 1;
    const impact = (ex.impact_level || 'low').toLowerCase();

    if (config.forbidden) {
        if (config.forbidden.maxDifficulty && diff > config.forbidden.maxDifficulty) return 0;
        if (config.forbidden.minDifficulty && diff < config.forbidden.minDifficulty) return 0;
        if (config.forbidden.blockHighImpact && impact === 'high') return 0;
    }

    let multiplier = 1.0;
    if (config.bias) {
        if (config.bias.difficulty) {
            const diffMult = config.bias.difficulty[diff];
            multiplier *= (diffMult !== undefined ? diffMult : 0.5);
        }
        if (config.bias.metabolicPenalty && intensity > 2) multiplier /= (config.bias.metabolicPenalty * (intensity - 1));
        if (config.bias.metabolicBonus && intensity >= 3) multiplier *= config.bias.metabolicBonus;
        if (config.bias.categoryKeywords && config.bias.categoryKeywords.length > 0) {
            const cat = (ex.category_id || '').toLowerCase();
            if (config.bias.categoryKeywords.some(kw => cat.includes(kw))) multiplier *= 1.3;
        }
    }
    if (phaseContext.spiralDifficultyBias > 0 && diff >= 3) multiplier *= (1.0 + phaseContext.spiralDifficultyBias);
    if (phaseContext.isSoftProgression) {
        if (diff >= 4) multiplier *= 0.5;
        if (diff <= 2) multiplier *= 1.2;
    }
    return multiplier;
}

function scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile) {
    const cat = ex.category_id || 'uncategorized';
    const base = categoryWeights[cat] != null ? categoryWeights[cat] : 1.0;

    if (state.usedIds.has(ex.id)) return 0;

    let score = base;
    score *= sectionCategoryFitMultiplier(section, cat);
    score *= painReliefFitMultiplier(ex, section, painZoneSet);
    score *= painSafetyPenalty(ex, userData, ctx);
    score *= goalMultiplierForExercise(ex, userData, ctx);
    score *= varietyPenalty(ex, state, section);

    // --- FIX: AFFINITY LOGIC (User Request) ---
    // Pobieramy Affinity Score z mapy preferencji przekazanej w `state`.
    if (state.preferencesMap) {
        const pref = state.preferencesMap[ex.id] || { score: 0 };
        const affinity = pref.score || 0;
        let affinityMult = 1.0;

        if (affinity > 0) {
            // Like: Liniowy Boost (np. +20 pkt = x1.2, +100 pkt = x2.0)
            affinityMult = 1.0 + (affinity * 0.01);
        } else if (affinity < 0) {
            // Dislike: Liniowa Kara (np. -50 pkt = x0.5)
            // Zabezpieczenie (floor): min 0.1, żeby nie zerować całkowicie (do tego służy Blacklist),
            // ale znacząco zmniejszyć szansę wylosowania.
            affinityMult = Math.max(0.1, 1.0 + (affinity * 0.01));
        }
        score *= affinityMult;
    }
    // ------------------------------------------

    if (phaseContext) {
        const phaseFit = calculatePhaseFit(ex, phaseContext);
        if (phaseFit === 0) return 0;
        score *= phaseFit;
    }

    const hobby = String(userData?.hobby || '').toLowerCase();
    const diagnoses = normalizeLowerSet(userData?.medical_diagnosis);

    if (hobby.includes('running') && ex.is_unilateral) {
        const isRehabControl = phaseContext?.phaseId === 'control' || phaseContext?.phaseId === 'rehab';
        score *= isRehabControl ? 1.1 : 1.2;
    }

    if (diagnoses.has('disc_herniation') && ex.primary_plane === 'rotation') {
        const isRehabControl = phaseContext?.phaseId === 'control' || phaseContext?.phaseId === 'rehab';
        score *= isRehabControl ? 0.5 : 0.7;
    }

    if (fatigueProfile) {
        const isFatigued = fatigueProfile.fatigueScoreNow >= fatigueProfile.fatigueThresholdFilter;
        const isMonotonySpike = fatigueProfile.isMonotonyRelevant &&
            fatigueProfile.monotony7d >= 2.0 &&
            fatigueProfile.strain7d >= fatigueProfile.p85_strain_56d;

        if (isFatigued || isMonotonySpike) {
            if (isBreathingCategory(cat) || isMobilityCategory(cat)) { score *= 1.25; }
            if (section === 'main' && (ex.difficulty_level || 1) === 3) { score *= 0.75; }
            if ((ex.metabolic_intensity || 1) === 3) { score *= 0.80; }
        }
    }

    return Math.max(0, score);
}

function selectMicrocycleAnchors(candidates, userData, ctx, categoryWeights, phaseContext, fatigueProfile) {
    let targetExposure = 2;
    if (phaseContext?.phaseId === PHASE_IDS.STRENGTH) targetExposure = 3;

    const mockState = {
        usedIds: new Set(),
        weeklyUsage: new Map(),
        sessionCategoryUsage: new Map(),
        weeklyFamilyUsage: new Map(),
        sessionFamilyUsage: new Map(),
        anchorFamilies: new Set(),
        anchorTargetExposure: targetExposure
    };

    const scored = candidates
        .filter(ex => !isBreathingCategory(ex.category_id))
        .map(ex => ({
            ex,
            score: scoreExercise(ex, 'main', userData, ctx, categoryWeights, mockState, new Set(), phaseContext, fatigueProfile)
        }))
        .filter(item => item.score > 0);

    scored.sort((a, b) => b.score - a.score);

    const anchorFamilies = new Set();
    const maxAnchors = 2;

    for (const item of scored) {
        if (anchorFamilies.size >= maxAnchors) break;
        const family = deriveFamilyKey(item.ex);
        anchorFamilies.add(family);
    }

    return { anchorFamilies, targetExposure };
}

function pickExerciseForSection(section, candidates, userData, ctx, categoryWeights, state, painZoneSet, extraFilterFn = null, phaseContext = null, fatigueProfile = null) {
    const filtered = [];
    for (const ex of candidates) {
        if (state.usedIds.has(ex.id)) continue;
        if (extraFilterFn && !extraFilterFn(ex)) continue;
        filtered.push(ex);
    }
    if (filtered.length === 0) return null;

    const picked = weightedPick(filtered, (ex) => scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile));
    if (!picked) return null;

    if (section === 'main') {
        const primaryScore = scoreExercise(picked, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile);
        const primaryFamily = deriveFamilyKey(picked);
        const potentialAlts = filtered.filter(ex => ex.id !== picked.id && deriveFamilyKey(ex) === primaryFamily);
        let altCandidate = null;
        if (potentialAlts.length > 0) {
            potentialAlts.sort((a, b) => {
                const sA = scoreExercise(a, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile);
                const sB = scoreExercise(b, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile);
                return sB - sA;
            });
            altCandidate = potentialAlts[0];
        }
        if (altCandidate) {
            const altScore = scoreExercise(altCandidate, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext, fatigueProfile);
            if (altScore >= primaryScore * 0.95) { picked.alternatives = [JSON.parse(JSON.stringify(altCandidate))]; }
        }
    }

    state.usedIds.add(picked.id);
    state.weeklyUsage.set(picked.id, (state.weeklyUsage.get(picked.id) || 0) + 1);
    state.weeklyCategoryUsage.set(picked.category_id, (state.weeklyCategoryUsage.get(picked.category_id) || 0) + 1);
    state.sessionCategoryUsage.set(picked.category_id, (state.sessionCategoryUsage.get(picked.category_id) || 0) + 1);
    const famKey = deriveFamilyKey(picked);
    state.weeklyFamilyUsage.set(famKey, (state.weeklyFamilyUsage.get(famKey) || 0) + 1);
    state.sessionFamilyUsage.set(famKey, (state.sessionFamilyUsage.get(famKey) || 0) + 1);

    return JSON.parse(JSON.stringify(picked));
}

// ============================================================================
// 5. PRESCRIPTION & VOLUME
// ============================================================================

function deriveSessionCounts(userData, ctx, targetMin) {
    let warmup = 2; let main = 2; let cooldown = 2;
    if (targetMin <= 20) { warmup = 2; main = 2; cooldown = 1; }
    else if (targetMin <= 35) { warmup = 2; main = 4; cooldown = 2; }
    else if (targetMin <= 50) { warmup = 3; main = 5; cooldown = 2; }
    else { warmup = 3; main = 6; cooldown = 2; }
    return { warmup, main: Math.max(MIN_MAIN_EXERCISES, main), cooldown };
}

function createInitialSession(dayNumber, targetMinutes) {
    return { dayNumber, title: `Sesja ${dayNumber}`, warmup: [], main: [], cooldown: [], targetMinutes };
}

function loadFactorFromState(userData, ctx, fatigueState, rpeModifier = 1.0) {
    const exp = String(userData?.exercise_experience || 'none').toLowerCase();
    const schedule = userData?.schedule_pattern || DEFAULT_SCHEDULE_PATTERN;
    const sessionsPerWeek = schedule.length;
    let base = 1.0;
    if (exp === 'none') base = 0.70; else if (exp === 'advanced') base = 1.10;
    if (sessionsPerWeek >= 5) base *= 0.90; else if (sessionsPerWeek <= 2) base *= 1.15;
    if (fatigueState === 'fatigued') base *= 0.8;
    base *= rpeModifier;
    return clamp(base, 0.45, 1.35);
}

function getPhaseRestFactor(phaseConfig, section = 'main') {
    const rawPhaseFactor = toNumber(phaseConfig?.prescription?.restFactor, 1.0);
    let phaseFactor = clamp(rawPhaseFactor, 0.5, 2.0);
    if (section === 'warmup' || section === 'cooldown') { phaseFactor = Math.min(phaseFactor, 1.0); }
    return phaseFactor;
}

function parseRange(str) {
    if (typeof str === 'number') return [str, str];
    if (!str) return [1, 1];
    const parts = String(str).split('-');
    if (parts.length === 1) return [parts[0], parts[0]];
    return [parts[0].trim(), parts[1].trim()].map(s => parseInt(s, 10));
}

function resolveValueFromRange(rangeStr, experienceLevel) {
    const [min, max] = parseRange(rangeStr);
    if (min === max) return min;
    if (experienceLevel === 'advanced') return max;
    if (experienceLevel === 'regular') return Math.round((min + max) / 2);
    return min;
}

function prescribeForExercise(ex, section, userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier = 1.0, phaseContext = null, historyMap = {}, undulationFactor = 1.0) {
    const phaseId = phaseContext?.phaseId || 'capacity';
    const phaseConfig = phaseContext?.config || {};
    const prescriptionConfig = phaseConfig.prescription || {};
    const isDeload = phaseId === PHASE_IDS.DELOAD || (phaseContext?.isOverride && phaseContext?.phaseId === PHASE_IDS.DELOAD);

    const factor = loadFactorFromState(userData, ctx, fatigueState, rpeModifier);
    const experience = String(userData?.exercise_experience || 'none').toLowerCase();

    // --- ROM CONSTRAINT INJECTION (US-12) ---
    // Pobieramy globalny profil ROM z kontekstu fazy (przekazany z handlera)
    let romConstraint = null;
    if (phaseContext && phaseContext.romProfile) {
        // Logika dla kolana
        if (ex.kneeFlexionApplicability && phaseContext.romProfile.knee_flexion) {
            const limit = phaseContext.romProfile.knee_flexion.current_limit;
            if (limit < 130) { // Jeśli limit jest mniejszy niż pełny zakres
                romConstraint = {
                    joint: 'knee',
                    limitDegrees: limit,
                    instruction: `Zakres do ${limit}°`
                };
            }
        }
    }
    // ----------------------------------------

    let selectedTempo = ex.default_tempo;
    if (ex.tempos && ex.tempos[phaseId]) { selectedTempo = ex.tempos[phaseId]; }
    selectedTempo = enforceTempoByPhaseIntent(selectedTempo, ex, phaseId);

    // ... (reszta logiki sets/reps bez zmian) ...
    let sets = 1;
    if (section === 'warmup') { sets = 2; }
    else if (section === 'cooldown') { sets = 1; }
    else {
        const rangeStr = prescriptionConfig.sets || '3';
        sets = resolveValueFromRange(rangeStr, experience);
    }

    if (section === 'main' && !isDeload) {
        sets = Math.max(2, Math.round(sets * undulationFactor));
    }

    if (section === 'main' && !isDeload && historyMap && historyMap[ex.id]) {
        sets = applyMicroLoading(sets, historyMap[ex.id]);
    }

    if (isDeload) { sets = Math.max(1, Math.floor(sets * 0.6)); }

    let repsOrTime = '10';
    if (ex.conditioning_style === 'interval' && ex.recommended_interval_sec) {
        const { work, rest } = ex.recommended_interval_sec;
        const baseTotalSec = 480 * factor * undulationFactor;
        const cycle = work + rest;
        let calculatedSets = Math.round(baseTotalSec / cycle);
        calculatedSets = clamp(calculatedSets, 3, 20);
        return { sets: String(calculatedSets), reps_or_time: `${work} s`, restBetweenSets: rest, tempo_or_iso: selectedTempo, romConstraint };
    }

    if (ex.conditioning_style === 'steady') {
        let durationMin = 10;
        if (experience === 'regular') durationMin = 15;
        if (experience === 'advanced') durationMin = 20;
        if (targetMin <= 20) durationMin = 10;

        durationMin = Math.round(durationMin * undulationFactor);

        return {
            sets: "1",
            reps_or_time: `${durationMin} min`,
            tempo_or_iso: "Umiarkowane",
            restFactor: 1.0,
            restAfterExercise: 60,
            transitionTime: 5,
            requiresSideSwitch: false,
            romConstraint // Dodano
        };
    }

    if (ex.conditioning_style === 'amrap') {
        return {
            sets: "3",
            reps_or_time: "MAX",
            tempo_or_iso: "Dynamiczne",
            restFactor: 1.5,
            restAfterExercise: 90,
            transitionTime: 5,
            requiresSideSwitch: ex.requires_side_switch,
            romConstraint // Dodano
        };
    }

    if (isBreathingCategory(ex.category_id)) {
        sets = 1;
        let breathDur = 90;
        if (experience === 'regular') breathDur = 120;
        if (experience === 'advanced') breathDur = 180;
        if (ex.max_recommended_duration > 0) {
            breathDur = Math.min(breathDur, ex.max_recommended_duration);
            breathDur = Math.max(90, breathDur);
        } else {
            breathDur = Math.max(90, breathDur);
        }
        repsOrTime = `${breathDur} s`;
    }
    else if (ex.max_recommended_duration > 0) {
        const phaseRepsStr = prescriptionConfig.reps || "10";
        if (phaseRepsStr.includes('s')) {
            const rangeStr = phaseRepsStr.replace('s', '');
            let targetSec = resolveValueFromRange(rangeStr, experience);
            if (!isDeload) targetSec = Math.round(targetSec * undulationFactor);
            repsOrTime = `${targetSec} s`;
        } else {
            const targetReps = resolveValueFromRange(phaseRepsStr, experience);
            let estimatedSec = targetReps * 4;
            if (!isDeload) estimatedSec = Math.round(estimatedSec * undulationFactor);
            estimatedSec = clamp(estimatedSec, 15, ex.max_recommended_duration || 60);
            repsOrTime = `${Math.ceil(estimatedSec / 5) * 5} s`;
        }
    } else {
        const rangeStr = prescriptionConfig.reps || "8-12";
        if (rangeStr.includes('s')) { repsOrTime = "10"; }
        else {
            let targetReps = resolveValueFromRange(rangeStr, experience);
            targetReps = Math.min(targetReps, ex.max_recommended_reps || GLOBAL_MAX_REPS);
            if (!isDeload) targetReps = Math.round(targetReps * factor * undulationFactor);
            repsOrTime = String(targetReps);
        }
    }

    if (ex.is_unilateral) {
        if (!String(repsOrTime).toLowerCase().includes('s')) repsOrTime = `${repsOrTime}/str.`;
        sets = Math.min(sets, 3);
    }

    const baseRest = ex.calculated_timing.rest_sec || 30;
    const baseTransition = ex.calculated_timing.transition_sec || 5;
    const phaseRestFactor = getPhaseRestFactor(phaseConfig, section);
    let phaseAdjustedRest = Math.round(baseRest * phaseRestFactor);

    if (ex.is_unilateral) {
        phaseAdjustedRest = Math.max(phaseAdjustedRest, 12);
    }

    return {
        sets: String(sets),
        reps_or_time: repsOrTime,
        tempo_or_iso: selectedTempo,
        restFactor: prescriptionConfig.restFactor || 1.0,
        restAfterExercise: phaseAdjustedRest,
        transitionTime: baseTransition,
        requiresSideSwitch: false,
        romConstraint // Dodano na końcu
    };
}


// ============================================================================
// 6. ESTIMATION & SHRINKING
// ============================================================================

function parseRepsOrTimeToSeconds(repsOrTime) {
    const t = String(repsOrTime || '').trim().toLowerCase();
    if (t.includes('s') && !t.includes('/str')) return Math.max(5, parseInt(t, 10) || 30);
    if (t.includes('min')) return Math.max(10, (parseInt(t, 10) || 1) * 60);
    return parseInt(t, 10) || 10;
}

function getRestAfterExercise(exEntry, effectiveRestFactor) {
    let baseRest = exEntry.restAfterExercise;
    if (!baseRest && exEntry.calculated_timing && exEntry.calculated_timing.rest_sec) { baseRest = exEntry.calculated_timing.rest_sec; }
    if (!baseRest) baseRest = 30;
    return Math.round(baseRest * effectiveRestFactor);
}

function estimateExerciseDurationSeconds(exEntry, userData, paceMap, effectiveRestFactor) {
    const globalSpr = clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12);
    let tempoToUse = paceMap && paceMap[exEntry.id] ? paceMap[exEntry.id] : globalSpr;
    const rawSets = parseInt(exEntry.sets, 10) || 1;
    const isUnilateral = exEntry.is_unilateral || String(exEntry.reps_or_time || '').includes('/str');
    const sets = isUnilateral ? Math.ceil(rawSets / 2) : rawSets;
    let singleSideWorkTime = 0;
    const rawStr = String(exEntry.reps_or_time).toLowerCase();
    const cleanStr = rawStr.replace(/\/str\.?|stron.*/g, '').trim();
    if (cleanStr.includes('s') || cleanStr.includes('min') || cleanStr.includes(':')) {
        singleSideWorkTime = parseRepsOrTimeToSeconds(cleanStr);
    } else {
        const reps = parseInt(cleanStr, 10) || 10;
        singleSideWorkTime = reps * tempoToUse;
    }
    const sidesMultiplier = isUnilateral ? 2 : 1;
    const totalWorkTime = sets * singleSideWorkTime * sidesMultiplier;

    let transitionPerSet = 0;
    if (isUnilateral) {
        transitionPerSet = 12;
    } else {
        if (exEntry.transitionTime) transitionPerSet = exEntry.transitionTime;
        else if (exEntry.calculated_timing && exEntry.calculated_timing.transition_sec) transitionPerSet = exEntry.calculated_timing.transition_sec;
        else transitionPerSet = 5;
    }

    const totalTransition = sets * transitionPerSet;
    const restBase = getRestAfterExercise(exEntry, 1.0);
    let smartRestTime = Math.round(restBase * effectiveRestFactor);

    if (isUnilateral) {
        smartRestTime = Math.max(smartRestTime, 12);
    }

    const totalRest = (sets > 1) ? (sets - 1) * smartRestTime : 0;
    return totalWorkTime + totalTransition + totalRest;
}

function estimateSessionDurationSeconds(session, userData, paceMap, phaseContext) {
    const userRestFactor = toNumber(userData?.restTimeFactor, 1.0);
    let total = 5;
    const sections = ['warmup', 'main', 'cooldown'];
    for (const section of sections) {
        const exercises = session[section] || [];
        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i];
            total += estimateExerciseDurationSeconds(ex, userData, paceMap, userRestFactor);
            const isLastInSession = (section === 'cooldown' && i === exercises.length - 1) || (section === 'main' && i === exercises.length - 1 && (!session.cooldown || session.cooldown.length === 0)) || (section === 'warmup' && i === exercises.length - 1 && (!session.main || session.main.length === 0) && (!session.cooldown || session.cooldown.length === 0));
            if (!isLastInSession) { total += getRestAfterExercise(ex, userRestFactor); }
        }
    }
    return total;
}

function updateExValue(ex, newVal, isTime) {
    if (isTime) ex.reps_or_time = `${newVal} s`;
    else ex.reps_or_time = String(newVal);
    if (ex.is_unilateral && !ex.reps_or_time.includes('/str')) { ex.reps_or_time += "/str."; }
}

function shrinkSessionToTarget(session, userData, paceMap, targetMin, phaseContext) {
    const targetSec = targetMin * 60;
    const toleranceSec = 60;
    const userRestFactor = toNumber(userData?.restTimeFactor, 1.0);
    let safetyLoop = 0;
    const sections = ['main', 'warmup', 'cooldown'];

    while (safetyLoop < 15) {
        const currentDur = estimateSessionDurationSeconds(session, userData, paceMap, phaseContext);
        if (currentDur <= targetSec + toleranceSec) return;

        let setsReduced = false;
        for (const sec of sections) {
            if (!session[sec]) continue;
            let candidate = null;
            let maxDur = -1;
            for (const ex of session[sec]) {
                const s = parseInt(ex.sets, 10);
                if (s > 2) {
                    const dur = estimateExerciseDurationSeconds(ex, userData, paceMap, userRestFactor);
                    if (dur > maxDur) { maxDur = dur; candidate = ex; }
                }
            }
            if (candidate) { candidate.sets = String(parseInt(candidate.sets, 10) - 1); setsReduced = true; break; }
        }
        if (setsReduced) { safetyLoop++; continue; }

        let fineTuned = false;
        for (const sec of ['main', 'cooldown']) {
            if (!session[sec]) continue;
            for (const ex of session[sec]) {
                const valStr = String(ex.reps_or_time).toLowerCase();
                const isTime = valStr.includes('s') || valStr.includes('min');
                let changed = false;
                if (isTime) {
                    let s = parseRepsOrTimeToSeconds(ex.reps_or_time);
                    if (s >= 45) { s -= 15; updateExValue(ex, s, true); changed = true; }
                } else {
                    let r = parseInt(valStr, 10) || 10;
                    if (r >= 8) { r -= 2; updateExValue(ex, r, false); changed = true; }
                }
                if (changed) fineTuned = true;
            }
        }
        if (fineTuned) { safetyLoop++; continue; }

        let desperateSets = false;
        if (session.main) {
            for (const ex of session.main) {
                const s = parseInt(ex.sets, 10);
                if (s > 1) { ex.sets = String(s - 1); desperateSets = true; break; }
            }
        }
        if (desperateSets) { safetyLoop++; continue; }

        if (session.main && session.main.length > 1) { session.main.pop(); safetyLoop++; continue; }
        break;
    }
}

function expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, fatigueProfile, fatigueState, targetMin, rpeModifier, phaseContext, historyMap, undulationFactor) {
    const targetSec = targetMin * 60;
    let guard = 0;
    const MAX_SETS_SAFE = 5;

    while (guard < 30) {
        const estimated = estimateSessionDurationSeconds(session, userData, paceMap, phaseContext);
        if (estimated >= targetSec * 0.95) break;
        guard++;

        let volumeIncreased = false;
        if (session.main && session.main.length > 0) {
            const candidatesForMoreSets = session.main
                .filter(ex => {
                    const currentSets = parseInt(ex.sets, 10) || 1;
                    if (ex.conditioning_style === 'interval') return false;
                    if (isBreathingCategory(ex.category_id)) return false;
                    if (ex.is_unilateral && currentSets >= 3) return false;
                    return currentSets < MAX_SETS_SAFE;
                })
                .sort((a, b) => parseInt(a.sets) - parseInt(b.sets));

            if (candidatesForMoreSets.length > 0) {
                const targetEx = candidatesForMoreSets[0];
                const currentSets = parseInt(targetEx.sets, 10);
                targetEx.sets = String(currentSets + 1);
                volumeIncreased = true;
            }
        }

        if (volumeIncreased) continue;

        let newExerciseAdded = false;
        const ex = pickExerciseForSection('main', candidates, userData, ctx, categoryWeights, sState, pZones, (c) => !isBreathingCategory(c.category_id), phaseContext, fatigueProfile);
        if (ex) {
            const rx = prescribeForExercise(ex, 'main', userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier, phaseContext, historyMap, undulationFactor);
            session.main.push({ ...ex, ...rx });
            newExerciseAdded = true;
        }

        if (!newExerciseAdded && !volumeIncreased) break;
    }
}

function analyzePainResponse(recentSessions) {
    const result = {
        painStatus: 'green',
        painDuringMax: 0,
        pain24hDelta: 0,
        consecutiveSymptomNegatives: 0,
        painModifier: 1.0,
        painReason: 'ok'
    };

    if (!recentSessions || recentSessions.length === 0) return result;
    const lastSession = recentSessions[0];
    const fb = lastSession.feedback;

    if (fb && fb.type === 'pain_monitoring') {
        const duringMax = fb.during?.max_nprs || 0;
        const delta = fb.after24h?.delta_vs_baseline || 0;
        const flags = fb.after24h || {};

        result.painDuringMax = duringMax;
        result.pain24hDelta = delta;

        if (duringMax > PAIN_CONFIG.maxPainDuring.amber ||
            delta > PAIN_CONFIG.maxDeltaFromBaseline.amber ||
            flags.neuro_red_flags === true) {

            result.painStatus = 'red';
            result.painModifier = PAIN_CONFIG.modifiers.red;
            result.painReason = flags.neuro_red_flags ? 'neuro_flags_detected' : 'high_pain_metrics';
            return result;
        }

        if (duringMax > PAIN_CONFIG.maxPainDuring.green ||
            delta > PAIN_CONFIG.maxDeltaFromBaseline.green ||
            flags.night_pain === true ||
            flags.stiffness_increased === true) {

            result.painStatus = 'amber';
            result.painModifier = PAIN_CONFIG.modifiers.amber;
            result.painReason = 'moderate_symptoms';
            return result;
        }

        result.painStatus = 'green';
        result.painModifier = PAIN_CONFIG.modifiers.green;
        return result;
    }

    let painDuring = 0;
    if (typeof lastSession.pain_during === 'number') { painDuring = lastSession.pain_during; }
    else if (fb?.type === 'symptom' || fb?.type === 'pain') {
        const val = parseInt(fb.value, 10);
        if (val === -1) painDuring = 7;
        else if (val === 0) painDuring = 3;
        else if (val === 1) painDuring = 1;
    }
    result.painDuringMax = painDuring;

    let negativeCount = 0;
    for (let i = 0; i < Math.min(3, recentSessions.length); i++) {
        const s = recentSessions[i];
        if (s.feedback?.type === 'symptom' && parseInt(s.feedback.value, 10) === -1) { negativeCount++; }
    }
    result.consecutiveSymptomNegatives = negativeCount;

    if (painDuring >= PAIN_CONFIG.maxPainDuring.amber || negativeCount >= PAIN_CONFIG.redRequiresConsecutiveSessions) {
        result.painStatus = 'red'; result.painModifier = PAIN_CONFIG.modifiers.red; result.painReason = (painDuring >= 7) ? 'high_pain_intensity_legacy' : 'persistent_symptoms_legacy';
    }
    else if (painDuring > PAIN_CONFIG.maxPainDuring.green || negativeCount === 1) {
        result.painStatus = 'amber'; result.painModifier = PAIN_CONFIG.modifiers.amber; result.painReason = 'moderate_pain_warning_legacy';
    }
    else { result.painStatus = 'green'; result.painModifier = PAIN_CONFIG.modifiers.green; }
    return result;
}

function analyzeRpeTrend(recentSessions) {
    const defaultResult = { volumeModifier: 1.0, intensityCap: null, label: 'Standard', lastFeedback: null };
    if (!recentSessions || recentSessions.length === 0) return defaultResult;
    const lastSession = recentSessions[0];
    let lastFeedback = null;
    if (lastSession.feedback) { lastFeedback = { value: parseInt(lastSession.feedback.value, 10), type: lastSession.feedback.type }; }
    const result = { ...defaultResult, lastFeedback };
    const isPainType = lastFeedback?.type === 'symptom' || lastFeedback?.type === 'pain';
    if (isPainType) { return result; }
    if (lastFeedback?.value === -1) { result.volumeModifier = 0.85; result.label = 'Recovery'; }
    else if (lastFeedback?.value === 1) { result.volumeModifier = 1.15; result.label = 'Progressive'; }
    return result;
}

// ============================================================================
// 7. ROLLING PLAN BUILDER
// ============================================================================

function buildRollingPlan(candidates, categoryWeights, userData, ctx, userId, historyMap, preferencesMap, paceMap, fatigueProfile, rpeData, progressionMap, phaseContext, currentSessionsDone, targetSessionsTotal) {
    const schedulePattern = userData?.schedule_pattern || DEFAULT_SCHEDULE_PATTERN;
    const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);
    const forcedRestDates = new Set(normalizeStringArray(userData?.forced_rest_dates));

    const { anchorFamilies, targetExposure } = selectMicrocycleAnchors(candidates, userData, ctx, categoryWeights, phaseContext, fatigueProfile);
    console.log(`[PlanGen] Anchors selected (${anchorFamilies.size}):`, Array.from(anchorFamilies));

    const plan = {
        id: `rolling-${Date.now()}`,
        days: [],
        meta: {
            ...userData,
            severityScore: ctx.severityScore,
            isSevere: ctx.isSevere,
            generatedAt: new Date().toISOString(),
            rpeStatus: rpeData.label,
            fatigueProfile: fatigueProfile,
            currentPhase: phaseContext.phaseId,
            overrideMode: phaseContext.isOverride ? phaseContext.phaseId : null,
            anchors: Array.from(anchorFamilies)
        }
    };

    let fatigueScore = fatigueProfile.fatigueScoreNow;
    const weeklyUsage = new Map();
    const weeklyCategoryUsage = new Map();
    const weeklyFamilyUsage = new Map();

    const undulationWave = [1.0, 0.85, 1.15, 0.9, 0.8, 1.2, 1.0];
    
    // ZMIANA: Obliczamy ile sesji pozostało do końca fazy
    let sessionsRemaining = targetSessionsTotal - currentSessionsDone;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const dayOfWeek = currentDate.getDay();
        const dateString = currentDate.toISOString().split('T')[0];
        const isScheduled = schedulePattern.includes(dayOfWeek);
        const isForcedRest = forcedRestDates.has(dateString);

        const dailyUndulation = undulationWave[dayOffset % 7];

        if (dayOffset > 0) fatigueScore = Math.round(fatigueScore * 0.6);

        if (isScheduled && !isForcedRest) {
            // ZMIANA: Jeśli skończył się limit sesji w fazie, przerywamy generowanie planu
            // aby wymusić sprawdzenie przejścia fazy (target reached).
            if (sessionsRemaining <= 0) {
                break;
            }

            let costOfSession = 25 * dailyUndulation;
            const sessionTitleSuffix = phaseContext.isOverride ? `(${phaseContext.phaseId.toUpperCase()})` : '';
            const session = createInitialSession(dayOffset + 1, targetMin);

            let intensityLabel = "";
            if (dailyUndulation > 1.1) intensityLabel = " (Mocny)";
            else if (dailyUndulation < 0.9) intensityLabel = " (Lekki)";

            session.title = `Trening ${currentDate.toLocaleDateString('pl-PL', { weekday: 'long' })}${intensityLabel} ${sessionTitleSuffix}`;
            session.date = dateString;
            session.type = 'workout';
            const pZones = derivePainZoneSet(userData.pain_locations);
            const sState = {
                usedIds: new Set(),
                weeklyUsage, weeklyCategoryUsage, weeklyFamilyUsage,
                sessionCategoryUsage: new Map(), sessionFamilyUsage: new Map(), sessionPlaneUsage: new Map(),
                historyMap: historyMap || {}, preferencesMap: preferencesMap || {},
                progressionMap: progressionMap || { sources: new Map(), targets: new Set() },
                anchorFamilies, anchorTargetExposure: targetExposure
            };

            const currentLoopFatigueState = fatigueScore >= fatigueProfile.fatigueThresholdFilter ? 'fatigued' : 'fresh';

            ['warmup', 'main', 'cooldown'].forEach(sec => {
                const counts = deriveSessionCounts(userData, ctx, targetMin);
                for (let i = 0; i < counts[sec]; i++) {
                    const sectionFilter = (c) => {
                        if (sec === 'warmup' || sec === 'cooldown') { if ((c.difficulty_level || 1) > 2) return false; }
                        return true;
                    };
                    const ex = pickExerciseForSection(sec, candidates, userData, ctx, categoryWeights, sState, pZones, sectionFilter, phaseContext, fatigueProfile);
                    if (ex) {
                        const rx = prescribeForExercise(ex, sec, userData, ctx, categoryWeights, currentLoopFatigueState, targetMin, rpeData.volumeModifier, phaseContext, historyMap, dailyUndulation);
                        session[sec].push({ ...ex, ...rx });
                    }
                }
            });

            if (session.warmup.length > 0) {
                session.warmup.sort((a, b) => {
                    const aIsBreath = isBreathingCategory(a.category_id);
                    const bIsBreath = isBreathingCategory(b.category_id);
                    if (aIsBreath && !bIsBreath) return -1;
                    if (!aIsBreath && bIsBreath) return 1;
                    return (a.difficulty_level || 1) - (b.difficulty_level || 1);
                });
            }
            if (session.cooldown.length > 0) {
                session.cooldown.sort((a, b) => {
                    const aIsBreath = isBreathingCategory(a.category_id);
                    const bIsBreath = isBreathingCategory(b.category_id);
                    if (aIsBreath && !bIsBreath) return 1;
                    if (!aIsBreath && bIsBreath) return -1;
                    return (b.difficulty_level || 1) - (a.difficulty_level || 1);
                });
            }

            expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, fatigueProfile, currentLoopFatigueState, targetMin, rpeData.volumeModifier, phaseContext, historyMap, dailyUndulation);
            shrinkSessionToTarget(session, userData, paceMap, targetMin, phaseContext);
            const finalDur = Math.round(estimateSessionDurationSeconds(session, userData, paceMap, phaseContext) / 60);
            session.estimatedDurationMin = finalDur;

            plan.days.push(session);
            
            // ZMIANA: Zmniejszamy licznik dostępnych sesji po wygenerowaniu treningu
            sessionsRemaining--;
            
            fatigueScore += costOfSession;
            fatigueScore = Math.min(MAX_BUCKET_CAPACITY, Math.max(0, fatigueScore));
        } else {
            fatigueScore = Math.max(0, fatigueScore - 50);
            plan.days.push({ dayNumber: dayOffset + 1, title: 'Regeneracja', date: dateString, type: 'rest', warmup: [], main: [], cooldown: [], estimatedDurationMin: 0 });
        }
    }
    return plan;
}

// ============================================================================
// 8. VALIDATOR
// ============================================================================

function validateAndCorrectPlan(plan, phaseContext) {
    if (!plan || !plan.days) return;
    const config = phaseContext.config;
    const forbidden = config.forbidden || {};
    const isRehab = phaseContext.phaseId === PHASE_IDS.REHAB;
    const isDeload = phaseContext.phaseId === PHASE_IDS.DELOAD;

    plan.days.forEach(day => {
        if (day.type === 'rest') return;
        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!day[section]) return;
            day[section].forEach(ex => {
                if (forbidden.maxDifficulty && ex.difficulty_level > forbidden.maxDifficulty) {
                    ex.sets = "1";
                    ex.reps_or_time = "Spokojnie";
                    ex.validation_note = "Auto-scaled: Too hard for current phase";
                }
                if (isDeload) { const s = parseInt(ex.sets, 10); if (s > 2) ex.sets = "2"; }
                if (isRehab) {
                    if (!String(ex.reps_or_time).includes('s') && parseInt(ex.reps_or_time) > 12) { ex.reps_or_time = "10"; }
                    if (ex.tempo_or_iso === 'normal' || ex.tempo_or_iso === 'fast') { ex.tempo_or_iso = 'slow'; }
                }
            });
        });
    });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };
    let userId; try { userId = await getUserIdFromEvent(event); } catch (e) { return { statusCode: 401 }; }
    const userData = safeJsonParse(event.body);
    if (!userData) return { statusCode: 400 };

    const client = await pool.connect();
    try {
        const [eR, bR, pR, hR, sR, recentSessionsR, oR, fatigueProfile, settingsR] = await Promise.all([
            client.query('SELECT * FROM exercises'),
            client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
            client.query('SELECT exercise_id, affinity_score FROM user_exercise_preferences WHERE user_id = $1', [userId]),
            client.query(`SELECT session_data->'sessionLog' as logs, completed_at FROM training_sessions WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'`, [userId]),
            client.query('SELECT exercise_id, avg_seconds_per_rep FROM user_exercise_stats WHERE user_id = $1', [userId]),
            client.query(`SELECT completed_at, session_data->'feedback' as feedback, session_data->'pain_during' as pain_during FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 3`, [userId]),
            client.query('SELECT original_exercise_id, replacement_exercise_id, adjustment_type FROM user_plan_overrides WHERE user_id = $1', [userId]),
            calculateFatigueProfile(client, userId),
            client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId])
        ]);

        const exercises = eR.rows.map(r => normalizeExerciseRow(r, userData.exercise_experience));
        const ctx = safeBuildUserContext(userData);
        bR.rows.forEach(r => ctx.blockedIds.add(r.exercise_id));
        const preferencesMap = {}; pR.rows.forEach(r => preferencesMap[r.exercise_id] = { score: r.affinity_score });

        const historyMap = {};
        hR.rows.forEach(r => {
            const sessionDate = new Date(r.completed_at);
            (r.logs || []).forEach(l => {
                const id = l.exerciseId || l.id;
                if (id && (!historyMap[id] || sessionDate > historyMap[id].date)) {
                    historyMap[id] = { date: sessionDate, rir: l.rir, rating: l.rating };
                }
            });
        });

        const progressionMap = { sources: new Map(), targets: new Set() };
        oR.rows.forEach(r => { if (r.adjustment_type === 'evolution') { progressionMap.sources.set(r.original_exercise_id, r.replacement_exercise_id); progressionMap.targets.add(r.replacement_exercise_id); } });
        const paceMap = {}; sR.rows.forEach(r => { paceMap[r.exercise_id] = parseFloat(r.avg_seconds_per_rep); });
        const recentSessions = recentSessionsR.rows;
        const rpeData = analyzeRpeTrend(recentSessions);
        const painData = analyzePainResponse(recentSessions);

        let settings = settingsR.rows[0]?.settings || {};
        let phaseState = settings.phase_manager;

        if (!phaseState) { phaseState = initializePhaseState(userData.primary_goal, userData); }
        else { phaseState = applyGoalChangePolicy(phaseState, userData.primary_goal, userData); }

        const safetyCtx = {
            isSeverePain: ctx.isSevere, painStatus: painData.painStatus,
            fatigueScore: fatigueProfile.fatigueScoreNow, fatigueThresholdEnter: fatigueProfile.fatigueThresholdEnter, fatigueThresholdExit: fatigueProfile.fatigueThresholdExit,
            monotony7d: fatigueProfile.isMonotonyRelevant ? fatigueProfile.monotony7d : 1.0,
            strain7d: fatigueProfile.isMonotonyRelevant ? fatigueProfile.strain7d : 0,
            p85_strain_56d: fatigueProfile.p85_strain_56d,
            lastFeedbackValue: rpeData.lastFeedback?.value, lastFeedbackType: rpeData.lastFeedback?.type
        };

        const resolved = resolveActivePhase(phaseState, safetyCtx);
        if (resolved.suggestedUpdate) { phaseState = applySuggestedUpdate(phaseState, resolved.suggestedUpdate); }

        let sessionsCompleted = phaseState.current_phase_stats?.sessions_completed || 0;
        let targetSessions = phaseState.current_phase_stats?.target_sessions || 12;
        if (resolved.isOverride) { sessionsCompleted = phaseState.override?.stats?.sessions_completed || 0; targetSessions = pickTargetSessions(resolved.activePhaseId, userData); }

        const phaseContext = {
            phaseId: resolved.activePhaseId, isOverride: resolved.isOverride,
            config: getPhaseConfig(resolved.activePhaseId), sessionsCompleted: sessionsCompleted, targetSessions: targetSessions,
            isSoftProgression: phaseState.current_phase_stats?.is_soft_progression || false, spiralDifficultyBias: phaseState.spiral?.base_difficulty_bias || 0
        };

        // Fix: Inject painStatus into ctx for goalMultiplierForExercise usage
        ctx.painStatus = painData.painStatus;

        console.log(`[PlanGen] User: ${userId}, Phase: ${phaseContext.phaseId} (Override: ${phaseContext.isOverride}), Fatigue: ${fatigueProfile.fatigueScoreNow}, PainStatus: ${painData.painStatus}`);

        const cWeights = buildDynamicCategoryWeights(exercises, userData, ctx);
        const effectiveVolumeModifier = rpeData.volumeModifier * painData.painModifier;
        rpeData.volumeModifier = effectiveVolumeModifier;

        const candidates = filterExerciseCandidates(exercises, userData, ctx, fatigueProfile, rpeData);
        if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES' }) };

        // ZMIANA: Przekazanie liczników fazy do funkcji budującej plan
        const plan = buildRollingPlan(
            candidates, cWeights, userData, ctx, userId, historyMap, preferencesMap, 
            paceMap, fatigueProfile, rpeData, progressionMap, phaseContext,
            phaseContext.sessionsCompleted, phaseContext.targetSessions
        );
        validateAndCorrectPlan(plan, phaseContext);

        settings.dynamicPlanData = plan;
        settings.planMode = 'dynamic';
        settings.onboardingCompleted = true;
        settings.wizardData = userData;
        settings.phase_manager = phaseState;

        await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings', [userId, JSON.stringify(settings)]);

        return { statusCode: 200, body: JSON.stringify({ plan, phaseContext }) };
    } catch (e) {
        console.error(e);
        return { statusCode: 500 };
    } finally { client.release(); }
};

module.exports.validateExerciseRecord = validateExerciseRecord;
module.exports.prescribeForExercise = prescribeForExercise;
module.exports.normalizeExerciseRow = normalizeExerciseRow;
module.exports.buildDynamicCategoryWeights = buildDynamicCategoryWeights;
module.exports.scoreExercise = scoreExercise;
module.exports.safeBuildUserContext = safeBuildUserContext;
module.exports.deriveFamilyKey = deriveFamilyKey;
module.exports.selectMicrocycleAnchors = selectMicrocycleAnchors;
module.exports.analyzePainResponse = analyzePainResponse; // Exported for testing US-02
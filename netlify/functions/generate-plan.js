// netlify/functions/generate-plan.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability, isRotationalPlane } = require('./_clinical-rule-engine.js');
const { calculateTiming } = require('./_pacing-engine.js'); // IMPORT NOWEGO SILNIKA

// DEFAULT CONSTANTS
const DEFAULT_SECONDS_PER_REP = 6;
const DEFAULT_TARGET_MIN = 30;
const DEFAULT_SCHEDULE_PATTERN = [1, 3, 5];

const MIN_MAIN_EXERCISES = 1;
const MAX_SETS_MAIN = 5;
const MAX_SETS_MOBILITY = 3;
const MAX_BREATHING_SEC = 240;
const GLOBAL_MAX_REPS = 25;

const POSITION_ENERGY_RANK = {
    'supine': 1, 'prone': 1, 'lying': 1, 'side_lying': 1,
    'sitting': 2, 'long_sitting': 2,
    'quadruped': 3, 'kneeling': 3, 'half_kneeling': 3,
    'standing': 4, 'lunge': 4
};

const HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES = new Set([
  'chondromalacia', 'meniscus_tear', 'acl_rehab', 'mcl_rehab', 'lcl_rehab',
]);

const HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES = new Set([
  'disc_herniation', 'spondylolisthesis',
]);

// ---------------------------------
// Utility helpers
// ---------------------------------

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

function normalizeStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
  return [];
}

function normalizeLowerSet(arr) {
  return new Set(normalizeStringArray(arr).map(s => s.toLowerCase()));
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

function normalizeExerciseRow(row) {
  const ex = {
    id: row.id,
    name: row.name,
    description: row.description,
    equipment: normalizeStringArray(row.equipment).map(cleanString).filter(Boolean),
    is_unilateral: !!row.is_unilateral,
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
    recommended_interval_sec: row.recommended_interval_sec
  };

  // --- ZMIANA ARCHITEKTONICZNA (Task B2) ---
  // Wstępne obliczenie timingu już na etapie normalizacji
  ex.calculated_timing = calculateTiming(ex);

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

    if (ex.impact_level !== 'no_impact' && ex.is_foot_loading !== true) return { valid: false, error: 'impact_without_foot_loading' };
    if (ex.position !== 'standing' && ex.impact_level !== 'no_impact') return { valid: false, error: 'impact_without_standing' };

    if (ex.spine_load_level === 'high' && ex.position !== 'standing') return { valid: false, error: 'high_spine_without_standing' };
    if (ex.knee_load_level === 'high') {
        if (ex.position !== 'standing' || ex.is_foot_loading !== true) return { valid: false, error: 'high_knee_without_loading' };
    }

    if (ex.impact_level === 'high' && ex.difficulty_level < 4) return { valid: false, error: 'high_impact_low_difficulty' };
    if (ex.difficulty_level <= 2 && !['no_impact', 'low'].includes(ex.impact_level)) return { valid: false, error: 'low_difficulty_high_impact' };

    return { valid: true };
}

function isBreathingCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('breathing') || s.includes('breath') || s.includes('relax') || s.includes('parasymp'); }
function isMobilityCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('mobility') || s.includes('stretch') || s.includes('flexor') || s.includes('decompression'); }
function isConditioningCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('conditioning') || s.includes('cardio') || s.includes('aerobic'); }
function isCoreCategory(cat) { const s = String(cat || '').toLowerCase(); return s.startsWith('core_') || s === 'core' || s.includes('core_stability') || s.includes('anti_'); }
function isLowerLimbCategory(cat) { const s = String(cat || '').toLowerCase(); return (s.includes('knee') || s.includes('vmo') || s.includes('calf') || s.includes('calves') || s.includes('ankle') || s.includes('glute') || s.includes('hip_extension') || s.includes('unilateral') || s.includes('hamstring') || s.includes('quad')); }
function isUpperBodyMobilityNeed(workType, hobby) { const wt = String(workType || '').toLowerCase(); const hb = String(hobby || '').toLowerCase(); return wt === 'sedentary' || hb === 'cycling'; }

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

function getPositionRank(ex) {
    const pos = ex.position || 'standing';
    return POSITION_ENERGY_RANK[pos] || 3;
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

function initCategoryWeightsFromExercises(exercises) {
  const weights = Object.create(null);
  for (const ex of exercises) {
    const cat = ex.category_id || 'uncategorized';
    if (weights[cat] == null) weights[cat] = 1.0;
  }
  return weights;
}

function boost(weights, categoryId, delta) {
    const key = String(categoryId);
    if (weights[key] != null) {
        weights[key] += delta;
    }
}

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
  const secondaryGoals = normalizeStringArray(userData?.secondary_goals).map(s => String(s).toLowerCase());

  if (painLocs.has('knee') || painLocs.has('knee_anterior')) {
    boost(weights, 'vmo_activation', 2.0);
    boost(weights, 'knee_stability', 2.0);
    boost(weights, 'terminal_knee_extension', 1.5);
    boost(weights, 'glute_activation', 0.8);
    boost(weights, 'hip_mobility', 0.4);
  }
  if (focusLocs.has('glutes') || focusLocs.has('glute') || focusLocs.has('pośladki')) {
    boost(weights, 'glute_activation', 1.5);
    boost(weights, 'hip_extension', 1.5);
  }
  if (focusLocs.has('abs') || focusLocs.has('core') || focusLocs.has('brzuch')) {
    boost(weights, 'core_stability', 1.2);
    boost(weights, 'core_anti_extension', 1.0);
  }
  if (painLocs.has('lumbar') || painLocs.has('low_back')) {
    boost(weights, 'breathing', 0.8);
    boost(weights, 'spine_mobility', 1.2);
    boost(weights, 'core_anti_extension', 1.0);
    boost(weights, 'hip_mobility', 0.6);
  }
  if (painLocs.has('hip')) {
    boost(weights, 'hip_mobility', 1.0);
    boost(weights, 'glute_activation', 0.8);
  }
  if (painLocs.has('neck') || painLocs.has('cervical')) {
    boost(weights, 'thoracic_mobility', 0.8);
    boost(weights, 'breathing', 0.4);
  }
  if (painLocs.has('shoulder')) boost(weights, 'thoracic_mobility', 0.8);
  if (painLocs.has('ankle') || painLocs.has('foot')) {
    boost(weights, 'calves', 0.6);
    boost(weights, 'ankle_mobility', 0.8);
    boost(weights, 'balance', 0.5);
  }

  if (workType === 'sedentary') {
    boost(weights, 'thoracic_mobility', 1.0);
    boost(weights, 'hip_flexor_stretch', 1.0);
    boost(weights, 'hip_extension', 0.6);
    boost(weights, 'glute_activation', 0.6);
  } else if (workType === 'standing') {
    boost(weights, 'breathing', 0.4);
    boost(weights, 'spine_mobility', 0.6);
    boost(weights, 'calves', 0.6);
    boost(weights, 'hip_mobility', 0.4);
  }

  if (hobby === 'running') {
    boost(weights, 'core_stability', 1.0);
    boost(weights, 'unilateral_leg', 1.2);
    boost(weights, 'vmo_activation', 1.0);
    boost(weights, 'calves', 1.0);
    boost(weights, 'eccentric_hamstrings', 0.9);
  } else if (hobby === 'cycling') {
    boost(weights, 'thoracic_mobility', 0.8);
    boost(weights, 'hip_flexor_stretch', 0.9);
    boost(weights, 'hip_mobility', 0.6);
    boost(weights, 'glute_activation', 0.4);
  }

  if (diagnosis.has('disc_herniation')) {
    boost(weights, 'core_anti_extension', 0.8);
    boost(weights, 'breathing', 0.5);
    boost(weights, 'hip_mobility', 0.4);
    boost(weights, 'core_anti_rotation', 0.3);
    multiplyMatching(weights, (cat) => String(cat).toLowerCase().includes('rotation_mobility'), 0.6);
  }
  if (diagnosis.has('chondromalacia') || diagnosis.has('chondmalacia')) {
    boost(weights, 'vmo_activation', 0.8);
    boost(weights, 'knee_stability', 0.8);
    boost(weights, 'glute_activation', 0.6);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.85);
  }
  if (diagnosis.has('patellar_tendinopathy') || diagnosis.has('jumpers_knee')) {
    boost(weights, 'eccentric_control', 1.2);
    boost(weights, 'vmo_activation', 0.7);
  }
  if (diagnosis.has('scoliosis')) {
    boost(weights, 'core_anti_rotation', 0.6);
    boost(weights, 'core_anti_lateral_flexion', 0.6);
    boost(weights, 'glute_activation', 0.3);
  }
  if (diagnosis.has('facet_syndrome') || diagnosis.has('stenosis')) {
    boost(weights, 'hip_mobility', 0.6);
    boost(weights, 'core_anti_extension', -0.4);
  }
  if (diagnosis.has('piriformis') || painLocs.has('sciatica') || ctx.painFilters.has('sciatica')) {
    boost(weights, 'nerve_flossing', 2.0);
    boost(weights, 'glute_activation', 0.4);
    boost(weights, 'hip_mobility', 0.4);
  }

  if (restrictions.has('foot_injury')) {
    boost(weights, 'core_stability', 0.6);
    boost(weights, 'spine_mobility', 0.6);
    boost(weights, 'hip_mobility', 0.4);
    multiplyMatching(weights, (cat) => isLowerLimbCategory(cat), 0.85);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.85);
  }
  if (restrictions.has('no_kneeling')) {
    boost(weights, 'core_stability', 0.3);
    boost(weights, 'core_anti_extension', 0.2);
  }

  if (componentWeights.has('mobility')) {
    multiplyMatching(weights, (cat) => String(cat).toLowerCase().includes('mobility') || String(cat).toLowerCase().endsWith('_mobility'), 1.35);
    multiplyMatching(weights, (cat) => String(cat).toLowerCase().includes('stretch'), 1.25);
  }
  if (componentWeights.has('strength')) {
    multiplyMatching(weights, (cat) => isCoreCategory(cat) || isLowerLimbCategory(cat) || String(cat).toLowerCase().includes('activation') || String(cat).toLowerCase().includes('stability') || String(cat).toLowerCase().includes('extension'), 1.25);
  }
  if (componentWeights.has('conditioning')) {
    boost(weights, 'conditioning_low_impact', 1.6);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.45);
  }
  if (componentWeights.has('pain_relief')) {
    multiplyMatching(weights, (cat) => isBreathingCategory(cat) || isMobilityCategory(cat) || String(cat).toLowerCase().includes('nerve'), 1.25);
  }

  if (primaryGoal === 'pain_relief') {
    multiplyMatching(weights, (cat) => isBreathingCategory(cat) || isMobilityCategory(cat) || String(cat).toLowerCase().includes('nerve'), 1.25);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.9);
  }
  if (primaryGoal === 'fat_loss') {
    boost(weights, 'conditioning_low_impact', 1.3);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.25);
  }
  if (primaryGoal === 'strength' || primaryGoal === 'hypertrophy') {
    multiplyMatching(weights, (cat) => isCoreCategory(cat) || isLowerLimbCategory(cat) || String(cat).toLowerCase().includes('strength'), 1.15);
  }

  for (const cat of Object.keys(weights)) { weights[cat] = Math.max(0.05, weights[cat]); }

  return weights;
}

function parseNoPositionRestrictions(restrictionsSet) {
  const disallowed = new Set();
  for (const r of restrictionsSet) {
    if (r.startsWith('no_')) {
      const pos = r.replace('no_', '').trim();
      if (pos) disallowed.add(pos);
    }
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

  for (const item of required) {
      if (!userEquipmentSet.has(item)) return false;
  }
  return true;
}

function violatesPhysicalRestrictions(ex, restrictionsSet) {
  const disallowedPositions = parseNoPositionRestrictions(restrictionsSet);
  const pos = (ex.position || '').toLowerCase();
  if (pos && disallowedPositions.has(pos)) return true;

  if (restrictionsSet.has('no_kneeling')) {
      if (pos === 'kneeling' || pos === 'quadruped' || pos === 'half_kneeling') return true;
  }

  if (restrictionsSet.has('no_prone') && pos === 'prone') return true;
  if (restrictionsSet.has('no_supine') && pos === 'supine') return true;
  if (restrictionsSet.has('no_sitting') && pos === 'sitting') return true;
  if (restrictionsSet.has('no_standing') && pos === 'standing') return true;

  if (restrictionsSet.has('foot_injury')) {
    if (ex.is_foot_loading) return true;
    const impact = (ex.impact_level || 'low').toLowerCase();
    if (impact === 'moderate' || impact === 'high') return true;
  }

  return false;
}

function violatesDiagnosisHardContraindications(ex, diagnosisSet) {
  const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
  const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
  const impact = (ex.impact_level || 'low').toLowerCase();
  const cat = String(ex.category_id || '').toLowerCase();
  const plane = String(ex.primary_plane || '').toLowerCase();

  if (diagnosisSet.has('disc_herniation')) {
    const isDynamicRotation = (isRotationalPlane(plane) || cat.includes('rotation')) && !cat.includes('anti_rotation');
    if (isDynamicRotation) {
      const diff = ex.difficulty_level || 1;
      if (spineLoad !== 'low' || impact !== 'low' || diff >= 3) return true;
    }
  }

  if (kneeLoad === 'high') {
    for (const d of diagnosisSet) { if (HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d)) return true; }
  }
  if (spineLoad === 'high') {
    for (const d of diagnosisSet) { if (HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES.has(d)) return true; }
  }
  if (impact === 'high') {
    if (diagnosisSet.has('chondromalacia') || diagnosisSet.has('meniscus_tear') || diagnosisSet.has('disc_herniation')) return true;
  }
  return false;
}

function violatesSeverePainRules(ex, ctx) {
  if (!ctx.isSevere) return false;
  if ((ex.difficulty_level || 1) > 2) return true;
  const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
  const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
  const impact = (ex.impact_level || 'low').toLowerCase();
  if (spineLoad === 'high') return true;
  if (kneeLoad === 'high') return true;
  if (impact === 'high') return true;
  if ((ex.metabolic_intensity || 1) >= 4) return true;
  return false;
}

function applyCheckExerciseAvailability(ex, ctx, userData) {
  try {
    const res = checkExerciseAvailability(ex, ctx, { strictSeverity: true, userData });
    return res;
  } catch (e) {
    console.error(`Error in checkExerciseAvailability for ${ex.id}:`, e);
    return { allowed: false, reason: 'rule_engine_exception' };
  }
}

function filterExerciseCandidates(exercises, userData, ctx, fatigueState, rpeData) {
  const userEquipment = normalizeEquipmentList(userData?.equipment_available);
  const diagnosisSet = normalizeLowerSet(userData?.medical_diagnosis);
  const restrictionsSet = normalizeLowerSet(userData?.physical_restrictions);

  const difficultyCap = rpeData && rpeData.intensityCap ? rpeData.intensityCap : 5;

  const filtered = [];
  for (const ex of exercises) {
    if (!ex || !ex.id) continue;

    const validation = validateExerciseRecord(ex);
    if (!validation.valid) {
        console.warn(`[Filter] Rejected invalid record: ${ex.id} (${validation.error})`);
        continue;
    }

    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) continue;

    const safetyCheck = applyCheckExerciseAvailability(ex, ctx, userData);
    if (!safetyCheck.allowed) {
        console.log(`[Filter] Rejected ${ex.id}: ${safetyCheck.reason}`);
        continue;
    }

    if (!isExerciseCompatibleWithEquipment(ex, userEquipment)) continue;
    if (violatesPhysicalRestrictions(ex, restrictionsSet)) continue;
    if (violatesDiagnosisHardContraindications(ex, diagnosisSet)) continue;
    if (violatesSeverePainRules(ex, ctx)) continue;

    const diff = ex.difficulty_level || 1;
    if (diff > difficultyCap) continue;

    if (fatigueState === 'fatigued') {
        if (diff >= 4) continue;
        if ((ex.impact_level || 'low') === 'high') continue;
    }

    filtered.push(ex);
  }
  return filtered;
}

function derivePainZoneSet(userData) {
  const painLocs = normalizeLowerSet(userData?.pain_locations);
  const zoneSet = new Set();
  for (const z of painLocs) zoneSet.add(z);
  if (painLocs.has('lumbar') || painLocs.has('low_back')) { zoneSet.add('lumbosacral'); zoneSet.add('sciatica'); }
  if (painLocs.has('knee') || painLocs.has('knee_anterior')) { zoneSet.add('patella'); }
  if (painLocs.has('hip')) zoneSet.add('piriformis');
  return zoneSet;
}

function sectionCategoryFitMultiplier(section, categoryId) {
  const cat = String(categoryId || '').toLowerCase();
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
  if (isBreathingCategory(cat)) return 0.20;
  if (isMobilityCategory(cat)) return 0.85;
  return 1.15;
}

function goalMultiplierForExercise(ex, userData, ctx) {
  const primaryGoal = String(userData?.primary_goal || '').toLowerCase();
  const secondaryGoals = normalizeStringArray(userData?.secondary_goals).map(s => String(s).toLowerCase());
  const goals = [primaryGoal, ...secondaryGoals].filter(Boolean);
  let m = 1.0;
  for (const g of goals) {
    if (g === 'pain_relief') {
      if (isBreathingCategory(ex.category_id) || isMobilityCategory(ex.category_id)) m *= 1.15;
      if (intersectionCount(ex.pain_relief_zones || [], derivePainZoneSet(userData)) > 0) m *= 1.15;
      if (isConditioningCategory(ex.category_id)) m *= 0.9;
    } else if (g === 'fat_loss') {
      if (isConditioningCategory(ex.category_id) || (ex.metabolic_intensity || 1) >= 4) m *= ctx.isSevere ? 0.85 : 1.20;
    } else if (g === 'strength' || g === 'hypertrophy') {
      if (!isMobilityCategory(ex.category_id) && !isBreathingCategory(ex.category_id)) m *= ctx.isSevere ? 0.85 : 1.10;
    } else if (g === 'posture') {
      if (String(ex.category_id || '').toLowerCase().includes('thoracic')) m *= 1.12;
    }
  }
  return m;
}

function painSafetyPenalty(ex, userData) {
  const painLocs = normalizeLowerSet(userData?.pain_locations);
  const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
  const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
  const impact = (ex.impact_level || 'low').toLowerCase();
  const pos = (ex.position || '').toLowerCase();
  let p = 1.0;

  if (painLocs.has('knee') || painLocs.has('knee_anterior')) {
    if (kneeLoad === 'high') p *= 0.10;
    else if (kneeLoad === 'medium') p *= 0.60;
  }
  if (painLocs.has('lumbar') || painLocs.has('low_back')) {
    if (spineLoad === 'high') p *= 0.10;
    else if (spineLoad === 'medium') p *= 0.65;
  }
  if (painLocs.has('foot') || painLocs.has('ankle')) {
    if (pos === 'standing') p *= 0.50;
    if (impact !== 'low') p *= 0.50;
  }
  if (impact === 'high') p *= 0.50;
  return p;
}

function painReliefFitMultiplier(ex, section, painZoneSet) {
  if (!painZoneSet || painZoneSet.size === 0) return 1.0;
  const matchCount = intersectionCount(ex.pain_relief_zones || [], painZoneSet);
  if (matchCount <= 0) return 1.0;
  if (section === 'warmup' || section === 'cooldown') return 1.0 + Math.min(1.0, matchCount * 0.55);
  return 1.0 + Math.min(0.4, matchCount * 0.15);
}

function varietyPenalty(ex, state, section) {
  let p = 1.0;
  const weeklyUsed = state.weeklyUsage.get(ex.id) || 0;
  p *= 1.0 / (1.0 + weeklyUsed * 2.0);

  const weeklyCat = state.weeklyCategoryUsage.get(ex.category_id) || 0;
  p *= 1.0 / (1.0 + weeklyCat * 0.35);

  const sessionCat = state.sessionCategoryUsage.get(ex.category_id) || 0;
  p *= 1.0 / (1.0 + sessionCat * (section === 'main' ? 0.9 : 0.6));

  const plane = (ex.primary_plane || 'multi').toLowerCase();
  const sessionPlane = state.sessionPlaneUsage.get(plane) || 0;
  p *= 1.0 / (1.0 + sessionPlane * 0.35);

  return p;
}

// --- ZMODYFIKOWANA FUNKCJA AFFINITY ---
// Przekształca score (-100 do +100) na mnożnik (0.0 do 2.0)
// Wzór: M = 1.0 + (S / 100.0)
function calculateAffinityMultiplier(exId, preferencesMap) {
    if (!preferencesMap || !preferencesMap[exId]) return 1.0;
    let score = preferencesMap[exId].score || 0;

    // Zabezpieczenie zakresu
    score = Math.max(-100, Math.min(100, score));

    // Liniowa interpolacja
    // -100 => 0.0
    // 0 => 1.0
    // +100 => 2.0
    let multiplier = 1.0 + (score / 100.0);

    // Zabezpieczenie przed ujemnym mnożnikiem
    return Math.max(0, parseFloat(multiplier.toFixed(3)));
}

function calculateFreshnessMultiplier(exId, historyMap) {
    if (!historyMap || !historyMap[exId]) return 1.2;
    const lastDate = new Date(historyMap[exId]);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) return 0.1;
    if (diffDays <= 5) return 0.5;
    if (diffDays >= 14) return 1.2;
    return 1.0;
}

function scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet) {
  const cat = ex.category_id || 'uncategorized';
  const base = categoryWeights[cat] != null ? categoryWeights[cat] : 1.0;
  if (state.usedIds.has(ex.id)) return 0;

  let score = base;
  score *= sectionCategoryFitMultiplier(section, cat);
  if ((section === 'warmup' || section === 'cooldown') && (ex.difficulty_level || 1) <= 2) score *= 1.10;
  score *= painReliefFitMultiplier(ex, section, painZoneSet);
  score *= painSafetyPenalty(ex, userData);
  score *= goalMultiplierForExercise(ex, userData, ctx);

  if (isUpperBodyMobilityNeed(userData?.work_type, userData?.hobby)) {
    const c = String(cat).toLowerCase();
    if (section !== 'main' && (c.includes('thoracic') || c.includes('hip_flexor') || c.includes('hip_mobility'))) score *= 1.10;
  }
  if (ctx.isSevere && (ex.metabolic_intensity || 1) >= 3) score *= 0.80;
  score *= varietyPenalty(ex, state, section);

  if (state.preferencesMap) score *= calculateAffinityMultiplier(ex.id, state.preferencesMap);
  if (state.historyMap) score *= calculateFreshnessMultiplier(ex.id, state.historyMap);

  return Math.max(0, score);
}

function pickExerciseForSection(section, candidates, userData, ctx, categoryWeights, state, painZoneSet, extraFilterFn = null) {
  const filtered = [];
  for (const ex of candidates) {
    if (state.usedIds.has(ex.id)) continue;
    if (extraFilterFn && !extraFilterFn(ex)) continue;
    filtered.push(ex);
  }
  if (filtered.length === 0) return null;

  const picked = weightedPick(filtered, (ex) => scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet));
  if (!picked) return null;

  state.usedIds.add(picked.id);
  state.weeklyUsage.set(picked.id, (state.weeklyUsage.get(picked.id) || 0) + 1);
  state.weeklyCategoryUsage.set(picked.category_id, (state.weeklyCategoryUsage.get(picked.category_id) || 0) + 1);
  state.sessionCategoryUsage.set(picked.category_id, (state.sessionCategoryUsage.get(picked.category_id) || 0) + 1);
  const plane = (picked.primary_plane || 'multi').toLowerCase();
  state.sessionPlaneUsage.set(plane, (state.sessionPlaneUsage.get(plane) || 0) + 1);

  return JSON.parse(JSON.stringify(picked));
}

function deriveSessionCounts(userData, ctx, targetMin) {
  const componentWeights = normalizeLowerSet(userData?.session_component_weights);

  let warmup = 3;
  let main = 4;
  let cooldown = 2;

  if (targetMin <= 25) { warmup = 2; main = 2; cooldown = 1; }
  else if (targetMin <= 35) { warmup = 2; main = 3; cooldown = 1; }
  else if (targetMin <= 50) { warmup = 3; main = 4; cooldown = 2; }
  else { warmup = 3; main = 5; cooldown = 2; }

  if (componentWeights.has('mobility')) { warmup += 1; cooldown += 1; main = Math.max(MIN_MAIN_EXERCISES, main - 1); }
  if (componentWeights.has('strength')) { main += 1; warmup = Math.max(2, warmup - 1); }
  if (componentWeights.has('conditioning')) { main += ctx.isSevere ? 0 : 1; }
  if (ctx.isSevere) { warmup += 1; main = Math.max(MIN_MAIN_EXERCISES, main - 1); }

  return { warmup, main: Math.max(MIN_MAIN_EXERCISES, main), cooldown };
}

function createInitialSession(dayNumber, targetMinutes) {
  return { dayNumber, title: `Sesja ${dayNumber}`, warmup: [], main: [], cooldown: [], targetMinutes };
}

function loadFactorFromState(userData, ctx, fatigueState, rpeModifier = 1.0) {
  const exp = String(userData?.exercise_experience || 'none').toLowerCase();
  const schedule = userData?.schedule_pattern || DEFAULT_SCHEDULE_PATTERN;
  const sessionsPerWeek = schedule.length;

  const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
  let base = 1.0;

  if (exp === 'none') base = 0.70;
  else if (exp === 'occasional') base = 0.85;
  else if (exp === 'regular') base = 1.0;
  else if (exp === 'advanced') base = 1.10;

  const severity = clamp(toNumber(ctx?.severityScore, painIntensity), 0, 10);
  if (severity >= 7) base *= 0.55;
  else if (severity >= 4) base *= 0.80;

  if (sessionsPerWeek >= 5) base *= 0.90;
  if (sessionsPerWeek <= 2) base *= 1.15;

  if (fatigueState === 'fatigued') base *= 0.8;
  if (fatigueState === 'fresh') base *= 1.1;

  base *= rpeModifier;

  return clamp(base, 0.45, 1.35);
}

function prescribeForExercise(ex, section, userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier = 1.0) {
  const factor = loadFactorFromState(userData, ctx, fatigueState, rpeModifier);
  const cat = String(ex.category_id || '').toLowerCase();

  let sets = 1;
  let repsOrTime = '10';

  if (ex.conditioning_style === 'interval' && ex.recommended_interval_sec) {
      const { work, rest } = ex.recommended_interval_sec;
      const baseTotalSec = 480 * factor;
      const cycle = work + rest;
      let calculatedSets = Math.round(baseTotalSec / cycle);
      calculatedSets = clamp(calculatedSets, 3, 20);

      return {
          sets: String(calculatedSets),
          reps_or_time: `${work} s`,
          restBetweenSets: rest
      };
  }

  if (isBreathingCategory(cat)) {
    sets = 1;
    let baseSec = 90;
    if (targetMin <= 20) baseSec = 60;
    else if (targetMin >= 45) baseSec = 120;
    if (section === 'warmup') baseSec = Math.max(60, baseSec - 30);
    const sec = clamp(Math.round(baseSec * factor), 45, MAX_BREATHING_SEC);
    repsOrTime = `${Math.ceil(sec / 15) * 15} s`;
    return { sets: String(sets), reps_or_time: repsOrTime };
  }

  if (section === 'warmup') { sets = factor < 0.7 ? 1 : 2; }
  else if (section === 'cooldown') { sets = 1; }
  else {
    if (factor < 0.65) sets = 1; else if (factor < 0.95) sets = 2; else sets = 3;
    const w = categoryWeights[ex.category_id] != null ? categoryWeights[ex.category_id] : 1.0;
    if (!ctx.isSevere && w >= 2.5) sets = Math.min(4, sets + 1);
  }

  if (ex.max_recommended_duration > 0) {
    let baseSec = targetMin >= 45 ? 60 : 45;
    if (ctx.isSevere) baseSec = 30;
    let sec = clamp(Math.round(baseSec * factor), 15, ex.max_recommended_duration);
    repsOrTime = `${Math.ceil(sec / 5) * 5} s`;
  } else {
    let baseReps = 10;
    if (isMobilityCategory(cat)) baseReps = 12;
    const exp = String(userData?.exercise_experience || 'none').toLowerCase();
    if (exp === 'advanced') baseReps += 2; else if (exp === 'regular') baseReps += 1;
    const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
    if (painIntensity >= 7) baseReps = Math.min(baseReps, 8); else if (painIntensity >= 4) baseReps = Math.min(baseReps, 10);
    let reps = clamp(Math.round(baseReps * factor), 5, ex.max_recommended_reps || GLOBAL_MAX_REPS);
    repsOrTime = String(reps);
  }

  if (ex.is_unilateral) {
    if (!String(repsOrTime).toLowerCase().includes('s')) repsOrTime = `${repsOrTime}/str.`;
    sets = Math.min(sets, targetMin < 35 ? 2 : 3);
  }
  return { sets: String(sets), reps_or_time: repsOrTime };
}

function parseRepsOrTimeToSeconds(repsOrTime) {
  const t = String(repsOrTime || '').trim().toLowerCase();
  if (t.includes('s')) return Math.max(5, parseInt(t, 10) || 30);
  if (t.includes('min')) return Math.max(10, (parseInt(t, 10) || 1) * 60);
  return parseInt(t, 10) || 10;
}

// --- ZMIANA ARCHITEKTONICZNA (Task B2) ---
// Używamy danych z _pacing-engine.js zamiast liczyć "w locie"
function estimateExerciseDurationSeconds(exEntry, userData, paceMap) {
  const globalSpr = clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12);
  const restFactor = toNumber(userData?.restTimeFactor, 1.0);

  let tempoToUse = globalSpr;
  if (paceMap && paceMap[exEntry.id]) {
      tempoToUse = paceMap[exEntry.id];
  }

  const sets = parseInt(exEntry.sets, 10) || 1;
  const isUnilateral = exEntry.is_unilateral || String(exEntry.reps_or_time || '').includes('/str');
  const multiplier = isUnilateral ? 2 : 1;

  let workTimePerSet = 0;
  const valStr = String(exEntry.reps_or_time).toLowerCase();
  if (valStr.includes('s') || valStr.includes('min')) {
      workTimePerSet = parseRepsOrTimeToSeconds(exEntry.reps_or_time) * multiplier;
  } else {
      const reps = parseRepsOrTimeToSeconds(exEntry.reps_or_time);
      workTimePerSet = reps * tempoToUse * multiplier;
  }

  let totalSeconds = (sets * workTimePerSet);

  if (sets > 1) {
      // Używamy pre-kalkulowanej wartości z obiektu (jeśli dostępna)
      // Fallback do starej logiki w razie problemów (bezpiecznik)
      let baseRest = 30;
      if (exEntry.calculated_timing && exEntry.calculated_timing.rest_sec) {
          baseRest = exEntry.calculated_timing.rest_sec;
      }
      const smartRest = Math.round(baseRest * restFactor);
      totalSeconds += (sets - 1) * smartRest;
  }

  // Używamy pre-kalkulowanej wartości transition (jeśli dostępna)
  let transitionTime = Math.max(12, Math.round(12 * restFactor));
  if (exEntry.calculated_timing && exEntry.calculated_timing.transition_sec) {
      // Backend zwraca bazę (np. 12 lub 5), frontend/tu mnożymy przez factor
      transitionTime = Math.max(5, Math.round(exEntry.calculated_timing.transition_sec * restFactor));
  } else if (!isUnilateral) {
      transitionTime = 5;
  }

  const transitionTotal = sets * transitionTime;

  return totalSeconds + transitionTotal;
}

function estimateSessionDurationSeconds(session, userData, paceMap) {
  const restFactor = toNumber(userData?.restTimeFactor, 1.0);
  const rbe = Math.round(30 * restFactor);

  const all = [...session.warmup, ...session.main, ...session.cooldown];
  let total = 0;
  for (let i = 0; i < all.length; i++) {
    total += estimateExerciseDurationSeconds(all[i], userData, paceMap);
    if (i < all.length - 1) total += rbe;
  }
  return total;
}

function expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, fatigueState, targetMin, rpeModifier) {
  const targetSec = targetMin * 60;
  let guard = 0;

  while (guard < 20) {
    const estimated = estimateSessionDurationSeconds(session, userData, paceMap);
    if (estimated >= targetSec * 0.95) break;

    guard++;
    let changed = false;

    for (const ex of session.main) {
      if (isBreathingCategory(ex.category_id)) continue;
      const s = parseInt(ex.sets, 10) || 1;
      const maxS = (isMobilityCategory(ex.category_id) && !ex.category_id.includes('stretch')) ? MAX_SETS_MOBILITY : MAX_SETS_MAIN;
      if (s < maxS) {
        ex.sets = String(s + 1);
        changed = true;
        break;
      }
    }

    if (!changed) {
      const ex = pickExerciseForSection('main', candidates, userData, ctx, categoryWeights, sState, pZones, (c) => !isBreathingCategory(c.category_id));
      if (ex) {
        const rx = prescribeForExercise(ex, 'main', userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier);
        const newEx = { ...ex, ...rx };
        session.main.push(newEx);
        changed = true;
      } else {
        break;
      }
    }

    if (!changed) break;
  }
}

function enforceStrictTimeLimit(session, userData, paceMap, targetMin) {
    const targetSec = targetMin * 60;
    const hardLimit = targetSec + 30;
    let maxIterations = 50;

    while (maxIterations-- > 0) {
        const totalDur = estimateSessionDurationSeconds(session, userData, paceMap);
        if (totalDur <= hardLimit) return;

        const warmDur = session.warmup.reduce((acc, ex) => acc + estimateExerciseDurationSeconds(ex, userData, paceMap), 0);
        const mainDur = session.main.reduce((acc, ex) => acc + estimateExerciseDurationSeconds(ex, userData, paceMap), 0);
        const coolDur = session.cooldown.reduce((acc, ex) => acc + estimateExerciseDurationSeconds(ex, userData, paceMap), 0);

        let heaviestEx = null;
        let heaviestDur = -1;
        let heaviestIdx = -1;

        session.main.forEach((ex, idx) => {
            const d = estimateExerciseDurationSeconds(ex, userData, paceMap);
            if (d > heaviestDur) { heaviestDur = d; heaviestEx = ex; heaviestIdx = idx; }
        });

        let actionTaken = false;

        if (heaviestEx) {
            const currentSets = parseInt(heaviestEx.sets, 10);
            if (currentSets > 1) {
                heaviestEx.sets = String(currentSets - 1);
                actionTaken = true;
            } else {
                const projectedMain = mainDur - heaviestDur;
                const isBalanceThreatened = projectedMain < (warmDur + coolDur);
                if (!isBalanceThreatened && session.main.length > MIN_MAIN_EXERCISES) {
                    session.main.splice(heaviestIdx, 1);
                    actionTaken = true;
                    session.compressionApplied = true;
                }
            }
        }

        if (!actionTaken) {
            for (const ex of session.cooldown) {
                const s = parseInt(ex.sets, 10);
                if (s > 1) { ex.sets = String(s - 1); actionTaken = true; break; }
            }
        }
        if (!actionTaken) {
            for (const ex of session.warmup) {
                const s = parseInt(ex.sets, 10);
                if (s > 1) { ex.sets = String(s - 1); actionTaken = true; break; }
            }
        }

        if (!actionTaken && session.main.length > MIN_MAIN_EXERCISES) {
             if (heaviestIdx > -1) {
                 session.main.splice(heaviestIdx, 1);
                 actionTaken = true;
                 session.compressionApplied = true;
             }
        }

        if (!actionTaken) {
            const allEx = [...session.warmup, ...session.main, ...session.cooldown];
            for (const ex of allEx) {
                const cur = parseRepsOrTimeToSeconds(ex.reps_or_time);
                const isSec = String(ex.reps_or_time).includes('s');
                const next = Math.max(isSec ? 15 : 5, Math.floor(cur * 0.9));
                if (next < cur) {
                    ex.reps_or_time = isSec ? `${next} s` : (String(ex.reps_or_time).includes('/str') ? `${next}/str.` : String(next));
                    actionTaken = true;
                }
            }
        }

        if (!actionTaken) break;
    }
}

function reorderSessionByIntensityWave(session) {
    session.warmup.sort((a, b) => {
        const rankA = getPositionRank(a);
        const rankB = getPositionRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return (a.difficulty_level || 1) - (b.difficulty_level || 1);
    });

    session.main.sort((a, b) => {
        const diffA = a.difficulty_level || 1;
        const diffB = b.difficulty_level || 1;
        const metA = a.metabolic_intensity || 1;
        const metB = b.metabolic_intensity || 1;

        if (diffA !== diffB) return diffB - diffA;
        return metB - metA;
    });

    session.cooldown.sort((a, b) => {
        const rankA = getPositionRank(a);
        const rankB = getPositionRank(b);
        if (rankA !== rankB) return rankB - rankA;
        return (b.difficulty_level || 1) - (a.difficulty_level || 1);
    });
}

function analyzeInitialFatigue(userId, lastSession) {
    if (!lastSession) return 'fresh';

    const now = new Date();
    const lastDate = new Date(lastSession.completed_at);
    const diffHours = (now - lastDate) / (1000 * 60 * 60);

    if (diffHours < 20) return 'fatigued';
    if (diffHours > 72) return 'fresh';
    return 'normal';
}

function analyzeRpeTrend(recentSessions) {
    const defaultResult = { volumeModifier: 1.0, intensityCap: null, label: 'Standard' };
    if (!recentSessions || recentSessions.length === 0) return defaultResult;

    const sorted = recentSessions.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    const lastSession = sorted[0];

    const now = new Date();
    const lastDate = new Date(lastSession.completed_at);
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);

    if (diffDays > 5) return { ...defaultResult, label: 'Reset (Decay)' };

    const feedback = lastSession.feedback || {};
    const val = parseInt(feedback.value, 10);
    const type = feedback.type || 'tension';

    if (val === -1) {
        if (type === 'symptom') {
            return { volumeModifier: 0.70, intensityCap: 2, label: 'Protection Mode (Pain)' };
        } else {
            const prevSession = sorted[1];
            if (prevSession && prevSession.feedback && parseInt(prevSession.feedback.value) === -1) {
                return { volumeModifier: 0.75, intensityCap: 2, label: 'Deload (Chronic Fatigue)' };
            }
            return { volumeModifier: 0.85, intensityCap: 3, label: 'Recovery (Acute)' };
        }
    }

    if (val === 1) {
        const prevSession = sorted[1];
        if (prevSession && prevSession.feedback && parseInt(prevSession.feedback.value) === 1) {
            return { volumeModifier: 1.25, intensityCap: null, label: 'Progressive Overload (Boost)' };
        }
        return { volumeModifier: 1.15, intensityCap: null, label: 'Progressive Overload' };
    }

    return { volumeModifier: 1.0, intensityCap: null, label: 'Maintenance' };
}

function buildRollingPlan(candidates, categoryWeights, userData, ctx, userId, historyMap, preferencesMap, paceMap, initialFatigue, rpeData) {
    const schedulePattern = userData?.schedule_pattern || DEFAULT_SCHEDULE_PATTERN;
    const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);

    const forcedRestDates = new Set(normalizeStringArray(userData?.forced_rest_dates));

    const plan = {
        id: `rolling-${Date.now()}`,
        days: [],
        meta: {
            ...userData,
            severityScore: ctx.severityScore,
            isSevere: ctx.isSevere,
            generatedAt: new Date().toISOString(),
            rpeStatus: rpeData.label
        }
    };

    const weeklyUsage = new Map();
    const weeklyCategoryUsage = new Map();

    let fatigueState = initialFatigue;
    let consecutiveTrainings = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const dayOfWeek = currentDate.getDay();
        const dateString = currentDate.toISOString().split('T')[0];

        const isScheduled = schedulePattern.includes(dayOfWeek);
        const isForcedRest = forcedRestDates.has(dateString);

        const forceRest = consecutiveTrainings >= 14;

        if (isScheduled && !forceRest && !isForcedRest) {
            consecutiveTrainings++;

            const sState = {
                usedIds: new Set(),
                weeklyUsage,
                weeklyCategoryUsage,
                sessionCategoryUsage: new Map(),
                sessionPlaneUsage: new Map(),
                historyMap: historyMap || {},
                preferencesMap: preferencesMap || {}
            };

            const counts = deriveSessionCounts(userData, ctx, targetMin);
            const dayTitle = `Trening ${currentDate.toLocaleDateString('pl-PL', {weekday: 'long'})}`;
            const session = createInitialSession(dayOffset + 1, targetMin);
            session.title = dayTitle;
            session.date = dateString;
            session.type = 'workout';

            const pZones = derivePainZoneSet(userData);

            ['warmup', 'main', 'cooldown'].forEach(sec => {
                for (let i = 0; i < counts[sec]; i++) {
                    const ex = pickExerciseForSection(sec, candidates, userData, ctx, categoryWeights, sState, pZones, (c) => sec === 'main' ? !isBreathingCategory(c.category_id) : (c.metabolic_intensity || 1) < 4);
                    if (ex) {
                        const rx = prescribeForExercise(ex, sec, userData, ctx, categoryWeights, fatigueState, targetMin, rpeData.volumeModifier);
                        const newEx = { ...ex, ...rx };
                        session[sec].push(newEx);
                    }
                }
            });

            expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, fatigueState, targetMin, rpeData.volumeModifier);
            enforceStrictTimeLimit(session, userData, paceMap, targetMin);
            reorderSessionByIntensityWave(session);

            session.estimatedDurationMin = Math.round(estimateSessionDurationSeconds(session, userData, paceMap) / 60);
            plan.days.push(session);

            fatigueState = 'fatigued';

        } else {
            consecutiveTrainings = 0;
            fatigueState = 'fresh';

            plan.days.push({
                dayNumber: dayOffset + 1,
                title: 'Regeneracja',
                date: dateString,
                type: 'rest',
                warmup: [], main: [], cooldown: [],
                estimatedDurationMin: 0
            });
        }
    }

    return plan;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  let userId; try { userId = await getUserIdFromEvent(event); } catch (e) { return { statusCode: 401 }; }
  const userData = safeJsonParse(event.body);
  if (!userData) return { statusCode: 400 };

  const client = await pool.connect();
  try {
    const [eR, bR, pR, hR, sR, recentSessionsR] = await Promise.all([
      client.query('SELECT * FROM exercises'),
      client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
      client.query('SELECT exercise_id, affinity_score FROM user_exercise_preferences WHERE user_id = $1', [userId]),
      client.query(`SELECT session_data->'sessionLog' as logs, completed_at FROM training_sessions WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'`, [userId]),
      client.query('SELECT exercise_id, avg_seconds_per_rep FROM user_exercise_stats WHERE user_id = $1', [userId]),
      client.query(`
        SELECT completed_at, session_data->'feedback' as feedback
        FROM training_sessions
        WHERE user_id = $1
        ORDER BY completed_at DESC
        LIMIT 3
      `, [userId])
    ]);

    const exercises = eR.rows.map(normalizeExerciseRow);
    const ctx = safeBuildUserContext(userData);
    bR.rows.forEach(r => ctx.blockedIds.add(r.exercise_id));
    const preferencesMap = {}; pR.rows.forEach(r => preferencesMap[r.exercise_id] = { score: r.affinity_score });
    const historyMap = {}; hR.rows.forEach(r => { (r.logs || []).forEach(l => { const id = l.exerciseId || l.id; if (id && (!historyMap[id] || new Date(r.completed_at) > historyMap[id])) historyMap[id] = new Date(r.completed_at); }); });

    const paceMap = {};
    sR.rows.forEach(r => {
        paceMap[r.exercise_id] = parseFloat(r.avg_seconds_per_rep);
    });

    const recentSessions = recentSessionsR.rows;
    const initialFatigue = analyzeInitialFatigue(userId, recentSessions[0]);
    const rpeData = analyzeRpeTrend(recentSessions);

    console.log(`[PlanGen] User: ${userId}, Fatigue: ${initialFatigue}, RPE Status: ${rpeData.label}, VolMod: ${rpeData.volumeModifier}`);

    const cWeights = buildDynamicCategoryWeights(exercises, userData, ctx);

    const candidates = filterExerciseCandidates(exercises, userData, ctx, initialFatigue, rpeData);

    if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES' }) };

    const plan = buildRollingPlan(candidates, cWeights, userData, ctx, userId, historyMap, preferencesMap, paceMap, initialFatigue, rpeData);

    const sRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
    const settings = sRes.rows[0]?.settings || {};
    settings.dynamicPlanData = plan; settings.planMode = 'dynamic'; settings.onboardingCompleted = true; settings.wizardData = userData;
    await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings', [userId, JSON.stringify(settings)]);

    return { statusCode: 200, body: JSON.stringify({ plan }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500 };
  } finally { client.release(); }
};

// P3.1 Exports for testing
module.exports.validateExerciseRecord = validateExerciseRecord;
module.exports.prescribeForExercise = prescribeForExercise;
module.exports.normalizeExerciseRow = normalizeExerciseRow;
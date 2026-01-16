// ExerciseApp/netlify/functions/generate-plan.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');
const { calculateTiming } = require('./_pacing-engine.js');
const { calculateAcuteFatigue } = require('./_fatigue-calculator.js');

// --- PHASE MANAGER INTEGRATION ---
const {
    initializePhaseState,
    resolveActivePhase,
    applyGoalChangePolicy
} = require('./_phase-manager.js');

const {
    getPhaseConfig,
    PHASE_IDS
} = require('./phase-catalog.js');

// DEFAULT CONSTANTS
const DEFAULT_SECONDS_PER_REP = 6;
const DEFAULT_TARGET_MIN = 30;
const DEFAULT_SCHEDULE_PATTERN = [1, 3, 5];

const MIN_MAIN_EXERCISES = 1;
const MAX_SETS_MAIN = 5;
const MAX_SETS_MOBILITY = 3;
const MAX_BREATHING_SEC = 240;
const GLOBAL_MAX_REPS = 25;
const MAX_BUCKET_CAPACITY = 120;

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
    recommended_interval_sec: row.recommended_interval_sec,

    // Explicit Tempo Map from DB (M1)
    default_tempo: row.default_tempo || "2-0-2",
    tempos: {
        control: row.tempo_control,
        mobility: row.tempo_mobility,
        capacity: row.tempo_capacity,
        strength: row.tempo_strength,
        metabolic: row.tempo_metabolic,
        rehab: row.tempo_rehab,
        deload: row.tempo_control || row.tempo_rehab // fallback
    }
  };

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
    return { valid: true };
}

// --- CATEGORY MAPPING HELPERS (Refined for DB IDs) ---
// IDs: 18 (breathing), 10 (muscle_relaxation)
function isBreathingCategory(cat) { 
    const s = String(cat || '').toLowerCase(); 
    return s.includes('breathing') || s.includes('breath') || s.includes('relax') || s.includes('parasymp'); 
}

// IDs: 1, 4, 7, 8 (mobility), 16 (stretch)
function isMobilityCategory(cat) { 
    const s = String(cat || '').toLowerCase(); 
    return s.includes('mobility') || s.includes('stretch') || s.includes('flexor') || s.includes('decompression'); 
}

// IDs: 20 (conditioning_low_impact)
function isConditioningCategory(cat) { 
    const s = String(cat || '').toLowerCase(); 
    return s.includes('conditioning') || s.includes('cardio') || s.includes('aerobic'); 
}

// IDs: 2, 5, 6, 13 (core_anti...), 19 (core_stability)
function isCoreCategory(cat) { 
    const s = String(cat || '').toLowerCase(); 
    return s.startsWith('core_') || s === 'core' || s.includes('core_stability') || s.includes('anti_'); 
}

// IDs: 3 (glute), 9 (terminal_knee), 11 (calves), 12 (vmo), 17 (knee_stability), 15 (eccentric - usually lower limb), 14 (flossing - sciatic/femoral)
function isLowerLimbCategory(cat) { 
    const s = String(cat || '').toLowerCase(); 
    return (
        s.includes('knee') || s.includes('vmo') || s.includes('calf') || s.includes('calves') || 
        s.includes('ankle') || s.includes('glute') || s.includes('hip_extension') || 
        s.includes('unilateral') || s.includes('hamstring') || s.includes('quad') ||
        s.includes('eccentric') || s.includes('nerve')
    ); 
}

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

  // 1. Pain Based Boosts
  if (painLocs.has('knee') || painLocs.has('knee_anterior')) {
    boost(weights, 'vmo_activation', 2.0);
    boost(weights, 'knee_stability', 2.0);
    boost(weights, 'terminal_knee_extension', 1.5);
    boost(weights, 'glute_activation', 0.8);
    boost(weights, 'hip_mobility', 0.4);
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
  if (painLocs.has('ankle') || painLocs.has('foot')) {
    boost(weights, 'calves', 0.6);
    boost(weights, 'ankle_mobility', 0.8);
    boost(weights, 'balance', 0.5);
  }

  // 2. Focus/Goal Based
  if (focusLocs.has('glutes')) { boost(weights, 'glute_activation', 1.5); boost(weights, 'hip_extension', 1.5); }
  if (focusLocs.has('abs')) { boost(weights, 'core_stability', 1.2); boost(weights, 'core_anti_extension', 1.0); }

  // 3. Work/Hobby
  if (workType === 'sedentary') {
    boost(weights, 'thoracic_mobility', 1.0);
    boost(weights, 'hip_flexor_stretch', 1.0);
    boost(weights, 'glute_activation', 0.6);
  } else if (workType === 'standing') {
    boost(weights, 'spine_mobility', 0.6);
    boost(weights, 'calves', 0.6);
  }

  if (hobby === 'running') {
    boost(weights, 'core_stability', 1.0);
    boost(weights, 'unilateral_leg', 1.2);
    boost(weights, 'vmo_activation', 1.0);
  } else if (hobby === 'cycling') {
    boost(weights, 'thoracic_mobility', 0.8);
    boost(weights, 'hip_flexor_stretch', 0.9);
  }

  // 4. Diagnosis
  if (diagnosis.has('disc_herniation')) {
    boost(weights, 'core_anti_extension', 0.8);
    boost(weights, 'hip_mobility', 0.4);
    multiplyMatching(weights, (cat) => String(cat).toLowerCase().includes('rotation_mobility'), 0.6);
  }
  if (diagnosis.has('chondromalacia')) {
    boost(weights, 'vmo_activation', 0.8);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.85);
  }
  if (diagnosis.has('scoliosis')) {
    boost(weights, 'core_anti_rotation', 0.6);
    boost(weights, 'core_anti_lateral_flexion', 0.6);
  }
  if (diagnosis.has('piriformis') || painLocs.has('sciatica') || ctx.painFilters.has('sciatica')) {
    boost(weights, 'nerve_flossing', 2.0);
    boost(weights, 'glute_activation', 0.4);
  }

  // 5. Restrictions
  if (restrictions.has('foot_injury')) {
    multiplyMatching(weights, (cat) => isLowerLimbCategory(cat), 0.85);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.85);
  }
  if (restrictions.has('no_kneeling')) {
    boost(weights, 'core_stability', 0.3);
  }

  // 6. User Preferences
  if (componentWeights.has('mobility')) multiplyMatching(weights, (cat) => isMobilityCategory(cat), 1.35);
  if (componentWeights.has('strength')) multiplyMatching(weights, (cat) => isCoreCategory(cat) || isLowerLimbCategory(cat), 1.25);
  if (componentWeights.has('conditioning')) multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.45);

  if (primaryGoal === 'pain_relief') {
    multiplyMatching(weights, (cat) => isBreathingCategory(cat) || isMobilityCategory(cat) || String(cat).toLowerCase().includes('nerve'), 1.25);
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 0.9);
  } else if (primaryGoal === 'fat_loss') {
    multiplyMatching(weights, (cat) => isConditioningCategory(cat), 1.25);
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

function violatesDiagnosisHardContraindications(ex, diagnosisSet) {
  const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
  const spineLoad = (ex.spine_load_level || 'low').toLowerCase();
  const impact = (ex.impact_level || 'low').toLowerCase();
  if (kneeLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_KNEE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
  if (spineLoad === 'high') { for (const d of diagnosisSet) { if (HARD_EXCLUDED_SPINE_LOAD_FOR_DIAGNOSES.has(d)) return true; } }
  if (impact === 'high' && diagnosisSet.has('disc_herniation')) return true;
  return false;
}

function violatesSeverePainRules(ex, ctx) {
  if (!ctx.isSevere) return false;
  if ((ex.difficulty_level || 1) > 2) return true;
  if ((ex.metabolic_intensity || 1) >= 4) return true;
  return false;
}

function applyCheckExerciseAvailability(ex, ctx, userData) {
  try { return checkExerciseAvailability(ex, ctx, { strictSeverity: true, userData }); }
  catch (e) { return { allowed: false, reason: 'rule_engine_exception' }; }
}

function filterExerciseCandidates(exercises, userData, ctx, fatigueState, rpeData) {
  const userEquipment = normalizeEquipmentList(userData?.equipment_available);
  const diagnosisSet = normalizeLowerSet(userData?.medical_diagnosis);
  const restrictionsSet = normalizeLowerSet(userData?.physical_restrictions);

  const filtered = [];
  for (const ex of exercises) {
    if (!ex || !ex.id) continue;
    const validation = validateExerciseRecord(ex);
    if (!validation.valid) continue;
    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) continue;

    const safetyCheck = applyCheckExerciseAvailability(ex, ctx, userData);
    if (!safetyCheck.allowed) continue;

    if (!isExerciseCompatibleWithEquipment(ex, userEquipment)) continue;
    if (violatesPhysicalRestrictions(ex, restrictionsSet)) continue;
    if (violatesDiagnosisHardContraindications(ex, diagnosisSet)) continue;
    if (violatesSeverePainRules(ex, ctx)) continue;

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

  // ZMIANA: Blokada oddechu w części głównej (Waga 0.0)
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
  if (isBreathingCategory(cat)) return 0.0; // Fallback safety
  if (isMobilityCategory(cat)) return 0.85;
  return 1.15;
}

function goalMultiplierForExercise(ex, userData, ctx) {
  const primaryGoal = String(userData?.primary_goal || '').toLowerCase();
  let m = 1.0;
  if (primaryGoal === 'pain_relief') {
      if (isBreathingCategory(ex.category_id) || isMobilityCategory(ex.category_id)) m *= 1.15;
  }
  return m;
}

function painSafetyPenalty(ex, userData) {
  const painLocs = normalizeLowerSet(userData?.pain_locations);
  const kneeLoad = (ex.knee_load_level || 'low').toLowerCase();
  let p = 1.0;
  if (painLocs.has('knee') && kneeLoad === 'high') p *= 0.10;
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
  const sessionCat = state.sessionCategoryUsage.get(ex.category_id) || 0;
  p *= 1.0 / (1.0 + sessionCat * (section === 'main' ? 0.9 : 0.6));
  return p;
}

/**
 * Calculates phase fit multiplier (G2 logic)
 */
function calculatePhaseFit(ex, phaseContext) {
    if (!phaseContext || !phaseContext.config) return 1.0;
    const config = phaseContext.config;
    const diff = ex.difficulty_level || 1;
    const intensity = ex.metabolic_intensity || 1;
    const impact = (ex.impact_level || 'low').toLowerCase();

    // 1. HARD FILTERS (Forbidden Rules)
    if (config.forbidden) {
        if (config.forbidden.maxDifficulty && diff > config.forbidden.maxDifficulty) return 0;
        if (config.forbidden.minDifficulty && diff < config.forbidden.minDifficulty) return 0;
        if (config.forbidden.blockHighImpact && impact === 'high') return 0;
    }

    let multiplier = 1.0;

    // 2. BIAS
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

    // 3. SPIRAL BIAS
    if (phaseContext.spiralDifficultyBias > 0 && diff >= 3) multiplier *= (1.0 + phaseContext.spiralDifficultyBias);

    // 4. SOFT PROGRESSION
    if (phaseContext.isSoftProgression) {
        if (diff >= 4) multiplier *= 0.5;
        if (diff <= 2) multiplier *= 1.2;
    }

    return multiplier;
}

function scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext) {
  const cat = ex.category_id || 'uncategorized';
  const base = categoryWeights[cat] != null ? categoryWeights[cat] : 1.0;
  if (state.usedIds.has(ex.id)) return 0;

  let score = base;
  score *= sectionCategoryFitMultiplier(section, cat);
  score *= painReliefFitMultiplier(ex, section, painZoneSet);
  score *= painSafetyPenalty(ex, userData);
  score *= goalMultiplierForExercise(ex, userData, ctx);
  score *= varietyPenalty(ex, state, section);

  // G2: Phase Fit
  if (phaseContext) {
      const phaseFit = calculatePhaseFit(ex, phaseContext);
      if (phaseFit === 0) return 0;
      score *= phaseFit;
  }

  return Math.max(0, score);
}

function pickExerciseForSection(section, candidates, userData, ctx, categoryWeights, state, painZoneSet, extraFilterFn = null, phaseContext = null) {
  const filtered = [];
  for (const ex of candidates) {
    if (state.usedIds.has(ex.id)) continue;
    if (extraFilterFn && !extraFilterFn(ex)) continue;
    filtered.push(ex);
  }
  if (filtered.length === 0) return null;

  const picked = weightedPick(filtered, (ex) => scoreExercise(ex, section, userData, ctx, categoryWeights, state, painZoneSet, phaseContext));
  if (!picked) return null;

  state.usedIds.add(picked.id);
  state.weeklyUsage.set(picked.id, (state.weeklyUsage.get(picked.id) || 0) + 1);
  state.weeklyCategoryUsage.set(picked.category_id, (state.weeklyCategoryUsage.get(picked.category_id) || 0) + 1);
  state.sessionCategoryUsage.set(picked.category_id, (state.sessionCategoryUsage.get(picked.category_id) || 0) + 1);

  return JSON.parse(JSON.stringify(picked));
}

function deriveSessionCounts(userData, ctx, targetMin) {
  let warmup = 2; let main = 2; let cooldown = 2; // Default conservative

  if (targetMin <= 20) {
      warmup = 2; main = 1; cooldown = 1;
  }
  else if (targetMin <= 35) {
      warmup = 2; main = 3; cooldown = 2;
  }
  else if (targetMin <= 50) {
      warmup = 3; main = 4; cooldown = 2;
  }
  else {
      warmup = 3; main = 5; cooldown = 2;
  }
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

// --- PRESCRIPTION ENGINE UPDATE (G3) ---

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
    return min; // beginner
}

function prescribeForExercise(ex, section, userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier = 1.0, phaseContext = null) {

  const phaseId = phaseContext?.phaseId || 'capacity';
  const phaseConfig = phaseContext?.config?.prescription || {};
  const isDeload = phaseId === PHASE_IDS.DELOAD || (phaseContext?.isOverride && phaseContext?.phaseId === PHASE_IDS.DELOAD);

  const factor = loadFactorFromState(userData, ctx, fatigueState, rpeModifier);
  const cat = String(ex.category_id || '').toLowerCase();
  const experience = String(userData?.exercise_experience || 'none').toLowerCase();

  // A. Tempo
  let selectedTempo = ex.default_tempo;
  if (ex.tempos && ex.tempos[phaseId]) {
      selectedTempo = ex.tempos[phaseId];
  }

  // B. Sets
  let sets = 1;
  if (section === 'warmup') {
      sets = 2;
  } else if (section === 'cooldown') {
      sets = 1;
  } else {
      const rangeStr = phaseConfig.sets || '3';
      sets = resolveValueFromRange(rangeStr, experience);
  }

  if (isDeload) {
      sets = Math.max(1, Math.floor(sets * 0.6));
  }

  // C. Reps / Time
  let repsOrTime = '10';

  if (ex.conditioning_style === 'interval' && ex.recommended_interval_sec) {
      const { work, rest } = ex.recommended_interval_sec;
      const baseTotalSec = 480 * factor;
      const cycle = work + rest;
      let calculatedSets = Math.round(baseTotalSec / cycle);
      calculatedSets = clamp(calculatedSets, 3, 20);
      return { sets: String(calculatedSets), reps_or_time: `${work} s`, restBetweenSets: rest, tempo_or_iso: selectedTempo };
  }

  if (ex.max_recommended_duration > 0) {
      const phaseRepsStr = phaseConfig.reps || "10";

      if (phaseRepsStr.includes('s')) {
          const rangeStr = phaseRepsStr.replace('s', '');
          const targetSec = resolveValueFromRange(rangeStr, experience);
          repsOrTime = `${targetSec} s`;
      } else {
          const targetReps = resolveValueFromRange(phaseRepsStr, experience);
          let estimatedSec = targetReps * 4;
          estimatedSec = clamp(estimatedSec, 15, ex.max_recommended_duration || 60);
          repsOrTime = `${Math.ceil(estimatedSec / 5) * 5} s`;
      }
  } else {
      const rangeStr = phaseConfig.reps || "8-12";
      if (rangeStr.includes('s')) {
          repsOrTime = "10";
      } else {
          let targetReps = resolveValueFromRange(rangeStr, experience);
          targetReps = Math.min(targetReps, ex.max_recommended_reps || GLOBAL_MAX_REPS);
          if (!isDeload) targetReps = Math.round(targetReps * factor);
          repsOrTime = String(targetReps);
      }
  }

  if (ex.is_unilateral) {
    if (!String(repsOrTime).toLowerCase().includes('s')) repsOrTime = `${repsOrTime}/str.`;
    sets = Math.min(sets, 3);
  }

  // --- WAŻNE: Wstrzykujemy tutaj parametry czasu ---
  // To zapewnia spójność między backendem a frontendem.
  const baseRest = ex.calculated_timing.rest_sec || 30;
  const baseTransition = ex.calculated_timing.transition_sec || 5;

  return {
      sets: String(sets),
      reps_or_time: repsOrTime,
      tempo_or_iso: selectedTempo,
      restFactor: phaseConfig.restFactor || 1.0,

      // EXPLICIT PARAMETERS FOR FRONTEND (Single Source of Truth)
      restAfterExercise: baseRest,
      transitionTime: baseTransition
  };
}

function parseRepsOrTimeToSeconds(repsOrTime) {
  const t = String(repsOrTime || '').trim().toLowerCase();
  if (t.includes('s')) return Math.max(5, parseInt(t, 10) || 30);
  return parseInt(t, 10) || 10;
}

// --- HELPER: POBIERANIE CZASU PRZERWY PO ĆWICZENIU ---
function getRestAfterExercise(exEntry, restFactor) {
    // 1. Sprawdź czy prescripiton (prescribeForExercise) nadało wartość
    let baseRest = exEntry.restAfterExercise;

    // 2. Fallback do calculation_timing jeśli nie ma w root
    if (!baseRest && exEntry.calculated_timing && exEntry.calculated_timing.rest_sec) {
        baseRest = exEntry.calculated_timing.rest_sec;
    }
    // 3. Fallback ostateczny
    if (!baseRest) baseRest = 30;

    // 4. Aplikuj User Factor (z suwaka w ustawieniach)
    return Math.round(baseRest * restFactor);
}

function estimateExerciseDurationSeconds(exEntry, userData, paceMap) {
  const globalSpr = clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12);
  const restFactor = toNumber(userData?.restTimeFactor, 1.0);
  let tempoToUse = paceMap && paceMap[exEntry.id] ? paceMap[exEntry.id] : globalSpr;

  const sets = parseInt(exEntry.sets, 10) || 1;
  const isUnilateral = exEntry.is_unilateral || String(exEntry.reps_or_time || '').includes('/str');
  const multiplier = isUnilateral ? 2 : 1;

  let workTimePerSet = 0;
  const valStr = String(exEntry.reps_or_time).toLowerCase();
  if (valStr.includes('s')) {
      workTimePerSet = parseRepsOrTimeToSeconds(exEntry.reps_or_time) * multiplier;
  } else {
      const reps = parseRepsOrTimeToSeconds(exEntry.reps_or_time);
      workTimePerSet = reps * tempoToUse * multiplier;
  }

  let totalSeconds = (sets * workTimePerSet);

  // Intra-set rest (pomiędzy seriami TEGO SAMEGO ćwiczenia)
  let restTimePerSet = 0;
  if (sets > 1) {
      // Używamy tej samej wartości co "po ćwiczeniu" jako bazy
      restTimePerSet = getRestAfterExercise(exEntry, restFactor);
      totalSeconds += (sets - 1) * restTimePerSet;
  }

  // --- POPRAWKA: Transition naliczamy tylko dla unilateralnych ---
  let transitionTime = 0; // Domyślnie 0 dla obustronnych
  if (isUnilateral) {
      if (exEntry.transitionTime) {
          transitionTime = exEntry.transitionTime;
      } else if (exEntry.calculated_timing && exEntry.calculated_timing.transition_sec) {
          transitionTime = exEntry.calculated_timing.transition_sec;
      } else {
          transitionTime = 12; // Domyślna wartość dla jednostronnych
      }
  }

  const totalTransition = sets * transitionTime;
  totalSeconds += totalTransition;

  return totalSeconds;
}

function estimateSessionDurationSeconds(session, userData, paceMap) {
  const restFactor = toNumber(userData?.restTimeFactor, 1.0);

  // --- POPRAWKA: Globalny bufor startowy (5s) ---
  let total = 5;

  const all = [...session.warmup, ...session.main, ...session.cooldown];
  for (let i = 0; i < all.length; i++) {
    // 1. Czas samego ćwiczenia (praca + przerwy między seriami + przejścia)
    total += estimateExerciseDurationSeconds(all[i], userData, paceMap);

    // 2. Czas przerwy PO ćwiczeniu (przed następnym)
    if (i < all.length - 1) {
        total += getRestAfterExercise(all[i], restFactor);
    }
  }
  return total;
}

// ============================================================================
// TASK: SMART SHRINKING v2 (Hydraulic Press: Sets -> Reps/Time -> Drop)
// ============================================================================

function updateExValue(ex, newVal, isTime) {
    if (isTime) ex.reps_or_time = `${newVal} s`;
    else ex.reps_or_time = String(newVal);
    // Unilateral fix
    if (ex.is_unilateral && !ex.reps_or_time.includes('/str')) {
        ex.reps_or_time += "/str.";
    }
}

function shrinkSessionToTarget(session, userData, paceMap, targetMin) {
    const targetSec = targetMin * 60;
    const toleranceSec = 60; // 1 min tolerance

    let safetyLoop = 0;
    const sections = ['main', 'warmup', 'cooldown']; // Priority order for reduction

    while (safetyLoop < 15) {
        const currentDur = estimateSessionDurationSeconds(session, userData, paceMap);
        if (currentDur <= targetSec + toleranceSec) return; // Goal reached!

        console.log(`[Pacing-Shrink] Day ${session.dayNumber}: ${Math.round(currentDur/60)}m > Target ${targetMin}m. Loop ${safetyLoop}.`);

        // --- STEP 1: REDUCE SETS (Only if > 2) ---
        let setsReduced = false;
        // Search in Main, then Warmup/Cooldown for exercises with > 2 sets
        for (const sec of sections) {
            if (!session[sec]) continue;
            // Find longest exercise with > 2 sets
            let candidate = null;
            let maxDur = -1;

            for (const ex of session[sec]) {
                const s = parseInt(ex.sets, 10);
                if (s > 2) {
                    const dur = estimateExerciseDurationSeconds(ex, userData, paceMap);
                    if (dur > maxDur) {
                        maxDur = dur;
                        candidate = ex;
                    }
                }
            }

            if (candidate) {
                const oldSets = candidate.sets;
                candidate.sets = String(parseInt(candidate.sets, 10) - 1);
                console.log(`[Pacing-Shrink] Strategy 1: Reduce Sets for ${candidate.name} (${oldSets} -> ${candidate.sets})`);
                setsReduced = true;
                break; // Break loop to re-calculate time
            }
        }

        if (setsReduced) { safetyLoop++; continue; }

        // --- STEP 2: FINE TUNING (Reps / Time) ---
        // Reduce time (-15s) or reps (-2) for *all* exercises in Main/Cooldown
        // This is a "global squeeze"
        let fineTuned = false;
        for (const sec of ['main', 'cooldown']) {
            if (!session[sec]) continue;
            for (const ex of session[sec]) {
                const valStr = String(ex.reps_or_time).toLowerCase();
                const isTime = valStr.includes('s') || valStr.includes('min');
                let changed = false;

                if (isTime) {
                    let s = parseRepsOrTimeToSeconds(ex.reps_or_time);
                    if (s >= 45) { // Only reduce if > 45s
                        s -= 15;
                        console.log(`[Pacing-Shrink] Strategy 2: Squeeze Time for ${ex.name} (${ex.reps_or_time} -> ${s}s)`);
                        updateExValue(ex, s, true);
                        changed = true;
                    }
                } else {
                    let r = parseInt(valStr, 10) || 10;
                    if (r >= 8) { // Only reduce if >= 8 reps
                        r -= 2;
                        console.log(`[Pacing-Shrink] Strategy 2: Squeeze Reps for ${ex.name} (${ex.reps_or_time} -> ${r})`);
                        updateExValue(ex, r, false);
                        changed = true;
                    }
                }
                if (changed) fineTuned = true;
            }
        }

        if (fineTuned) { safetyLoop++; continue; }

        // --- STEP 3: SETS > 1 (Desperate Mode) ---
        // If still over, reduce Main sets to 1
        let desperateSets = false;
        if (session.main) {
            for (const ex of session.main) {
                const s = parseInt(ex.sets, 10);
                if (s > 1) {
                    console.log(`[Pacing-Shrink] Strategy 3: Desperate Set Cut for ${ex.name} (1 set)`);
                    ex.sets = String(s - 1);
                    desperateSets = true;
                    break;
                }
            }
        }
        if (desperateSets) { safetyLoop++; continue; }

        // --- STEP 4: DELETE EXERCISE (Nuclear Option) ---
        if (session.main && session.main.length > 1) {
            // Find shortest exercise to remove (least impact) or last
            const removed = session.main.pop();
            console.log(`[Pacing-Shrink] Strategy 4: Nuclear Option. Removed ${removed.name}`);
            safetyLoop++;
            continue;
        }

        break; // Can't reduce further
    }
}

function expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, fatigueState, targetMin, rpeModifier, phaseContext) {
  const targetSec = targetMin * 60;
  let guard = 0;
  while (guard < 20) {
    const estimated = estimateSessionDurationSeconds(session, userData, paceMap);
    if (estimated >= targetSec * 0.95) break;

    console.log(`[Pacing-Expand] Day ${session.dayNumber}: Current ${Math.round(estimated/60)}m < Target ${targetMin}m. Adding exercise.`);

    guard++;
    let changed = false;

    const ex = pickExerciseForSection('main', candidates, userData, ctx, categoryWeights, sState, pZones, (c) => !isBreathingCategory(c.category_id), phaseContext);
    if (ex) {
      const rx = prescribeForExercise(ex, 'main', userData, ctx, categoryWeights, fatigueState, targetMin, rpeModifier, phaseContext);
      console.log(`[Pacing-Expand] Added: ${ex.name}`);
      session.main.push({ ...ex, ...rx });
      changed = true;
    }
    if (!changed) break;
  }
}

function analyzeRpeTrend(recentSessions) {
    const defaultResult = { volumeModifier: 1.0, intensityCap: null, label: 'Standard', lastFeedback: null };
    if (!recentSessions || recentSessions.length === 0) return defaultResult;
    const lastSession = recentSessions[0];

    let lastFeedback = null;
    if (lastSession.feedback) {
        lastFeedback = {
            value: parseInt(lastSession.feedback.value, 10),
            type: lastSession.feedback.type
        };
    }

    const result = { ...defaultResult, lastFeedback };

    if (lastFeedback?.value === -1) {
        result.volumeModifier = 0.85;
        result.label = 'Recovery';
    } else if (lastFeedback?.value === 1) {
        result.volumeModifier = 1.15;
        result.label = 'Progressive';
    }
    return result;
}

// --- NEW DEBUG LOGGER FOR CORRECT TOTAL SUMMATION ---
function logFinalSessionBreakdown(session, userData, paceMap) {
    const globalSpr = clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12);
    const restFactor = toNumber(userData?.restTimeFactor, 1.0);
    const all = [...session.warmup, ...session.main, ...session.cooldown];

    // --- POPRAWKA: Startujemy od 5s bufora (zgodnie z funkcją liczącą)
    let runningTotal = 5;

    console.log(`\n=== TIMING AUDIT: DAY ${session.dayNumber} (RestFactor: ${restFactor}, SPR: ${globalSpr}) ===`);
    console.log(`   + Global Session Start Buffer: 5s`);

    all.forEach((ex, i) => {
        // Recalculate components manually for log transparency
        let tempoToUse = paceMap && paceMap[ex.id] ? paceMap[ex.id] : globalSpr;
        const sets = parseInt(ex.sets, 10) || 1;
        const isUnilateral = ex.is_unilateral || String(ex.reps_or_time || '').includes('/str');
        const multiplier = isUnilateral ? 2 : 1;

        let workTimePerSet = 0;
        const valStr = String(ex.reps_or_time).toLowerCase();
        if (valStr.includes('s')) {
            workTimePerSet = parseRepsOrTimeToSeconds(ex.reps_or_time) * multiplier;
        } else {
            const reps = parseRepsOrTimeToSeconds(ex.reps_or_time);
            workTimePerSet = reps * tempoToUse * multiplier;
        }

        const intraSetRest = (sets > 1) ? getRestAfterExercise(ex, restFactor) : 0;

        // --- POPRAWKA: Transition tylko dla Unilateral
        let transitionTime = 0;
        if (isUnilateral) {
            if (ex.transitionTime) {
                transitionTime = ex.transitionTime;
            } else if (ex.calculated_timing && ex.calculated_timing.transition_sec) {
                transitionTime = ex.calculated_timing.transition_sec;
            } else {
                transitionTime = 12;
            }
        }

        const totalTransition = sets * transitionTime;

        // Exercise Total Duration
        const dur = (sets * workTimePerSet) + ((sets - 1) * intraSetRest) + totalTransition;

        console.log(`[Ex] ${ex.name}: ${sets}x(${Math.round(workTimePerSet)}s work + ${intraSetRest}s rest) + ${totalTransition}s transition = ${Math.round(dur)}s`);
        runningTotal += dur;

        if (i < all.length - 1) {
            const rbe = getRestAfterExercise(ex, restFactor);
            console.log(`   + Rest After Exercise: ${rbe}s`);
            runningTotal += rbe;
        }
    });

    console.log(`=== TOTAL: ${runningTotal}s (${Math.round(runningTotal/60)} min) ===\n`);
}

function buildRollingPlan(candidates, categoryWeights, userData, ctx, userId, historyMap, preferencesMap, paceMap, initialFatigueScore, rpeData, progressionMap, phaseContext) {
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
            rpeStatus: rpeData.label,
            startingFatigue: initialFatigueScore,
            currentPhase: phaseContext.phaseId,
            overrideMode: phaseContext.isOverride ? phaseContext.phaseId : null
        }
    };

    let fatigueScore = initialFatigueScore;
    let consecutiveTrainings = 0;
    const weeklyUsage = new Map();
    const weeklyCategoryUsage = new Map();

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const dayOfWeek = currentDate.getDay();
        const dateString = currentDate.toISOString().split('T')[0];

        const isScheduled = schedulePattern.includes(dayOfWeek);
        const isForcedRest = forcedRestDates.has(dateString);
        if (dayOffset > 0) fatigueScore = Math.round(fatigueScore * 0.6);

        if (isScheduled && !isForcedRest) {
            consecutiveTrainings++;
            let costOfSession = 25;

            const sessionTitleSuffix = phaseContext.isOverride ? `(${phaseContext.phaseId.toUpperCase()})` : '';

            const session = createInitialSession(dayOffset + 1, targetMin);
            session.title = `Trening ${currentDate.toLocaleDateString('pl-PL', {weekday: 'long'})} ${sessionTitleSuffix}`;
            session.date = dateString;
            session.type = 'workout';

            const pZones = derivePainZoneSet(userData);
            const sState = { usedIds: new Set(), weeklyUsage, weeklyCategoryUsage, sessionCategoryUsage: new Map(), sessionPlaneUsage: new Map(), historyMap: historyMap || {}, preferencesMap: preferencesMap || {}, progressionMap: progressionMap || { sources: new Map(), targets: new Set() } };

            ['warmup', 'main', 'cooldown'].forEach(sec => {
                const counts = deriveSessionCounts(userData, ctx, targetMin);
                for (let i = 0; i < counts[sec]; i++) {
                    
                    // --- ZMIANA: Filtr Difficulty (Max Lvl 2 dla Warmup/Cooldown) ---
                    const sectionFilter = (c) => {
                        if (sec === 'warmup' || sec === 'cooldown') {
                            if ((c.difficulty_level || 1) > 2) return false;
                        }
                        return true;
                    };

                    const ex = pickExerciseForSection(sec, candidates, userData, ctx, categoryWeights, sState, pZones, sectionFilter, phaseContext);
                    if (ex) {
                        const rx = prescribeForExercise(ex, sec, userData, ctx, categoryWeights, 'fresh', targetMin, rpeData.volumeModifier, phaseContext);
                        session[sec].push({ ...ex, ...rx });
                    }
                }
            });

            // --- ZMIANA: Sortowanie Rozgrzewki (Breathing -> Top, Diff -> Asc) ---
            if (session.warmup.length > 0) {
                session.warmup.sort((a, b) => {
                    const aIsBreath = isBreathingCategory(a.category_id);
                    const bIsBreath = isBreathingCategory(b.category_id);

                    // 1. Priorytet Oddechu (Na górze)
                    if (aIsBreath && !bIsBreath) return -1;
                    if (!aIsBreath && bIsBreath) return 1;

                    // 2. Trudność Rosnąco
                    return (a.difficulty_level || 1) - (b.difficulty_level || 1);
                });
            }

            // --- ZMIANA: Sortowanie Schłodzenia (Diff -> Desc, Breathing -> Bottom) ---
            if (session.cooldown.length > 0) {
                session.cooldown.sort((a, b) => {
                    const aIsBreath = isBreathingCategory(a.category_id);
                    const bIsBreath = isBreathingCategory(b.category_id);

                    // 1. Priorytet Oddechu (Na dole)
                    if (aIsBreath && !bIsBreath) return 1;
                    if (!aIsBreath && bIsBreath) return -1;

                    // 2. Trudność Malejąco
                    return (b.difficulty_level || 1) - (a.difficulty_level || 1);
                });
            }

            // 1. Dopychamy (Expand)
            expandSessionToTarget(session, candidates, userData, ctx, categoryWeights, sState, pZones, paceMap, 'fresh', targetMin, rpeData.volumeModifier, phaseContext);
            // 2. Skracamy (Shrink) - z nową logiką Reps/Time
            shrinkSessionToTarget(session, userData, paceMap, targetMin);

            const finalDur = Math.round(estimateSessionDurationSeconds(session, userData, paceMap) / 60);
            session.estimatedDurationMin = finalDur;

            // 3. LOGGING (AUDIT)
            logFinalSessionBreakdown(session, userData, paceMap);

            plan.days.push(session);

            fatigueScore += costOfSession;
            fatigueScore = Math.min(MAX_BUCKET_CAPACITY, Math.max(0, fatigueScore));
        } else {
            consecutiveTrainings = 0;
            fatigueScore -= 50;
            fatigueScore = Math.max(0, fatigueScore);
            plan.days.push({ dayNumber: dayOffset + 1, title: 'Regeneracja', date: dateString, type: 'rest', warmup: [], main: [], cooldown: [], estimatedDurationMin: 0 });
        }
    }
    return plan;
}

// ============================================================================
// TASK G4: PLAN VALIDATOR (Safety Net)
// ============================================================================

/**
 * Waliduje wygenerowany plan pod kątem krytycznych reguł fazy.
 * Jeśli znajdzie naruszenia (np. za trudne ćwiczenie w Rehab), koryguje parametry.
 * Działa "in-place" na obiekcie planu.
 */
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
                // 1. Difficulty Enforcement (Safety Cap)
                if (forbidden.maxDifficulty && ex.difficulty_level > forbidden.maxDifficulty) {
                    console.log(`[Validator] Scaling down ${ex.name} (Lvl ${ex.difficulty_level} > ${forbidden.maxDifficulty})`);
                    // Redukcja objętości jako kara za zbyt trudne ćwiczenie
                    ex.sets = "1";
                    ex.reps_or_time = "Spokojnie";
                    ex.validation_note = "Auto-scaled: Too hard for current phase";
                }

                // 2. Deload Volume Enforcement
                if (isDeload) {
                    const s = parseInt(ex.sets, 10);
                    if (s > 2) ex.sets = "2";
                }

                // 3. Rehab Safety Enforcement
                if (isRehab) {
                    // W Rehabie unikamy długich serii dynamicznych
                    if (!String(ex.reps_or_time).includes('s') && parseInt(ex.reps_or_time) > 12) {
                        ex.reps_or_time = "10";
                    }
                    // Wymuś tempo iso/slow jeśli nie jest ustawione
                    if (ex.tempo_or_iso === 'normal' || ex.tempo_or_iso === 'fast') {
                        ex.tempo_or_iso = 'slow';
                    }
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
    const [eR, bR, pR, hR, sR, recentSessionsR, oR, calculatedFatigue, settingsR] = await Promise.all([
      client.query('SELECT * FROM exercises'),
      client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]),
      client.query('SELECT exercise_id, affinity_score FROM user_exercise_preferences WHERE user_id = $1', [userId]),
      client.query(`SELECT session_data->'sessionLog' as logs, completed_at FROM training_sessions WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'`, [userId]),
      client.query('SELECT exercise_id, avg_seconds_per_rep FROM user_exercise_stats WHERE user_id = $1', [userId]),
      client.query(`SELECT completed_at, session_data->'feedback' as feedback FROM training_sessions WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 3`, [userId]),
      client.query('SELECT original_exercise_id, replacement_exercise_id, adjustment_type FROM user_plan_overrides WHERE user_id = $1', [userId]),
      calculateAcuteFatigue(client, userId),
      client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId])
    ]);

    const exercises = eR.rows.map(normalizeExerciseRow);
    const ctx = safeBuildUserContext(userData);
    bR.rows.forEach(r => ctx.blockedIds.add(r.exercise_id));
    const preferencesMap = {}; pR.rows.forEach(r => preferencesMap[r.exercise_id] = { score: r.affinity_score });
    const historyMap = {}; hR.rows.forEach(r => { (r.logs || []).forEach(l => { const id = l.exerciseId || l.id; if (id && (!historyMap[id] || new Date(r.completed_at) > historyMap[id])) historyMap[id] = new Date(r.completed_at); }); });
    const progressionMap = { sources: new Map(), targets: new Set() };
    oR.rows.forEach(r => { if (r.adjustment_type === 'evolution') { progressionMap.sources.set(r.original_exercise_id, r.replacement_exercise_id); progressionMap.targets.add(r.replacement_exercise_id); } });
    const paceMap = {}; sR.rows.forEach(r => { paceMap[r.exercise_id] = parseFloat(r.avg_seconds_per_rep); });
    const recentSessions = recentSessionsR.rows;
    const rpeData = analyzeRpeTrend(recentSessions);

    // --- PHASE CONTEXT PIPELINE (G1) ---
    let settings = settingsR.rows[0]?.settings || {};
    let phaseState = settings.phase_manager;

    if (!phaseState) {
        phaseState = initializePhaseState(userData.primary_goal, userData);
    } else {
        phaseState = applyGoalChangePolicy(phaseState, userData.primary_goal, userData);
    }

    const safetyCtx = {
        isSeverePain: ctx.isSevere,
        fatigueScore: calculatedFatigue,
        lastFeedbackValue: rpeData.lastFeedback?.value,
        lastFeedbackType: rpeData.lastFeedback?.type
    };

    const resolved = resolveActivePhase(phaseState, safetyCtx);

    const phaseContext = {
        phaseId: resolved.activePhaseId,
        isOverride: resolved.isOverride,
        config: getPhaseConfig(resolved.activePhaseId),
        sessionsCompleted: phaseState.current_phase_stats?.sessions_completed || 0,
        targetSessions: phaseState.current_phase_stats?.target_sessions || 12,
        isSoftProgression: phaseState.current_phase_stats?.is_soft_progression || false,
        spiralDifficultyBias: phaseState.spiral?.base_difficulty_bias || 0
    };

    console.log(`[PlanGen] User: ${userId}, Phase: ${phaseContext.phaseId} (Override: ${phaseContext.isOverride}), Fatigue: ${calculatedFatigue}`);

    const cWeights = buildDynamicCategoryWeights(exercises, userData, ctx);
    const fatigueStateForFilter = calculatedFatigue >= 80 ? 'fatigued' : 'fresh';
    const candidates = filterExerciseCandidates(exercises, userData, ctx, fatigueStateForFilter, rpeData);

    if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES' }) };

    // --- BUILD PLAN (Uses G2 Scoring + G3 Prescription) ---
    const plan = buildRollingPlan(candidates, cWeights, userData, ctx, userId, historyMap, preferencesMap, paceMap, calculatedFatigue, rpeData, progressionMap, phaseContext);

    // --- VALIDATOR (G4) ---
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
// netlify/functions/generate-plan.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');

/**
 * Virtual Physio v3.1: Precision Time-Boxing & Affinity.
 *
 * Zmiany v3.1 (Fix Time Estimate):
 * - Przepisano `deriveSessionCounts`: Mniej ćwiczeń dla krótkich sesji (<=30min).
 * - Przepisano `compressSessionIfTooLong`: 4-fazowa kompresja (Serie -> Warmup/Cool -> Reps/Time -> Remove).
 * - Limit serii dla ćwiczeń unilateralnych (są czasochłonne).
 * - Dokładniejsza estymacja czasu (narzuty na przejścia).
 */

const DEFAULT_SECONDS_PER_REP = 6;
const DEFAULT_REST_BETWEEN_SETS = 30;
const DEFAULT_REST_BETWEEN_EXERCISES = 30;
const DEFAULT_TARGET_MIN = 30;
const DEFAULT_SESSIONS_PER_WEEK = 3;

const MAX_SETS_MAIN = 5;
const MAX_SETS_MOBILITY = 3;
const GLOBAL_MAX_REPS = 25;
const GLOBAL_MAX_TIME_SEC = 90;
const MAX_BREATHING_SEC = 240;
const MAX_STRETCH_SEC = 120;

const MIN_MAIN_EXERCISES = 2; // Zmniejszono z 3 dla krótkich sesji

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

function canonicalizeEquipmentItem(item) {
  const s = String(item || '').trim().toLowerCase();
  if (!s) return '';
  const map = [
    ['mini band', 'band'], ['power band', 'band'], ['resistance band', 'band'],
    ['gum', 'band'], ['guma', 'band'], ['taśma', 'band'], ['tasma', 'band'],
    ['dumbbells', 'dumbbell'], ['hantle', 'dumbbell'], ['kettlebells', 'kettlebell'],
    ['mata', 'mat'], ['maty', 'mat'], ['exercise mat', 'mat'],
    ['bodyweight', 'bodyweight'], ['masa własna', 'bodyweight'], ['masa wlasna', 'bodyweight'],
    ['none', 'none'], ['brak', 'none'], ['brak sprzętu', 'none'], ['brak sprzetu', 'none'],
  ];
  for (const [from, to] of map) {
    if (s === from) return to;
  }
  return s;
}

function normalizeEquipmentList(raw) {
  const items = normalizeStringArray(raw).map(canonicalizeEquipmentItem).filter(Boolean);
  const ignore = new Set(['none', 'brak', '']);
  const set = new Set();
  for (const it of items) {
    if (ignore.has(it)) continue;
    set.add(it);
  }
  return set;
}

function normalizeExerciseRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    equipment: normalizeStringArray(row.equipment).map(canonicalizeEquipmentItem).filter(Boolean),
    is_unilateral: !!row.is_unilateral,
    is_foot_loading: !!row.is_foot_loading,
    category_id: row.category_id ? String(row.category_id) : 'uncategorized',
    difficulty_level: clamp(toNumber(row.difficulty_level, 1), 1, 5),
    pain_relief_zones: normalizeStringArray(row.pain_relief_zones).map(s => s.toLowerCase()),
    primary_plane: row.primary_plane ? String(row.primary_plane) : 'multi',
    position: row.position ? String(row.position) : null,
    knee_load_level: row.knee_load_level ? String(row.knee_load_level) : 'low',
    spine_load_level: row.spine_load_level ? String(row.spine_load_level) : 'low',
    impact_level: row.impact_level ? String(row.impact_level) : 'low',
    metabolic_intensity: clamp(toNumber(row.metabolic_intensity, 1), 1, 5),
    max_recommended_duration: toNumber(row.max_recommended_duration, 0),
    max_recommended_reps: toNumber(row.max_recommended_reps, 0),
  };
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

// ---------------------------------
// Clinical context & weighting
// ---------------------------------

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
  const ensure = ['breathing', 'spine_mobility', 'thoracic_mobility', 'hip_mobility', 'hip_flexor_stretch', 'glute_activation', 'hip_extension', 'core_stability', 'core_anti_rotation', 'core_anti_extension', 'core_anti_flexion', 'core_anti_lateral_flexion', 'vmo_activation', 'knee_stability', 'unilateral_leg', 'calves', 'conditioning_low_impact', 'eccentric_hamstrings', 'nerve_flossing'];
  for (const cat of ensure) { if (weights[cat] == null) weights[cat] = 1.0; }
  return weights;
}

function boost(weights, categoryId, delta) { const key = String(categoryId); if (weights[key] == null) weights[key] = 1.0; weights[key] += delta; }
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

  // Logika wag (skrócona dla czytelności, identyczna jak w poprzedniej wersji)
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
  if (diagnosis.has('chondromalacia')) {
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

// ---------------------------------
// Safety filtering
// ---------------------------------

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
  const req = ex.equipment.map(canonicalizeEquipmentItem).filter(Boolean).map(s => s.toLowerCase());
  const ignorable = new Set(['none', 'bodyweight', 'mat']);
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

  if (restrictionsSet.has('no_kneeling') && pos === 'kneeling') return true;
  if (restrictionsSet.has('no_prone') && pos === 'prone') return true;
  if (restrictionsSet.has('no_supine') && pos === 'supine') return true;
  if (restrictionsSet.has('no_sitting') && pos === 'sitting') return true;
  if (restrictionsSet.has('no_standing') && pos === 'standing') return true;

  if (restrictionsSet.has('foot_injury')) {
    if (ex.is_foot_loading) return true;
    const impact = (ex.impact_level || 'low').toLowerCase();
    if (impact === 'medium' || impact === 'high') return true;
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
    const isDynamicRotation = (plane === 'transverse' || cat.includes('rotation')) && !cat.includes('anti_rotation');
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
    if (res && typeof res.allowed === 'boolean') return res.allowed;
    if (typeof res === 'boolean') return res;
    return true;
  } catch (e) {
    console.error('checkExerciseAvailability error:', e);
    return true;
  }
}

function filterExerciseCandidates(exercises, userData, ctx) {
  const userEquipment = normalizeEquipmentList(userData?.equipment_available);
  const diagnosisSet = normalizeLowerSet(userData?.medical_diagnosis);
  const restrictionsSet = normalizeLowerSet(userData?.physical_restrictions);

  const filtered = [];
  for (const ex of exercises) {
    if (!ex || !ex.id) continue;
    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) continue;
    if (!applyCheckExerciseAvailability(ex, ctx, userData)) continue;
    if (!isExerciseCompatibleWithEquipment(ex, userEquipment)) continue;
    if (violatesPhysicalRestrictions(ex, restrictionsSet)) continue;
    if (violatesDiagnosisHardContraindications(ex, diagnosisSet)) continue;
    if (violatesSeverePainRules(ex, ctx)) continue;
    filtered.push(ex);
  }
  return filtered;
}

// ---------------------------------
// Scoring & selection
// ---------------------------------

function derivePainZoneSet(userData) {
  const painLocs = normalizeLowerSet(userData?.pain_locations);
  const zoneSet = new Set();
  for (const z of painLocs) zoneSet.add(z);
  if (painLocs.has('lumbar') || painLocs.has('low_back')) { zoneSet.add('lumbosacral'); zoneSet.add('sciatica'); }
  if (painLocs.has('knee') || painLocs.has('knee_anterior')) { zoneSet.add('patella'); zoneSet.add('patellofemoral'); }
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
  p *= 1.0 / (1.0 + weeklyUsed * 0.7);
  const weeklyCat = state.weeklyCategoryUsage.get(ex.category_id) || 0;
  p *= 1.0 / (1.0 + weeklyCat * 0.35);
  const sessionCat = state.sessionCategoryUsage.get(ex.category_id) || 0;
  p *= 1.0 / (1.0 + sessionCat * (section === 'main' ? 0.9 : 0.6));
  const plane = (ex.primary_plane || 'multi').toLowerCase();
  const sessionPlane = state.sessionPlaneUsage.get(plane) || 0;
  p *= 1.0 / (1.0 + sessionPlane * 0.35);
  return p;
}

function calculateAffinityMultiplier(exId, preferencesMap) {
    if (!preferencesMap || !preferencesMap[exId]) return 1.0;
    const score = preferencesMap[exId].score || 0;

    if (score >= 50) return 1.5;  // LIKE
    if (score >= 10) return 1.2;  // MILD LIKE
    if (score <= -50) return 0.2; // DISLIKE (Soft block)
    if (score <= -10) return 0.7; // MILD DISLIKE

    return 1.0;
}

function calculateFreshnessMultiplier(exId, historyMap) {
    if (!historyMap || !historyMap[exId]) return 1.2; // Nie robione nigdy = Boost

    const lastDate = new Date(historyMap[exId]);
    const now = new Date();
    const diffTime = Math.abs(now - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 2) return 0.1; // Robione wczoraj/przedwczoraj -> Kara
    if (diffDays <= 5) return 0.5; // Robione niedawno
    if (diffDays >= 14) return 1.2; // Dawno nie robione -> Boost

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

  // Integracja Affinity i Freshness
  if (state.preferencesMap) {
      score *= calculateAffinityMultiplier(ex.id, state.preferencesMap);
  }
  if (state.historyMap) {
      score *= calculateFreshnessMultiplier(ex.id, state.historyMap);
  }

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

// ---------------------------------
// Session structure
// ---------------------------------

function deriveSessionCounts(userData, ctx) {
  const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);
  const componentWeights = normalizeLowerSet(userData?.session_component_weights);

  // FIX: Zmniejszono bazową liczbę ćwiczeń dla krótkich sesji
  let warmup = 3;
  let main = 4;
  let cooldown = 2;

  // NOWE PROGI DLA KRÓTKICH SESJI
  if (targetMin <= 25) { warmup = 2; main = 2; cooldown = 1; } // Total 5
  else if (targetMin <= 35) { warmup = 2; main = 3; cooldown = 1; } // Total 6
  else if (targetMin <= 50) { warmup = 3; main = 4; cooldown = 2; } // Total 9
  else { warmup = 3; main = 5; cooldown = 2; } // Total 10

  if (componentWeights.has('mobility')) { warmup += 1; cooldown += 1; main = Math.max(MIN_MAIN_EXERCISES, main - 1); }
  if (componentWeights.has('strength')) { main += 1; warmup = Math.max(2, warmup - 1); }
  if (componentWeights.has('conditioning')) { main += ctx.isSevere ? 0 : 1; }

  if (ctx.isSevere) {
    warmup += 1;
    main = Math.max(MIN_MAIN_EXERCISES, main - 1);
  }

  return { warmup, main: Math.max(MIN_MAIN_EXERCISES, main), cooldown, targetMin };
}

function createInitialSession(dayNumber, counts) {
  return {
    dayNumber,
    title: `Sesja ${dayNumber}`,
    warmup: [],
    main: [],
    cooldown: [],
    targetMinutes: counts.targetMin,
  };
}

// ---------------------------------
// Volume prescription & time estimation
// ---------------------------------

function loadFactorFromExperienceAndPain(userData, ctx) {
  const exp = String(userData?.exercise_experience || 'none').toLowerCase();
  const sessionsPerWeek = clamp(toNumber(userData?.sessions_per_week, DEFAULT_SESSIONS_PER_WEEK), 1, 7);
  const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);

  let base = 1.0;
  if (exp === 'none') base = 0.70;
  else if (exp === 'occasional') base = 0.85;
  else if (exp === 'regular') base = 1.0;
  else if (exp === 'advanced') base = 1.10;
  else base = 0.95;

  const severity = clamp(toNumber(ctx?.severityScore, painIntensity), 0, 10);
  if (severity >= 7) base *= 0.55;
  else if (severity >= 4) base *= 0.80;

  if (sessionsPerWeek >= 6) base *= 0.85;
  if (sessionsPerWeek <= 2) base *= 1.10;

  return clamp(base, 0.45, 1.25);
}

function prescribeForExercise(ex, section, userData, ctx, categoryWeights) {
  const factor = loadFactorFromExperienceAndPain(userData, ctx);
  const cat = String(ex.category_id || '').toLowerCase();
  const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);

  let sets = 1;
  let repsOrTime = '10';

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

  if (section === 'warmup') {
    sets = factor < 0.7 ? 1 : 2;
  } else if (section === 'cooldown') {
    sets = 1;
  } else {
    if (factor < 0.65) sets = 1;
    else if (factor < 0.95) sets = 2;
    else sets = 3;
    const w = categoryWeights[ex.category_id] != null ? categoryWeights[ex.category_id] : 1.0;
    if (!ctx.isSevere && w >= 2.5) sets = Math.min(4, sets + 1);
  }

  const maxDur = ex.max_recommended_duration || 0;
  const maxReps = ex.max_recommended_reps || 0;

  if (maxDur > 0) {
    let baseSec = 45;
    if (targetMin >= 45) baseSec = 60;
    if (ctx.isSevere) baseSec = 30;

    let sec = Math.round(baseSec * factor);
    sec = Math.min(sec, maxDur);
    sec = Math.max(sec, 15);

    sec = Math.ceil(sec / 5) * 5;
    repsOrTime = `${sec} s`;
  }
  else if (maxReps > 0) {
    let baseReps = 10;
    if (isMobilityCategory(cat)) baseReps = 12;

    const exp = String(userData?.exercise_experience || 'none').toLowerCase();
    if (exp === 'advanced') baseReps += 2;
    else if (exp === 'regular') baseReps += 1;

    const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
    if (painIntensity >= 7) baseReps = Math.min(baseReps, 8);
    else if (painIntensity >= 4) baseReps = Math.min(baseReps, 10);

    let reps = Math.round(baseReps * factor);
    reps = Math.min(reps, maxReps);
    reps = Math.max(reps, 5);

    repsOrTime = String(reps);
  }
  else {
    const isStretching = cat.includes('stretch') || cat.includes('yoga') || section === 'cooldown';
    const forceTime = isConditioningCategory(cat) || (ex.metabolic_intensity || 1) >= 4;

    if (forceTime || isStretching) {
      let baseSec = section === 'cooldown' ? 60 : 45;
      if (targetMin >= 45) baseSec += 15;
      if (forceTime && ctx.isSevere) baseSec = 25;

      const maxSec = isStretching ? MAX_STRETCH_SEC : GLOBAL_MAX_TIME_SEC;
      const sec = clamp(Math.round(baseSec * factor), 20, maxSec);
      repsOrTime = `${Math.ceil(sec / 5) * 5} s`;
      if (isStretching) sets = Math.min(sets, MAX_SETS_MOBILITY);
      else sets = clamp(sets, 1, ctx.isSevere ? 2 : 4);
    } else {
      let baseReps = 10;
      if (section === 'warmup') baseReps = 8;
      if (section === 'cooldown') baseReps = 8;

      const exp = String(userData?.exercise_experience || 'none').toLowerCase();
      if (exp === 'advanced') baseReps += 2;
      else if (exp === 'regular') baseReps += 1;

      const painIntensity = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
      if (painIntensity >= 7) baseReps = Math.min(baseReps, 8);
      else if (painIntensity >= 4) baseReps = Math.min(baseReps, 10);

      const reps = clamp(Math.round(baseReps * factor), 5, GLOBAL_MAX_REPS);
      repsOrTime = String(reps);
    }
  }

  // --- FIX: LIMIT SERII DLA UNILATERAL ---
  if (ex.is_unilateral) {
    if (!String(repsOrTime).toLowerCase().includes('s')) repsOrTime = `${repsOrTime}/str.`;
    // Max 3 serie (bo to 6 serii faktycznie), a dla krótkich sesji (<35min) max 2
    const uniLimit = targetMin < 35 ? 2 : 3;
    sets = Math.min(sets, uniLimit);
  }

  return { sets: String(sets), reps_or_time: repsOrTime };
}

function parseRepsOrTimeToSeconds(repsOrTime) {
  const t = String(repsOrTime || '').trim().toLowerCase();
  if (t.includes('s')) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.max(5, n) : 30;
  }
  if (t.includes('min')) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.max(10, n * 60) : 60;
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 10;
}

function isTimePrescription(repsOrTime) {
  const t = String(repsOrTime || '').toLowerCase();
  return t.includes('s') || t.includes('min');
}

function estimateExerciseDurationSeconds(exEntry, userData) {
  const secondsPerRep = clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12);
  const restBetweenSets = clamp(toNumber(userData?.restBetweenSets, DEFAULT_REST_BETWEEN_SETS), 0, 180);
  const sets = clamp(parseInt(exEntry.sets, 10) || 1, 1, 10);
  const repsOrTime = exEntry.reps_or_time;
  const unilateralMultiplier = exEntry.is_unilateral || String(repsOrTime || '').includes('/str') ? 2 : 1;

  let workPerSet = 0;
  if (isTimePrescription(repsOrTime)) {
    workPerSet = parseRepsOrTimeToSeconds(repsOrTime);
  } else {
    const reps = parseRepsOrTimeToSeconds(repsOrTime);
    workPerSet = reps * secondsPerRep;
  }

  const work = sets * workPerSet * unilateralMultiplier;
  const rests = (sets > 1) ? (sets - 1) * restBetweenSets : 0;
  // Transition buffer: 15s dla unilateral (zmiana strony), 10s dla zwykłych
  const transition = sets * (exEntry.is_unilateral ? 15 : 10);

  return work + rests + transition;
}

function estimateSessionDurationSeconds(session, userData) {
  const restBetweenExercises = clamp(toNumber(userData?.restBetweenExercises, DEFAULT_REST_BETWEEN_EXERCISES), 0, 180);
  const all = [...session.warmup, ...session.main, ...session.cooldown];
  let total = 0;
  for (let i = 0; i < all.length; i++) {
    total += estimateExerciseDurationSeconds(all[i], userData);
    if (i < all.length - 1) total += restBetweenExercises;
  }
  return total;
}

function expandSessionToTarget(session, candidates, userData, ctx, categoryWeights) {
  const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);
  const targetSec = targetMin * 60;
  let estimated = estimateSessionDurationSeconds(session, userData);

  const tryIncreaseSets = () => {
    const mainSorted = [...session.main].sort((a, b) => {
      const wa = categoryWeights[a.category_id] != null ? categoryWeights[a.category_id] : 1.0;
      const wb = categoryWeights[b.category_id] != null ? categoryWeights[b.category_id] : 1.0;
      return wb - wa;
    });
    let changed = false;
    for (const ex of mainSorted) {
      const cat = String(ex.category_id || '').toLowerCase();
      if (isBreathingCategory(cat)) continue;
      const currentSets = clamp(parseInt(ex.sets, 10) || 1, 1, 10);
      const maxSets = (isMobilityCategory(cat) && !cat.includes('stretch')) ? MAX_SETS_MOBILITY : MAX_SETS_MAIN;
      if (currentSets < maxSets) {
        ex.sets = String(currentSets + 1);
        changed = true;
        estimated = estimateSessionDurationSeconds(session, userData);
        if (estimated >= targetSec * 0.95) break;
      }
    }
    return changed;
  };

  const tryIncreaseRepsOrTime = () => {
    let changed = false;
    const all = [...session.main, ...session.warmup];
    for (const ex of all) {
      const cat = String(ex.category_id || '').toLowerCase();
      if (isBreathingCategory(cat)) {
        const cur = parseRepsOrTimeToSeconds(ex.reps_or_time);
        if (cur < MAX_BREATHING_SEC) {
          ex.reps_or_time = `${Math.min(MAX_BREATHING_SEC, cur + 15)} s`;
          changed = true;
        }
      } else if (isTimePrescription(ex.reps_or_time) || isConditioningCategory(cat)) {
        const cur = parseRepsOrTimeToSeconds(ex.reps_or_time);
        const maxSec = GLOBAL_MAX_TIME_SEC;
        if (cur < maxSec) {
          ex.reps_or_time = `${Math.min(maxSec, cur + 10)} s`;
          changed = true;
        }
      } else {
        const cur = parseRepsOrTimeToSeconds(ex.reps_or_time);
        const next = Math.min(GLOBAL_MAX_REPS, cur + 2);
        if (next !== cur) {
          if (String(ex.reps_or_time).includes('/str')) ex.reps_or_time = `${next}/str.`;
          else ex.reps_or_time = String(next);
          changed = true;
        }
      }
      estimated = estimateSessionDurationSeconds(session, userData);
      if (estimated >= targetSec * 0.95) break;
    }
    return changed;
  };

  let guard = 0;
  while (estimated < targetSec * 0.90 && guard < 30) {
    guard++;
    const changedSets = tryIncreaseSets();
    if (estimated >= targetSec * 0.90) break;
    const changedVol = tryIncreaseRepsOrTime();
    if (estimated >= targetSec * 0.90) break;
    if (!changedSets && !changedVol) {
        break; // Removed filler logic for brevity as per instructions, stick to sets/reps expansion
    }
  }
  session.estimatedDurationMin = Math.round(estimateSessionDurationSeconds(session, userData) / 60);
  return session;
}

// --- ZMODYFIKOWANA FUNKCJA KOMPRESJI ---
function compressSessionIfTooLong(session, userData) {
  const targetMin = clamp(toNumber(userData?.target_session_duration_min, DEFAULT_TARGET_MIN), 10, 90);
  const targetSec = targetMin * 60;
  let estimated = estimateSessionDurationSeconds(session, userData);

  // Tolerancja 5%
  if (estimated <= targetSec * 1.05) {
    session.estimatedDurationMin = Math.round(estimated / 60);
    return session;
  }

  // FAZA 1: Redukcja serii w części GŁÓWNEJ
  let guard = 0;
  while (estimated > targetSec * 1.05 && guard < 20) {
    guard++;
    let changed = false;
    for (const ex of session.main) {
      const cat = String(ex.category_id || '').toLowerCase();
      if (isBreathingCategory(cat)) continue;
      const s = clamp(parseInt(ex.sets, 10) || 1, 1, 10);
      if (s > 1) {
        ex.sets = String(s - 1);
        changed = true;
      }
      estimated = estimateSessionDurationSeconds(session, userData);
      if (estimated <= targetSec * 1.05) break;
    }
    if (!changed) break;
  }

  if (estimated <= targetSec * 1.05) {
      session.estimatedDurationMin = Math.round(estimated / 60);
      return session;
  }

  // FAZA 2: Redukcja serii w WARMUP/COOLDOWN
  guard = 0;
  while (estimated > targetSec * 1.05 && guard < 20) {
      guard++;
      let changed = false;
      const warmCool = [...session.warmup, ...session.cooldown];
      for (const ex of warmCool) {
          const s = clamp(parseInt(ex.sets, 10) || 1, 1, 10);
          if (s > 1) {
              ex.sets = String(s - 1);
              changed = true;
          }
          estimated = estimateSessionDurationSeconds(session, userData);
          if (estimated <= targetSec * 1.05) break;
      }
      if (!changed) break;
  }

  if (estimated <= targetSec * 1.05) {
      session.estimatedDurationMin = Math.round(estimated / 60);
      return session;
  }

  // FAZA 3: Redukcja Objętości (Czas/Powtórzenia)
  guard = 0;
  while (estimated > targetSec * 1.05 && guard < 20) {
      guard++;
      let changed = false;
      const all = [...session.warmup, ...session.main, ...session.cooldown];
      for (const ex of all) {
          const currentVal = parseRepsOrTimeToSeconds(ex.reps_or_time);
          // Redukcja o 20%, ale nie mniej niż 15s / 5 reps
          let newVal = Math.floor(currentVal * 0.8);
          
          if (isTimePrescription(ex.reps_or_time)) {
              if (newVal < 15) newVal = 15;
              if (newVal < currentVal) {
                  ex.reps_or_time = `${newVal} s`;
                  changed = true;
              }
          } else {
              if (newVal < 5) newVal = 5;
              if (newVal < currentVal) {
                  const isStr = String(ex.reps_or_time).includes('/str');
                  ex.reps_or_time = isStr ? `${newVal}/str.` : String(newVal);
                  changed = true;
              }
          }
          estimated = estimateSessionDurationSeconds(session, userData);
          if (estimated <= targetSec * 1.05) break;
      }
      if (!changed) break;
  }

  // FAZA 4: Usuwanie ćwiczeń z części głównej (Hard Cut)
  while (estimated > targetSec * 1.10 && session.main.length > 2) {
    session.main.pop();
    estimated = estimateSessionDurationSeconds(session, userData);
  }

  session.estimatedDurationMin = Math.round(estimated / 60);
  return session;
}

// ---------------------------------
// Plan generation
// ---------------------------------

function buildWeeklyPlan(candidates, categoryWeights, userData, ctx, userId, historyMap, preferencesMap) {
  const sessionsPerWeek = clamp(toNumber(userData?.sessions_per_week, DEFAULT_SESSIONS_PER_WEEK), 1, 7);
  const counts = deriveSessionCounts(userData, ctx);
  const planId = `dynamic-${Date.now()}`;
  const painZoneSet = derivePainZoneSet(userData);

  const plan = {
    id: planId,
    name: 'Virtual Physio – plan spersonalizowany',
    description: 'Plan generowany algorytmicznie na podstawie ankiety (EBP + biomechanika).',
    createdAt: new Date().toISOString(),
    meta: {
      sessions_per_week: sessionsPerWeek,
      target_session_duration_min: counts.targetMin,
      secondsPerRep: clamp(toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP), 2, 12),
      restBetweenSets: clamp(toNumber(userData?.restBetweenSets, DEFAULT_REST_BETWEEN_SETS), 0, 180),
      severityScore: ctx.severityScore,
      isSevere: ctx.isSevere,
      tolerancePattern: ctx.tolerancePattern,
      pain_locations: normalizeStringArray(userData?.pain_locations),
      focus_locations: normalizeStringArray(userData?.focus_locations),
      medical_diagnosis: normalizeStringArray(userData?.medical_diagnosis),
      physical_restrictions: normalizeStringArray(userData?.physical_restrictions),
      work_type: userData?.work_type || null,
      hobby: userData?.hobby || null,
      session_component_weights: normalizeStringArray(userData?.session_component_weights),
      primary_goal: userData?.primary_goal || null,
      secondary_goals: normalizeStringArray(userData?.secondary_goals),
      equipment_available: normalizeStringArray(userData?.equipment_available),
      exercise_experience: userData?.exercise_experience || null,
    },
    days: [],
  };

  const weeklyUsage = new Map();
  const weeklyCategoryUsage = new Map();

  for (let day = 1; day <= sessionsPerWeek; day++) {
    const sessionState = {
      usedIds: new Set(),
      weeklyUsage,
      weeklyCategoryUsage,
      sessionCategoryUsage: new Map(),
      sessionPlaneUsage: new Map(),
      historyMap: historyMap || {},
      preferencesMap: preferencesMap || {}
    };

    const session = createInitialSession(day, counts);

    // Warmup
    for (let i = 0; i < counts.warmup; i++) {
      const ex = pickExerciseForSection(
        'warmup', candidates, userData, ctx, categoryWeights, sessionState, painZoneSet,
        (candidate) => (candidate.metabolic_intensity || 1) < 4
      );
      if (!ex) break;
      const rx = prescribeForExercise(ex, 'warmup', userData, ctx, categoryWeights);
      session.warmup.push({ ...ex, sets: rx.sets, reps_or_time: rx.reps_or_time });
    }

    // Main
    for (let i = 0; i < counts.main; i++) {
      const ex = pickExerciseForSection(
        'main', candidates, userData, ctx, categoryWeights, sessionState, painZoneSet,
        (candidate) => {
          const cat = String(candidate.category_id || '').toLowerCase();
          if (isBreathingCategory(cat)) return false;
          if (ctx.isSevere && (candidate.impact_level || 'low').toLowerCase() !== 'low') return false;
          return true;
        }
      );
      if (!ex) break;
      const rx = prescribeForExercise(ex, 'main', userData, ctx, categoryWeights);
      session.main.push({ ...ex, sets: rx.sets, reps_or_time: rx.reps_or_time });
    }

    // Safety fill (Only if really needed, but kept minimal)
    if (session.main.length < MIN_MAIN_EXERCISES) {
      const missing = MIN_MAIN_EXERCISES - session.main.length;
      for (let k = 0; k < missing; k++) {
        const ex = pickExerciseForSection(
          'main', candidates, userData, ctx, categoryWeights, sessionState, painZoneSet,
          (candidate) => {
            const cat = String(candidate.category_id || '').toLowerCase();
            if (!(isCoreCategory(cat) || isMobilityCategory(cat))) return false;
            const spineLoad = (candidate.spine_load_level || 'low').toLowerCase();
            const impact = (candidate.impact_level || 'low').toLowerCase();
            if (spineLoad === 'high' || impact === 'high') return false;
            return true;
          }
        );
        if (!ex) break;
        const rx = prescribeForExercise(ex, 'main', userData, ctx, categoryWeights);
        session.main.push({ ...ex, sets: rx.sets, reps_or_time: rx.reps_or_time, isSafetyFill: true });
      }
    }

    // Cooldown
    for (let i = 0; i < counts.cooldown; i++) {
      const ex = pickExerciseForSection(
        'cooldown', candidates, userData, ctx, categoryWeights, sessionState, painZoneSet,
        (candidate) => (candidate.metabolic_intensity || 1) < 4
      );
      if (!ex) break;
      const rx = prescribeForExercise(ex, 'cooldown', userData, ctx, categoryWeights);
      session.cooldown.push({ ...ex, sets: rx.sets, reps_or_time: rx.reps_or_time });
    }

    expandSessionToTarget(session, candidates, userData, ctx, categoryWeights);
    compressSessionIfTooLong(session, userData);
    plan.days.push(session);
  }

  return plan;
}

async function loadUserSettings(client, userId) {
  const res = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
  if (res.rows && res.rows.length > 0) {
    try { return res.rows[0].settings ? JSON.parse(res.rows[0].settings) : {}; } catch (e) { return {}; }
  }
  return {};
}

async function saveUserSettings(client, userId, settingsObj) {
  await client.query(
    `INSERT INTO user_settings (user_id, settings, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
    [userId, JSON.stringify(settingsObj)]
  );
}

// ---------------------------------
// Handler
// ---------------------------------

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let userId;
  try { userId = await getUserIdFromEvent(event); } catch (e) { return { statusCode: 401, body: JSON.stringify({ error: 'UNAUTHORIZED' }) }; }

  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
  const userData = safeJsonParse(body);
  if (userData === null) return { statusCode: 400, body: JSON.stringify({ error: 'INVALID_JSON_BODY' }) };
  if (userData && userData.can_generate_plan === false) return { statusCode: 400, body: JSON.stringify({ error: 'PLAN_GENERATION_BLOCKED_BY_CLINICAL_RULES' }) };

  const client = await pool.connect();
  try {
    const [exercisesRes, blacklistRes, prefsRes, historyRes] = await Promise.all([
      client.query('SELECT * FROM exercises'),
      client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
      client.query('SELECT exercise_id, affinity_score FROM user_exercise_preferences WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
      client.query(`
        SELECT session_data->'sessionLog' as logs, completed_at
        FROM training_sessions
        WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'
      `, [userId]).catch(() => ({ rows: [] }))
    ]);

    const exercises = (exercisesRes.rows || []).map(normalizeExerciseRow);
    if (exercises.length === 0) return { statusCode: 500, body: JSON.stringify({ error: 'EXERCISE_DB_EMPTY' }) };

    const ctx = safeBuildUserContext(userData);
    if (blacklistRes?.rows) {
      for (const r of blacklistRes.rows) { if (r && r.exercise_id) ctx.blockedIds.add(r.exercise_id); }
    }

    const preferencesMap = {};
    prefsRes.rows.forEach(row => {
        preferencesMap[row.exercise_id] = { score: row.affinity_score };
    });

    const historyMap = {};
    historyRes.rows.forEach(row => {
        if (row.logs && Array.isArray(row.logs)) {
            const date = new Date(row.completed_at);
            row.logs.forEach(log => {
                const exId = log.exerciseId || log.id;
                if (exId) {
                    if (!historyMap[exId] || date > historyMap[exId]) {
                        historyMap[exId] = date;
                    }
                }
            });
        }
    });

    const categoryWeights = buildDynamicCategoryWeights(exercises, userData, ctx);
    let candidates = filterExerciseCandidates(exercises, userData, ctx);

    if (candidates.length < 10) {
      const relaxedCtx = { ...ctx, isSevere: false };
      candidates = filterExerciseCandidates(exercises, userData, relaxedCtx);
    }

    if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES_AVAILABLE' }) };

    const dynamicPlanData = buildWeeklyPlan(candidates, categoryWeights, userData, ctx, userId, historyMap, preferencesMap);
    const settings = await loadUserSettings(client, userId);
    settings.dynamicPlanData = dynamicPlanData;
    settings.planMode = 'dynamic';
    settings.onboardingCompleted = true;
    settings.wizardData = userData;

    await saveUserSettings(client, userId, settings);

    return { statusCode: 200, body: JSON.stringify({ message: 'Plan generated', plan: dynamicPlanData }) };
  } catch (error) {
    console.error('generate-plan error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'UNKNOWN_ERROR' }) };
  } finally {
    client.release();
  }
};
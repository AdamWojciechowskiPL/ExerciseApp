// netlify/functions/generate-plan.js
'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { buildUserContext, checkExerciseAvailability } = require('./_clinical-rule-engine.js');

/**
 * Virtual Physio v3.8: Precision Atomic Pruning.
 * Naprawiono błąd przekraczania czasu poprzez bardziej agresywne usuwanie ćwiczeń 
 * oraz inteligentną redukcję powtórzeń przy zachowaniu balansu sekcji.
 */

const DEFAULT_SECONDS_PER_REP = 6;
const DEFAULT_REST_BETWEEN_SETS = 30;
const DEFAULT_REST_BETWEEN_EXERCISES = 30;
const DEFAULT_TARGET_MIN = 30;
const DEFAULT_SESSIONS_PER_WEEK = 3;

const MAX_SETS_MAIN = 4; // Zmniejszono z 5 dla lepszej kontroli
const MAX_SETS_MOBILITY = 2; // Zmniejszono z 3
const GLOBAL_MAX_REPS = 20;
const GLOBAL_MAX_TIME_SEC = 90;

const MIN_MAIN_EXERCISES = 2;
const MIN_WARMUP_EXERCISES = 1;
const MIN_COOLDOWN_EXERCISES = 1;

// ---------------------------------
// Helpers & Normalization
// ---------------------------------

function safeJsonParse(body) { if (!body) return {}; try { return JSON.parse(body); } catch (e) { return null; } }
function toNumber(val, fallback) { const n = Number(val); return Number.isFinite(n) ? n : fallback; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function normalizeStringArray(v) { if (!v) return []; if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean); if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean); return []; }
function normalizeLowerSet(arr) { return new Set(normalizeStringArray(arr).map(s => s.toLowerCase())); }
function intersectionCount(aArr, bSet) { let c = 0; for (const a of aArr) { if (bSet.has(String(a).toLowerCase())) c++; } return c; }

function canonicalizeEquipmentItem(item) {
  const s = String(item || '').trim().toLowerCase();
  if (!s) return '';
  const map = [['mini band', 'band'], ['power band', 'band'], ['resistance band', 'band'], ['gum', 'band'], ['guma', 'band'], ['tasma', 'band'], ['dumbbells', 'dumbbell'], ['hantle', 'dumbbell'], ['kettlebells', 'kettlebell'], ['mata', 'mat'], ['exercise mat', 'mat'], ['bodyweight', 'bodyweight'], ['none', 'none'], ['brak', 'none']];
  for (const [from, to] of map) { if (s === from) return to; }
  return s;
}

function normalizeEquipmentList(raw) {
  const items = normalizeStringArray(raw).map(canonicalizeEquipmentItem).filter(Boolean);
  const set = new Set();
  for (const it of items) { if (!['none', 'brak', ''].includes(it)) set.add(it); }
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

function isBreathingCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('breathing') || s.includes('breath') || s.includes('relax'); }
function isMobilityCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('mobility') || s.includes('stretch') || s.includes('flexor'); }
function isConditioningCategory(cat) { const s = String(cat || '').toLowerCase(); return s.includes('conditioning') || s.includes('cardio'); }

// ---------------------------------
// Clinical & Logic
// ---------------------------------

function safeBuildUserContext(userData) {
  let ctx = buildUserContext(userData) || {};
  const pi = clamp(toNumber(userData?.pain_intensity, 0), 0, 10);
  const di = clamp(toNumber(userData?.daily_impact, 0), 0, 10);
  if (!Number.isFinite(ctx.severityScore)) ctx.severityScore = Math.round((pi * 0.6) + (di * 0.4));
  if (typeof ctx.isSevere !== 'boolean') ctx.isSevere = ctx.severityScore >= 7;
  if (!ctx.blockedIds) ctx.blockedIds = new Set();
  return ctx;
}

function buildDynamicCategoryWeights(exercises, userData, ctx) {
  const weights = {};
  for (const ex of exercises) { const c = ex.category_id || 'uncategorized'; if (!weights[c]) weights[c] = 1.0; }
  boost(weights, 'vmo_activation', 1.5); // Always important for prehab
  const painLocs = normalizeLowerSet(userData?.pain_locations);
  if (painLocs.has('knee')) boost(weights, 'knee_stability', 2.0);
  if (painLocs.has('lumbar')) boost(weights, 'core_anti_extension', 1.5);
  for (const c of Object.keys(weights)) weights[c] = Math.max(0.1, weights[c]);
  return weights;
}
function boost(w, c, d) { if (!w[c]) w[c] = 1.0; w[c] += d; }

function filterExerciseCandidates(exercises, userData, ctx) {
  const equip = normalizeEquipmentList(userData?.equipment_available);
  const filtered = [];
  for (const ex of exercises) {
    if (ctx.blockedIds.has(ex.id)) continue;
    try {
      const res = checkExerciseAvailability(ex, ctx, { strictSeverity: true, userData });
      if (res === false || res.allowed === false) continue;
    } catch(e) {}
    
    // Manual equipment check fallback
    const req = ex.equipment.filter(x => !['none', 'bodyweight', 'mat'].includes(x));
    if (req.length > 0 && !req.every(i => equip.has(i))) continue;
    
    filtered.push(ex);
  }
  return filtered;
}

// ---------------------------------
// Scoring & Picker
// ---------------------------------

function scoreExercise(ex, section, userData, ctx, categoryWeights, state) {
  const cat = ex.category_id || 'uncategorized';
  let score = categoryWeights[cat] || 1.0;
  if (state.usedIds.has(ex.id)) return 0;
  
  if (section === 'warmup') {
    if (isBreathingCategory(cat)) score *= 1.5;
    if (isMobilityCategory(cat)) score *= 1.3;
    if (isConditioningCategory(cat)) score *= 0.2;
  } else if (section === 'cooldown') {
    if (isBreathingCategory(cat)) score *= 1.4;
    if (isMobilityCategory(cat)) score *= 1.2;
  } else {
    if (isBreathingCategory(cat)) score *= 0.1;
  }
  
  // Variety penalty
  const usage = state.weeklyUsage.get(ex.id) || 0;
  score *= (1.0 / (1.0 + usage));
  
  return Math.max(0, score);
}

function pickExerciseForSection(section, candidates, userData, ctx, categoryWeights, state) {
  const pool = candidates.filter(ex => !state.usedIds.has(ex.id));
  if (pool.length === 0) return null;
  const picked = weightedPick(pool, (ex) => scoreExercise(ex, section, userData, ctx, categoryWeights, state));
  if (picked) {
    state.usedIds.add(picked.id);
    state.weeklyUsage.set(picked.id, (state.weeklyUsage.get(picked.id) || 0) + 1);
    return JSON.parse(JSON.stringify(picked));
  }
  return null;
}

// ---------------------------------
// Time Calculation
// ---------------------------------

function parseRepsOrTimeToSeconds(val) {
  const t = String(val || '').toLowerCase();
  if (t.includes('s')) return parseInt(t, 10) || 30;
  if (t.includes('min')) return (parseInt(t, 10) || 1) * 60;
  return parseInt(t, 10) || 10;
}

function estimateExerciseDurationSeconds(ex, userData) {
  const spr = toNumber(userData?.secondsPerRep, DEFAULT_SECONDS_PER_REP);
  const rbs = toNumber(userData?.restBetweenSets, DEFAULT_REST_BETWEEN_SETS);
  const sets = parseInt(ex.sets, 10) || 1;
  const isUni = ex.is_unilateral || String(ex.reps_or_time).includes('/str');
  
  let workSec = 0;
  if (String(ex.reps_or_time).includes('s')) workSec = parseRepsOrTimeToSeconds(ex.reps_or_time);
  else workSec = parseRepsOrTimeToSeconds(ex.reps_or_time) * spr;
  
  const work = sets * workSec * (isUni ? 2 : 1);
  const rests = (sets > 1) ? (sets - 1) * rbs : 0;
  const transition = sets * (isUni ? 15 : 10);
  
  return work + rests + transition;
}

function estimateSectionDuration(exercises, userData) {
  const rbe = toNumber(userData?.restBetweenExercises, DEFAULT_REST_BETWEEN_EXERCISES);
  let sum = 0;
  exercises.forEach((ex, i) => {
    sum += estimateExerciseDurationSeconds(ex, userData);
    if (i < exercises.length - 1) sum += rbe;
  });
  return sum;
}

function estimateTotalSeconds(session, userData) {
  const rbe = toNumber(userData?.restBetweenExercises, DEFAULT_REST_BETWEEN_EXERCISES);
  const w = estimateSectionDuration(session.warmup, userData);
  const m = estimateSectionDuration(session.main, userData);
  const c = estimateSectionDuration(session.cooldown, userData);
  let total = w + m + c;
  if (session.warmup.length && session.main.length) total += rbe;
  if (session.main.length && session.cooldown.length) total += rbe;
  return total;
}

// ---------------------------------
// Volume & Pruning
// ---------------------------------

function prescribeForExercise(ex, section, userData, ctx) {
  let sets = 2;
  if (section === 'cooldown' || section === 'warmup') sets = 1;
  
  let repsOrTime = '10';
  if (isBreathingCategory(ex.category_id)) repsOrTime = '60 s';
  else if (ex.max_recommended_duration > 0) repsOrTime = '30 s';
  
  if (ex.is_unilateral) repsOrTime += '/str.';
  
  return { sets: String(sets), reps_or_time: repsOrTime };
}

/**
 * CORE LOGIC: compressSessionIfTooLong v3.8
 */
function compressSessionIfTooLong(session, userData) {
  const targetSec = clamp(toNumber(userData?.target_session_duration_min, 30), 15, 90) * 60;
  let currentSec = estimateTotalSeconds(session, userData);
  
  if (currentSec <= targetSec * 1.05) return;

  let iters = 0;
  while (currentSec > targetSec * 1.02 && iters < 50) {
    iters++;
    
    const durW = estimateSectionDuration(session.warmup, userData);
    const durM = estimateSectionDuration(session.main, userData);
    const durC = estimateSectionDuration(session.cooldown, userData);

    // Wybierz cel redukcji:
    // 1. Balance Check: Czy Warmup/Cooldown są za długie względem Main?
    let targetSection = 'main';
    if (durW > durM * 0.4 && session.warmup.length > MIN_WARMUP_EXERCISES) targetSection = 'warmup';
    else if (durC > durM * 0.4 && session.cooldown.length > MIN_COOLDOWN_EXERCISES) targetSection = 'cooldown';
    else targetSection = 'main';

    // Znajdź "najdroższe" ćwiczenie w wybranej sekcji
    let longestIdx = -1;
    let maxVal = -1;
    session[targetSection].forEach((ex, i) => {
      const d = estimateExerciseDurationSeconds(ex, userData);
      if (d > maxVal) { maxVal = d; longestIdx = i; }
    });

    if (longestIdx === -1) break;
    const ex = session[targetSection][longestIdx];
    const s = parseInt(ex.sets, 10) || 1;

    if (s > 1) {
      // KROK A: Zabierz serię
      ex.sets = String(s - 1);
    } else if (session[targetSection].length > (targetSection === 'main' ? MIN_MAIN_EXERCISES : 1)) {
      // KROK B: Usuń ćwiczenie
      session[targetSection].splice(longestIdx, 1);
    } else {
      // KROK C: Drastyczna redukcja powtórzeń/czasu (o 20%)
      const curVal = parseRepsOrTimeToSeconds(ex.reps_or_time);
      const isSec = String(ex.reps_or_time).includes('s');
      const newVal = Math.max(isSec ? 10 : 5, Math.floor(curVal * 0.8));
      ex.reps_or_time = isSec ? `${newVal} s` : (ex.is_unilateral ? `${newVal}/str.` : String(newVal));
      
      // Jeśli już jesteśmy na minimum wszystkiego w tej sekcji, spróbuj innej sekcji
      if (newVal === curVal && targetSection === 'main') break; 
    }

    currentSec = estimateTotalSeconds(session, userData);
  }
}

// ---------------------------------
// Main Builder
// ---------------------------------

function buildWeeklyPlan(candidates, categoryWeights, userData, ctx) {
  const sessions = clamp(toNumber(userData?.sessions_per_week, 3), 1, 7);
  const targetMin = clamp(toNumber(userData?.target_session_duration_min, 30), 15, 90);
  
  const plan = { id: `dynamic-${Date.now()}`, days: [] };
  const state = { usedIds: new Set(), weeklyUsage: new Map() };

  // Initial counts for 30 min: 2 warmup, 3 main, 1 cooldown
  let cW = 2, cM = 3, cC = 1;
  if (targetMin > 45) { cW = 3; cM = 5; cC = 2; }

  for (let d = 1; d <= sessions; d++) {
    const session = { dayNumber: d, title: `Sesja ${d}`, warmup: [], main: [], cooldown: [] };
    
    // Fill sections
    for (let i = 0; i < cW; i++) {
      const ex = pickExerciseForSection('warmup', candidates, userData, ctx, categoryWeights, state);
      if (ex) session.warmup.push({...ex, ...prescribeForExercise(ex, 'warmup', userData, ctx)});
    }
    for (let i = 0; i < cM; i++) {
      const ex = pickExerciseForSection('main', candidates, userData, ctx, categoryWeights, state);
      if (ex) session.main.push({...ex, ...prescribeForExercise(ex, 'main', userData, ctx)});
    }
    for (let i = 0; i < cC; i++) {
      const ex = pickExerciseForSection('cooldown', candidates, userData, ctx, categoryWeights, state);
      if (ex) session.cooldown.push({...ex, ...prescribeForExercise(ex, 'cooldown', userData, ctx)});
    }

    // Precision Optimization
    compressSessionIfTooLong(session, userData);
    
    session.estimatedDurationMin = Math.round(estimateTotalSeconds(session, userData) / 60);
    plan.days.push(session);
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
    const [eR, bR] = await Promise.all([
      client.query('SELECT * FROM exercises'),
      client.query('SELECT exercise_id FROM user_exercise_blacklist WHERE user_id = $1', [userId])
    ]);

    const exercises = eR.rows.map(normalizeExerciseRow);
    const ctx = safeBuildUserContext(userData);
    bR.rows.forEach(r => ctx.blockedIds.add(r.exercise_id));

    const cWeights = buildDynamicCategoryWeights(exercises, userData, ctx);
    const candidates = filterExerciseCandidates(exercises, userData, ctx);
    
    if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES' }) };

    const plan = buildWeeklyPlan(candidates, cWeights, userData, ctx);
    
    // Save to DB
    const sRes = await client.query('SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
    const settings = sRes.rows[0]?.settings || {};
    settings.dynamicPlanData = plan;
    settings.planMode = 'dynamic';
    settings.onboardingCompleted = true;
    settings.wizardData = userData;

    await client.query('INSERT INTO user_settings (user_id, settings) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings', [userId, JSON.stringify(settings)]);

    return { statusCode: 200, body: JSON.stringify({ plan }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  } finally { client.release(); }
};

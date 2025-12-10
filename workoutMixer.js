import { state } from './state.js';
import { getISODate, getAvailableMinutesForToday, parseSetCount } from './utils.js';
import { assistant } from './assistantEngine.js';

/**
 * WORKOUT MIXER v3.1 (Clinical Logic Integrated)
 * Teraz zawiera pełną logikę walidacji bezpieczeństwa zgodną z _clinical-rule-engine.js
 */

const CACHE_FRESHNESS_DAYS = 60;
const SECONDS_PER_REP = 4;

// Wagi dla algorytmu punktacji
const WEIGHT_FRESHNESS = 1.0;
const WEIGHT_AFFINITY = 1.2;

export const workoutMixer = {

    mixWorkout: (staticDayPlan, forceShuffle = false) => {
        if (!staticDayPlan) return null;

        console.log(`🌪️ [Mixer] Rozpoczynam miksowanie dnia: ${staticDayPlan.title}`);

        const dynamicPlan = JSON.parse(JSON.stringify(staticDayPlan));
        const sessionUsedIds = new Set();

        // Budujemy kontekst kliniczny na podstawie danych z Wizarda (frontend state)
        const clinicalCtx = buildClinicalContext();
        
        // Jeśli stan jest ostry (Severe), wyłączamy losowe tasowanie dla bezpieczeństwa
        const effectiveForceShuffle = clinicalCtx.isSevere ? false : forceShuffle;

        // 1. Prehab (Wstrzykiwanie ćwiczeń na strefy bólu)
        if (state.settings.painZones && state.settings.painZones.length > 0) {
            injectPrehabExercises(dynamicPlan, sessionUsedIds, clinicalCtx);
        }

        // 2. Iteracja po sekcjach (Warmup, Main, Cooldown)
        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!dynamicPlan[section]) return;

            dynamicPlan[section] = dynamicPlan[section].map(originalExercise => {

                const hasEquipmentForOriginal = checkEquipment(originalExercise);
                const mustSwap = !hasEquipmentForOriginal;

                const criteria = {
                    categoryId: originalExercise.categoryId,
                    targetLevel: originalExercise.difficultyLevel || 1,
                };

                const shouldShuffle = effectiveForceShuffle || mustSwap;

                const freshVariant = findBestVariant(
                    originalExercise,
                    criteria,
                    sessionUsedIds,
                    shouldShuffle,
                    mustSwap,
                    clinicalCtx
                );

                // Jeśli znaleziono lepszy wariant i jest inny niż oryginał
                if (freshVariant && (freshVariant.id !== originalExercise.exerciseId && freshVariant.id !== originalExercise.id)) {
                    sessionUsedIds.add(freshVariant.id);
                    return mergeExerciseData(originalExercise, freshVariant);
                }

                // Jeśli musieliśmy wymienić (brak sprzętu), a nie znaleźliśmy alternatywy
                if (mustSwap) {
                    originalExercise.equipmentWarning = true;
                }

                sessionUsedIds.add(originalExercise.id || originalExercise.exerciseId);
                return originalExercise;
            });
        });

        // 3. Kompresja czasu (jeśli plan przekracza dostępne minuty)
        const availableMinutes = getAvailableMinutesForToday();
        const estimatedMinutes = assistant.estimateDuration(dynamicPlan);

        if (estimatedMinutes > availableMinutes) {
            compressWorkout(dynamicPlan, availableMinutes, estimatedMinutes);
        }

        dynamicPlan._isDynamic = true;
        return dynamicPlan;
    },

    getAlternative: (originalExercise, currentId) => {
        const criteria = { categoryId: originalExercise.categoryId, targetLevel: originalExercise.difficultyLevel || 1 };
        const usedIds = new Set([currentId]);
        const clinicalCtx = buildClinicalContext();
        const variant = findBestVariant(originalExercise, criteria, usedIds, true, false, clinicalCtx);
        return variant ? mergeExerciseData(originalExercise, variant) : originalExercise;
    },

    adaptVolume: (oldEx, newDef) => adaptVolumeInternal(oldEx, newDef),
    
    getExerciseTempo: (exerciseId) => {
        const ex = state.exerciseLibrary[exerciseId];
        return ex ? (ex.defaultTempo || "Kontrolowane") : "Kontrolowane";
    },

    applyMicroDosing: (exercise) => {
        const originalSets = parseSetCount(exercise.sets);
        let newSets = originalSets + 2;
        if (newSets > 6) newSets = 6; 

        let newVal = 0;
        let isTime = false;

        const rawText = String(exercise.reps_or_time).toLowerCase();
        if (rawText.includes('s') || rawText.includes('min')) {
            isTime = true;
            const num = parseInt(rawText) || 30; 
            newVal = Math.round(num * 0.4); 
            if (newVal < 5) newVal = 5;
        } else {
            const num = parseInt(rawText) || 10;
            newVal = Math.round(num * 0.35); 
            if (newVal < 2) newVal = 2;
        }

        const libEx = state.exerciseLibrary[exercise.id || exercise.exerciseId];
        if (libEx) {
            if (isTime && libEx.maxDuration) {
                newVal = Math.min(newVal, Math.round(libEx.maxDuration * 0.5));
            } else if (!isTime && libEx.maxReps) {
                newVal = Math.min(newVal, Math.round(libEx.maxReps * 0.5));
            }
        }

        exercise.sets = newSets.toString();
        if (isTime) {
            exercise.reps_or_time = `${newVal} s`;
        } else {
            exercise.reps_or_time = exercise.reps_or_time.includes('/str') ? `${newVal}/str.` : `${newVal}`;
        }

        exercise._isMicroDose = true;
        exercise.description = (exercise.description || "") + "\n\n💡 TRENER: Zastosowano mikro-serie dla poprawy techniki.";

        return exercise;
    }
};

// ============================================================
// CORE LOGIC & SEARCH
// ============================================================

function findBestVariant(originalEx, criteria, usedIds, forceShuffle = false, mustSwap = false, clinicalCtx = null) {
    if (!criteria.categoryId) return null;

    let candidates = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ id: id, ...data }))
        .filter(ex => {
            // 1. Zgodność kategorii
            if (ex.categoryId !== criteria.categoryId) return false;
            
            // 2. Poziom trudności (chyba że musimy wymienić za wszelką cenę)
            if (!mustSwap) {
                const lvl = ex.difficultyLevel || 1;
                if (Math.abs(lvl - criteria.targetLevel) > 1) return false;
            }
            
            // 3. Wykluczenia podstawowe
            if (state.blacklist.includes(ex.id)) return false;
            if (usedIds.has(ex.id)) return false;
            
            // 4. Sprzęt
            if (!checkEquipment(ex)) return false;
            
            // 5. WALIDACJA KLINICZNA (KLUCZOWE!)
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;
            
            return true;
        });

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(ex => {
        let score = 0;

        // A. Świeżość (-100 do +60)
        const lastDate = getLastPerformedDate(ex.id, ex.name);
        if (!lastDate) {
            score += 100 * WEIGHT_FRESHNESS;
        } else {
            const daysSince = (new Date() - lastDate) / (1000 * 60 * 60 * 24);
            const freshnessScore = Math.min(daysSince, CACHE_FRESHNESS_DAYS);
            if (daysSince < 2) score -= 100;
            else score += freshnessScore * WEIGHT_FRESHNESS;
        }

        // B. Affinity (Freq) -50 do +50
        const userPref = state.userPreferences[ex.id] || { score: 0 };
        score += (userPref.score || 0) * WEIGHT_AFFINITY;

        // C. Bonus za oryginał (stabilność planu)
        if (!forceShuffle && !mustSwap && (ex.id === originalEx.exerciseId || ex.id === originalEx.id)) {
            score += 60;
        }

        // D. Random Factor
        const randomFactor = forceShuffle ? (Math.random() * 50) : (Math.random() * 10);
        score += randomFactor;

        return { ex, score };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates.length > 0) {
        const winner = scoredCandidates[0].ex;
        winner._score = scoredCandidates[0].score;
        return winner;
    }
    return null;
}

// ============================================================
// CLINICAL RULE ENGINE (FRONTEND PORT)
// ============================================================

/**
 * Buduje kontekst kliniczny na podstawie danych z Wizarda (state.settings.wizardData).
 * Odzwierciedla logikę z backendu (_clinical-rule-engine.js).
 */
function buildClinicalContext() {
    const wizardData = state.settings.wizardData || {};
    
    // 1. Wzorce ruchu (Flexion/Extension intolerance)
    const tolerancePattern = detectTolerancePattern(wizardData.trigger_movements, wizardData.relief_movements);

    // 2. Analiza bólu i Severity
    const painChar = wizardData.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');
    const painInt = parseInt(wizardData.pain_intensity) || 0;
    const impact = parseInt(wizardData.daily_impact) || 0;

    let severityScore = (painInt + impact) / 2;
    if (isPainSharp) severityScore *= 1.2;
    const isSevere = severityScore >= 6.5;

    // 3. Filtry bólu (strefy)
    const painLocs = wizardData.pain_locations || [];
    const painFilters = new Set(painLocs);
    if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');

    // 4. Restrykcje fizyczne
    const physicalRestrictions = wizardData.physical_restrictions || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        painFilters,
        physicalRestrictions
    };
}

/**
 * Główna funkcja walidująca bezpieczeństwo ćwiczenia w Mixerze.
 * Łączy flagę serwerową (isAllowed) z lokalną walidacją kontekstu.
 */
function passesMixerClinicalRules(ex, ctx) {
    if (!ex || !ctx) return true;

    // A. WALIDACJA SERWEROWA (Safety Net)
    // Jeśli backend uznał ćwiczenie za niedozwolone (np. brak sprzętu lub ciężki stan), odrzucamy.
    // Uwaga: 'isAllowed' może być undefined dla starych danych, wtedy zakładamy true (i polegamy na lokalnej walidacji).
    if (ex.isAllowed === false) {
        // Wyjątek: Jeśli powód to sprzęt, a my w mixerze pozwalamy na brak sprzętu (co jest sprawdzane wcześniej),
        // to moglibyśmy to przepuścić. Ale funkcja checkEquipment w mixerze już to obsłużyła.
        // Tutaj respektujemy decyzję medyczną serwera.
        return false;
    }

    // B. WALIDACJA LOKALNA (Biomechanika & Wzorce)
    // Nawet jeśli serwer pozwolił, sprawdzamy czy ćwiczenie pasuje do aktualnych restrykcji
    // (np. jeśli użytkownik zmienił ustawienia, a nie przeładował całej aplikacji).

    // 1. Restrykcje fizyczne (np. brak klękania)
    if (violatesRestrictions(ex, ctx.physicalRestrictions)) {
        return false;
    }

    // 2. Wzorce tolerancji (Zgięcie/Wyprost)
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) {
        return false;
    }

    // 3. Tryb Ostry (Severity) - Tylko ćwiczenia z tagiem ulgi
    if (ctx.isSevere) {
        const zones = ex.painReliefZones || [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) {
            return false; 
        }
    }

    return true;
}

// --- Helpery Kliniczne (Portowane z Backend) ---

function detectTolerancePattern(triggers, reliefs) {
    const t = triggers || [];
    const r = reliefs || [];
    if (t.includes('bending_forward') || r.includes('bending_backward')) return 'flexion_intolerant';
    if (t.includes('bending_backward') || r.includes('bending_forward')) return 'extension_intolerant';
    return 'neutral';
}

function violatesRestrictions(ex, restrictions) {
    const plane = ex.primaryPlane || 'multi';
    const pos = ex.position || null;

    if (restrictions.includes('no_kneeling') && (pos === 'kneeling' || pos === 'quadruped')) return true;
    if (restrictions.includes('no_twisting') && plane === 'rotation') return true;
    if (restrictions.includes('no_floor_sitting') && pos === 'sitting') return true;
    
    return false;
}

function passesTolerancePattern(ex, tolerancePattern) {
    const plane = ex.primaryPlane || 'multi';
    const zones = ex.painReliefZones || [];

    if (tolerancePattern === 'flexion_intolerant') {
        // Jeśli to zgięcie, musi być oznaczone jako bezpieczne dla tej grupy
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) return false;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) return false;
    }
    return true;
}

// ============================================================
// DATA HELPERS
// ============================================================

function checkEquipment(exercise) {
    if (!state.settings.equipment || state.settings.equipment.length === 0) return true;
    if (!exercise.equipment) return true;
    
    const reqEq = Array.isArray(exercise.equipment) 
        ? exercise.equipment.join(',').toLowerCase() 
        : exercise.equipment.toLowerCase();

    if (reqEq.includes('brak') || reqEq.includes('none') || reqEq.includes('bodyweight') || reqEq === '') return true;
    
    const userEq = state.settings.equipment.map(e => e.toLowerCase());
    const requirements = reqEq.split(',').map(s => s.trim());
    
    return requirements.every(req => userEq.some(owned => owned.includes(req) || req.includes(owned)));
}

function adaptVolumeInternal(originalEx, newEx) {
    const oldVal = (originalEx.reps_or_time || "").toString();
    const isOldTimeBased = /s\b|min\b|:/.test(oldVal);
    const newMaxDuration = newEx.maxDuration || 0;
    const newMaxReps = newEx.maxReps || 0;
    let newVal = oldVal;

    // Konwersja Czas <-> Powtórzenia
    if (isOldTimeBased && newMaxReps > 0 && newMaxDuration === 0) {
        const seconds = parseSeconds(oldVal);
        let reps = Math.round(seconds / SECONDS_PER_REP);
        reps = Math.min(reps, newMaxReps);
        reps = Math.max(5, reps);
        newVal = `${reps}`;
    } else if (!isOldTimeBased && newMaxDuration > 0 && newMaxReps === 0) {
        const reps = parseReps(oldVal);
        let seconds = reps * SECONDS_PER_REP;
        seconds = Math.min(seconds, newMaxDuration);
        seconds = Math.max(15, seconds);
        newVal = `${seconds} s`;
    } else {
        // Skalowanie w tej samej domenie
        if (isOldTimeBased && newMaxDuration > 0) {
            const seconds = parseSeconds(oldVal);
            if (seconds > newMaxDuration) newVal = `${newMaxDuration} s`;
        } else if (!isOldTimeBased && newMaxReps > 0) {
            const reps = parseReps(oldVal);
            if (reps > newMaxReps) newVal = `${newMaxReps}`;
        }
    }
    return newVal;
}

function mergeExerciseData(original, variant) {
    let merged = {
        ...original,
        id: variant.id,
        exerciseId: variant.id,
        name: variant.name,
        description: variant.description,
        equipment: variant.equipment,
        youtube_url: variant.youtube_url,
        animationSvg: variant.animationSvg,
        reps_or_time: adaptVolumeInternal(original, variant),
        sets: original.sets,
        tempo_or_iso: variant.defaultTempo || "Kontrolowane",
        isDynamicSwap: (original.exerciseId !== variant.id),
        isSwapped: (original.exerciseId !== variant.id),
        originalName: (original.exerciseId !== variant.id) ? original.name : null
    };

    // Obsługa Unilateral
    if (variant.isUnilateral && !merged.reps_or_time.includes("/str")) {
        if (merged.reps_or_time.includes("s")) merged.reps_or_time = merged.reps_or_time.replace("s", "s/str.");
        else merged.reps_or_time = `${merged.reps_or_time}/str.`;
        
        if (parseSetCount(original.sets) === 1) merged.sets = "2";
    }

    return merged;
}

function parseSeconds(val) { const v = val.toLowerCase(); return v.includes('min') ? parseFloat(v) * 60 : (parseInt(v) || 45); }
function parseReps(val) { return parseInt(val) || 10; }

function injectPrehabExercises(plan, usedIds, clinicalCtx) {
    if (!plan.warmup) plan.warmup = [];
    const libraryArray = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    
    state.settings.painZones.forEach(zone => {
        const rehabCandidates = libraryArray.filter(ex => {
            if (!ex.painReliefZones || !ex.painReliefZones.includes(zone)) return false;
            if (usedIds.has(ex.id)) return false;
            if (!checkEquipment(ex)) return false;
            
            // Walidacja kliniczna dla prehaby
            if (!passesMixerClinicalRules(ex, clinicalCtx)) return false;
            
            return true;
        });
        
        if (rehabCandidates.length > 0) {
            const chosen = rehabCandidates[Math.floor(Math.random() * rehabCandidates.length)];
            plan.warmup.unshift({ 
                ...chosen, 
                exerciseId: chosen.id, 
                sets: "1", 
                reps_or_time: "45 s", 
                tempo_or_iso: chosen.defaultTempo || "Izometria", 
                isPersonalized: true, 
                section: "warmup", 
                isUnilateral: chosen.isUnilateral 
            });
            usedIds.add(chosen.id);
        }
    });
}

function compressWorkout(plan, targetMin, currentMin) {
    if (plan.main) { plan.main.forEach(ex => { const c = parseSetCount(ex.sets); if (c > 1) ex.sets = String(c - 1); }); }
    plan.compressionApplied = true; plan.targetMinutes = targetMin;
}

function getLastPerformedDate(exerciseId, exerciseName) {
    let latestDate = null;
    Object.keys(state.userProgress).forEach(dateKey => {
        state.userProgress[dateKey].forEach(session => {
            if (!session.sessionLog) return;
            if (session.sessionLog.find(l => (l.exerciseId === exerciseId) || (l.name === exerciseName))) {
                const d = new Date(dateKey); if (!latestDate || d > latestDate) latestDate = d;
            }
        });
    });
    return latestDate;
}
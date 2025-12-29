// ExerciseApp/clinicalEngine.js
// Frontendowa wersja silnika reguł (Ported from _clinical-rule-engine.js)

export const KNOWN_POSITIONS = [
    'standing', 'sitting', 'kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
];

const DIFFICULTY_MAP = {
    'none': 1, 'occasional': 2, 'regular': 3, 'advanced': 4
};

// --- HELPERY KONTEKSTU ---

export function detectTolerancePattern(triggers, reliefs) {
    if (!Array.isArray(triggers)) triggers = [];
    if (!Array.isArray(reliefs)) reliefs = [];

    if (triggers.includes('bending_forward') || reliefs.includes('bending_backward')) return 'flexion_intolerant';
    if (triggers.includes('bending_backward') || reliefs.includes('bending_forward')) return 'extension_intolerant';
    return 'neutral';
}

export function buildClinicalContext(wizardData) {
    if (!wizardData) return null;

    const tolerancePattern = detectTolerancePattern(wizardData.trigger_movements, wizardData.relief_movements);
    const painChar = wizardData.pain_character || [];
    const isPainSharp = painChar.includes('sharp') || painChar.includes('burning') || painChar.includes('radiating');
    const painInt = parseInt(wizardData.pain_intensity) || 0;
    const impact = parseInt(wizardData.daily_impact) || 0;

    let severityScore = (painInt + impact) / 2;
    if (isPainSharp) severityScore *= 1.2;
    const isSevere = severityScore >= 6.5;

    const experienceKey = wizardData.exercise_experience;
    const baseDifficultyCap = DIFFICULTY_MAP[experienceKey] || 2;
    let difficultyCap = baseDifficultyCap;

    if (isSevere) {
        difficultyCap = Math.min(baseDifficultyCap, 2);
    } else if (isPainSharp && severityScore >= 4) {
        difficultyCap = Math.min(baseDifficultyCap, 3);
    }

    const painLocs = wizardData.pain_locations || [];
    const painFilters = new Set();
    if (painLocs.length > 0) {
        painLocs.forEach(loc => painFilters.add(loc));
        if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('lumbar_general');
        // Jeśli ból rzutowany (sciatica) lub kolano, też dodajemy
        if (painLocs.includes('sciatica')) painFilters.add('sciatica');
        if (painLocs.includes('knee')) painFilters.add('knee');
    } else {
        painFilters.add('lumbar_general');
        painFilters.add('thoracic');
    }

    const userEquipment = (wizardData.equipment_available || []).map(e => e.toLowerCase());
    const physicalRestrictions = wizardData.physical_restrictions || [];
    const medicalDiagnosis = wizardData.medical_diagnosis || [];

    return {
        tolerancePattern,
        isSevere,
        severityScore,
        difficultyCap,
        painFilters,
        userEquipment,
        physicalRestrictions,
        medicalDiagnosis
    };
}

// --- LOGIKA WALIDACJI (Core Rules) ---

export function checkEquipment(ex, userEquipment) {
    if (!userEquipment) return true; 

    let requirements = [];
    if (Array.isArray(ex.equipment)) {
        requirements = ex.equipment;
    } else if (typeof ex.equipment === 'string') {
        requirements = ex.equipment.split(',').map(e => e.trim());
    } else {
        return true; 
    }

    if (requirements.length === 0) return true;

    const isNone = requirements.some(req => {
        const r = req.toLowerCase();
        return r.includes('brak') || r.includes('none') || r.includes('masa') || r === '';
    });
    if (isNone) return true;

    return requirements.every(req => {
        const reqLower = req.toLowerCase();
        return userEquipment.some(owned => owned.includes(reqLower) || reqLower.includes(owned));
    });
}

export function violatesRestrictions(ex, ctx) {
    const restrictions = ctx.physicalRestrictions;
    const diagnosis = ctx.medicalDiagnosis || [];
    
    const plane = ex.primaryPlane || 'multi';
    const pos = ex.position || null;
    const cat = ex.categoryId || '';
    const impact = ex.impactLevel || 'low';
    const kneeLoad = ex.kneeLoadLevel || 'low';

    // 1. Klękanie
    if (restrictions.includes('no_kneeling')) {
        if (pos === 'kneeling' || pos === 'quadruped') return true;
    }

    // 2. Skręty
    if (restrictions.includes('no_twisting')) {
        if (plane === 'rotation') return true;
    }

    // 3. Siedzenie na podłodze
    if (restrictions.includes('no_floor_sitting')) {
        if (pos === 'sitting') return true;
    }

    // 4. Uderzenia / Skoki (High Impact)
    if (restrictions.includes('no_high_impact')) {
        if (impact === 'high') return true;
        const highImpactCats = ['plyometrics', 'cardio'];
        if (!ex.impactLevel && highImpactCats.includes(cat)) return true;
    }

    // 5. Uraz stopy (Non-weight bearing)
    if (restrictions.includes('foot_injury')) {
        if (ex.isFootLoading === true) return true;
        const blockedPositions = ['standing', 'kneeling', 'quadruped', 'lunge'];
        if (blockedPositions.includes(pos)) return true;
        const blockedCategories = ['squats', 'lunges', 'calves', 'plyometrics', 'cardio'];
        if (blockedCategories.includes(cat)) return true;
    }

    // 6. NOWE: Ochrona Kolan (Knee Protection Logic)
    // Jeśli user ma ostry ból kolana lub specyficzną diagnozę, blokujemy duże obciążenia
    const hasKneeIssue = ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior');
    const isChondromalacia = diagnosis.includes('chondromalacia') || diagnosis.includes('runners_knee');
    
    // Jeśli stan ostry (Severity >= 6.5) i ból kolana -> blokujemy High Load
    if (hasKneeIssue && ctx.isSevere && kneeLoad === 'high') {
        return true;
    }

    // Jeśli specyficzna diagnoza (nawet nie w stanie ostrym) -> blokujemy High Load (np. głęboki przysiad)
    if (isChondromalacia && kneeLoad === 'high') {
        return true;
    }

    // Jeśli użytkownik ma wyraźny zakaz głębokich przysiadów w restrykcjach
    if (restrictions.includes('no_deep_squat') && kneeLoad === 'high') {
        return true;
    }

    return false;
}

export function passesTolerancePattern(ex, tolerancePattern) {
    const plane = ex.primaryPlane || 'multi';
    const zones = Array.isArray(ex.painReliefZones) ? ex.painReliefZones : [];

    if (tolerancePattern === 'flexion_intolerant') {
        if (plane === 'flexion' && !zones.includes('lumbar_flexion_intolerant')) return false;
    } else if (tolerancePattern === 'extension_intolerant') {
        if (plane === 'extension' && !zones.includes('lumbar_extension_intolerant')) return false;
    }
    return true;
}

export function checkExerciseAvailability(ex, ctx, options = {}) {
    const { ignoreDifficulty = false, ignoreEquipment = false, strictSeverity = true } = options;

    // 1. Blacklist
    if (ctx.blockedIds && ctx.blockedIds.has(ex.id)) return { allowed: false, reason: 'blacklisted' };

    // 2. Sprzęt
    if (!ignoreEquipment && !checkEquipment(ex, ctx.userEquipment)) return { allowed: false, reason: 'missing_equipment' };

    // 3. Trudność
    const exLevel = ex.difficultyLevel || 1;
    if (!ignoreDifficulty && ctx.difficultyCap && exLevel > ctx.difficultyCap) return { allowed: false, reason: 'too_hard_calculated' };

    // 4. Restrykcje (w tym Kolana)
    if (violatesRestrictions(ex, ctx)) return { allowed: false, reason: 'physical_restriction' };

    // 5. Wzorce
    if (!passesTolerancePattern(ex, ctx.tolerancePattern)) return { allowed: false, reason: 'biomechanics_mismatch' };

    // 6. Severity (Tryb ostry)
    if (strictSeverity && ctx.isSevere) {
        // Spine Load Check
        const spineLoad = ex.spineLoadLevel || 'low';
        if (spineLoad === 'high') return { allowed: false, reason: 'severity_filter' };

        // Knee Load Check (w trybie ostrym zawsze unikamy high load na kolana, jeśli ból dotyczy kolana)
        // Logika ta jest już częściowo w violatesRestrictions, ale tutaj jako double-check
        const kneeLoad = ex.kneeLoadLevel || 'low';
        if ((ctx.painFilters.has('knee') || ctx.painFilters.has('knee_anterior')) && kneeLoad === 'high') {
            return { allowed: false, reason: 'severity_filter' };
        }

        const zones = Array.isArray(ex.painReliefZones) ? ex.painReliefZones : [];
        const helpsZone = zones.some(z => ctx.painFilters.has(z));
        if (!helpsZone) return { allowed: false, reason: 'severity_filter' };
    }

    return { allowed: true, reason: null };
}
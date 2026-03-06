// ExerciseApp/shared/clinical-rules-core.js

const ClinicalRulesCore = (() => {
    const DIFFICULTY_MAP = { none: 1, occasional: 2, regular: 3, advanced: 4 };

    const KNOWN_POSITIONS = [
        'standing', 'sitting', 'kneeling', 'half_kneeling', 'quadruped', 'supine', 'prone', 'side_lying'
    ];

    const norm = (v) => String(v || '').trim().toLowerCase();
    const getField = (ex, snake, camel, fallback = '') => ex?.[snake] ?? ex?.[camel] ?? fallback;

    const isRotationalPlane = (p) => {
        const plane = norm(p);
        return plane === 'rotation' || plane === 'transverse';
    };

    const computeAcuteGuard = (data) => {
        const isAcute = data.symptom_onset === 'sudden' || data.symptom_onset === 'post_traumatic' || data.symptom_duration === 'lt_6_weeks';
        const isWorsening = data.symptom_trend === 'worsening';
        return { isAcute, isWorsening, isAcuteWorsening: isAcute && isWorsening };
    };

    const getToleranceBias = (tolerancePattern, confirmedDirectionalIntolerance) => {
        const strength = confirmedDirectionalIntolerance ? 1 : (tolerancePattern === 'neutral' ? 0 : 0.35);
        return { pattern: tolerancePattern, strength, confirmed: confirmedDirectionalIntolerance };
    };

    const detectTolerancePattern = (triggers, reliefs) => {
        const safeTriggers = Array.isArray(triggers) ? triggers : [];
        const safeReliefs = Array.isArray(reliefs) ? reliefs : [];

        if (safeTriggers.includes('bending_forward') || safeReliefs.includes('bending_backward')) return 'flexion_intolerant';
        if (safeTriggers.includes('bending_backward') || safeReliefs.includes('bending_forward')) return 'extension_intolerant';
        return 'neutral';
    };

    const isDirectionalMismatch = (ex, tolerancePattern) => {
        const plane = norm(getField(ex, 'primary_plane', 'primaryPlane', 'multi'));
        const tags = Array.isArray(ex?.tolerance_tags) ? ex.tolerance_tags : (Array.isArray(ex?.toleranceTags) ? ex.toleranceTags : []);
        const profile = getField(ex, 'spineMotionProfile', 'spineMotionProfile', 'neutral');

        if (tolerancePattern === 'flexion_intolerant') {
            if (plane === 'flexion' && !tags.includes('ok_for_flexion_intolerant')) return true;
            if (profile === 'lumbar_flexion_loaded') return true;
        } else if (tolerancePattern === 'extension_intolerant') {
            if (plane === 'extension' && !tags.includes('ok_for_extension_intolerant')) return true;
            if (profile === 'lumbar_extension_loaded') return true;
        }

        return false;
    };

    const createClinicalRules = (deps = {}) => {
        const normalizeWizardData = typeof deps.normalizeWizardData === 'function' ? deps.normalizeWizardData : ((data) => data || {});
        const derivePainZoneSet = typeof deps.derivePainZoneSet === 'function'
            ? deps.derivePainZoneSet
            : ((painLocations = []) => new Set(Array.isArray(painLocations) ? painLocations.map(norm).filter(Boolean) : []));
        const normalizeDiagnosisArray = typeof deps.normalizeDiagnosisArray === 'function'
            ? deps.normalizeDiagnosisArray
            : ((raw = []) => Array.isArray(raw) ? raw.map(norm).filter(Boolean) : []);

        const buildClinicalContext = (wizardData) => {
            if (!wizardData) return null;
            const data = normalizeWizardData(wizardData || {});
            const tolerancePattern = detectTolerancePattern(data.trigger_movements, data.relief_movements);
            const directionalNegative24hCount = Math.max(0, parseInt(data.directional_negative_24h_count, 10) || 0);
            const confirmedDirectionalIntolerance = directionalNegative24hCount >= 2;
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
            if (painLocs.length > 0) {
                painLocs.forEach((loc) => painFilters.add(loc));
                if (painLocs.includes('si_joint') || painLocs.includes('hip')) painFilters.add('low_back');
                if (painLocs.includes('low_back') || painLocs.includes('lumbar') || painLocs.includes('lumbar_general')) {
                    painFilters.add('low_back');
                    painFilters.add('lumbar_general');
                }
                if (painLocs.includes('knee')) painFilters.add('knee');
            } else {
                painFilters.add('low_back');
                painFilters.add('lumbar_general');
                painFilters.add('thoracic');
            }

            return {
                tolerancePattern,
                toleranceBias: getToleranceBias(tolerancePattern, confirmedDirectionalIntolerance),
                isSevere,
                severityScore,
                difficultyCap,
                painFilters,
                painZoneSet: derivePainZoneSet(painLocs),
                userEquipment: new Set((data.equipment_available || []).map(norm).filter(Boolean)),
                physicalRestrictions: data.physical_restrictions || [],
                medicalDiagnosis: normalizeDiagnosisArray(data.medical_diagnosis),
                blockedIds: new Set(),
                symptomProfile: {
                    onset: data.symptom_onset || '',
                    duration: data.symptom_duration || '',
                    trend: data.symptom_trend || ''
                },
                directionalNegative24hCount,
                confirmedDirectionalIntolerance
            };
        };

        const checkEquipment = (ex, userEquipmentSet) => {
            if (!userEquipmentSet) return true;
            const exEquipRaw = Array.isArray(ex.equipment) ? ex.equipment : (ex.equipment ? ex.equipment.split(',') : []);
            const requirements = exEquipRaw.map(norm).filter(Boolean);
            const ignorable = new Set(['none', 'brak', '', 'brak sprzętu', 'masa własna', 'bodyweight']);
            const required = requirements.filter((item) => !ignorable.has(item));
            if (required.length === 0) return true;
            if (userEquipmentSet.size === 0) return false;
            return required.every((item) => userEquipmentSet.has(item));
        };

        const violatesRestrictions = (ex, ctx) => {
            const restrictions = ctx.physicalRestrictions || [];
            const diagnosis = ctx.medicalDiagnosis || [];

            const plane = norm(getField(ex, 'primary_plane', 'primaryPlane', 'multi'));
            const pos = norm(ex.position);
            const impact = norm(getField(ex, 'impact_level', 'impactLevel', 'low'));
            const kneeLoad = norm(getField(ex, 'knee_load_level', 'kneeLoadLevel', 'low'));

            if (restrictions.includes('no_kneeling') && ['kneeling', 'quadruped', 'half_kneeling'].includes(pos)) return true;
            if (restrictions.includes('no_twisting') && isRotationalPlane(plane)) return true;
            if (restrictions.includes('no_floor_sitting') && pos === 'sitting') return true;
            if (restrictions.includes('no_high_impact') && impact === 'high') return true;

            if (restrictions.includes('foot_injury')) {
                if (ex.is_foot_loading === true || ex.isFootLoading === true) return true;
                if (impact === 'medium' || impact === 'high') return true;
                if (['standing', 'lunge', 'squat', 'half_kneeling'].includes(pos)) return true;
            }

            const hasKneeIssue = ctx.painFilters?.has('knee') || ctx.painFilters?.has('knee_anterior');
            if (hasKneeIssue && kneeLoad === 'high') return true;
            if (diagnosis.includes('chondromalacia') && kneeLoad === 'high') return true;
            if (restrictions.includes('no_deep_squat') && kneeLoad === 'high') return true;

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
        };

        const passesTolerancePattern = (ex, tolerancePattern) => !isDirectionalMismatch(ex, tolerancePattern);

        const checkExerciseAvailability = (ex, ctx, options = {}) => {
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
        };

        return {
            buildClinicalContext,
            checkEquipment,
            violatesRestrictions,
            passesTolerancePattern,
            checkExerciseAvailability,
            detectTolerancePattern
        };
    };

    return {
        KNOWN_POSITIONS,
        isRotationalPlane,
        createClinicalRules
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.__ClinicalRulesCore = ClinicalRulesCore;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClinicalRulesCore;
}

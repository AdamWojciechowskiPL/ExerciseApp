'use strict';

const { pool, getUserIdFromEvent } = require('./_auth-helper.js');
const { calculateFatigueProfile } = require('./_fatigue-calculator.js');
const { derivePainZoneSet, normalizeLowerSet } = require('./_pain-taxonomy.js');
const { CANONICAL, normalizeWizardPayload } = require('./_wizard-canonical.js');
const {
    initializePhaseState,
    resolveActivePhase,
    applySuggestedUpdate,
    applyGoalChangePolicy
} = require('./_phase-manager.js');
const { getPhaseConfig, pickTargetSessions } = require('./phase-catalog.js');

const {
    safeJsonParse,
    hasPositiveMedicalScreening,
    hasHardStopMedicalScreening,
    hasConditionalMedicalScreening,
    isActivityInsufficientForHighIntensity,
    isHighIntensityIntent,
    isCautiousOnlyIntent,
    validateGeneratePlanRequest
} = require('./generate-plan/request-validation.js');
const { fetchPlanGenerationData } = require('./generate-plan/repositories.js');
const {
    buildDynamicCategoryWeights,
    scoreExercise,
    selectMicrocycleAnchors,
    deriveFamilyKey,
    analyzePainResponse,
    analyzeRpeTrend,
    calculateScoreComponents
} = require('./generate-plan/scoring.js');
const {
    normalizeExerciseRow,
    safeBuildUserContext,
    validateExerciseRecord,
    filterExerciseCandidates
} = require('./generate-plan/candidate-filtering.js');
const { prescribeForExercise } = require('./generate-plan/prescription.js');
const { buildRollingPlan } = require('./generate-plan/plan-builder.js');
const { validateAndCorrectPlan } = require('./generate-plan/plan-validator.js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    let userId;
    try { userId = await getUserIdFromEvent(event); } catch (e) { return { statusCode: 401 }; }

    const requestValidation = validateGeneratePlanRequest(event, userId, {
        normalizeWizardPayload,
        normalizeLowerSet,
        CANONICAL
    });
    if (!requestValidation.ok) return requestValidation.response;

    const { userData } = requestValidation;

    const client = await pool.connect();
    try {
        const generationData = await fetchPlanGenerationData(client, userId, userData, {
            normalizeExerciseRow,
            safeBuildUserContext,
            analyzeRpeTrend,
            analyzePainResponse,
            calculateFatigueProfile
        });

        const {
            exercises,
            ctx,
            preferencesMap,
            historyMap,
            progressionMap,
            paceMap,
            rpeData,
            painData,
            fatigueProfile
        } = generationData;

        let settings = generationData.settings || {};
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

        ctx.painStatus = painData.painStatus;

        console.log(`[PlanGen] User: ${userId}, Phase: ${phaseContext.phaseId} (Override: ${phaseContext.isOverride}), Fatigue: ${fatigueProfile.fatigueScoreNow}, PainStatus: ${painData.painStatus}`);

        const cWeights = buildDynamicCategoryWeights(exercises, userData, ctx);
        rpeData.volumeModifier = rpeData.volumeModifier * painData.painModifier;

        const devDebugMode = String(event.queryStringParameters?.debug || userData.debug_mode || '').toLowerCase() === 'true';
        const filterResult = filterExerciseCandidates(exercises, userData, ctx, fatigueProfile, rpeData, { debug: devDebugMode });
        const candidates = devDebugMode ? filterResult.candidates : filterResult;

        try {
            const debugPZones = derivePainZoneSet(userData.pain_locations);
            const debugState = {
                usedIds: new Set(),
                weeklyUsage: new Map(),
                weeklyCategoryUsage: new Map(),
                weeklyFamilyUsage: new Map(),
                sessionCategoryUsage: new Map(),
                sessionFamilyUsage: new Map(),
                sessionPlaneUsage: new Map(),
                historyMap: historyMap || {},
                preferencesMap: preferencesMap || {},
                progressionMap: progressionMap || { sources: new Map(), targets: new Set() },
                anchorFamilies: new Set(),
                anchorTargetExposure: 2
            };

            if (devDebugMode && Array.isArray(filterResult.diagnostics)) {
                console.log('=== CLINICAL FILTER DIAGNOSTICS ===');
                console.log(JSON.stringify(filterResult.diagnostics, null, 2));
                console.log('===================================');
            }

            const debugLog = candidates.map(ex => {
                const finalScoreMain = calculateScoreComponents(ex, 'main', userData, ctx, cWeights, debugState, debugPZones, phaseContext, fatigueProfile);
                return {
                    id: ex.id,
                    name: ex.name,
                    cat: ex.category_id,
                    w_main: finalScoreMain.finalScore,
                    breakdown: finalScoreMain
                };
            }).sort((a, b) => b.w_main - a.w_main);

            console.log('=== CLINICALLY ALLOWED EXERCISES & WEIGHTS ===');
            console.log(JSON.stringify(debugLog, null, 2));
            console.log('==============================================');
        } catch (err) {
            console.error('Error generating weight logs:', err);
        }

        if (candidates.length < 5) return { statusCode: 400, body: JSON.stringify({ error: 'NO_SAFE_EXERCISES' }) };

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
module.exports.analyzePainResponse = analyzePainResponse;
module.exports.filterExerciseCandidates = filterExerciseCandidates;
module.exports.safeJsonParse = safeJsonParse;
module.exports.hasPositiveMedicalScreening = hasPositiveMedicalScreening;
module.exports.hasHardStopMedicalScreening = hasHardStopMedicalScreening;
module.exports.hasConditionalMedicalScreening = hasConditionalMedicalScreening;
module.exports.isActivityInsufficientForHighIntensity = isActivityInsufficientForHighIntensity;
module.exports.isHighIntensityIntent = isHighIntensityIntent;
module.exports.isCautiousOnlyIntent = isCautiousOnlyIntent;

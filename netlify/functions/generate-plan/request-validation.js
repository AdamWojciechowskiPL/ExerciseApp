'use strict';

const HIGH_INTENSITY_PRIMARY_GOALS = new Set(['fat_loss', 'sport_return']);
const CAUTIOUS_PRIMARY_GOALS = new Set(['mobility', 'pain_relief', 'prevention']);
const HARD_STOP_MEDICAL_SCREENING_FIELDS = new Set([
    'chest_pain_exertional',
    'syncope_exertional',
    'dyspnea_disproportionate',
    'recent_cardiac_event',
    'uncontrolled_hypertension'
]);
const CONDITIONAL_MEDICAL_SCREENING_FIELDS = new Set(['cvd', 'metabolic', 'renal']);
const HIGH_INTENSITY_ACTIVITY_BLOCK_LIST = new Set(['inactive', 'light_regular']);

function safeJsonParse(body) {
    if (!body) return {};
    try { return JSON.parse(body); } catch (e) { return null; }
}

function hasPositiveMedicalScreening(clearance = {}) {
    if (!clearance || typeof clearance !== 'object') return false;
    for (const [key, value] of Object.entries(clearance)) {
        if (key === 'none') continue;
        if (value === true) return true;
    }
    return false;
}

function hasHardStopMedicalScreening(clearance = {}) {
    if (!clearance || typeof clearance !== 'object') return false;
    for (const field of HARD_STOP_MEDICAL_SCREENING_FIELDS) {
        if (clearance[field] === true) return true;
    }
    return false;
}

function hasConditionalMedicalScreening(clearance = {}) {
    if (!clearance || typeof clearance !== 'object') return false;
    for (const field of CONDITIONAL_MEDICAL_SCREENING_FIELDS) {
        if (clearance[field] === true) return true;
    }
    return false;
}

function isActivityInsufficientForHighIntensity(userData = {}) {
    const status = String(userData.current_activity_status || '').toLowerCase();
    return HIGH_INTENSITY_ACTIVITY_BLOCK_LIST.has(status);
}

function isHighIntensityIntent(userData = {}) {
    const goal = String(userData.primary_goal || '').toLowerCase();
    const componentWeights = Array.isArray(userData.session_component_weights)
        ? userData.session_component_weights.map((v) => String(v || '').toLowerCase())
        : [];
    const focusLocs = Array.isArray(userData.focus_locations)
        ? userData.focus_locations.map((v) => String(v || '').toLowerCase())
        : [];
    return HIGH_INTENSITY_PRIMARY_GOALS.has(goal)
        || componentWeights.includes('conditioning')
        || focusLocs.includes('metabolic');
}

function isCautiousOnlyIntent(userData = {}) {
    const goal = String(userData.primary_goal || '').toLowerCase();
    const componentWeights = Array.isArray(userData.session_component_weights)
        ? userData.session_component_weights.map((v) => String(v || '').toLowerCase())
        : [];
    const focusLocs = Array.isArray(userData.focus_locations)
        ? userData.focus_locations.map((v) => String(v || '').toLowerCase())
        : [];
    const hasConditioning = componentWeights.includes('conditioning');
    const hasMetabolicFocus = focusLocs.includes('metabolic');
    return CAUTIOUS_PRIMARY_GOALS.has(goal) && !hasConditioning && !hasMetabolicFocus;
}

function validateGeneratePlanRequest(event, userId, { normalizeWizardPayload, normalizeLowerSet, CANONICAL }) {
    if (event.httpMethod !== 'POST') return { ok: false, response: { statusCode: 405 } };

    const parsedUserData = safeJsonParse(event.body);
    if (!parsedUserData) return { ok: false, response: { statusCode: 400 } };

    const userData = normalizeWizardPayload(parsedUserData);

    const redFlagsRaw = parsedUserData?.red_flags;
    if (redFlagsRaw !== undefined && !Array.isArray(redFlagsRaw)) {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'INVALID_RED_FLAGS_PAYLOAD' }) } };
    }

    const redFlags = normalizeLowerSet(redFlagsRaw);
    const allowedRedFlags = new Set((CANONICAL.red_flags || []).map((flag) => String(flag).toLowerCase()));
    for (const flag of redFlags) {
        if (!allowedRedFlags.has(flag)) {
            return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'INVALID_RED_FLAG_VALUE', value: flag }) } };
        }
    }

    const hasRedFlags = redFlags.size > 0 && !redFlags.has('none');
    if (hasRedFlags) {
        console.warn(`[PlanGen] User: ${userId}, status=ineligible_for_plan, reason=red_flags`);
        return {
            ok: false,
            response: {
                statusCode: 422,
                body: JSON.stringify({
                    error: 'RED_FLAGS_HARD_STOP',
                    status: 'ineligible_for_plan',
                    message: 'Wykryto objawy alarmowe. Plan nie został wygenerowany — skonsultuj się z lekarzem lub fizjoterapeutą.'
                })
            }
        };
    }

    const medicalScreeningRaw = parsedUserData?.exercise_medical_clearance;
    if (medicalScreeningRaw === undefined) {
        return { ok: false, response: { statusCode: 422, body: JSON.stringify({ error: 'MISSING_MEDICAL_SCREENING_ANSWER', field: 'exercise_medical_clearance' }) } };
    }
    if (medicalScreeningRaw === null || Array.isArray(medicalScreeningRaw) || typeof medicalScreeningRaw !== 'object') {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'INVALID_MEDICAL_SCREENING_PAYLOAD' }) } };
    }

    const screeningKeys = new Set(Object.keys(userData.exercise_medical_clearance || {}));
    const requiredScreeningKeys = new Set(CANONICAL.exercise_medical_clearance_fields || []);
    if (requiredScreeningKeys.size > 0) {
        for (const key of requiredScreeningKeys) {
            if (!screeningKeys.has(key)) {
                return { ok: false, response: { statusCode: 422, body: JSON.stringify({ error: 'MISSING_MEDICAL_SCREENING_ANSWER', field: key }) } };
            }
            if (typeof userData.exercise_medical_clearance[key] !== 'boolean') {
                return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'INVALID_MEDICAL_SCREENING_VALUE', field: key }) } };
            }
        }
    }

    if (!userData.current_activity_status) {
        return { ok: false, response: { statusCode: 422, body: JSON.stringify({ error: 'MISSING_CURRENT_ACTIVITY_STATUS', field: 'current_activity_status' }) } };
    }
    if (!Array.isArray(CANONICAL.current_activity_status) || !CANONICAL.current_activity_status.includes(userData.current_activity_status)) {
        return { ok: false, response: { statusCode: 400, body: JSON.stringify({ error: 'INVALID_CURRENT_ACTIVITY_STATUS', field: 'current_activity_status' }) } };
    }

    const highIntensityIntent = isHighIntensityIntent(userData);
    const medicalScreeningPositive = hasPositiveMedicalScreening(userData.exercise_medical_clearance);
    const hardStopMedicalScreening = hasHardStopMedicalScreening(userData.exercise_medical_clearance);
    const conditionalMedicalScreening = hasConditionalMedicalScreening(userData.exercise_medical_clearance);

    if (hardStopMedicalScreening) {
        console.warn(`[PlanGen] User: ${userId}, status=ineligible_for_plan, reason=medical_screening_hard_stop`);
        return {
            ok: false,
            response: {
                statusCode: 422,
                body: JSON.stringify({
                    error: 'MEDICAL_SCREENING_HARD_STOP',
                    status: 'ineligible_for_plan',
                    message: 'Wykryto objawy wysiłkowe wysokiego ryzyka. Plan nie może zostać wygenerowany bez pilnej konsultacji medycznej.'
                })
            }
        };
    }

    const activityRiskForHighIntensity = isActivityInsufficientForHighIntensity(userData) && medicalScreeningPositive;
    if (highIntensityIntent && (medicalScreeningPositive || activityRiskForHighIntensity)) {
        console.warn(`[PlanGen] User: ${userId}, status=ineligible_for_plan, reason=medical_screening_high_intensity`);
        return {
            ok: false,
            response: {
                statusCode: 422,
                body: JSON.stringify({
                    error: 'MEDICAL_SCREENING_HIGH_INTENSITY_BLOCK',
                    status: 'ineligible_for_plan',
                    message: 'Nie możemy wygenerować planu o wyższej intensywności bez konsultacji medycznej. Wybierz plan low-intensity lub skonsultuj się z lekarzem.'
                })
            }
        };
    }

    if (conditionalMedicalScreening && !isCautiousOnlyIntent(userData)) {
        console.warn(`[PlanGen] User: ${userId}, status=ineligible_for_plan, reason=medical_screening_cautious_only`);
        return {
            ok: false,
            response: {
                statusCode: 422,
                body: JSON.stringify({
                    error: 'MEDICAL_SCREENING_CONDITIONAL_REQUIRES_CAUTIOUS_FLOW',
                    status: 'ineligible_for_plan',
                    message: 'Przy dodatnim screeningu warunkowym dostępne są wyłącznie plany low-intensity / rehab / mobility.'
                })
            }
        };
    }

    return { ok: true, userData, parsedUserData };
}

module.exports = {
    safeJsonParse,
    hasPositiveMedicalScreening,
    hasHardStopMedicalScreening,
    hasConditionalMedicalScreening,
    isActivityInsufficientForHighIntensity,
    isHighIntensityIntent,
    isCautiousOnlyIntent,
    validateGeneratePlanRequest
};

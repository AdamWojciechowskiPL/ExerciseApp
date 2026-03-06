'use strict';

const CANONICAL = require('../../shared/wizard-canonical-values.json');

const VALUE_ALIAS = {
    pain_locations: {
        lumar_general: 'lumbar_general',
        lumbar: 'low_back',
        lumbar_general: 'low_back'
    },
    focus_locations: {
        glutes: 'glute',
        abs: 'core'
    },
    medical_diagnosis: {
        osteoarthritis: 'knee_oa',
        knee_osteoarthritis: 'knee_oa',
        spondylolisthesis_lumbar: 'spondylolisthesis'
    }
};

function normalizeEntry(value, group) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const aliasMap = VALUE_ALIAS[group] || {};
    return aliasMap[raw] || raw;
}

function normalizeCanonicalArray(values, group) {
    const allowed = new Set((CANONICAL[group] || []).map(v => String(v).toLowerCase()));
    if (!Array.isArray(values)) return [];

    const out = [];
    for (const value of values) {
        const normalized = normalizeEntry(value, group);
        if (!normalized) continue;
        if (allowed.has(normalized) && !out.includes(normalized)) {
            out.push(normalized);
        }
    }
    return out;
}

function normalizeEquipmentList(values) {
    const aliases = CANONICAL.equipment?.aliases || {};
    const ignorable = new Set((CANONICAL.equipment?.ignorable || []).map(v => String(v).toLowerCase()));
    if (!Array.isArray(values)) return [];

    const out = [];
    for (const value of values) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw || ignorable.has(raw)) continue;
        const normalized = aliases[raw] || raw;
        if (!out.includes(normalized)) out.push(normalized);
    }
    return out;
}


function normalizeMedicalClearance(raw) {
    const fields = Array.isArray(CANONICAL.exercise_medical_clearance_fields)
        ? CANONICAL.exercise_medical_clearance_fields
        : [];

    const normalized = {};
    const source = raw && typeof raw === 'object' ? raw : {};

    for (const field of fields) {
        normalized[field] = source[field] === true;
    }

    const hasPositiveFlag = fields.some((field) => normalized[field] === true);
    const hasExplicitNone = source.none === true;

    normalized.none = hasExplicitNone || (!hasPositiveFlag && source.none !== false);

    if (normalized.none) {
        for (const field of fields) {
            normalized[field] = false;
        }
    }

    return normalized;
}

function normalizeCanonicalValue(value, group) {
    const allowed = new Set((CANONICAL[group] || []).map(v => String(v).toLowerCase()));
    const normalized = normalizeEntry(value, group);
    return allowed.has(normalized) ? normalized : '';
}

function normalizeWizardPayload(payload = {}) {
    return {
        ...payload,
        pain_locations: normalizeCanonicalArray(payload.pain_locations, 'pain_locations'),
        focus_locations: normalizeCanonicalArray(payload.focus_locations, 'focus_locations'),
        medical_diagnosis: normalizeCanonicalArray(payload.medical_diagnosis, 'medical_diagnosis'),
        red_flags: normalizeCanonicalArray(payload.red_flags, 'red_flags'),
        physical_restrictions: normalizeCanonicalArray(payload.physical_restrictions, 'physical_restrictions'),
        hobby: normalizeCanonicalArray(payload.hobby, 'hobby'),
        session_component_weights: normalizeCanonicalArray(payload.session_component_weights, 'focus'),
        equipment_available: normalizeEquipmentList(payload.equipment_available),
        symptom_onset: normalizeCanonicalValue(payload.symptom_onset, 'symptom_onset'),
        symptom_duration: normalizeCanonicalValue(payload.symptom_duration, 'symptom_duration'),
        symptom_trend: normalizeCanonicalValue(payload.symptom_trend, 'symptom_trend'),
        current_activity_status: normalizeCanonicalValue(payload.current_activity_status, 'current_activity_status'),
        exercise_medical_clearance: normalizeMedicalClearance(payload.exercise_medical_clearance)
    };
}

module.exports = {
    CANONICAL,
    normalizeCanonicalArray,
    normalizeEquipmentList,
    normalizeCanonicalValue,
    normalizeWizardPayload,
    normalizeMedicalClearance
};

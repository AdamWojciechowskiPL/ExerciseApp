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

function normalizeWizardPayload(payload = {}) {
    return {
        ...payload,
        pain_locations: normalizeCanonicalArray(payload.pain_locations, 'pain_locations'),
        focus_locations: normalizeCanonicalArray(payload.focus_locations, 'focus_locations'),
        medical_diagnosis: normalizeCanonicalArray(payload.medical_diagnosis, 'medical_diagnosis'),
        physical_restrictions: normalizeCanonicalArray(payload.physical_restrictions, 'physical_restrictions'),
        hobby: normalizeCanonicalArray(payload.hobby, 'hobby'),
        session_component_weights: normalizeCanonicalArray(payload.session_component_weights, 'focus'),
        equipment_available: normalizeEquipmentList(payload.equipment_available)
    };
}

module.exports = {
    CANONICAL,
    normalizeCanonicalArray,
    normalizeEquipmentList,
    normalizeWizardPayload
};

// ExerciseApp/clinicalEngine.js

import CANONICAL_VALUES from './shared/wizard-canonical-values.js';
import './shared/clinical-core/contracts.js';
import './shared/clinical-core/index.js';

const { KNOWN_POSITIONS, isRotationalPlane, createClinicalRules } = globalThis.__ClinicalRulesCore;

const DIAGNOSIS_ALIAS_MAP = { runners_knee: 'chondromalacia', patellofemoral: 'chondromalacia' };
const PAIN_MAPPING = {
    lumbar: ['low_back', 'lumbar_general', 'lumbosacral', 'sciatica'],
    lumbar_general: ['low_back', 'lumbar_general', 'lumbosacral'],
    low_back: ['low_back', 'lumbar_general', 'lumbosacral', 'sciatica'],
    si_joint: ['si_joint', 'lumbosacral', 'low_back'],
    sciatica: ['sciatica', 'piriformis', 'lumbar_radiculopathy'],
    hip: ['hip', 'piriformis', 'glute'],
    piriformis: ['piriformis', 'sciatica', 'glute'],
    knee: ['knee', 'patella', 'knee_stability'],
    knee_anterior: ['patella', 'knee_anterior', 'knee'],
    patella: ['patella', 'knee_anterior'],
    cervical: ['cervical', 'neck', 'upper_traps'],
    neck: ['cervical', 'neck', 'upper_traps'],
    thoracic: ['thoracic', 'posture', 'shoulder_mobility'],
    shoulder: ['shoulder', 'thoracic'],
    ankle: ['ankle', 'calves', 'foot'],
    foot: ['foot', 'ankle', 'plantar_fascia']
};

const norm = (v) => String(v || '').trim().toLowerCase();

const normalizeCanonicalValue = (value, group) => {
    const allowed = new Set((CANONICAL_VALUES[group] || []).map(norm));
    const v = norm(value);
    return allowed.has(v) ? v : '';
};

const normalizeDiagnosisArray = (raw = []) => Array.isArray(raw)
    ? raw.map(norm).filter(Boolean).map((d) => DIAGNOSIS_ALIAS_MAP[d] || d)
    : [];

const derivePainZoneSet = (painLocations = []) => {
    const inputs = new Set((Array.isArray(painLocations) ? painLocations : []).map(norm).filter(Boolean));
    const out = new Set(inputs);
    for (const input of inputs) {
        const mapped = PAIN_MAPPING[input] || [];
        mapped.forEach((zone) => out.add(zone));
    }
    return out;
};

const normalizeWizardData = (wizardData) => ({
    ...wizardData,
    symptom_onset: normalizeCanonicalValue(wizardData.symptom_onset, 'symptom_onset'),
    symptom_duration: normalizeCanonicalValue(wizardData.symptom_duration, 'symptom_duration'),
    symptom_trend: normalizeCanonicalValue(wizardData.symptom_trend, 'symptom_trend')
});

const rules = createClinicalRules({ normalizeWizardData, derivePainZoneSet, normalizeDiagnosisArray });

export { KNOWN_POSITIONS, isRotationalPlane };
export const detectTolerancePattern = rules.detectTolerancePattern;
export const buildClinicalContext = rules.buildClinicalContext;
export const checkEquipment = rules.checkEquipment;
export const violatesRestrictions = rules.violatesRestrictions;
export const passesTolerancePattern = rules.passesTolerancePattern;
export const checkExerciseAvailability = rules.checkExerciseAvailability;

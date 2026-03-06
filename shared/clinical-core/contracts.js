// ExerciseApp/shared/clinical-core/contracts.js

const ClinicalContracts = (() => {
    const DECISION_REASONS = Object.freeze({
        BLACKLISTED: 'blacklisted',
        MISSING_EQUIPMENT: 'missing_equipment',
        TOO_HARD_CALCULATED: 'too_hard_calculated',
        PHYSICAL_RESTRICTION: 'physical_restriction',
        BIOMECHANICS_MISMATCH: 'biomechanics_mismatch',
        SEVERITY_FILTER: 'severity_filter',
        DIRECTIONAL_BIAS: 'directional_bias'
    });

    const EMPTY_INPUT = Object.freeze({
        wizardData: {},
        exercise: {},
        context: {},
        followUp: {}
    });

    const normalizeCoreInput = (input = {}) => ({
        wizardData: input.wizardData || EMPTY_INPUT.wizardData,
        exercise: input.exercise || EMPTY_INPUT.exercise,
        context: input.context || EMPTY_INPUT.context,
        followUp: input.followUp || input.history || EMPTY_INPUT.followUp
    });

    return {
        DECISION_REASONS,
        normalizeCoreInput
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.__ClinicalContracts = ClinicalContracts;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClinicalContracts;
}

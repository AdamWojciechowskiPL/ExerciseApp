// netlify/functions/_data-contract.js
'use strict';

const PAIN_MONITORING_VERSION = 1;

/**
 * Waliduje obiekt feedbacku pod kątem zgodności ze schematem pain_monitoring.
 * Fail-closed: zwraca false przy jakimkolwiek odstępstwie.
 */
function validatePainMonitoring(feedback) {
    if (!feedback || feedback.type !== 'pain_monitoring') {
        // Jeśli to nie jest pain_monitoring, nie walidujemy tym kontraktem (legacy bypass)
        return { valid: true, isSchema: false };
    }

    if (feedback.schema_version !== PAIN_MONITORING_VERSION) {
        return { valid: false, error: 'Unsupported schema version' };
    }

    // 1. Sekcja DURING (Wymagana)
    if (!feedback.during || typeof feedback.during !== 'object') {
        return { valid: false, error: 'Missing "during" section' };
    }

    const d = feedback.during;
    if (typeof d.max_nprs !== 'number' || d.max_nprs < 0 || d.max_nprs > 10) {
        return { valid: false, error: 'Invalid during.max_nprs (0-10)' };
    }
    
    if (d.locations && !Array.isArray(d.locations)) {
        return { valid: false, error: 'Invalid during.locations (array expected)' };
    }

    // 2. Sekcja AFTER 24H (Opcjonalna przy pierwszym zapisie, wymagana przy patchu)
    if (feedback.after24h) {
        const a = feedback.after24h;
        if (typeof a.max_nprs !== 'number' || a.max_nprs < 0 || a.max_nprs > 10) {
            return { valid: false, error: 'Invalid after24h.max_nprs (0-10)' };
        }
        // Delta może być ujemna (ból się zmniejszył) lub dodatnia
        if (typeof a.delta_vs_baseline !== 'number' || a.delta_vs_baseline < -10 || a.delta_vs_baseline > 10) {
            return { valid: false, error: 'Invalid after24h.delta_vs_baseline (-10 to 10)' };
        }
        
        // Flagi bezpieczeństwa
        const boolFields = ['stiffness_increased', 'swelling', 'night_pain', 'neuro_red_flags'];
        for (const field of boolFields) {
            if (a[field] !== undefined && typeof a[field] !== 'boolean') {
                return { valid: false, error: `Invalid type for ${field}` };
            }
        }
    }

    // 3. Metadata
    if (feedback.note && feedback.note.length > 200) {
        return { valid: false, error: 'Note too long (max 200 chars)' };
    }

    return { valid: true, isSchema: true };
}

module.exports = {
    validatePainMonitoring,
    PAIN_MONITORING_VERSION
};
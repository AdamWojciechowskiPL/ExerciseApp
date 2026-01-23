// netlify/functions/_tempo-validator.js
'use strict';

const SAFE_FALLBACK_TEMPO = "2-0-2: Ruch kontrolowany, pełna stabilizacja.";
const SAFE_FALLBACK_REHAB = "3-1-3: Bardzo wolno, pełna kontrola, bez bólu.";

// Słowa kluczowe sugerujące wysoką dynamikę (zakazane w fazach bezpiecznych)
const FAST_INTENT_KEYWORDS = [
    'dynamicz', 'eksplozyw', 'szybk', 'zryw', 'szarp', 'whip', 'max', 'prędko'
];

/**
 * Waliduje string tempa zgodnie z kontraktem klinicznym (US-03).
 */
function validateTempoString(str) {
    if (!str || typeof str !== 'string' || !str.trim()) {
        return { ok: false, reason: 'empty_or_null' };
    }

    const trimmed = str.trim();

    // 1. Dynamiczne: "X-X-X: Opis"
    const dynamicRegex = /^\d+-\d+-\d+: [^ ]/;
    // Obsługa "X" jako symbolu eksplozji (np. 2-0-X)
    const dynamicExplosiveRegex = /^\d+-\d+-[Xx]: [^ ]/;

    if (dynamicRegex.test(trimmed) || dynamicExplosiveRegex.test(trimmed)) {
        return { ok: true, type: 'dynamic', sanitized: trimmed };
    }

    // 2. Izometryczne: "Izometria: Opis"
    const isoRegex = /^Izometria: [^ ]/;
    if (isoRegex.test(trimmed)) {
        const timeInDescriptionRegex = /(\d+\s*s\b)|(\d+\s*sek)/i;
        if (timeInDescriptionRegex.test(trimmed)) {
            return { ok: false, reason: 'iso_contains_seconds' };
        }
        return { ok: true, type: 'isometric', sanitized: trimmed };
    }

    if (trimmed.includes(':') && !trimmed.includes(': ')) {
        return { ok: false, reason: 'missing_space_after_colon' };
    }

    return { ok: false, reason: 'invalid_format' };
}

/**
 * Analizuje cyfry tempa (E-I-C).
 * Zwraca obiekt z czasami faz lub null, jeśli nieparsowalne.
 * 'X' jest traktowane jako 0 (maksymalna szybkość).
 */
function parseTempoDigits(tempoStr) {
    const match = tempoStr.match(/^(\d+)-(\d+)-([0-9Xx])/);
    if (!match) return null;

    return {
        eccentric: parseInt(match[1], 10),
        isometric: parseInt(match[2], 10),
        concentric: (match[3].toUpperCase() === 'X') ? 0 : parseInt(match[3], 10)
    };
}

function hasFastIntentKeywords(description) {
    const lowerDesc = description.toLowerCase();
    return FAST_INTENT_KEYWORDS.some(kw => lowerDesc.includes(kw));
}

/**
 * US-04: Wymusza zgodność tempa z intencją fazy.
 * Zwraca oryginalny string, jeśli jest bezpieczny, lub bezpieczny fallback.
 */
function enforceTempoByPhaseIntent(tempoStr, ex, phaseId) {
    // 1. Walidacja formatu (US-03) - Fail-Closed na starcie
    const validation = validateTempoString(tempoStr);
    if (!validation.ok) {
        return getFallbackForPhase(ex, phaseId);
    }

    const cleanTempo = validation.sanitized;
    const isIso = validation.type === 'isometric';
    
    // Jeśli izometria - sprawdzamy tylko tekst (czy nie ma np. "Izometria: Dynamiczne napięcie")
    if (isIso) {
        if (hasFastIntentKeywords(cleanTempo)) {
            return getFallbackForPhase(ex, phaseId);
        }
        return cleanTempo;
    }

    // Dla dynamicznych - analiza cyfr i tekstu
    const digits = parseTempoDigits(cleanTempo);
    if (!digits) return getFallbackForPhase(ex, phaseId); // Should not happen given validateTempoString but safety first

    const descriptionPart = cleanTempo.split(':')[1] || '';
    const hasFastText = hasFastIntentKeywords(descriptionPart);

    // --- REGUŁY FAZOWE (US-04) ---

    // A. REHAB / CONTROL / DELOAD / MOBILITY (Safety First)
    if (['rehab', 'control', 'deload', 'mobility'].includes(phaseId)) {
        // 1. Text Check: Zakaz słów "szybko/dynamicznie"
        if (hasFastText) return getFallbackForPhase(ex, phaseId);

        // 2. Numeric Check: 
        // Rehab: min 3s (Slow) w dowolnej fazie ruchu (chyba że izometria, ale to tu nie wchodzi)
        if (phaseId === 'rehab') {
            if (digits.eccentric < 3 && digits.concentric < 3) {
                return getFallbackForPhase(ex, phaseId);
            }
        } 
        // Control/Deload: min 1s (Moderate/Slow). Zakaz 0 lub X.
        else {
            if (digits.eccentric < 1 || digits.concentric < 1) {
                return getFallbackForPhase(ex, phaseId);
            }
        }
    }

    // B. METABOLIC / CAPACITY (Controlled Intensity)
    else if (['metabolic', 'capacity'].includes(phaseId)) {
        // Zakaz szybkiego ekscentryka (kontrola ciężaru)
        if (digits.eccentric < 1) return getFallbackForPhase(ex, phaseId);
    }

    // C. STRENGTH (Power allowed but safe)
    else if (phaseId === 'strength') {
        // Koncentryk może być szybki (X lub 0), ale ekscentryk musi być kontrolowany
        if (digits.eccentric < 1) return getFallbackForPhase(ex, phaseId);
    }

    // Jeśli przeszło wszystkie testy
    return cleanTempo;
}

/**
 * Helper do wyboru bezpiecznego fallbacku zgodnie z kontraktem.
 */
function getFallbackForPhase(ex, phaseId) {
    const defaults = ex.tempos || {};
    const globalDefault = ex.default_tempo;

    // Helper sprawdzający rekurencyjnie poprawność kandydata (bez wpadania w pętlę)
    const isValid = (t, pId) => {
        if (!t) return false;
        // Sprawdzamy "płytko" czy format i cyfry pasują do fazy, 
        // ale nie wołamy enforceTempoByPhaseIntent, żeby uniknąć rekurencji.
        // Używamy uproszczonej logiki tutaj.
        const v = validateTempoString(t);
        if (!v.ok) return false;
        if (v.type === 'isometric') return !hasFastIntentKeywords(t);
        
        const d = parseTempoDigits(v.sanitized);
        if (!d) return false;
        if (hasFastIntentKeywords(t)) return false;

        // Proste reguły bezpieczeństwa dla fallbacku
        if (['rehab', 'control', 'deload'].includes(pId)) {
            if (d.eccentric < 1 || d.concentric < 1) return false;
        }
        return true;
    };

    // Strategia Fallbacku (Priority Chain)
    
    // 1. Dla Deload: Control -> Rehab -> Default -> Safe Constant
    if (phaseId === 'deload') {
        if (isValid(defaults.control, 'control')) return defaults.control;
        if (isValid(defaults.rehab, 'rehab')) return defaults.rehab;
    }

    // 2. Dla Rehab: Rehab -> Control -> Safe Rehab Constant
    if (phaseId === 'rehab') {
        if (isValid(defaults.rehab, 'rehab')) return defaults.rehab;
        if (isValid(defaults.control, 'control')) return defaults.control;
        return SAFE_FALLBACK_REHAB;
    }

    // 3. Dla Control/Mobility: Control -> Default -> Safe Constant
    if (['control', 'mobility'].includes(phaseId)) {
        if (isValid(defaults.control, 'control')) return defaults.control;
    }

    // 4. Default Check
    if (isValid(globalDefault, phaseId)) return globalDefault;

    // 5. Ultimate Safety Net
    return phaseId === 'rehab' ? SAFE_FALLBACK_REHAB : SAFE_FALLBACK_TEMPO;
}

module.exports = {
    validateTempoString,
    enforceTempoByPhaseIntent,
    SAFE_FALLBACK_TEMPO,
    SAFE_FALLBACK_REHAB
};
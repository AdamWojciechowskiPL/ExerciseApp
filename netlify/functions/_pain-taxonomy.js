// netlify/functions/_pain-taxonomy.js
'use strict';

/**
 * PAIN TAXONOMY MAP
 * Mapuje surowe inputy z Wizarda (user inputs) na dozwolone strefy w bazie (pain_relief_zones).
 * Klucz: input użytkownika (lowercase).
 * Wartość: tablica pasujących tagów z bazy danych.
 */
const PAIN_MAPPING = {
    // Kręgosłup Lędźwiowy
    'lumbar': ['lumbar_general', 'lumbosacral', 'sciatica'],
    'lumbar_general': ['lumbar_general', 'lumbosacral'],
    'low_back': ['lumbar_general', 'lumbosacral', 'sciatica'],
    'si_joint': ['si_joint', 'lumbosacral'],

    // Nogi / Biodra
    'sciatica': ['sciatica', 'piriformis', 'lumbar_radiculopathy'],
    'hip': ['hip', 'piriformis', 'glute'],
    'piriformis': ['piriformis', 'sciatica', 'glute'],

    // Kolana
    'knee': ['knee', 'patella', 'knee_stability'],
    'knee_anterior': ['patella', 'knee_anterior', 'knee'],
    'patella': ['patella', 'knee_anterior'],

    // Góra
    'cervical': ['cervical', 'neck', 'upper_traps'],
    'neck': ['cervical', 'neck', 'upper_traps'],
    'thoracic': ['thoracic', 'posture', 'shoulder_mobility'],
    'shoulder': ['shoulder', 'thoracic'],

    // Stopy
    'ankle': ['ankle', 'calves', 'foot'],
    'foot': ['foot', 'ankle', 'plantar_fascia']
};

/**
 * Normalizuje tablicę stringów (trim + lowercase).
 */
function normalizeStringArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
    return [];
}

/**
 * Tworzy Set znormalizowanych stringów (pomocnicza dla innych modułów).
 */
function normalizeLowerSet(arr) {
    return new Set(normalizeStringArray(arr).map(s => s.toLowerCase()));
}

/**
 * Główna funkcja mapująca.
 * Przyjmuje surowe lokalizacje bólu od użytkownika i zwraca Set
 * zawierający wszystkie pasujące tagi 'pain_relief_zones' z bazy.
 *
 * @param {string[]|string} userPainLocations
 * @returns {Set<string>} Zbiór znormalizowanych tagów
 */
function derivePainZoneSet(userPainLocations) {
    const inputs = normalizeLowerSet(userPainLocations);
    const zoneSet = new Set();

    // 1. Przepisz inputy bezpośrednie (jeśli pasują do enumów, np. 'sciatica' -> 'sciatica')
    inputs.forEach(input => zoneSet.add(input));

    // 2. Rozwiń mapowania (Expansion)
    inputs.forEach(input => {
        const mapped = PAIN_MAPPING[input];
        if (mapped) {
            mapped.forEach(z => zoneSet.add(z));
        }
    });

    return zoneSet;
}

module.exports = {
    derivePainZoneSet,
    normalizeLowerSet,
    normalizeStringArray,
    PAIN_MAPPING
};
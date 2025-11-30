// assistantEngine.js

import { state } from './state.js';
import { getISODate, parseSetCount, getExerciseDuration, applyProgression } from './utils.js';

/**
 * MÓZG SYSTEMU (ASSISTANT ENGINE)
 * Centralny moduł odpowiedzialny za logikę adaptacyjną, analizę statystyk
 * i modyfikowanie planów treningowych w czasie rzeczywistym.
 */

// Stałe pomocnicze
const SECONDS_PER_REP = 4; // Średni czas na 1 powtórzenie (tempo 2-0-2)
const DEFAULT_REST_SETS = 60; // Domyślna przerwa między seriami (jeśli brak w planie)
const DEFAULT_REST_EXERCISES = 90; // Domyślna przerwa między ćwiczeniami

export const assistant = {

    // ============================================================
    // TASK-04: Resilience Calculator (Kalkulator Tarczy)
    // [KOD POZOSTAJE BEZ ZMIAN - SKIPIUJĘ GO DLA CZYTELNOŚCI]
    // ============================================================
    calculateResilience: () => {
        // Jeśli serwer przysłał nam gotowe dane w state.userStats, używamy ich!
        if (state.userStats && state.userStats.resilience) {
            return state.userStats.resilience;
        }

        // Fallback: Jeśli z jakiegoś powodu danych brak (np. błąd initu), zwracamy domyślne zero.
        // Nie ma sensu liczyć tego lokalnie na niepełnych danych.
        return { score: 0, status: 'Vulnerable', daysSinceLast: 0, sessionCount: 0 };
    },

    // ============================================================
    // TASK-05: Duration Estimator (Szacowanie Czasu)
    // ============================================================
    
    /**
     * Szacuje czas trwania treningu w minutach.
     * Uwzględnia czas pracy, przerwy między seriami i przejścia między ćwiczeniami.
     * 
     * @param {Object} dayPlan - Nawodniony obiekt dnia (warmup, main, cooldown)
     * @returns {number} Szacowany czas w minutach
     */
    estimateDuration: (dayPlan) => {
        if (!dayPlan) return 0;

        // Pobierz zasady globalne z aktywnego planu (dla czasów przerw)
        const activePlan = state.trainingPlans[state.settings.activePlanId];
        const globalRules = activePlan?.GlobalRules || {};
        const restBetweenSets = globalRules.defaultRestSecondsBetweenSets || DEFAULT_REST_SETS;
        const restBetweenExercises = globalRules.defaultRestSecondsBetweenExercises || DEFAULT_REST_EXERCISES;

        let totalSeconds = 0;
        const allExercises = [
            ...(dayPlan.warmup || []),
            ...(dayPlan.main || []),
            ...(dayPlan.cooldown || [])
        ];

        allExercises.forEach((exercise, index) => {
            const sets = parseSetCount(exercise.sets);
            
            // 1. Czas pracy (Work)
            // Sprawdzamy czy to ćwiczenie na czas (Duration) czy powtórzenia
            let workTimePerSet = getExerciseDuration(exercise); 
            
            if (workTimePerSet === null) {
                // Jeśli to powtórzenia, parsujemy string (np. "10-12") i mnożymy przez stałą
                const repsString = String(exercise.reps_or_time);
                const repsMatch = repsString.match(/(\d+)/); // Pobieramy pierwszą liczbę
                const reps = repsMatch ? parseInt(repsMatch[0], 10) : 10;
                workTimePerSet = reps * SECONDS_PER_REP;
            }

            totalSeconds += sets * workTimePerSet;

            // 2. Przerwy między seriami (Rest)
            if (sets > 1) {
                totalSeconds += (sets - 1) * restBetweenSets;
            }

            // 3. Przerwa po ćwiczeniu (Transition)
            // Dodajemy przerwę, chyba że to ostatnie ćwiczenie w całym treningu
            if (index < allExercises.length - 1) {
                totalSeconds += restBetweenExercises;
            }
        });

        return Math.ceil(totalSeconds / 60);
    },

    // ============================================================
    // TASK-06: Rule Engine (Silnik Regułowy / Modyfikator Planu)
    // ============================================================

    /**
     * Modyfikuje plan treningowy na podstawie czynników zewnętrznych.
     * 
     * @param {Object} dayPlan - Oryginalny plan dnia
     * @param {number} painLevel - Poziom bólu (0-10)
     * @param {number} timeFactor - Suwak czasu (np. 0.5 = 50% czasu, 1.0 = norma)
     * @returns {Object} Zmodyfikowana kopia planu
     */
   adjustTrainingVolume: (dayPlan, painLevel, timeFactor = 1.0) => {
        if (!dayPlan) return null;

        const modifiedPlan = JSON.parse(JSON.stringify(dayPlan));
        
        // Modyfikator objętości wynikający z bólu
        let painModifier = 1.0;
        let painMessage = null;

        if (painLevel >= 4 && painLevel <= 6) {
            painModifier = 0.6; 
            painMessage = "Zmniejszono objętość (umiarkowany ból).";
        } else if (painLevel >= 7) {
            painModifier = 0.3; 
            painMessage = "Tryb minimum (silny ból).";
        }

        // Łączny mnożnik (Ból * Suwak Czasu)
        // np. Ból 0 (1.0) * Suwak 50% (0.5) = 0.5
        const totalFactor = painModifier * timeFactor;

        ['warmup', 'main', 'cooldown'].forEach(section => {
            if (!modifiedPlan[section]) return;

            modifiedPlan[section].forEach(exercise => {
                // 1. Skalowanie SERII
                const originalSets = parseSetCount(exercise.sets);
                // Jeśli mamy dużo serii (np. 3+), tniemy serie. Jeśli mało (1-2), staramy się utrzymać min. 1.
                let newSets = Math.round(originalSets * totalFactor);
                newSets = Math.max(1, newSets); 
                exercise.sets = String(newSets);

                // 2. Skalowanie POWTÓRZEŃ / CZASU (NOWOŚĆ!)
                // Jeśli serie nie spadły (bo np. była 1 i została 1), a suwak jest nisko,
                // musimy przyciąć powtórzenia, żeby skrócić czas.
                
                // Logika: Jeśli totalFactor < 1, skalujemy też powtórzenia
                if (totalFactor < 0.9 || totalFactor > 1.1) {
                    const duration = getExerciseDuration(exercise);
                    
                    if (duration !== null) {
                        // Ćwiczenie na czas (np. 60s -> 30s)
                        // Skalujemy czas proporcjonalnie
                        const newDuration = Math.max(5, Math.round(duration * totalFactor));
                        exercise.reps_or_time = `${newDuration} s`;
                    } else {
                        // Ćwiczenie na powtórzenia (np. 10 -> 5)
                        const repsMatch = String(exercise.reps_or_time).match(/(\d+)/);
                        if (repsMatch) {
                            const originalReps = parseInt(repsMatch[0], 10);
                            const newReps = Math.max(1, Math.round(originalReps * totalFactor));
                            
                            // Zachowujemy format (np. "10/str." -> "5/str.")
                            exercise.reps_or_time = exercise.reps_or_time.replace(originalReps, newReps);
                        }
                    }
                }
            });
        });

        modifiedPlan._modificationInfo = {
            originalPainLevel: painLevel,
            appliedModifier: totalFactor,
            message: painMessage
        };

        return modifiedPlan;
    }
};
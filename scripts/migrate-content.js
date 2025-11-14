// scripts/migrate-content.js

// Używamy 'dotenv' do wczytania zmiennych środowiskowych z pliku .env
// To pozwala na bezpieczne zarządzanie connection stringiem do bazy danych.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Dynamicznie ustalamy ścieżkę do głównego folderu projektu
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Wczytujemy zmienne z pliku .env znajdującego się w głównym folderze
dotenv.config({ path: path.join(projectRoot, '.env') });

// Importujemy klienta bazy danych oraz statyczne dane, które będziemy migrować.
import { Pool } from '@neondatabase/serverless';
import { EXERCISE_LIBRARY } from '../exercise-library.js';
import { TRAINING_PLANS } from '../training-plans.js';

// Funkcja pomocnicza do logowania z kolorami dla lepszej czytelności.
const log = (message, color = 'reset') => {
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color] || colors.reset}%s${colors.reset}`, message);
};

// Główna funkcja wykonująca migrację.
async function runMigration() {
  log('Starting migration script...', 'yellow');

  // Sprawdzamy, czy connection string jest dostępny.
  if (!process.env.NETLIFY_DATABASE_URL) {
    log('ERROR: NETLIFY_DATABASE_URL environment variable is not set.', 'red');
    process.exit(1); // Zakończ skrypt z kodem błędu.
  }

  // Tworzymy nową pulę połączeń do bazy danych.
  const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
  const client = await pool.connect();

  try {
    // === KROK 1: ROZPOCZĘCIE TRANSAKCJI ===
    // Używamy transakcji, aby zapewnić, że wszystkie operacje powiodą się, albo żadna.
    // To chroni nas przed pozostawieniem bazy w stanie niekompletnym w razie błędu.
    log('Starting database transaction...');
    await client.query('BEGIN');

    // === KROK 2: MIGRACJA ĆWICZEŃ ===
    log('Migrating exercises from EXERCISE_LIBRARY...', 'cyan');
    const exerciseEntries = Object.entries(EXERCISE_LIBRARY);
    for (const [id, exercise] of exerciseEntries) {
      const query = `
        INSERT INTO exercises (id, name, description, equipment, youtube_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          equipment = EXCLUDED.equipment,
          youtube_url = EXCLUDED.youtube_url;
      `;
      await client.query(query, [id, exercise.name, exercise.description, exercise.equipment, exercise.youtube_url]);
    }
    log(`Successfully migrated ${exerciseEntries.length} exercises.`, 'green');

    // === KROK 3: MIGRACJA PLANÓW TRENINGOWYCH ===
    log('Migrating training plans from TRAINING_PLANS...', 'cyan');
    const planEntries = Object.entries(TRAINING_PLANS);
    for (const [planId, plan] of planEntries) {
      log(`  -> Migrating plan: ${plan.name}`);
      
      // Wstawiamy główny rekord planu.
      const planQuery = `
        INSERT INTO training_plans (id, name, description, global_rules)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          global_rules = EXCLUDED.global_rules;
      `;
      await client.query(planQuery, [planId, plan.name, plan.description, JSON.stringify(plan.GlobalRules)]);

      // Iterujemy po dniach w danym planie.
      for (const day of plan.Days) {
        // Wstawiamy rekord dnia i pobieramy jego nowo wygenerowane ID (klucz główny).
        const dayQuery = `
          INSERT INTO plan_days (plan_id, day_number, title)
          VALUES ($1, $2, $3)
          RETURNING id;
        `;
        const dayResult = await client.query(dayQuery, [planId, day.dayNumber, day.title]);
        const dayId = dayResult.rows[0].id; // To jest kluczowe dla tabeli łączącej.

        // Łączymy wszystkie sekcje w jedną strukturę, aby łatwiej po nich iterować.
        const sections = {
          warmup: day.warmup || [],
          main: day.main || [],
          cooldown: day.cooldown || [],
        };

        // Iterujemy po sekcjach ('warmup', 'main', 'cooldown').
        for (const [sectionName, exercises] of Object.entries(sections)) {
          // Iterujemy po ćwiczeniach w danej sekcji.
          for (let i = 0; i < exercises.length; i++) {
            const exerciseRef = exercises[i];
            const exerciseLinkQuery = `
              INSERT INTO day_exercises (day_id, exercise_id, section, order_in_section, sets, reps_or_time, tempo_or_iso)
              VALUES ($1, $2, $3, $4, $5, $6, $7);
            `;
            await client.query(exerciseLinkQuery, [
              dayId,
              exerciseRef.exerciseId,
              sectionName,
              i + 1, // Kolejność w sekcji (zaczynamy od 1).
              exerciseRef.sets,
              exerciseRef.reps_or_time,
              exerciseRef.tempo_or_iso,
            ]);
          }
        }
      }
    }
    log(`Successfully migrated ${planEntries.length} training plans.`, 'green');

    // === KROK 4: ZATWIERDZENIE TRANSAKCJI ===
    // Jeśli wszystkie operacje powyżej zakończyły się sukcesem, zatwierdzamy zmiany.
    log('Committing transaction...');
    await client.query('COMMIT');
    log('Migration completed successfully!', 'green');

  } catch (error) {
    // === OBSŁUGA BŁĘDÓW: WYCOFANIE TRANSAKCJI ===
    // W przypadku jakiegokolwiek błędu, wycofujemy wszystkie zmiany dokonane w tej transakcji.
    log('An error occurred during migration. Rolling back transaction...', 'red');
    console.error(error);
    await client.query('ROLLBACK');
    process.exit(1); // Zakończ skrypt z błędem.
  } finally {
    // === ZAWSZE ZWALNIAMY POŁĄCZENIE ===
    // Niezależnie od wyniku, zwalniamy połączenie z bazą i zamykamy pulę.
    log('Releasing database client and closing pool.', 'yellow');
    client.release();
    await pool.end();
  }
}

// Uruchomienie głównej funkcji skryptu.
runMigration();
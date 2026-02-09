// ExerciseApp/tests/run.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 1. Konfiguracja Mock Environment (Globalnie dla wszystkich testów)
process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

// Kolory do konsoli
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

const testDir = __dirname;

// 2. Znajdź tylko pliki w standardzie V2
const testFiles = fs.readdirSync(testDir)
    .map(f => path.join(testDir, f));

if (testFiles.length === 0) {
    console.error('❌ Nie znaleziono plików testowych');
    process.exit(1);
}

console.log(`${colors.cyan}${colors.bold}🚀 Uruchamianie Suite (${testFiles.length} plików)...${colors.reset}\n`);

// 3. Uruchom natywny Node Test Runner
const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    stdio: 'inherit',
    env: process.env
});

console.log(`\n${colors.gray}---------------------------------------------------${colors.reset}`);
if (result.status === 0) {
    console.log(`${colors.green}${colors.bold}✅ WSZYSTKIE TESTY ZALICZONE${colors.reset}`);
} else {
    // Node --test sam wypisze błędy na stderr/stdout
    console.log(`⚠️  Kod wyjścia: ${result.status}`);
}

process.exit(result.status);
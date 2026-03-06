// ExerciseApp/tests/run.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

process.env.AUTH0_ISSUER_BASE_URL = 'https://mock.auth0.com';
process.env.NETLIFY_DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock';
process.env.AUTH0_AUDIENCE = 'mock-audience';
process.env.CONTEXT = 'dev';

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
    .filter((f) => /^test_.*\.js$/i.test(f))
    .map((f) => path.join(testDir, f))
    .sort();

if (testFiles.length === 0) {
    console.error('❌ Nie znaleziono plików testowych');
    process.exit(1);
}

console.log(`${colors.cyan}${colors.bold}🚀 Uruchamianie Suite (${testFiles.length} plików)...${colors.reset}\n`);

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    stdio: 'inherit',
    env: process.env
});

console.log(`\n${colors.gray}---------------------------------------------------${colors.reset}`);
if (result.status === 0) {
    console.log(`${colors.green}${colors.bold}✅ WSZYSTKIE TESTY ZALICZONE${colors.reset}`);
} else {
    console.log(`⚠️  Kod wyjścia: ${result.status}`);
}

process.exit(result.status);

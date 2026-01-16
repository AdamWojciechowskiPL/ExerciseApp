const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Kolory do konsoli
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m"
};

const testDir = __dirname;
const currentFile = path.basename(__filename);

console.log(`${colors.cyan}${colors.bold}========================================${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}   🚀  URUCHAMIANIE WSZYSTKICH TESTÓW   ${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}========================================${colors.reset}\n`);

// 1. Znajdź wszystkie pliki .js w katalogu tests, pomijając ten skrypt
const files = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.js') && file !== currentFile);

let totalPassed = 0;
let totalFailed = 0;
let failedFiles = [];

const startTime = Date.now();

// 2. Uruchom każdy test w osobnym procesie
files.forEach((file, index) => {
    const fullPath = path.join(testDir, file);
    
    console.log(`${colors.yellow}▶️  [${index + 1}/${files.length}] Uruchamianie: ${file}...${colors.reset}`);
    
    // FIX: Używamy process.execPath i shell: false, aby obsłużyć spacje w ścieżkach (np. OneDrive)
    const result = spawnSync(process.execPath, [fullPath], {
        stdio: 'inherit',
        shell: false, 
        env: { ...process.env }
    });

    if (result.status === 0) {
        console.log(`${colors.green}✅  SUKCES: ${file}${colors.reset}\n`);
        totalPassed++;
    } else {
        console.log(`${colors.red}❌  BŁĄD: ${file} (Exit Code: ${result.status})${colors.reset}\n`);
        totalFailed++;
        failedFiles.push(file);
    }
});

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

// 3. Podsumowanie
console.log(`${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}PODSUMOWANIE (Czas: ${duration}s)${colors.reset}`);
console.log(`${colors.cyan}========================================${colors.reset}`);

if (totalFailed === 0) {
    console.log(`${colors.green}${colors.bold}WSZYSTKIE TESTY ZALICZONE (${totalPassed}/${files.length})${colors.reset} 🎉`);
    process.exit(0);
} else {
    console.log(`${colors.green}Zaliczone: ${totalPassed}`);
    console.log(`${colors.red}Nieudane:  ${totalFailed}`);
    console.log(`\n${colors.red}Lista błędów:${colors.reset}`);
    failedFiles.forEach(f => console.log(` - ${f}`));
    process.exit(1);
}
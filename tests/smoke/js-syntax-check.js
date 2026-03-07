'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.netlify', '.next', '.cache']);

function collectJsFiles(dir, bucket = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(ROOT_DIR, fullPath);

        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
                collectJsFiles(fullPath, bucket);
            }
            continue;
        }

        if (!entry.isFile() || !relativePath.endsWith('.js') || relativePath.startsWith('tests/smoke/')) {
            continue;
        }

        bucket.push({ fullPath, relativePath });
    }

    return bucket;
}

function isLikelyEsm(sourceCode) {
    return /(^|\n)\s*import\s.+from\s+['"][^'"]+['"];?|(^|\n)\s*export\s/m.test(sourceCode);
}

const parseErrors = [];
const jsFiles = collectJsFiles(ROOT_DIR);

for (const file of jsFiles) {
    const sourceCode = fs.readFileSync(file.fullPath, 'utf8');
    const nodeArgs = isLikelyEsm(sourceCode)
        ? ['--experimental-default-type=module', '--check', file.fullPath]
        : ['--check', file.fullPath];

    const result = spawnSync(process.execPath, nodeArgs, { encoding: 'utf8' });
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        parseErrors.push({
            file: file.relativePath,
            error: stderr.split('\n').slice(-1)[0] || `exit code ${result.status}`
        });
    }
}

if (parseErrors.length > 0) {
    console.error('❌ JS syntax smoke check failed for files:');
    for (const failure of parseErrors) {
        console.error(` - ${failure.file}: ${failure.error}`);
    }
    process.exit(1);
}

console.log(`✅ JS syntax smoke check passed (${jsFiles.length} files).`);

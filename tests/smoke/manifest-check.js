'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(ROOT_DIR, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    console.error('❌ Missing required PWA manifest file: manifest.json');
    process.exit(1);
}

console.log('✅ PWA manifest presence check passed (manifest.json found).');

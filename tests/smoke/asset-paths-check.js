'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const indexPath = path.join(ROOT_DIR, 'index.html');
const serviceWorkerPath = path.join(ROOT_DIR, 'service-worker.js');

function toRepoFilePath(assetPath) {
    const normalized = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    return path.join(ROOT_DIR, normalized);
}

function isLocalAssetPath(assetPath) {
    if (!assetPath || assetPath.startsWith('#')) return false;
    if (/^(https?:)?\/\//i.test(assetPath)) return false;
    if (/^(data:|mailto:|tel:|javascript:)/i.test(assetPath)) return false;
    return assetPath.startsWith('/');
}

function collectIndexHtmlAssets(html) {
    const assets = new Set();
    const attrRegex = /\b(?:src|href)=['"]([^'"]+)['"]/gi;
    let match;

    while ((match = attrRegex.exec(html)) !== null) {
        const assetPath = match[1].trim();
        if (isLocalAssetPath(assetPath)) {
            assets.add(assetPath);
        }
    }

    return [...assets].sort();
}

function collectServiceWorkerAppShellAssets(source) {
    const shellMatch = source.match(/const\s+APP_SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!shellMatch) {
        throw new Error('Nie znaleziono deklaracji APP_SHELL_ASSETS w service-worker.js');
    }

    const assets = new Set();
    const stringRegex = /['"]([^'"]+)['"]/g;
    let match;

    while ((match = stringRegex.exec(shellMatch[1])) !== null) {
        const assetPath = match[1].trim();
        if (isLocalAssetPath(assetPath) || assetPath === '/') {
            assets.add(assetPath);
        }
    }

    return [...assets].sort();
}

function checkAssetsExist(label, assets) {
    const missing = [];

    for (const assetPath of assets) {
        if (assetPath === '/') {
            continue;
        }

        const filePath = toRepoFilePath(assetPath);
        if (!fs.existsSync(filePath)) {
            missing.push(assetPath);
        }
    }

    if (missing.length > 0) {
        console.error(`❌ ${label}: znaleziono nieistniejące assety:`);
        missing.forEach((assetPath) => console.error(` - ${assetPath}`));
        process.exitCode = 1;
    }
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, 'utf8');

const indexAssets = collectIndexHtmlAssets(indexHtml);
const appShellAssets = collectServiceWorkerAppShellAssets(serviceWorkerSource);

checkAssetsExist('index.html', indexAssets);
checkAssetsExist('service-worker APP_SHELL_ASSETS', appShellAssets);

if (process.exitCode === 1) {
    process.exit(1);
}

console.log(`✅ Asset path consistency check passed (index: ${indexAssets.length}, app shell: ${appShellAssets.length}).`);

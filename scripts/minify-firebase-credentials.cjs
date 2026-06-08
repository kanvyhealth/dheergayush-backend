#!/usr/bin/env node
/**
 * Minify Firebase service account JSON for FIREBASE_SERVICE_ACCOUNT_JSON (Render).
 * Usage: node scripts/minify-firebase-credentials.cjs ./firebase-service-account.json
 */
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || './firebase-service-account.json';
const resolved = path.resolve(inputPath);

if (!fs.existsSync(resolved)) {
  console.error('File not found:', resolved);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

const oneLine = JSON.stringify(parsed);
process.stdout.write(oneLine);

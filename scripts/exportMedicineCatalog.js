/**
 * Writes public/data/medicine-catalog.json from medicine/medicine images (no MongoDB).
 * Skips if a multi-brand synced catalog already exists (from sync_ayurvedic_to_store.py).
 * Run: npm run catalog:export
 */
const fs = require('fs');
const path = require('path');
const { buildStoreFromMedicineImages } = require('../lib/medicineCatalog');

const outDir = path.join(__dirname, '..', 'public', 'data');
const outFile = path.join(outDir, 'medicine-catalog.json');

if (fs.existsSync(outFile)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    if (Array.isArray(existing) && existing.length > 1) {
      console.log('Skipping export — multi-brand catalog already present at', outFile);
      console.log('Use: python scripts/sync_ayurvedic_to_store.py --project-root .');
      process.exit(0);
    }
    const single = existing[0];
    if (single && single.name && !String(single.name).includes('Classical Pharmacy')) {
      console.log('Skipping export — verified brand catalog already at', outFile);
      process.exit(0);
    }
  } catch (_) { /* continue */ }
}

const store = buildStoreFromMedicineImages();
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify([store], null, 2), 'utf8');
console.log('Wrote', store.medicines.length, 'products to', outFile);

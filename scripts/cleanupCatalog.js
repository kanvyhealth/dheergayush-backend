/**
 * Remove non-ayurvedic products from medicine-catalog.json and fix imageFile mapping.
 *
 * Usage:
 *   node scripts/cleanupCatalog.js
 *   node scripts/cleanupCatalog.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const { CATALOG_PATH } = require('../lib/medicineCatalogJson');
const { filterExcludedStores, isExcludedMedicine } = require('../lib/excludedBrands');
const { isValidAyurvedicProduct } = require('../lib/excludedProducts');
const { classifyStoreProduct } = require('../lib/storeCategories');

const DRY_RUN = process.argv.includes('--dry-run');
const IMAGE_DIR = path.join(__dirname, '..', 'medicine', 'medicine');

function expectedImageFile(med) {
  const id = String(med._id || '').trim();
  if (!id) return null;
  return `${id}.jpg`;
}

function fixImageFile(med) {
  const expected = expectedImageFile(med);
  if (!expected) return med;
  const diskPath = path.join(IMAGE_DIR, expected);
  const hasDisk = fs.existsSync(diskPath);
  const current = med.imageFile || '';
  if (current === expected) return med;
  if (hasDisk || !current) {
    return { ...med, imageFile: expected };
  }
  const currentPath = path.join(IMAGE_DIR, current);
  if (fs.existsSync(currentPath)) {
    return med;
  }
  return { ...med, imageFile: expected };
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Catalog not found:', CATALOG_PATH);
    process.exit(1);
  }

  const catalog = filterExcludedStores(JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')));
  let removed = 0;
  let imageFixed = 0;
  let recategorized = 0;
  const removedSamples = [];

  const cleaned = catalog.map((store) => {
    const medicines = (store.medicines || [])
      .filter((med) => {
        const keep = isValidAyurvedicProduct(med)
          && !isExcludedMedicine({ ...med, storeName: store.name });
        if (!keep) {
          removed++;
          if (removedSamples.length < 25) {
            removedSamples.push({ store: store.name, name: med.name });
          }
        }
        return keep;
      })
      .map((med) => {
        const fixed = fixImageFile(med);
        if (fixed.imageFile !== med.imageFile) imageFixed++;
        const department = classifyStoreProduct({ ...fixed, storeName: store.name });
        if (department !== fixed.category) recategorized++;
        return { ...fixed, category: department };
      });

    return { ...store, medicines };
  }).filter((store) => (store.medicines || []).length > 0);

  const before = catalog.reduce((n, s) => n + (s.medicines || []).length, 0);
  const after = cleaned.reduce((n, s) => n + (s.medicines || []).length, 0);

  console.log(`Brands: ${catalog.length} -> ${cleaned.length}`);
  console.log(`Products: ${before} -> ${after} (removed ${removed})`);
  console.log(`Image paths normalized: ${imageFixed}`);
  console.log(`Departments recategorized: ${recategorized}`);
  if (removedSamples.length) {
    console.log('\nSample removed products:');
    removedSamples.forEach((r) => console.log(`  [${r.store}] ${r.name}`));
  }

  if (DRY_RUN) {
    console.log('\nDry run — catalog not written.');
    return;
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(cleaned, null, 2));
  console.log('\nCatalog saved:', CATALOG_PATH);
}

main();

/**
 * Download missing product images for every brand in the catalog.
 *
 * Usage:
 *   node scripts/downloadAllBrandImages.js
 *   node scripts/downloadAllBrandImages.js --missing-only
 *   LIMIT=50 node scripts/downloadAllBrandImages.js --brand Aimil
 */
const fs = require('fs');
const path = require('path');
const {
  CATALOG_PATH,
  IMAGE_DIR,
  resolveImageOnline,
  downloadImage,
} = require('./catalogBrandUtils');

const args = process.argv.slice(2);
const BRAND_FILTER = args.includes('--brand')
  ? args[args.indexOf('--brand') + 1]
  : '';
const MISSING_ONLY = args.includes('--missing-only');
const LIMIT = Number(process.env.LIMIT || 0);
const DELAY_MS = Number(process.env.DELAY_MS || 450);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadForStore(store) {
  const brand = store.name;
  const medicines = store.medicines || [];
  let ok = 0;
  let notFound = 0;
  let failed = 0;
  let skipped = 0;
  let attempted = 0;

  console.log(`\n=== ${brand} (${medicines.length} products) ===`);

  for (let i = 0; i < medicines.length; i++) {
    if (LIMIT > 0 && attempted >= LIMIT) break;

    const med = medicines[i];
    const imageFile = med.imageFile || `${med._id}.jpg`;
    const dest = path.join(IMAGE_DIR, imageFile);
    const hasExisting = fs.existsSync(dest);

    if (MISSING_ONLY && hasExisting) {
      skipped++;
      continue;
    }

    attempted++;
    process.stdout.write(`[${i + 1}/${medicines.length}] ${med.name} ... `);
    try {
      const url = await resolveImageOnline(brand, med.name);
      if (!url) {
        if (hasExisting) {
          console.log('not found (kept existing)');
        } else {
          notFound++;
          console.log('not found');
        }
        continue;
      }
      const tmp = `${dest}.tmp`;
      await downloadImage(url, tmp);
      if (hasExisting) fs.unlinkSync(dest);
      fs.renameSync(tmp, dest);
      ok++;
      console.log('ok');
      await sleep(DELAY_MS);
    } catch (err) {
      if (fs.existsSync(`${dest}.tmp`)) fs.unlinkSync(`${dest}.tmp`);
      if (hasExisting) {
        console.log(`fail (${err.message}), kept existing`);
      } else {
        failed++;
        console.log(`fail (${err.message})`);
      }
    }
  }

  return { brand, ok, notFound, failed, skipped, attempted, total: medicines.length };
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const stores = BRAND_FILTER
    ? catalog.filter((s) => new RegExp(BRAND_FILTER, 'i').test(s.name || ''))
    : catalog;

  if (!stores.length) {
    console.error('No matching stores found');
    process.exit(1);
  }

  const results = [];
  for (const store of stores) {
    results.push(await downloadForStore(store));
  }

  console.log('\n=== Summary ===');
  results.forEach((r) => {
    console.log(
      `${r.brand}: downloaded ${r.ok}, not found ${r.notFound}, failed ${r.failed}, skipped ${r.skipped}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

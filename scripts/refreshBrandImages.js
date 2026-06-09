/**
 * Refresh trademark product pack-shot images for catalog brands.
 *
 * Usage:
 *   node scripts/refreshBrandImages.js
 *   node scripts/refreshBrandImages.js --brand Dabur
 *   node scripts/refreshBrandImages.js --missing-only
 *   LIMIT=20 node scripts/refreshBrandImages.js --brand Baidyanath
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
const DELAY_MS = Number(process.env.DELAY_MS || 400);

const TARGET_STORES = [
  { name: 'Shree Dhootapapeshwar', match: /dhootapapeshwar/i },
  { name: 'Baidyanath', match: /^baidyanath$/i },
  { name: 'Dabur', match: /^dabur$/i },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshStore(store) {
  const brand = store.name;
  const medicines = store.medicines || [];
  let updated = 0;
  let kept = 0;
  let failed = 0;
  let skipped = 0;
  let notFound = 0;

  console.log(`\n=== ${brand} (${medicines.length} products) ===`);

  for (let i = 0; i < medicines.length; i++) {
    if (LIMIT > 0 && updated + failed + skipped >= LIMIT) break;

    const med = medicines[i];
    const dest = path.join(IMAGE_DIR, med.imageFile || `${med._id}.jpg`);
    const hasExisting = med.imageFile && fs.existsSync(dest);

    if (MISSING_ONLY && hasExisting) {
      skipped++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${medicines.length}] ${med.name} ... `);
    try {
      const url = await resolveImageOnline(brand, med.name);
      if (!url) {
        if (hasExisting) {
          kept++;
          console.log('not found (kept existing)');
        } else {
          notFound++;
          console.log('not found');
        }
        continue;
      }

      const tmp = `${dest}.tmp`;
      const bytes = await downloadImage(url, tmp);
      if (hasExisting) fs.unlinkSync(dest);
      fs.renameSync(tmp, dest);
      updated++;
      console.log(`ok (${Math.round(bytes / 1024)} KB)`);
      await sleep(DELAY_MS);
    } catch (err) {
      if (fs.existsSync(`${dest}.tmp`)) fs.unlinkSync(`${dest}.tmp`);
      if (hasExisting) {
        kept++;
        console.log(`fail (${err.message}), kept existing`);
      } else {
        failed++;
        console.log(`fail (${err.message})`);
      }
    }
  }

  return { brand, updated, kept, failed, notFound, skipped, total: medicines.length };
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const stores = catalog.filter((s) => {
    const target = TARGET_STORES.find((t) => t.match.test(s.name || ''));
    if (!target) return false;
    if (BRAND_FILTER && !new RegExp(BRAND_FILTER, 'i').test(s.name || '')) return false;
    return true;
  });

  if (!stores.length) {
    console.error('No matching stores found');
    process.exit(1);
  }

  const summaries = [];
  for (const store of stores) {
    summaries.push(await refreshStore(store));
  }

  console.log('\nSummary');
  for (const s of summaries) {
    console.log(
      `  ${s.brand}: updated ${s.updated}, kept ${s.kept}, not found ${s.notFound}, failed ${s.failed}, skipped ${s.skipped}, total ${s.total}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Find catalog products whose image file is missing on disk, search the web,
 * save into medicine/medicine/{_id}.jpg, update imageFile, and list failures.
 *
 * Usage:
 *   node scripts/fetchMissingProductImages.js
 *   LIMIT=20 node scripts/fetchMissingProductImages.js
 *   DRY_RUN=1 node scripts/fetchMissingProductImages.js
 */
const fs = require('fs');
const path = require('path');
const {
  CATALOG_PATH,
  IMAGE_DIR,
  resolveImageOnline,
  downloadImage,
} = require('./catalogBrandUtils');
const { resolveImageWithWebFallback } = require('./imageWebSearch');

const LIMIT = Number(process.env.LIMIT || 0);
const DELAY_MS = Number(process.env.DELAY_MS || 500);
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const REPORT_PATH = path.join(
  path.dirname(CATALOG_PATH),
  'missing-product-images.json'
);
const REPORT_MD_PATH = path.join(
  path.dirname(CATALOG_PATH),
  'missing-product-images.md'
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function imageExists(imageFile, id) {
  const candidates = [
    imageFile,
    id ? `${id}.jpg` : '',
    id ? `${id}.jpeg` : '',
    id ? `${id}.png` : '',
    id ? `${id}.webp` : '',
  ]
    .filter(Boolean)
    .map((f) => path.join(IMAGE_DIR, path.basename(f)));

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).size >= 2500) return path.basename(p);
  }
  return null;
}

function collectMissing(catalog) {
  const missing = [];
  for (const store of catalog) {
    for (const med of store.medicines || []) {
      const id = String(med._id || '').trim();
      const existing = imageExists(med.imageFile, id);
      if (existing) {
        if (med.imageFile !== existing) med.imageFile = existing;
        continue;
      }
      missing.push({
        store,
        med,
        brand: med.brand || store.name,
        id,
      });
    }
  }
  return missing;
}

function writeUnavailableReport(unavailable) {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: unavailable.length,
    products: unavailable,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2));

  const lines = [
    '# Missing product images',
    '',
    `Generated: ${payload.generatedAt}`,
    `Count: ${unavailable.length}`,
    '',
    '| Store | Product | Brand | ID | Reason |',
    '| --- | --- | --- | --- | --- |',
    ...unavailable.map(
      (p) =>
        `| ${p.store} | ${String(p.name).replace(/\|/g, '/')} | ${p.brand} | \`${p._id}\` | ${p.reason} |`
    ),
    '',
  ];
  fs.writeFileSync(REPORT_MD_PATH, lines.join('\n'));
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Catalog not found:', CATALOG_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const missing = collectMissing(catalog);
  const queue = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;

  console.log(`Missing on disk: ${missing.length}`);
  console.log(`Will attempt: ${queue.length}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`Image dir: ${IMAGE_DIR}`);

  let downloaded = 0;
  let failed = 0;
  const unavailable = [];

  for (let i = 0; i < queue.length; i++) {
    const { store, med, brand, id } = queue[i];
    const imageFile = `${id || med._id}.jpg`;
    const dest = path.join(IMAGE_DIR, imageFile);
    const label = `[${i + 1}/${queue.length}] [${store.name}] ${med.name}`;

    process.stdout.write(`${label} ... `);

    if (!id) {
      failed++;
      unavailable.push({
        store: store.name,
        name: med.name,
        brand,
        _id: med._id || '',
        category: med.category || '',
        reason: 'missing_product_id',
      });
      console.log('no id');
      continue;
    }

    if (DRY_RUN) {
      console.log(`would search (${brand})`);
      continue;
    }

    try {
      const url = await resolveImageWithWebFallback(resolveImageOnline, brand, med.name);
      if (!url) {
        failed++;
        unavailable.push({
          store: store.name,
          name: med.name,
          brand,
          _id: id,
          category: med.category || '',
          reason: 'not_found_online',
        });
        console.log('not found');
        await sleep(DELAY_MS);
        continue;
      }

      const tmp = `${dest}.tmp`;
      await downloadImage(url, tmp);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(tmp, dest);
      med.imageFile = imageFile;
      downloaded++;
      console.log('ok');
      await sleep(DELAY_MS);
    } catch (err) {
      if (fs.existsSync(`${dest}.tmp`)) {
        try {
          fs.unlinkSync(`${dest}.tmp`);
        } catch (_) {
          /* ignore */
        }
      }
      failed++;
      unavailable.push({
        store: store.name,
        name: med.name,
        brand,
        _id: id,
        category: med.category || '',
        reason: `download_failed: ${err.message}`,
      });
      console.log(`fail (${err.message})`);
      await sleep(DELAY_MS);
    }
  }

  // Any remaining missing (beyond LIMIT) still go into the report as pending
  if (LIMIT > 0 && missing.length > queue.length) {
    for (const item of missing.slice(queue.length)) {
      unavailable.push({
        store: item.store.name,
        name: item.med.name,
        brand: item.brand,
        _id: item.id,
        category: item.med.category || '',
        reason: 'not_attempted_limit',
      });
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    writeUnavailableReport(unavailable);
  }

  console.log('\n=== Summary ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Unavailable / failed: ${failed}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Markdown: ${REPORT_MD_PATH}`);
  if (!DRY_RUN) console.log('Catalog updated:', CATALOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

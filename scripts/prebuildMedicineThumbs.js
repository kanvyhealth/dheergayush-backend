/**
 * Prebuild WebP thumbs for store product images.
 * Naming matches medicineAssetThumbs.js: {width}-{basenameWithoutExt}.webp
 *
 * Usage:
 *   node scripts/prebuildMedicineThumbs.js
 *   node scripts/prebuildMedicineThumbs.js --all
 *   node scripts/prebuildMedicineThumbs.js --width 400 --concurrency 4
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'medicine', 'medicine');
const CACHE_DIR = path.join(ROOT, 'medicine', '.thumbs');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const WIDTH = Math.min(800, Math.max(80, parseInt(argValue('--width', '400'), 10) || 400));
const CONCURRENCY = Math.min(16, Math.max(1, parseInt(argValue('--concurrency', '4'), 10) || 4));
const ALL_FILES = process.argv.includes('--all');
const FORCE = process.argv.includes('--force');

function cacheNameFor(file, width) {
  return `${width}-${file.replace(/\.[^.]+$/, '')}.webp`;
}

function collectCatalogImageFiles() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const files = new Set();
  for (const store of Array.isArray(catalog) ? catalog : []) {
    for (const med of store.medicines || []) {
      const file = String(med.imageFile || '').trim();
      if (!file) continue;
      const base = path.basename(file);
      if (IMAGE_EXT.has(path.extname(base).toLowerCase())) files.add(base);
    }
  }
  return [...files];
}

function collectAllImageFiles() {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  return fs.readdirSync(SOURCE_DIR).filter((name) => {
    const ext = path.extname(name).toLowerCase();
    return IMAGE_EXT.has(ext) && fs.statSync(path.join(SOURCE_DIR, name)).isFile();
  });
}

async function mapPool(items, concurrency, worker) {
  let idx = 0;
  const results = [];
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.error('sharp is required. Run: npm install sharp');
    process.exit(1);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let files = ALL_FILES ? collectAllImageFiles() : collectCatalogImageFiles();
  if (!files.length && !ALL_FILES) {
    console.warn('No catalog imageFile entries found; falling back to --all');
    files = collectAllImageFiles();
  }

  files = files.filter((f) => fs.existsSync(path.join(SOURCE_DIR, f)));
  console.log(`Prebuilding ${files.length} thumbs at width=${WIDTH} (concurrency=${CONCURRENCY})`);

  let built = 0;
  let skipped = 0;
  let failed = 0;

  await mapPool(files, CONCURRENCY, async (file) => {
    const src = path.join(SOURCE_DIR, file);
    const dest = path.join(CACHE_DIR, cacheNameFor(file, WIDTH));
    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 200) {
      skipped += 1;
      return;
    }
    const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
    try {
      await sharp(src)
        .rotate()
        .resize({
          width: WIDTH,
          height: WIDTH,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 72 })
        .toFile(tmp);
      fs.renameSync(tmp, dest);
      built += 1;
      if (built % 100 === 0) console.log(`  built ${built}…`);
    } catch (err) {
      failed += 1;
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      console.warn(`  fail ${file}: ${err.message}`);
    }
  });

  console.log(`Done. built=${built} skipped=${skipped} failed=${failed} cache=${CACHE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Replace Dabur store in medicine-catalog.json from OCR'd dabur-price-list.txt
 *
 * Usage:
 *   node scripts/extractDaburPdf.js
 *   node scripts/syncDaburFromPriceList.js
 */
const fs = require('fs');
const path = require('path');
const {
  CATALOG_PATH,
  IMAGE_DIR,
  parseWeight,
  normalizeCategory,
  cleanProductName,
  replaceStoreInCatalog,
  removeOrphanImages,
  attachImages,
} = require('./catalogBrandUtils');

const BRAND = 'Dabur';
const STORE_ID = '191b0c6d3ed44cc7c3607266';
const TEXT_PATH = path.join(__dirname, 'dabur-price-list.txt');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_IMAGES = args.includes('--skip-images');

const CODE_RE = /^F[A-Z]\d{5,6}[A-Z]?\b/;
const CATEGORY_RE =
  /^(ARK|ASAV\s*ARISHTA|AVLEHA|BHASMA|CHOORNA|GUTI|VATI|RAS|KALPA|GUGGUL|TAIL|OIL|PATENT|PROPRIETARY|TABLET|CAPSULE|SYRUP|POWDER|CHURNA|LEHYA|RASAYAN)[\s\-A-Z]*$/i;

function parseMrp(rest) {
  const nums = [...rest.matchAll(/\b(\d{2,5}(?:\.\d{1,2})?)\b/g)].map((m) => parseFloat(m[1]));
  if (!nums.length) return null;
  if (nums.length >= 3) return nums[nums.length - 3];
  return nums[0];
}

function parsePackAndName(rest, mrp) {
  let chunk = rest;
  if (mrp != null) {
    chunk = rest.replace(
      new RegExp(`\\s+${String(mrp).replace('.', '\\.')}(?:\\s+[\\d.]+){0,2}.*$`),
      '',
    );
  }
  chunk = chunk
    .replace(/~~/g, ' ')
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\b(South|North|PET|CP)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const packMatch =
    chunk.match(/(\d+(?:\.\d+)?)\s*(ml|gm|g|mg|kg|tab(?:let)?s?|caps?(?:ule)?s?)\b/i) ||
    chunk.match(/\b(\d+(?:\.\d+)?)\s*(ml|gm|g)\b/i);
  let pack = '1 unit';
  let name = chunk;
  if (packMatch) {
    pack = `${packMatch[1]} ${packMatch[2]}`;
    name = chunk.slice(0, packMatch.index).trim();
    name = name.replace(/\s+\d+(?:\.\d+)?\s*(?:ml|gm|g)\b.*$/i, '').trim();
  }
  name = name.replace(/[-+]+$/g, '').trim();
  if (!name || name.length < 2) return null;
  return { name: cleanProductName(name), pack };
}

function parseProductsFromText(text) {
  let category = 'Ayurvedic Medicines';
  const byName = new Map();

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('--- PAGE')) continue;
    if (/PRICE LIST|DABUR INDIA|SUPERCEDES|science of ayur/i.test(line)) continue;

    const catOnly = line.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!CODE_RE.test(line) && CATEGORY_RE.test(catOnly) && catOnly.length < 40) {
      category = normalizeCategory(catOnly);
      continue;
    }

    const codeMatch = line.match(/^(F[A-Z]\d{5,6}[A-Z]?)\s+(.+)$/);
    if (!codeMatch) continue;

    const materialCode = codeMatch[1];
    const rest = codeMatch[2];
    const mrp = parseMrp(rest);
    if (!mrp || mrp < 5 || mrp > 50000) continue;

    const parsed = parsePackAndName(rest, mrp);
    if (!parsed) continue;

    const weightMeta = parseWeight(parsed.pack.replace(/\s+/g, ' '));
    const variantLabel = rest.match(/\b(South|PET|North)\b/i)
      ? `${weightMeta.pack_label} (${rest.match(/\b(South|PET|North)\b/i)[1].toUpperCase()})`
      : weightMeta.pack_label;

    const key = normalizeName(parsed.name);
    if (!byName.has(key)) {
      byName.set(key, {
        name: parsed.name,
        category,
        weights: [],
      });
    }
    const product = byName.get(key);
    const dup = product.weights.find(
      (w) => w.pack_label === variantLabel && w.material_code === materialCode,
    );
    if (!dup) {
      product.weights.push({
        ...weightMeta,
        pack_label: variantLabel,
        price: mrp,
        variant_id: materialCode,
        material_code: materialCode,
      });
    }
  }

  return [...byName.values()].filter((p) => p.weights.length > 0);
}

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!fs.existsSync(TEXT_PATH)) {
    console.error('Missing', TEXT_PATH, '— run: node scripts/extractDaburPdf.js');
    process.exit(1);
  }
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }

  const text = fs.readFileSync(TEXT_PATH, 'utf8');
  const parsed = parseProductsFromText(text);
  console.log('Parsed', parsed.length, 'Dabur products from price list');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const storeIdx = catalog.findIndex((s) => s._id === STORE_ID || /^dabur$/i.test(s.name || ''));
  const oldMedicines = catalog[storeIdx]?.medicines || [];

  const { records, usedImageFiles, reused, downloaded, missing } = await attachImages({
    brand: BRAND,
    products: parsed,
    oldMedicines,
    dryRun: DRY_RUN,
    skipImages: SKIP_IMAGES,
    onProgress: (i, total) => {
      if (i % 25 === 0) console.log(`  images ${i}/${total}`);
    },
  });

  replaceStoreInCatalog(catalog, {
    storeId: STORE_ID,
    brandName: BRAND,
    brandMatch: /^dabur$/i,
    newMedicines: records,
    description: `${BRAND} — Ayurvedic Specialities price list (June 2024).`,
  });

  if (!DRY_RUN) {
    if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });
    removeOrphanImages(oldMedicines, usedImageFiles);
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  }

  console.log('\nSummary');
  console.log('  Products:', records.length, '(was', oldMedicines.length, ')');
  console.log('  Images reused:', reused);
  console.log('  Images downloaded:', downloaded);
  console.log('  Images missing:', missing);
  console.log(DRY_RUN ? '  DRY RUN — catalog not written' : `  Updated ${CATALOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

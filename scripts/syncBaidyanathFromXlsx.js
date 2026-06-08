/**
 * Replace Baidyanath store in medicine-catalog.json from Baidyanath.xlsx price list.
 *
 * Usage: node scripts/syncBaidyanathFromXlsx.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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

const BRAND = 'Baidyanath';
const STORE_ID = 'ffd0414146c8a65a8b635f06';
const XLSX_PATH = path.join(__dirname, '..', '..', 'Baidyanath.xlsx');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_IMAGES = args.includes('--skip-images');

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescription(desc) {
  const raw = String(desc || '').trim();
  const withoutPet = raw.replace(/\s*\(PET\)\s*$/i, '').trim();

  const m = withoutPet.match(/^(.+?)[.,\s]+(\d+(?:\.\d+)?)\s*(ML|GM|G|MG|KG|TAB(?:LET)?S?|CAPS?(?:ULE)?S?)\s*$/i);
  if (m) {
    const isPet = /\(PET\)/i.test(raw);
    const pack = `${m[2]} ${m[3]}`.toLowerCase();
    const packLabel = isPet ? `${pack} (PET)` : pack;
    return {
      name: cleanProductName(m[1].replace(/[.,]+$/g, '').trim()),
      pack: packLabel,
    };
  }

  return {
    name: cleanProductName(withoutPet.replace(/[.,]+$/g, '').trim()),
    pack: '1 unit',
  };
}

function parseProductsFromXlsx() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const byName = new Map();

  for (const row of rows) {
    if (!row || typeof row[0] !== 'number') continue;
    const category = normalizeCategory(String(row[3] || ''));
    const desc = String(row[4] || '').trim();
    const mrp = Number(row[6]);
    if (!desc || !mrp || mrp <= 0) continue;

    const parsed = parseDescription(desc);
    const weightMeta = parseWeight(parsed.pack.replace(/\s*\(PET\)/i, ''));
    const packLabel = parsed.pack;

    const key = normalizeName(parsed.name);
    if (!byName.has(key)) {
      byName.set(key, { name: parsed.name, category, weights: [] });
    }
    const product = byName.get(key);
    const dup = product.weights.find((w) => w.pack_label === packLabel);
    if (!dup) {
      product.weights.push({
        ...weightMeta,
        pack_label: packLabel,
        price: mrp,
        variant_id: String(row[1] || row[2] || mrp),
        material_code: String(row[1] || ''),
      });
    }
  }

  return [...byName.values()].filter((p) => p.weights.length > 0);
}

async function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('Missing', XLSX_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }

  const parsed = parseProductsFromXlsx();
  console.log('Parsed', parsed.length, 'Baidyanath products from XLSX');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const storeIdx = catalog.findIndex((s) => s._id === STORE_ID || /baidyanath/i.test(s.name || ''));
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
    brandMatch: /baidyanath/i,
    newMedicines: records,
    description: `${BRAND} — official price list 2025-26.`,
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

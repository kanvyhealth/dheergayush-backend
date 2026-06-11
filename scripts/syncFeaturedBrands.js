/**
 * Sync featured store brands: Vaidyaratnam, IMPCOPS (and verify Dr Rao's).
 *
 * Usage:
 *   node scripts/syncFeaturedBrands.js
 *   node scripts/syncFeaturedBrands.js --dry-run
 *   node scripts/syncFeaturedBrands.js --skip-images
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { VAIDYARATNAM_PRODUCTS } = require('../lib/vaidyaratnamCatalog');
const { classifyStoreProduct } = require('../lib/storeCategories');
const {
  CATALOG_PATH,
  IMAGE_DIR,
  parseWeight,
  cleanProductName,
  buildMedicineRecord,
  downloadImage,
  attachImages
} = require('./catalogBrandUtils');

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_IMAGES = process.argv.includes('--skip-images');

const BRANDS = {
  Vaidyaratnam: {
    storeId: 'a3f1c8d29b4e60718f5d2a91',
    description: 'Vaidyaratnam Oushadhasala — classical and proprietary Ayurvedic medicines.',
    brandMatch: /vaidyaratnam|vidhya\s*ratnam|vidhyaratnam/i
  },
  IMPCOPS: {
    storeId: 'b7e2d4f18c9a60329e6b1d45',
    description: 'IMPCOPS — Indian Medical Practitioners Co-operative Pharmacy Ayurvedic medicines.',
    brandMatch: /impcops|incops/i
  }
};

function decodeText(raw) {
  return String(raw || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableStoreId(brand) {
  return crypto.createHash('md5').update(`store|${brand}`).digest('hex').slice(0, 24);
}

function upsertBrandStore(catalog, { storeId, brandName, brandMatch, medicines, description }) {
  const idx = catalog.findIndex(
    (store) => store._id === storeId || (brandMatch && brandMatch.test(store.name || ''))
  );
  const store = {
    _id: storeId,
    name: brandName,
    logo: '/logos/logo-horizontal.png',
    description,
    medicines: medicines.sort((a, b) => a.name.localeCompare(b.name))
  };
  if (idx >= 0) catalog[idx] = store;
  else catalog.push(store);
  return store;
}

function toVaidyaratnamProducts() {
  return VAIDYARATNAM_PRODUCTS.map((item) => {
    const weightMeta = parseWeight(item.pack);
    return {
      name: cleanProductName(item.name),
      category: item.category,
      description: `${item.name} — authentic Vaidyaratnam Ayurvedic formulation.`,
      weights: [{
        ...weightMeta,
        pack_label: item.pack,
        price: item.price,
        variant_id: String(item.price)
      }]
    };
  });
}

async function fetchImpcopsProducts() {
  const products = [];
  let page = 1;
  while (page <= 20) {
    const res = await fetch(`https://impcops.org.in/wp-json/wc/store/products?per_page=100&page=${page}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    products.push(...batch);
    page += 1;
  }

  const byName = new Map();
  for (const item of products) {
    const isAyurveda = (item.categories || []).some(
      (cat) => String(cat.name || '').trim().toUpperCase() === 'AYURVEDA'
    );
    if (!isAyurveda) continue;

    const name = cleanProductName(decodeText(item.name));
    if (!name) continue;
    const price = Math.round(Number(item.prices?.price || 0) / 100);
    if (!price || price <= 0) continue;

    const description = decodeText(item.description || item.short_description || `${name} — IMPCOPS Ayurvedic medicine.`);
    const imageUrl = item.images?.[0]?.src || item.images?.[0]?.thumbnail || '';
    const key = name.toLowerCase();
    const weightMeta = parseWeight(name);
    const entry = {
      name,
      description,
      imageUrl,
      category: classifyStoreProduct({ name, description, category: 'Ayurvedic Medicines' }),
      weights: [{
        ...weightMeta,
        pack_label: weightMeta.pack_label || '1 unit',
        price,
        variant_id: String(item.id || price)
      }]
    };

    if (!byName.has(key)) {
      byName.set(key, entry);
      continue;
    }
    const existing = byName.get(key);
    const dup = existing.weights.find((w) => w.price === price && w.pack_label === entry.weights[0].pack_label);
    if (!dup) existing.weights.push(entry.weights[0]);
    if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
  }

  return [...byName.values()];
}

async function buildBrandMedicines(brand, products, oldMedicines) {
  if (brand === 'Vaidyaratnam') {
    return attachImages({
      brand,
      products,
      oldMedicines,
      dryRun: DRY_RUN,
      skipImages: SKIP_IMAGES || DRY_RUN
    });
  }

  const records = [];
  const usedImageFiles = new Set();
  let downloaded = 0;
  let missing = 0;

  for (const product of products) {
    const built = buildMedicineRecord({ brand, product });
    let imageFile = built.imageFile;

    if (!SKIP_IMAGES && !DRY_RUN) {
      const dest = path.join(IMAGE_DIR, imageFile);
      if (product.imageUrl && !fs.existsSync(dest)) {
        try {
          const ext = path.extname(new URL(product.imageUrl).pathname) || '.jpg';
          imageFile = `${built._id}${ext}`;
          await downloadImage(product.imageUrl, path.join(IMAGE_DIR, imageFile));
          downloaded += 1;
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (_) {
          missing += 1;
        }
      } else if (!fs.existsSync(dest)) {
        missing += 1;
      }
    }

    usedImageFiles.add(imageFile);
    records.push({ ...built, imageFile });
  }

  return { records, usedImageFiles, downloaded, missing, reused: 0 };
}

async function syncBrand(catalog, brand, config, products) {
  const oldStore = catalog.find(
    (store) => store._id === config.storeId || config.brandMatch.test(store.name || '')
  );
  const oldMedicines = oldStore?.medicines || [];
  const built = await buildBrandMedicines(brand, products, oldMedicines);
  const store = upsertBrandStore(catalog, {
    storeId: config.storeId || stableStoreId(brand),
    brandName: brand,
    brandMatch: config.brandMatch,
    medicines: built.records,
    description: config.description
  });
  return {
    brand,
    count: store.medicines.length,
    downloaded: built.downloaded || 0,
    missing: built.missing || 0
  };
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Catalog not found:', CATALOG_PATH);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const vaidyaratnamProducts = toVaidyaratnamProducts();
  const impcopsProducts = await fetchImpcopsProducts();

  console.log(`Vaidyaratnam source products: ${vaidyaratnamProducts.length}`);
  console.log(`IMPCOPS Ayurveda products: ${impcopsProducts.length}`);

  const results = [];
  results.push(await syncBrand(catalog, 'Vaidyaratnam', BRANDS.Vaidyaratnam, vaidyaratnamProducts));
  results.push(await syncBrand(catalog, 'IMPCOPS', BRANDS.IMPCOPS, impcopsProducts));

  const drRao = catalog.find((store) => /dr\s*rao/i.test(store.name || ''));
  if (drRao) {
    results.push({ brand: drRao.name, count: (drRao.medicines || []).length, existing: true });
  } else {
    console.warn('Dr Rao store not found in catalog — add separately if needed.');
  }

  catalog.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  results.forEach((result) => {
    console.log(
      `${result.brand}: ${result.count} products`
      + (result.downloaded ? `, images downloaded ${result.downloaded}` : '')
      + (result.missing ? `, images missing ${result.missing}` : '')
      + (result.existing ? ' (already present)' : '')
    );
  });

  if (DRY_RUN) {
    console.log('\nDry run — catalog not written.');
    return;
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log('\nCatalog saved:', CATALOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

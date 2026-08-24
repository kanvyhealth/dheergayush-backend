/**
 * Load verified multi-brand catalog from public/data/medicine-catalog.json
 * (produced by scripts/sync_ayurvedic_to_store.py).
 */
const fs = require('fs');
const path = require('path');
const { filterExcludedStores, isExcludedMedicine } = require('./excludedBrands');
const { isValidAyurvedicProduct } = require('./excludedProducts');
const CATALOG_PATH = path.join(__dirname, '..', '..', '..', 'public', 'data', 'medicine-catalog.json');

let catalogMemo = {
  mtimeMs: 0,
  size: 0,
  medicines: null
};

function flattenCatalogStores(stores) {
  const medicines = [];
  stores.forEach((store) => {
    if (!Array.isArray(store.medicines)) return;
    const storeBrand = String(store.name || '').trim();
    (store.medicines || []).forEach((med) => {
      if (isExcludedMedicine({ ...med, storeName: storeBrand })) return;
      if (!isValidAyurvedicProduct(med)) return;
      const brand = String(med.brand || med.company || storeBrand || '').trim();
      medicines.push({
        ...med,
        company: brand,
        brand,
        storeName: storeBrand,
        storeId: store._id
      });
    });
  });
  return medicines;
}

function loadMedicineCatalogJson() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  try {
    const stat = fs.statSync(CATALOG_PATH);
    if (
      catalogMemo.medicines &&
      catalogMemo.mtimeMs === stat.mtimeMs &&
      catalogMemo.size === stat.size
    ) {
      return catalogMemo.medicines;
    }

    const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const stores = filterExcludedStores(Array.isArray(parsed) ? parsed : []);
    const medicines = flattenCatalogStores(stores);
    catalogMemo = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      medicines
    };
    return medicines;
  } catch (_) {
    return [];
  }
}

function invalidateMedicineCatalogJsonMemo() {
  catalogMemo = { mtimeMs: 0, size: 0, medicines: null };
}

module.exports = {
  loadMedicineCatalogJson,
  CATALOG_PATH,
  invalidateMedicineCatalogJsonMemo
};

/**
 * Load verified multi-brand catalog from public/data/medicine-catalog.json
 * (produced by scripts/sync_ayurvedic_to_store.py).
 */
const fs = require('fs');
const path = require('path');
const { filterExcludedStores, isExcludedMedicine } = require('./excludedBrands');
const { isValidAyurvedicProduct } = require('./excludedProducts');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog.json');

function loadMedicineCatalogJson() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  try {
    const stores = filterExcludedStores(JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')));
    if (!Array.isArray(stores)) return [];
    const medicines = [];
    stores.forEach((store) => {
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
  } catch (_) {
    return [];
  }
}

module.exports = { loadMedicineCatalogJson, CATALOG_PATH };
/**
 * Sync medicine catalog from disk images into MongoDB and format API responses.
 */
const Store = require('./data').Store;
const {
  buildMedicinesFromFolder,
  listMedicineImageFiles,
  STORE_META,
  MEDICINE_DIR
} = require('./medicineCatalog');

function medicineImageUrl(imageFile) {
  if (!imageFile) return null;
  return `/medicine-assets/${encodeURIComponent(imageFile)}`;
}

function formatMedicineForApi(med, index) {
  const doc = med.toObject ? med.toObject() : { ...med };
  const imageFile = doc.imageFile || '';
  return {
    _id: doc._id ? String(doc._id) : undefined,
    name: doc.name,
    description: doc.description,
    category: doc.category,
    imageFile,
    imageUrl: medicineImageUrl(imageFile),
    weights: doc.weights || []
  };
}

function formatStoreForApi(store) {
  const doc = store.toObject ? store.toObject() : { ...store };
  return {
    _id: String(doc._id),
    name: doc.name,
    logo: doc.logo,
    description: doc.description,
    medicines: (doc.medicines || []).map(formatMedicineForApi),
    medicineCount: (doc.medicines || []).length,
    updatedAt: doc.updatedAt
  };
}

/**
 * Upsert store catalog: create if missing, or refresh medicines from image folder.
 */
async function syncStoreCatalogFromImages({ forceRefresh = false } = {}) {
  const imageCount = listMedicineImageFiles().length;
  if (!imageCount) {
    console.warn('⚠️  No medicine images in', MEDICINE_DIR);
    return { synced: false, reason: 'no_images' };
  }

  const medicinesFromDisk = buildMedicinesFromFolder().map(({ _id, ...med }) => med);
  let store = await Store.findOne({ name: STORE_META.name });

  if (!store) {
    store = await Store.create({
      name: STORE_META.name,
      logo: STORE_META.logo,
      description: STORE_META.description,
      medicines: medicinesFromDisk
    });
    console.log('✅ Created store in MongoDB with', store.medicines.length, 'medicines');
    return { synced: true, created: true, count: store.medicines.length };
  }

  const existingCount = store.medicines?.length || 0;
  const missingImages = store.medicines?.some((m) => !m.imageFile);

  if (forceRefresh || existingCount === 0 || missingImages || existingCount !== medicinesFromDisk.length) {
    store.medicines = medicinesFromDisk;
    store.logo = STORE_META.logo;
    store.description = STORE_META.description;
    await store.save();
    console.log('✅ Synced', store.medicines.length, 'medicines to MongoDB (with imageFile paths)');
    return { synced: true, updated: true, count: store.medicines.length };
  }

  console.log('ℹ️  Store catalog already in MongoDB (' + existingCount + ' medicines)');
  return { synced: false, count: existingCount };
}

async function getStoresFromDatabase() {
  const stores = await Store.find().sort({ name: 1 });
  return stores.map(formatStoreForApi);
}

module.exports = {
  syncStoreCatalogFromImages,
  getStoresFromDatabase,
  formatStoreForApi,
  formatMedicineForApi,
  medicineImageUrl
};

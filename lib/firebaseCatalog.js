/**
 * Store catalog from Firebase — cached, paginated, with local image resolution.
 */
const { Medicine, ProductCategory, Banner } = require('./data');
const { getStorageBucket, initFirebase } = require('./firebase');
const {
  resolveMedicineImageUrl,
  imageUrlFromFile,
  normalizeBrand,
  normalizeName,
  inferBrandFromName,
  warmImageIndex
} = require('./medicineImageResolver');

const { buildAyurvedicSeedMedicines } = require('./ayurvedicCatalogSeed');
const { getTestCheckoutProduct, TEST_CHECKOUT_PRODUCT_ID } = require('./testCheckoutProduct');
const { loadMedicineCatalogJson } = require('./medicineCatalogJson');
const { filterExcludedMedicines } = require('./excludedBrands');

const CACHE_TTL_MS = 30 * 60 * 1000;

const EXCLUDED_CATEGORIES = new Set([
  'others', 'hidden', 'festival', 'general', 'all', 'all catagery'
]);

function normalizeStoreCategory(raw) {
  const cat = String(raw || 'Ayurvedic Medicines')
    .replace(/[\[\]'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!cat) return 'ayurvedic medicines';
  if (cat.includes('beauty') || cat.includes('cosmetic') || cat.includes('personal care') || cat.includes('skin') || cat.includes('hair')) {
    return 'ayurvedic beauty';
  }
  if (cat.includes('wellness') || cat.includes('health food') || cat.includes('juice') || cat.includes('tea')) {
    return 'ayurvedic wellness';
  }
  if (cat.includes('medicine') || cat.includes('ayurved') || cat.includes('tablet') || cat.includes('herb')) {
    return 'ayurvedic medicines';
  }
  return cat;
}

function isStoreProduct(med) {
  const cat = normalizeStoreCategory(med.category);
  if (EXCLUDED_CATEGORIES.has(cat)) return false;
  if (cat.includes('hidden')) return false;
  const reviewStatus = String(med.inventoryReviewStatus || 'ready').toLowerCase();
  if (reviewStatus === 'needs_review' || reviewStatus === 'rejected') return false;
  if (med.storeVisible === false) return false;
  return (
    cat === 'ayurvedic medicines'
    || cat === 'ayurvedic beauty'
    || cat === 'ayurvedic wellness'
    || cat.includes('ayurved')
    || cat.includes('medicine')
    || cat.includes('beauty')
    || cat.includes('wellness')
    || cat.includes('health')
    || cat.includes('guggul')
    || cat.includes('bhasma')
    || cat.includes('choorna')
    || cat.includes('arishta')
    || cat.includes('asava')
    || cat.includes('kadha')
    || cat.includes('rasakalpa')
    || cat.includes('suvarna')
    || cat.includes('proprietary')
    || cat.includes('vati')
    || cat.includes('guti')
    || cat.includes('avaleha')
    || cat.includes('bheshajamrut')
    || cat.includes('herb')
    || cat.includes('consumer')
    || cat.includes('parpati')
    || cat.includes('pishti')
    || cat.includes('mandoor')
    || cat.includes('pottali')
    || cat.includes('pravahi')
    || cat.includes('vaidya')
    || cat.includes('kupipakwa')
    || cat.includes('rasayan')
    || cat.includes('loha')
  );
}

/** @deprecated use isStoreProduct */
function isAyurvedicMedicine(med) {
  return isStoreProduct(med);
}

let imageMapCache = null;
let imageMapExpiry = 0;
let catalogCache = null;
let catalogExpiry = 0;
let catalogPromise = null;

async function buildMedicineImageMap() {
  const now = Date.now();
  if (imageMapCache && now < imageMapExpiry) return imageMapCache;

  await initFirebase();
  const bucket = getStorageBucket();
  const map = {};
  if (bucket) {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const [files] = await bucket.getFiles({ prefix: 'products/medicines/' });
    await Promise.all(files.map(async (file) => {
      const base = file.name.replace('products/medicines/', '').split('-')[0];
      if (map[base]) return;
      try {
        const [meta] = await file.getMetadata();
        const token = meta.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
        if (token) {
          const encoded = encodeURIComponent(file.name);
          map[base] = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
          return;
        }
        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
        map[base] = url;
      } catch (_) { /* skip */ }
    }));
  }
  imageMapCache = map;
  imageMapExpiry = now + 10 * 60 * 1000;
  return map;
}

function parseQuantity(qty) {
  const s = String(qty || '1 unit');
  const m = s.match(/([\d.]+)\s*([a-zA-Z]+)?/);
  return {
    value: m ? parseFloat(m[1]) : 1,
    unit: m && m[2] ? m[2] : 'unit'
  };
}

function getMedicineBrand(doc) {
  return String(doc.company || doc.manufacturer || doc.brand || '').trim();
}

/** Strip leading brand from name; when brand === name return brand token for merging. */
function normalizeMedicineName(name, brandRaw) {
  let n = normalizeName(name);
  const brand = normalizeBrand(brandRaw);
  if (!n) return n;
  if (!brand) return n;
  const rawBrand = normalizeName(brandRaw);
  if (n === brand || n === rawBrand) return brand;
  if (rawBrand && n.startsWith(`${rawBrand} `)) {
    n = n.slice(rawBrand.length).trim();
  } else if (brand && n.startsWith(`${brand} `)) {
    n = n.slice(brand.length).trim();
  }
  return normalizeName(n);
}

function medicineMergeKey(med) {
  const brandRaw = getMedicineBrand(med);
  const brand = normalizeBrand(brandRaw);
  const name = normalizeMedicineName(med.name, brandRaw);
  if (brand && (!name || name === brand)) {
    return `${brand}|__product__`;
  }
  return `${brand}|${name}`;
}

function buildWeightsFromDoc(doc) {
  if (Array.isArray(doc.weights) && doc.weights.length) {
    return doc.weights.map((w) => ({
      value: Number(w.value) || 1,
      unit: w.unit || 'unit',
      price: Number(w.price ?? w.price_inr ?? doc.price_inr ?? doc.price) || 0
    }));
  }
  const pack = doc.pack_size || doc.quantity;
  const { value, unit } = parseQuantity(pack);
  return [{
    value,
    unit,
    price: Number(doc.price_inr ?? doc.price) || 0
  }];
}

function pickDisplayName(existingName, incomingName, brandRaw) {
  const brand = normalizeBrand(brandRaw);
  const a = String(existingName || '').trim();
  const b = String(incomingName || '').trim();
  if (!a) return b;
  if (!b) return a;
  const aNorm = normalizeMedicineName(a, brandRaw);
  const bNorm = normalizeMedicineName(b, brandRaw);
  if (aNorm === brand && bNorm !== brand) return b;
  if (bNorm === brand && aNorm !== brand) return a;
  return a.length >= b.length ? a : b;
}

function mergeWeightLists(existing, incoming) {
  const merged = [...(existing || [])];
  for (const w of incoming || []) {
    const idx = merged.findIndex((x) => x.value === w.value && x.unit === w.unit);
    if (idx === -1) {
      merged.push({ ...w });
    } else if (Number(w.price) < Number(merged[idx].price)) {
      merged[idx] = { ...w };
    }
  }
  merged.sort((a, b) => {
    if (a.unit === b.unit) return a.value - b.value;
    return String(a.unit).localeCompare(String(b.unit));
  });
  return merged;
}

/** Same brand + name → one product with multiple pack sizes in weights[]. */
function mergeMedicineDuplicates(medicines) {
  const groups = new Map();

  for (const med of medicines) {
    const key = medicineMergeKey(med);
    if (!groups.has(key)) {
      groups.set(key, {
        ...med,
        weights: (med.weights || []).map((w) => ({ ...w, medicineId: med._id })),
        variantIds: [med._id]
      });
      continue;
    }

    const group = groups.get(key);
    group.weights = mergeWeightLists(
      group.weights,
      (med.weights || []).map((w) => ({ ...w, medicineId: med._id }))
    );
    group.variantIds.push(med._id);
    group.name = pickDisplayName(group.name, med.name, group.company);
    if (!group.imageFile && med.imageFile) group.imageFile = med.imageFile;
    if (!group.imageUrl && med.imageUrl) group.imageUrl = med.imageUrl;
    else if (!group.imageUrl && med.imageFile) group.imageUrl = imageUrlFromFile(med.imageFile);
    if (med.description && (!group.description || med.description.length > group.description.length)) {
      group.description = med.description;
    }
  }

  let merged = Array.from(groups.values()).map((med) => {
    med._id = med.variantIds[0];
    delete med.variantIds;
    return med;
  });

  merged = foldUnbrandedDuplicates(merged);
  return merged;
}

/** Merge unbranded rows into the single branded match with the same core name. */
function foldUnbrandedDuplicates(medicines) {
  const branded = medicines.filter((m) => normalizeBrand(getMedicineBrand(m)));
  const orphans = medicines.filter((m) => !normalizeBrand(getMedicineBrand(m)));
  if (!orphans.length) return medicines;

  const removeIds = new Set();

  for (const orphan of orphans) {
    const oName = normalizeMedicineName(orphan.name, '') || normalizeName(orphan.name);
    if (!oName) continue;

    const matches = branded.filter((b) => {
      if (removeIds.has(b._id)) return false;
      const bName = normalizeMedicineName(b.name, getMedicineBrand(b));
      return bName === oName;
    });

    const brands = new Set(matches.map((m) => normalizeBrand(getMedicineBrand(m))));
    if (matches.length !== 1 || brands.size !== 1) continue;

    const target = matches[0];
    target.weights = mergeWeightLists(
      target.weights,
      (orphan.weights || []).map((w) => ({ ...w, medicineId: orphan._id }))
    );
    if (!target.imageFile && orphan.imageFile) target.imageFile = orphan.imageFile;
    if (!target.imageUrl && orphan.imageUrl) target.imageUrl = orphan.imageUrl;
    else if (!target.imageUrl && orphan.imageFile) target.imageUrl = imageUrlFromFile(orphan.imageFile);
    removeIds.add(orphan._id);
  }

  return medicines.filter((m) => !removeIds.has(m._id));
}

function formatMedicineForStore(med, imageMap) {
  const doc = med.toObject ? med.toObject() : { ...med };
  const id = String(doc._id || doc.id || '');
  let company = getMedicineBrand(doc);
  if (!company) company = inferBrandFromName(doc.name) || '';
  const imageFile = doc.imageFile || null;
  const reviewStatus = String(doc.inventoryReviewStatus || 'ready').toLowerCase();
  const price = Number(doc.price_inr ?? doc.price ?? 0) || 0;
  const storeVisible = reviewStatus === 'ready' && reviewStatus !== 'rejected';
  const formatted = {
    _id: id,
    id,
    name: doc.name,
    description: doc.description || `${company} — ${doc.name}`.trim(),
    category: doc.category || 'Ayurvedic Medicines',
    company,
    brand: doc.brand || company,
    imageFile,
    imageUrl: doc.imageUrl || doc.image_url || imageUrlFromFile(imageFile) || null,
    price,
    weights: buildWeightsFromDoc(doc),
    inventoryReviewStatus: reviewStatus,
    source: String(doc.source || 'catalog'),
    isStoreListed: doc.isStoreListed !== false && storeVisible,
    orderable: storeVisible && price > 0,
    storeVisible
  };
  if (!formatted.imageUrl) {
    formatted.imageUrl = resolveMedicineImageUrl(formatted, imageMap);
  }
  return formatted;
}

function canonicalBrandLabel(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const a = existing.trim();
  const b = incoming.trim();
  if (normalizeBrand(a) !== normalizeBrand(b)) return existing;
  if (b.length <= a.length) return b.charAt(0).toUpperCase() + b.slice(1);
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function buildStoresFromMedicines(medicines) {
  const byCompany = {};

  for (const med of medicines) {
    const company = (med.company || inferBrandFromName(med.name) || 'General').trim();
    const key = normalizeBrand(company) || company.toLowerCase().replace(/[^a-z0-9]/g, '') || 'general';
    if (!byCompany[key]) {
      byCompany[key] = {
        _id: key.replace(/\s+/g, '_'),
        name: company.charAt(0).toUpperCase() + company.slice(1),
        logo: '/logos/logo-horizontal.png',
        description: `${company} — Ayurvedic products`,
        medicines: [],
        medicineCount: 0
      };
    } else {
      byCompany[key].name = canonicalBrandLabel(byCompany[key].name, company);
    }
    byCompany[key].medicines.push(med);
    byCompany[key].medicineCount++;
  }

  return Object.values(byCompany).sort((a, b) => a.name.localeCompare(b.name));
}

function buildStoresSummary(stores) {
  return stores.map((s) => ({
    _id: s._id,
    name: s.name,
    logo: s.logo,
    description: s.description,
    medicineCount: s.medicineCount || (s.medicines ? s.medicines.length : 0)
  }));
}

async function loadCatalogCache(force = false) {
  const now = Date.now();
  if (!force && catalogCache && now < catalogExpiry) return catalogCache;
  if (catalogPromise && !force) return catalogPromise;

  catalogPromise = (async () => {
    warmImageIndex();
    const jsonMeds = loadMedicineCatalogJson();
    const jsonFormatted = jsonMeds.map((m) => formatMedicineForStore(m, {}));

    let firebaseMeds = [];
    let imageMap = {};
    let rawCount = 0;

    if (jsonFormatted.length) {
      // JSON catalog is authoritative — skip slow Firebase medicine/image-map fetch.
      rawCount = jsonMeds.length;
    } else {
      const [meds, map] = await Promise.all([
        Medicine.find({}),
        buildMedicineImageMap()
      ]);
      rawCount = meds.length;
      imageMap = map;
      firebaseMeds = meds.map((m) => formatMedicineForStore(m, imageMap));
    }

    const jsonBrands = new Set(
      jsonFormatted.map((m) => normalizeBrand(m.company)).filter(Boolean)
    );
    const firebaseFiltered = jsonBrands.size
      ? firebaseMeds.filter((m) => !jsonBrands.has(normalizeBrand(m.company)))
      : firebaseMeds;
    const seedMeds = jsonFormatted.length
      ? []
      : buildAyurvedicSeedMedicines().map((m) => formatMedicineForStore(m, imageMap));
    let medicines = filterExcludedMedicines(
      mergeMedicineDuplicates([...jsonFormatted, ...firebaseFiltered, ...seedMeds])
        .filter(isStoreProduct)
    );
    medicines = [
      getTestCheckoutProduct(),
      ...medicines.filter((m) => String(m._id) !== TEST_CHECKOUT_PRODUCT_ID)
    ];
    const stores = buildStoresFromMedicines(medicines);
    catalogCache = {
      medicines,
      stores,
      summary: buildStoresSummary(stores),
      imageMap,
      loadedAt: Date.now(),
      count: medicines.length,
      rawCount
    };
    catalogExpiry = Date.now() + CACHE_TTL_MS;
    catalogPromise = null;
    return catalogCache;
  })();

  return catalogPromise;
}

async function warmCatalogCache() {
  try {
    const cache = await loadCatalogCache(true);
    const withImages = cache.medicines.filter((m) => m.imageUrl).length;
    const raw = cache.rawCount || cache.count;
    console.log(`📦 Store catalog cached: ${cache.count} unique products (${raw} raw), ${cache.summary.length} brands, ${withImages} with images`);
    return cache;
  } catch (err) {
    console.warn('⚠️  Store catalog warm-up failed:', err.message);
    return null;
  }
}

function filterMedicines(medicines, { company, category, q } = {}) {
  let list = medicines.filter(isStoreProduct);
  if (company && company !== 'all') {
    const brand = normalizeBrand(company);
    list = list.filter((m) => normalizeBrand(m.company) === brand || m.company.toLowerCase() === company.toLowerCase());
  }
  if (category && category !== 'all') {
    const cat = normalizeStoreCategory(category);
    list = list.filter((m) => normalizeStoreCategory(m.category) === cat);
  }
  if (q) {
    const query = q.toLowerCase().trim();
    list = list.filter((m) => {
      const n = (m.name || '').toLowerCase();
      const d = (m.description || '').toLowerCase();
      const c = (m.company || '').toLowerCase();
      return n.includes(query) || d.includes(query) || c.includes(query);
    });
  }
  return list;
}

function findCatalogMedicineById(medicines, medicineId) {
  const id = String(medicineId || '').trim();
  if (!id) return null;
  return medicines.find(
    (m) => String(m._id) === id || String(m.id) === id
  ) || null;
}

function invalidateCatalogCache() {
  catalogCache = null;
  catalogExpiry = 0;
  catalogPromise = null;
}

async function loadFirestoreCatalogOverrides(imageMap = {}) {
  try {
    const { initFirebase } = require('./firebase');
    await initFirebase();
    const docs = await Medicine.find({ catalogOverride: true });
    return docs.map((m) => formatMedicineForStore(m, imageMap));
  } catch (err) {
    console.warn('⚠️ Firestore catalog overrides skipped:', err.message);
    return [];
  }
}

function applyCatalogOverrides(baseMedicines, overrides) {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return baseMedicines;
  }

  const overrideById = new Map(
    overrides.map((m) => [String(m._id || m.id), m])
  );

  const merged = baseMedicines.map((med) => {
    const id = String(med._id || med.id || '');
    const override = overrideById.get(id);
    if (!override) return med;
    overrideById.delete(id);
    return {
      ...med,
      ...override,
      _id: id,
      id,
      catalogOverride: true
    };
  });

  for (const override of overrideById.values()) {
    merged.push(override);
  }

  return merged;
}

async function getCatalogMedicinesWithOverrides() {
  const cache = await loadCatalogCache();
  const overrides = await loadFirestoreCatalogOverrides(cache.imageMap || {});
  return applyCatalogOverrides(cache.medicines, overrides);
}

async function getMedicinesByIds(ids = []) {
  const normalized = [...new Set(
    (Array.isArray(ids) ? ids : String(ids).split(','))
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )].slice(0, 100);

  if (!normalized.length) {
    return { items: [], found: 0, requested: 0 };
  }

  const medicines = await getCatalogMedicinesWithOverrides();
  const byId = new Map();
  for (const med of medicines) {
    const key = String(med._id || med.id || '');
    if (key) {
      byId.set(key, {
        ...med,
        storeId: normalizeBrand(med.company) || med.company.toLowerCase().replace(/\s+/g, '_'),
        storeName: med.company || 'General'
      });
    }
  }

  const items = normalized
    .map((id) => byId.get(id))
    .filter(Boolean);

  return {
    items,
    found: items.length,
    requested: normalized.length
  };
}

/**
 * Validates checkout line items against the live store catalog (JSON or Firebase).
 * Replaces client prices with catalog prices.
 */
async function validateOrderItemsAgainstCatalog(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Order must contain at least one item');
    err.status = 400;
    throw err;
  }

  const medicines = await getCatalogMedicinesWithOverrides();
  const normalized = [];
  let subtotal = 0;

  for (const item of items) {
    const medicineId = String(
      item.medicineId || item.storeProductId || item.id || item.productId || ''
    ).trim();
    const catalogMed = findCatalogMedicineById(medicines, medicineId);
    if (!catalogMed) {
      const err = new Error(
        `Product not available in store: ${item.name || item.productName || medicineId}`
      );
      err.status = 400;
      throw err;
    }

    const pricePerUnit = Number(catalogMed.price || 0);
    if (pricePerUnit <= 0) {
      const err = new Error(`Product is not for sale: ${catalogMed.name}`);
      err.status = 400;
      throw err;
    }

    const qty = Math.max(1, Math.min(99, Number(item.quantity || 1)));

    const totalPrice = Math.round(pricePerUnit * qty * 100) / 100;
    subtotal += totalPrice;
    normalized.push({
      medicineId: String(catalogMed._id || catalogMed.id),
      storeProductId: String(catalogMed._id || catalogMed.id),
      storeId: normalizeBrand(catalogMed.company) || catalogMed.company.toLowerCase().replace(/\s+/g, '_'),
      storeName: catalogMed.company || 'General',
      name: catalogMed.name,
      productName: catalogMed.name,
      pricePerUnit,
      quantity: qty,
      totalPrice,
      productType: item.productType || 'medicine',
      productTypeName: item.productTypeName || 'Medicine'
    });
  }

  return {
    items: normalized,
    subtotal: Math.round(subtotal * 100) / 100
  };
}

async function getMedicinesPaginated(opts = {}) {
  const cache = await loadCatalogCache();
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 48));
  const medicines = await getCatalogMedicinesWithOverrides();
  const list = filterMedicines(medicines, opts);
  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit).map((m) => ({
    ...m,
    storeId: normalizeBrand(m.company) || m.company.toLowerCase().replace(/\s+/g, '_'),
    storeName: m.company || 'General'
  }));

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    cachedAt: cache.loadedAt
  };
}

async function getStoresSummaryFromFirebase() {
  const cache = await loadCatalogCache();
  return cache.summary;
}

async function getStoresFromFirebase() {
  const cache = await loadCatalogCache();
  return cache.stores;
}

async function getMedicinesFromFirebase() {
  return getCatalogMedicinesWithOverrides();
}

async function getProductCategoriesFromFirebase() {
  const cats = await ProductCategory.find({});
  return cats
    .filter((c) => c.isActive !== false)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .map((c) => {
      const doc = c.toObject ? c.toObject() : c;
      return {
        _id: doc._id || doc.id,
        name: doc.name,
        description: doc.description || '',
        imageUrl: doc.imageUrl || '',
        productType: doc.productType || ''
      };
    });
}

async function getBannersFromFirebase() {
  const banners = await Banner.find({});
  return banners
    .filter((b) => b.isActive === true)
    .map((b) => {
      const doc = b.toObject ? b.toObject() : b;
      return {
        _id: doc._id || doc.id,
        url: doc.url,
        type: doc.type || 'image',
        bucketPath: doc.bucketPath || ''
      };
    });
}

module.exports = {
  getMedicinesFromFirebase,
  getMedicinesPaginated,
  getMedicinesByIds,
  validateOrderItemsAgainstCatalog,
  getStoresFromFirebase,
  getStoresSummaryFromFirebase,
  getProductCategoriesFromFirebase,
  getBannersFromFirebase,
  buildMedicineImageMap,
  warmCatalogCache,
  loadCatalogCache,
  invalidateCatalogCache,
  getCatalogMedicinesWithOverrides,
  mergeMedicineDuplicates,
  medicineMergeKey,
  formatMedicineForStore
};

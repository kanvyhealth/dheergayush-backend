/**
 * Store catalog from Firebase — cached, paginated, with local image resolution.
 */
const { Medicine, ProductCategory, Banner } = require('../data');
const { getStorageBucket, initFirebase } = require('./');
const {
  resolveMedicineImageUrl,
  imageUrlFromFile,
  extractMedicineAssetFile,
  normalizeMedicineImageUrl,
  normalizeBrand,
  normalizeName,
  inferBrandFromName,
  warmImageIndex
} = require('../../modules/store/medicineImageResolver');

const { buildAyurvedicSeedMedicines } = require('../../modules/store/ayurvedicCatalogSeed');
const { loadMedicineCatalogJson } = require('../../modules/store/medicineCatalogJson');
const {
  readStoreBootstrap,
  readStoreCatalogReady,
  matchBootstrapPage
} = require('../../modules/store/storeBootstrapFile');
const { filterExcludedMedicines } = require('../../modules/store/excludedBrands');
const { isValidAyurvedicProduct } = require('../../modules/store/excludedProducts');
const { buildSearchIndex, searchMedicines } = require('../../modules/store/catalogSearch');
const { toListImageUrl } = require('../../modules/store/medicineAssetThumbs');
const {
  STORE_DEPARTMENTS,
  STORE_SUBCATEGORIES,
  ORGANIC_FOOD_SUBCATEGORIES,
  AYURVEDIC_MEDICINE_SUBCATEGORIES,
  normalizeStoreCategoryKey,
  classifyStoreProduct,
  classifyStoreSubcategory,
  productMatchesDepartment,
  productMatchesSubcategory,
  toStoreSlug,
  storePathFor
} = require('../../modules/store/storeCategories');
const { sortStoresWithFeatured, getStoreMenuLabel } = require('../../modules/store/featuredStoreBrands');

const CACHE_TTL_MS = 30 * 60 * 1000;
const LIST_THUMB_WIDTH = 400;

const EXCLUDED_CATEGORIES = new Set([
  'others', 'hidden', 'festival', 'general', 'all', 'all catagery'
]);

function isStoreProduct(med) {
  if (!isValidAyurvedicProduct(med)) return false;
  const reviewStatus = String(med.inventoryReviewStatus || 'ready').toLowerCase();
  if (reviewStatus === 'needs_review' || reviewStatus === 'rejected') return false;
  if (med.storeVisible === false) return false;
  if (STORE_DEPARTMENTS.includes(med.category)) return true;
  const cat = normalizeStoreCategoryKey(med.category);
  if (EXCLUDED_CATEGORIES.has(cat)) return false;
  if (cat.includes('hidden')) return false;
  return STORE_DEPARTMENTS.includes(classifyStoreProduct(med));
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
let overridesCache = null;
let overridesExpiry = 0;
let overridesPromise = null;

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
  const imageFile = doc.imageFile || extractMedicineAssetFile(doc.imageUrl || doc.image_url) || null;
  const reviewStatus = String(doc.inventoryReviewStatus || 'ready').toLowerCase();
  const price = Number(doc.price_inr ?? doc.price ?? 0) || 0;
  const storeVisible = reviewStatus === 'ready' && reviewStatus !== 'rejected';
  const category = STORE_DEPARTMENTS.includes(doc.category)
    ? doc.category
    : classifyStoreProduct(doc);
  const allowedSubs = STORE_SUBCATEGORIES[category] || [];
  const subCategory = allowedSubs.includes(doc.subCategory)
    ? doc.subCategory
    : classifyStoreSubcategory({ ...doc, category });
  const formatted = {
    _id: id,
    id,
    name: doc.name,
    description: doc.description || `${company} — ${doc.name}`.trim(),
    category,
    subCategory,
    company,
    brand: doc.brand || company,
    imageFile,
    imageUrl: normalizeMedicineImageUrl(doc.imageUrl || doc.image_url, imageFile) || null,
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
  if (!formatted.imageFile && formatted.imageUrl) {
    formatted.imageFile = extractMedicineAssetFile(formatted.imageUrl);
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
  return sortStoresWithFeatured(stores).map((s) => ({
    _id: s._id,
    name: s.name,
    menuLabel: getStoreMenuLabel(s.name),
    logo: s.logo,
    description: s.description,
    medicineCount: s.medicineCount || (s.medicines ? s.medicines.length : 0)
  }));
}

function ensureSearchIndex(cache) {
  if (!cache) return null;
  if (!cache.searchIndex) {
    cache.searchIndex = buildSearchIndex(cache.medicines || []);
  }
  return cache.searchIndex;
}

function hydrateCatalogFromReady(ready) {
  const medicines = ready.medicines;
  const stores = buildStoresFromMedicines(medicines);
  const loadedAt = Date.now();
  const cache = {
    medicines,
    stores,
    summary: Array.isArray(ready.summary) && ready.summary.length
      ? ready.summary
      : buildStoresSummary(stores),
    searchIndex: null,
    taxonomy: ready.taxonomy || buildTaxonomyFromMedicines(medicines),
    page1: ready.page1 || null,
    imageMap: {},
    loadedAt,
    count: medicines.length,
    rawCount: medicines.length,
    fromSnapshot: true
  };
  if (!cache.page1) {
    const list = filterMedicines(medicines, {});
    const limit = 24;
    cache.page1 = {
      items: list.slice(0, limit).map(toListMedicine),
      total: list.length,
      page: 1,
      limit,
      pages: Math.ceil(list.length / limit) || 1,
      cachedAt: loadedAt
    };
  }
  return cache;
}

function ensureCatalogCacheLoading() {
  if (!catalogCache && !catalogPromise) {
    loadCatalogCache().catch(() => {});
  }
}

async function loadCatalogCache(force = false) {
  const now = Date.now();
  if (!force && catalogCache && now < catalogExpiry) return catalogCache;
  if (catalogPromise && !force) return catalogPromise;

  if (!force) {
    const ready = readStoreCatalogReady();
    if (ready) {
      catalogCache = hydrateCatalogFromReady(ready);
      catalogExpiry = Date.now() + CACHE_TTL_MS;
      loadFirestoreCatalogOverrides(catalogCache.imageMap || {}).catch(() => {});
      return catalogCache;
    }
  }

  catalogPromise = (async () => {
    const started = Date.now();
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
    const medicines = filterExcludedMedicines(
      mergeMedicineDuplicates([...jsonFormatted, ...firebaseFiltered, ...seedMeds])
        .filter(isStoreProduct)
    );
    const stores = buildStoresFromMedicines(medicines);
    catalogCache = {
      medicines,
      stores,
      summary: buildStoresSummary(stores),
      searchIndex: null,
      taxonomy: buildTaxonomyFromMedicines(medicines),
      page1: null,
      imageMap,
      loadedAt: Date.now(),
      count: medicines.length,
      rawCount,
      fromSnapshot: false
    };
    // Precompute default unfiltered page-1 for instant /api/medicines hits.
    {
      const list = filterMedicines(medicines, {});
      const limit = 24;
      catalogCache.page1 = {
        items: list.slice(0, limit).map(toListMedicine),
        total: list.length,
        page: 1,
        limit,
        pages: Math.ceil(list.length / limit) || 1,
        cachedAt: catalogCache.loadedAt
      };
    }
    catalogExpiry = Date.now() + CACHE_TTL_MS;
    catalogPromise = null;
    console.log(`Store catalog ready: ${catalogCache.count} products in ${Date.now() - started}ms`);
    // Warm Firestore overrides in the background so the first /api/medicines
    // request does not block on a cold Medicine.find().
    loadFirestoreCatalogOverrides(imageMap).catch(() => {});
    return catalogCache;
  })();

  return catalogPromise;
}

async function warmCatalogCache(opts = {}) {
  try {
    const cache = await loadCatalogCache(!!opts.forceRebuild);
    loadFirestoreCatalogOverrides(cache.imageMap || {}).catch(() => {});
    const withImages = cache.medicines.filter((m) => m.imageUrl).length;
    const raw = cache.rawCount || cache.count;
    const via = cache.fromSnapshot ? 'snapshot' : 'rebuild';
    console.log(`📦 Store catalog cached (${via}): ${cache.count} unique products (${raw} raw), ${cache.summary.length} brands, ${withImages} with images`);
    return cache;
  } catch (err) {
    console.warn('⚠️  Store catalog warm-up failed:', err.message);
    return null;
  }
}

function filterMedicines(medicines, { company, category, subcategory, q, searchIndex } = {}) {
  let list = medicines;
  if (company && company !== 'all') {
    const brand = normalizeBrand(company);
    list = list.filter((m) => normalizeBrand(m.company) === brand || m.company.toLowerCase() === company.toLowerCase());
  }
  if (category && category !== 'all') {
    list = list.filter((m) => productMatchesDepartment(m, category));
  }
  if (subcategory && subcategory !== 'all') {
    list = list.filter((m) => productMatchesSubcategory(m, subcategory));
  }
  if (q) {
    list = searchMedicines(list, q, { index: searchIndex || ensureSearchIndex(catalogCache) });
  }
  return list;
}

function toListMedicine(m) {
  const imageFile = m.imageFile || extractMedicineAssetFile(m.imageUrl) || null;
  const fullUrl = normalizeMedicineImageUrl(m.imageUrl, imageFile) || imageUrlFromFile(imageFile) || null;
  return {
    _id: m._id,
    id: m.id || m._id,
    name: m.name,
    brand: m.brand || m.company,
    company: m.company,
    imageUrl: toListImageUrl(fullUrl, LIST_THUMB_WIDTH),
    imageFile,
    category: m.category,
    subCategory: m.subCategory,
    price: m.price,
    weights: m.weights,
    storeId: normalizeBrand(m.company) || String(m.company || '').toLowerCase().replace(/\s+/g, '_'),
    storeName: m.company || 'General'
  };
}

async function getMedicinesPaginated(opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 48));
  const unfiltered = (!opts.company || opts.company === 'all')
    && (!opts.category || opts.category === 'all')
    && (!opts.subcategory || opts.subcategory === 'all')
    && !opts.q;

  if (catalogCache) {
    const cache = catalogCache;
    if (unfiltered && page === 1 && cache.page1 && cache.page1.limit === limit) {
      return {
        ...cache.page1,
        cachedAt: cache.loadedAt
      };
    }
  } else {
    const bootPage = matchBootstrapPage({ ...opts, page, limit });
    if (bootPage) {
      ensureCatalogCacheLoading();
      return bootPage;
    }
  }

  const cache = await loadCatalogCache();
  if (unfiltered && page === 1 && cache.page1 && cache.page1.limit === limit) {
    return {
      ...cache.page1,
      cachedAt: cache.loadedAt
    };
  }

  // List endpoints tolerate a brief stale catalog while overrides warm.
  const medicines = await getCatalogMedicinesWithOverrides({ allowStale: true });
  const list = filterMedicines(medicines, {
    ...opts,
    searchIndex: qIndex(cache, opts.q)
  });
  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit).map(toListMedicine);

  const result = {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    cachedAt: cache.loadedAt
  };

  if (unfiltered && page === 1) {
    cache.page1 = result;
  }

  return result;
}

function qIndex(cache, q) {
  return q ? ensureSearchIndex(cache) : cache.searchIndex;
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
  overridesCache = null;
  overridesExpiry = 0;
  overridesPromise = null;
}

async function loadFirestoreCatalogOverrides(imageMap = {}) {
  const now = Date.now();
  if (overridesCache && now < overridesExpiry) return overridesCache;
  if (overridesPromise) return overridesPromise;

  overridesPromise = (async () => {
  try {
    const { initFirebase } = require('./');
    await initFirebase();
    const docs = await Medicine.find({ catalogOverride: true });
    overridesCache = docs.map((m) => formatMedicineForStore(m, imageMap));
    overridesExpiry = Date.now() + 5 * 60 * 1000;
    return overridesCache;
  } catch (err) {
    console.warn('⚠️ Firestore catalog overrides skipped:', err.message);
    overridesCache = [];
    overridesExpiry = Date.now() + 60 * 1000;
    return [];
  } finally {
    overridesPromise = null;
  }
  })();

  return overridesPromise;
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

async function getCatalogMedicinesWithOverrides(opts = {}) {
  const allowStale = !!opts.allowStale;
  const cache = await loadCatalogCache();
  // Fast path: if overrides were already warmed and are empty, skip merge work.
  if (overridesCache && Date.now() < overridesExpiry) {
    if (!overridesCache.length) return cache.medicines;
    return applyCatalogOverrides(cache.medicines, overridesCache);
  }

  const pending = loadFirestoreCatalogOverrides(cache.imageMap || {});
  if (!allowStale) {
    const overrides = await pending;
    if (!overrides.length) return cache.medicines;
    return applyCatalogOverrides(cache.medicines, overrides);
  }

  // List path: don't block first paint on a cold Firestore round-trip.
  const raced = await Promise.race([
    pending.then((overrides) => ({ ready: true, overrides })),
    new Promise((resolve) => setTimeout(() => resolve({ ready: false }), 50))
  ]);

  if (!raced.ready) {
    return cache.medicines;
  }
  if (!raced.overrides.length) return cache.medicines;
  return applyCatalogOverrides(cache.medicines, raced.overrides);
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
    .filter(Boolean)
    .map((med) => {
      const imageFile = med.imageFile || extractMedicineAssetFile(med.imageUrl) || null;
      const imageUrl = normalizeMedicineImageUrl(med.imageUrl, imageFile) || med.imageUrl || null;
      return { ...med, imageFile, imageUrl };
    });

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

    let pricePerUnit = Number(catalogMed.price || 0);
    if (pricePerUnit <= 0 && Array.isArray(catalogMed.weights) && catalogMed.weights.length) {
      const selected = item.selectedWeight;
      if (selected && selected.value != null) {
        const match = catalogMed.weights.find(
          (w) => Number(w.value) === Number(selected.value)
            && String(w.unit || '').toLowerCase() === String(selected.unit || '').toLowerCase()
        );
        if (match) pricePerUnit = Number(match.price || 0);
      }
      if (pricePerUnit <= 0) {
        pricePerUnit = Math.min(...catalogMed.weights.map((w) => Number(w.price || 0)).filter((p) => p > 0));
      }
    }
    if (pricePerUnit <= 0) {
      pricePerUnit = Number(item.pricePerUnit || item.price || 0);
    }
    if (pricePerUnit <= 0) {
      const err = new Error(`Product is not for sale: ${catalogMed.name}`);
      err.status = 400;
      throw err;
    }

    const qty = Math.max(1, Math.min(99, Number(item.quantity || 1)));

    const totalPrice = Math.round(pricePerUnit * qty * 100) / 100;
    subtotal += totalPrice;

    let selectedWeight = null;
    if (item.selectedWeight && item.selectedWeight.value != null) {
      selectedWeight = {
        value: Number(item.selectedWeight.value),
        unit: String(item.selectedWeight.unit || 'unit')
      };
    } else if (Array.isArray(catalogMed.weights) && catalogMed.weights.length === 1) {
      selectedWeight = {
        value: Number(catalogMed.weights[0].value),
        unit: String(catalogMed.weights[0].unit || 'unit')
      };
    }

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
      selectedWeight,
      productType: item.productType || 'medicine',
      productTypeName: item.productTypeName || 'Medicine'
    });
  }

  return {
    items: normalized,
    subtotal: Math.round(subtotal * 100) / 100
  };
}

async function getStoresSummaryFromFirebase() {
  if (catalogCache) return catalogCache.summary;
  const boot = readStoreBootstrap();
  if (boot && Array.isArray(boot.summary) && boot.summary.length) {
    ensureCatalogCacheLoading();
    return boot.summary;
  }
  const cache = await loadCatalogCache();
  return cache.summary;
}

/** Single-pass taxonomy from already-classified catalog rows (no nested filters). */
function buildTaxonomyFromMedicines(medicines) {
  const list = (medicines || []).filter(isStoreProduct);
  const deptCounts = Object.create(null);
  const subCounts = Object.create(null);
  for (const name of STORE_DEPARTMENTS) {
    deptCounts[name] = 0;
    subCounts[name] = Object.create(null);
    for (const sub of STORE_SUBCATEGORIES[name] || []) {
      subCounts[name][sub] = 0;
    }
  }

  for (const m of list) {
    const dept = STORE_DEPARTMENTS.includes(m.category)
      ? m.category
      : classifyStoreProduct(m);
  if (!(dept in deptCounts)) continue;
    deptCounts[dept] += 1;

    const allowedSubs = STORE_SUBCATEGORIES[dept] || [];
    if (!allowedSubs.length) continue;
    const sub = allowedSubs.includes(m.subCategory)
      ? m.subCategory
      : classifyStoreSubcategory(m);
    if (sub && Object.prototype.hasOwnProperty.call(subCounts[dept], sub)) {
      subCounts[dept][sub] += 1;
    }
  }

  const departments = STORE_DEPARTMENTS.map((name) => {
    const subs = (STORE_SUBCATEGORIES[name] || []).map((subName) => ({
      name: subName,
      slug: toStoreSlug(subName),
      count: subCounts[name][subName] || 0,
      href: storePathFor(name, subName)
    })).filter((s) => s.count > 0 || name === 'Ayurvedic Medicines');
    return {
      name,
      slug: toStoreSlug(name),
      count: deptCounts[name] || 0,
      href: storePathFor(name),
      subcategories: subs
    };
  });

  return {
    departments,
    organicFoodSubcategories: ORGANIC_FOOD_SUBCATEGORIES,
    ayurvedicMedicineSubcategories: AYURVEDIC_MEDICINE_SUBCATEGORIES,
    total: list.length
  };
}

async function getStoreTaxonomy() {
  if (catalogCache && catalogCache.taxonomy) return catalogCache.taxonomy;
  const boot = readStoreBootstrap();
  if (boot && boot.taxonomy) {
    ensureCatalogCacheLoading();
    return boot.taxonomy;
  }
  const cache = await loadCatalogCache();
  if (cache.taxonomy) return cache.taxonomy;
  cache.taxonomy = buildTaxonomyFromMedicines(cache.medicines);
  return cache.taxonomy;
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
  getStoreTaxonomy,
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

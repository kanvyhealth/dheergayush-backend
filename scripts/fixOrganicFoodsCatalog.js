/**
 * Repair Pernati Naturals corruption and enrich Organic Foods subcategories.
 * Idempotent: safe to re-run. Writes a .bak next to the catalog on first change.
 */
const fs = require('fs');
const path = require('path');
const {
  classifyStoreProduct,
  classifyStoreSubcategory,
  ORGANIC_FOOD_SUBCATEGORIES
} = require('../src/modules/store/storeCategories');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog.json');
const OLD_CATALOG_PATH = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog_old.json');
const PERNATI_STORE_ID = '38aa2433d78e6103c1dadac9';
const PERNATI_NAME = 'Pernati Naturals';

function isWeightObject(w) {
  return w && typeof w === 'object' && !Array.isArray(w)
    && (w.value != null || w.price != null || w.unit || w.pack_label)
    && !w.name;
}

function isProductObject(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && typeof obj.name === 'string'
    && (obj.weights || obj.category || obj.brand || obj._id);
}

function slugifyId(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `pn-${slug || 'product'}`;
}

function cleanWeights(weights) {
  return (Array.isArray(weights) ? weights : []).filter(isWeightObject).map((w) => ({
    value: w.value,
    unit: w.unit || 'unit',
    price: w.price,
    pack_label: w.pack_label,
    variant_id: w.variant_id
  })).filter((w) => w.value != null && w.price != null);
}

function enrichOrganicProduct(med) {
  const next = { ...med };
  next.weights = cleanWeights(med.weights);
  next.category = 'Organic Foods';
  // Always recompute from name/category so ingredient-text false positives can be fixed on re-run
  next.subCategory = classifyStoreSubcategory({
    name: med.name,
    description: med.description,
    category: med.category === 'Organic Foods' ? 'Organic Foods' : (med.category || 'Organic Foods'),
    subCategory: ''
  });
  if (!ORGANIC_FOOD_SUBCATEGORIES.includes(next.subCategory)) {
    next.subCategory = 'Packaged Foods';
  }
  return next;
}

function extractNestedProducts(weights) {
  const products = [];
  (Array.isArray(weights) ? weights : []).forEach((w) => {
    if (isProductObject(w) && w.name) {
      products.push(w);
      if (Array.isArray(w.weights)) {
        products.push(...extractNestedProducts(w.weights));
      }
    }
  });
  return products;
}

function isMedicineLikeFood(med) {
  const text = `${med.name || ''} ${med.description || ''}`.toLowerCase();
  if (/\b(tablet|tablets|capsule|capsules|60 tabs|tabs)\b/i.test(text)) return true;
  if (/\b(book|plateau of the peak|life of sri sri)\b/i.test(text)) return true;
  if (/\bcombo\b/i.test(text) && /\b(immunity|wellness|retreat)\b/i.test(text)) return true;
  if (/\b(ma\s*\d+)\b/i.test(text) && !/\b(tea|honey|juice|ghee)\b/i.test(text)) return true;
  return false;
}

function isClearFood(med) {
  if (isMedicineLikeFood(med)) return false;
  const text = `${med.name || ''} ${med.description || ''} ${med.category || ''}`.toLowerCase();
  return /\b(honey|tea|juice|candy|candies|snack|chana|seed|seeds|vinegar|ghee|jaggery|pickle|masala|spice|powder|chyawanprash|chyavanaprasam|squash|sharbat|drink|beverage|muesli|granola|cookie|biscuit|flax|pepper|kitchen king|aloevera|aloe)\b/i.test(text)
    || String(med.category || '').toLowerCase() === 'organic foods';
}

function ensurePernatiStore(stores) {
  let store = stores.find((s) => String(s._id) === PERNATI_STORE_ID)
    || stores.find((s) => /pernati/i.test(String(s.name || '')));
  if (!store) {
    store = {
      _id: PERNATI_STORE_ID,
      name: PERNATI_NAME,
      logo: '/logos/logo-horizontal.png',
      description: 'Pernati Naturals — organic foods & cooking essentials.',
      medicines: []
    };
    stores.push(store);
  }
  if (!Array.isArray(store.medicines)) store.medicines = [];
  store.name = PERNATI_NAME;
  return store;
}

function mergeByName(targetList, incoming) {
  const byName = new Map();
  targetList.forEach((m) => {
    byName.set(String(m.name || '').toLowerCase().trim(), m);
  });
  incoming.forEach((m) => {
    const key = String(m.name || '').toLowerCase().trim();
    if (!key) return;
    if (byName.has(key)) {
      const existing = byName.get(key);
      existing.weights = cleanWeights([...(existing.weights || []), ...(m.weights || [])]);
      if (!existing.imageFile && m.imageFile) existing.imageFile = m.imageFile;
      if (!existing.description && m.description) existing.description = m.description;
      if (m.subCategory) existing.subCategory = m.subCategory;
      existing.category = 'Organic Foods';
    } else {
      byName.set(key, m);
      targetList.push(m);
    }
  });
}

function assignUniqueIds(medicines) {
  const used = new Set();
  medicines.forEach((m) => {
    let id = slugifyId(m.name);
    let n = 2;
    while (used.has(id)) {
      id = `${slugifyId(m.name)}-${n}`;
      n += 1;
    }
    used.add(id);
    m._id = id;
  });
}

function restoreSelectiveFoods(stores, oldStores) {
  const existingIds = new Set();
  const existingNamesByStore = new Map();
  stores.forEach((s) => {
    const nameKey = String(s.name || '').toLowerCase();
    const names = new Set((s.medicines || []).map((m) => String(m.name || '').toLowerCase()));
    existingNamesByStore.set(nameKey, names);
    (s.medicines || []).forEach((m) => existingIds.add(String(m._id)));
  });

  let restored = 0;
  (oldStores || []).forEach((oldStore) => {
    const storeName = String(oldStore.name || '').trim();
    if (!storeName || /pernati/i.test(storeName) || storeName.toLowerCase() === 'test') return;
    const foods = (oldStore.medicines || []).filter((m) => {
      if (String(m.category || '') !== 'Organic Foods') return false;
      return isClearFood(m);
    });
    if (!foods.length) return;

    let store = stores.find((s) => String(s.name || '').toLowerCase() === storeName.toLowerCase());
    if (!store) {
      store = {
        _id: oldStore._id || `restored-${storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: storeName,
        logo: oldStore.logo || '/logos/logo-horizontal.png',
        description: oldStore.description || `${storeName} — Ayurvedic products.`,
        medicines: []
      };
      stores.push(store);
      existingNamesByStore.set(storeName.toLowerCase(), new Set());
    }
    if (!Array.isArray(store.medicines)) store.medicines = [];
    const names = existingNamesByStore.get(storeName.toLowerCase()) || new Set();

    foods.forEach((m) => {
      const nameKey = String(m.name || '').toLowerCase();
      if (names.has(nameKey)) return;
      if (existingIds.has(String(m._id))) {
        m = { ...m, _id: `${m._id}-food` };
      }
      const enriched = enrichOrganicProduct({ ...m, brand: m.brand || storeName, company: m.company || storeName });
      store.medicines.push(enriched);
      names.add(nameKey);
      existingIds.add(String(enriched._id));
      restored += 1;
    });
    existingNamesByStore.set(storeName.toLowerCase(), names);
  });
  return restored;
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Catalog not found:', CATALOG_PATH);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('Catalog is not an array');
    process.exit(1);
  }

  const bakPath = CATALOG_PATH + '.bak';
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(CATALOG_PATH, bakPath);
    console.log('Backup written:', bakPath);
  }

  const stores = [];
  const orphanProducts = [];

  raw.forEach((entry) => {
    if (Array.isArray(entry.medicines)) {
      stores.push(entry);
    } else if (isProductObject(entry)) {
      orphanProducts.push(entry);
    } else {
      console.warn('Skipping unknown top-level entry:', entry && entry.name);
    }
  });

  const pernati = ensurePernatiStore(stores);
  const collected = [];

  // Nested products inside Red Poha / any medicine weights
  stores.forEach((store) => {
    (store.medicines || []).forEach((med) => {
      const nested = extractNestedProducts(med.weights);
      nested.forEach((p) => collected.push(p));
      med.weights = cleanWeights(med.weights);
    });
  });

  orphanProducts.forEach((p) => {
    collected.push(p);
    extractNestedProducts(p.weights).forEach((n) => collected.push(n));
  });

  // Existing Pernati medicines + collected orphans → enrich
  const pernatiMeds = (pernati.medicines || []).map((m) => enrichOrganicProduct({
    ...m,
    brand: PERNATI_NAME,
    company: PERNATI_NAME
  }));
  const incoming = collected.map((m) => enrichOrganicProduct({
    ...m,
    brand: m.brand || PERNATI_NAME,
    company: m.company || PERNATI_NAME,
    weights: cleanWeights(m.weights)
  }));

  pernati.medicines = [];
  mergeByName(pernati.medicines, pernatiMeds);
  mergeByName(pernati.medicines, incoming);
  assignUniqueIds(pernati.medicines);

  // Ensure every Organic Foods product in all stores has subcategory
  stores.forEach((store) => {
    if (store === pernati) return;
    store.medicines = (store.medicines || []).map((m) => {
      const dept = classifyStoreProduct(m);
      if (dept === 'Organic Foods' || String(m.category || '') === 'Organic Foods'
        || String(m.category || '') === 'Cooking Essentials') {
        return enrichOrganicProduct(m);
      }
      return m;
    });
  });

  let restored = 0;
  if (fs.existsSync(OLD_CATALOG_PATH)) {
    const oldStores = JSON.parse(fs.readFileSync(OLD_CATALOG_PATH, 'utf8'));
    restored = restoreSelectiveFoods(stores, oldStores);
  }

  // Final uniqueness check across catalog
  const allIds = new Set();
  let dupesFixed = 0;
  stores.forEach((store) => {
    (store.medicines || []).forEach((m) => {
      let id = String(m._id || slugifyId(m.name));
      if (allIds.has(id)) {
        id = `${id}-${dupesFixed + 2}`;
        dupesFixed += 1;
      }
      allIds.add(id);
      m._id = id;
    });
  });

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(stores, null, 2) + '\n', 'utf8');

  const organicCounts = {};
  let organicTotal = 0;
  stores.forEach((s) => {
    (s.medicines || []).forEach((m) => {
      if (m.category === 'Organic Foods') {
        organicTotal += 1;
        organicCounts[m.subCategory || '(none)'] = (organicCounts[m.subCategory || '(none)'] || 0) + 1;
      }
    });
  });

  console.log('Stores:', stores.length);
  console.log('Pernati products:', pernati.medicines.length);
  console.log('Orphans folded:', orphanProducts.length);
  console.log('Nested extracted into Pernati:', collected.length);
  console.log('Selectively restored foods:', restored);
  console.log('Duplicate ids fixed:', dupesFixed);
  console.log('Organic Foods total:', organicTotal);
  console.log('By subcategory:', organicCounts);
}

main();

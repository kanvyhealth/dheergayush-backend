/* Store department taxonomy — mirrors src/modules/store/storeCategories.js for the shop UI */
(function (global) {
  var STORE_DEPARTMENTS = [
    'Ayurvedic Medicines',
    'Personal and Beauty Care',
    'Organic Foods',
    'Dairy Products',
    'Yoga and Meditation Accessories',
    'Medical Devices'
  ];

  var DAIRY_SUBCATEGORIES = [
    'Milk',
    'Ghee',
    'Junnu',
    'Curd and Paneer',
    'Other Dairy'
  ];

  var ORGANIC_FOOD_SUBCATEGORIES = [
    'Honey',
    'Ghees and Oils',
    'Rice',
    'Pulses',
    'Millets',
    'Pickles (Veg)',
    'Pickles (Non-Veg)',
    'Spices and Masalas',
    'Salts and Sugars',
    'Flours and Ravva',
    'Nuts and Dry Fruits',
    'Packaged Foods',
    'Beverages and Drinks',
    'Sweets'
  ];

  var STORE_SUBCATEGORIES = {
    'Organic Foods': ORGANIC_FOOD_SUBCATEGORIES,
    'Dairy Products': DAIRY_SUBCATEGORIES
  };

  var DEPARTMENT_KEYS = {
    'ayurvedic medicines': 'Ayurvedic Medicines',
    'personal and beauty care': 'Personal and Beauty Care',
    'organic foods': 'Organic Foods',
    'dairy products': 'Dairy Products',
    'dairy': 'Dairy Products',
    'milk products': 'Dairy Products',
    'yoga and meditation accessories': 'Yoga and Meditation Accessories',
    'medical devices': 'Medical Devices',
    'ayurvedic beauty': 'Personal and Beauty Care',
    'ayurvedic wellness': 'Organic Foods',
    'beauty care': 'Personal and Beauty Care',
    'organic food': 'Organic Foods',
    'personal care': 'Personal and Beauty Care',
    'cooking essentials': 'Organic Foods',
    'organic groceries': 'Organic Foods',
    'eatables': 'Organic Foods',
    'healthy food': 'Organic Foods',
    'healthy foods': 'Organic Foods',
    'seeds and nuts': 'Organic Foods',
    'millets': 'Organic Foods',
    'dals pulses': 'Organic Foods',
    'dals and pulses': 'Organic Foods',
    'nuts dry fruits': 'Organic Foods',
    'nuts and dry fruits': 'Organic Foods',
    'flours': 'Organic Foods',
    'flours and ravva': 'Organic Foods'
  };

  var SUBCATEGORY_ALIASES = {
    honey: 'Honey',
    'ghees and oils': 'Ghees and Oils',
    'ghee and oils': 'Ghees and Oils',
    ghee: 'Ghees and Oils',
    oils: 'Ghees and Oils',
    rice: 'Rice',
    poha: 'Rice',
    pulses: 'Pulses',
    'dals pulses': 'Pulses',
    'dals and pulses': 'Pulses',
    dal: 'Pulses',
    millets: 'Millets',
    millet: 'Millets',
    'pickles veg': 'Pickles (Veg)',
    'pickle veg': 'Pickles (Veg)',
    'pickles non veg': 'Pickles (Non-Veg)',
    'pickle non veg': 'Pickles (Non-Veg)',
    pickles: 'Pickles (Veg)',
    pickle: 'Pickles (Veg)',
    'spices and masalas': 'Spices and Masalas',
    spices: 'Spices and Masalas',
    masalas: 'Spices and Masalas',
    'cooking essentials': 'Spices and Masalas',
    'salts and sugars': 'Salts and Sugars',
    salt: 'Salts and Sugars',
    sugar: 'Salts and Sugars',
    jaggery: 'Salts and Sugars',
    'flours and ravva': 'Flours and Ravva',
    flours: 'Flours and Ravva',
    flour: 'Flours and Ravva',
    ravva: 'Flours and Ravva',
    rava: 'Flours and Ravva',
    'nuts and dry fruits': 'Nuts and Dry Fruits',
    'nuts dry fruits': 'Nuts and Dry Fruits',
    nuts: 'Nuts and Dry Fruits',
    'dry fruits': 'Nuts and Dry Fruits',
    seeds: 'Nuts and Dry Fruits',
    'packaged foods': 'Packaged Foods',
    'packaged food': 'Packaged Foods',
    'beverages and drinks': 'Beverages and Drinks',
    beverages: 'Beverages and Drinks',
    drinks: 'Beverages and Drinks',
    sweets: 'Sweets',
    sweet: 'Sweets'
  };

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toStoreSlug(label) {
    return String(label || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeDepartment(raw) {
    var key = normalizeText(raw);
    if (DEPARTMENT_KEYS[key]) return DEPARTMENT_KEYS[key];
    for (var alias in DEPARTMENT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(DEPARTMENT_KEYS, alias)) continue;
      if (key.indexOf(alias) >= 0) return DEPARTMENT_KEYS[alias];
    }
    return 'Ayurvedic Medicines';
  }

  function normalizeDepartmentKey(raw) {
    return normalizeText(normalizeDepartment(raw));
  }

  function productMatchesDepartment(med, department) {
    if (!department || department === 'all') return true;
    return normalizeDepartmentKey(med && med.category) === normalizeDepartmentKey(department);
  }

  function normalizeSubcategoryLabel(raw) {
    var key = normalizeText(raw);
    if (!key) return null;
    if (SUBCATEGORY_ALIASES[key]) return SUBCATEGORY_ALIASES[key];
    for (var i = 0; i < ORGANIC_FOOD_SUBCATEGORIES.length; i++) {
      if (normalizeText(ORGANIC_FOOD_SUBCATEGORIES[i]) === key) return ORGANIC_FOOD_SUBCATEGORIES[i];
    }
    for (var j = 0; j < DAIRY_SUBCATEGORIES.length; j++) {
      if (normalizeText(DAIRY_SUBCATEGORIES[j]) === key) return DAIRY_SUBCATEGORIES[j];
    }
    for (var alias in SUBCATEGORY_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(SUBCATEGORY_ALIASES, alias)) continue;
      if (key.indexOf(alias) >= 0) return SUBCATEGORY_ALIASES[alias];
    }
    return null;
  }

  function normalizeSubcategoryKey(raw) {
    var label = normalizeSubcategoryLabel(raw) || String(raw || '').trim();
    return normalizeText(label);
  }

  function classifyStoreSubcategory(med) {
    var explicit = normalizeSubcategoryLabel(med && (med.subCategory || med.subcategory));
    if (explicit) return explicit;
    var category = String((med && med.category) || '').trim();
    if (normalizeDepartmentKey(category) === 'dairy products') {
      var n = String((med && med.name) || '').toLowerCase();
      if (/junnu/.test(n)) return 'Junnu';
      if (/ghee/.test(n)) return 'Ghee';
      if (/\bmilk\b/.test(n)) return 'Milk';
      if (/paneer|curd|dahi|lassi|buttermilk|cheese/.test(n)) return 'Curd and Paneer';
      return 'Other Dairy';
    }
    var fromCat = normalizeSubcategoryLabel(category);
    if (fromCat && category !== 'Organic Foods' && category !== 'Cooking Essentials') return fromCat;
    var name = String((med && med.name) || '').trim();
    var description = String((med && med.description) || '').trim();
    var nameCat = (category + ' ' + name).toLowerCase();
    var combined = (category + ' ' + name + ' ' + description).toLowerCase();
    if (/\bhoney\b/.test(nameCat)) return 'Honey';
    if (/\b(ghee|cooking oil|mustard oil|coconut oil|sesame oil|groundnut oil)\b/.test(nameCat)) return 'Ghees and Oils';
    if (/\b(pickle|pickles|achaar|achar)\b/.test(nameCat)) {
      if (/\b(chicken|mutton|prawn|fish|non[\s-]?veg|meat)\b/.test(combined)) return 'Pickles (Non-Veg)';
      return 'Pickles (Veg)';
    }
    if (/\b(millet|millets|foxtail|kodo|barnyard|proso|sorghum|bajra|ragi|jowar|brown top)\b/.test(nameCat)) return 'Millets';
    if (/\b(dal|dals|pulse|pulses|gram|toor|moong|chana dal|green gram|red gram|bean|beans|rajma)\b/.test(nameCat)) return 'Pulses';
    if (/\b(poha|rice|basmati|sona masoori)\b/.test(nameCat)) return 'Rice';
    if (/\b(almond|cashew|raisin|raisins|dry fruit|dry fruits|walnut|pista|pistachio|nuts|seed|seeds|flax|chia|pumpkin|sunflower|sesame|melon)\b/.test(nameCat)) return 'Nuts and Dry Fruits';
    if (/\b(atta|flour|flours|ravva|rava|sooji|semolina|broken wheat)\b/.test(nameCat)) return 'Flours and Ravva';
    if (/\b(salt|sugar|jaggery|brown sugar)\b/.test(nameCat)) return 'Salts and Sugars';
    if (/\b(masala|spice|spices|dhaniya|coriander|chilli|chili|turmeric|haldi|jeera|cumin|mustard|amchur|pepper|chintakupodi)\b/.test(nameCat)) {
      return 'Spices and Masalas';
    }
    if (/\b(tea|juice|drink|beverage|squash|sharbat|sherbet|chai|health drink|malt|coffee|chicory|decoction)\b/.test(nameCat)) return 'Beverages and Drinks';
    if (/\b(sweet|sweets|candy|candies|halwa|laddu|ladoo|mithai|chocolate)\b/.test(nameCat)) return 'Sweets';
    if (/\b(chyawanprash|chyawanprasha|snack|cookies|biscuit|muesli|granola|vinegar|jam|protein bar)\b/.test(nameCat)) return 'Packaged Foods';
    if (/\b(tea|juice|beverage|drink|squash|coffee|chicory|decoction)\b/.test(combined)) return 'Beverages and Drinks';
    if (/\b(chyawanprash|chyawanprasha|snack|cookies|biscuit|muesli|granola|vinegar)\b/.test(combined)) return 'Packaged Foods';
    if (normalizeText(category) === 'cooking essentials') return 'Spices and Masalas';
    return 'Packaged Foods';
  }

  function productMatchesSubcategory(med, subcategory) {
    if (!subcategory || subcategory === 'all') return true;
    return normalizeSubcategoryKey(classifyStoreSubcategory(med)) === normalizeSubcategoryKey(subcategory);
  }

  function departmentFromSlug(slug) {
    var key = toStoreSlug(slug);
    if (!key) return null;
    for (var i = 0; i < STORE_DEPARTMENTS.length; i++) {
      if (toStoreSlug(STORE_DEPARTMENTS[i]) === key) return STORE_DEPARTMENTS[i];
    }
    return null;
  }

  function subcategoryFromSlug(slug, department) {
    var key = toStoreSlug(slug);
    if (!key) return null;
    var dept = department || 'Organic Foods';
    var list = STORE_SUBCATEGORIES[dept] || ORGANIC_FOOD_SUBCATEGORIES;
    for (var i = 0; i < list.length; i++) {
      if (toStoreSlug(list[i]) === key) return list[i];
    }
    return normalizeSubcategoryLabel(String(slug || '').replace(/-/g, ' '));
  }

  function storePathFor(department, subcategory) {
    if (!department || department === 'all') return '/store';
    var deptSlug = toStoreSlug(department);
    if (!deptSlug) return '/store';
    if (!subcategory || subcategory === 'all') return '/store/' + deptSlug;
    var subSlug = toStoreSlug(subcategory);
    return subSlug ? '/store/' + deptSlug + '/' + subSlug : '/store/' + deptSlug;
  }

  function departmentIconClass(category) {
    var key = normalizeDepartmentKey(category);
    if (key === 'personal and beauty care') return 'fa-spa';
    if (key === 'organic foods') return 'fa-leaf';
    if (key === 'dairy products') return 'fa-cheese';
    if (key === 'yoga and meditation accessories') return 'fa-om';
    if (key === 'medical devices') return 'fa-stethoscope';
    return 'fa-mortar-pestle';
  }

  var FEATURED_STORE_BRANDS = [
    { key: 'vaidyaratnam', menuLabel: 'Vaidyaratnam' },
    { key: 'impcops', menuLabel: 'IMPCOPS' },
    { key: 'drrao', menuLabel: "Dr Rao's Ayurvedic" }
  ];

  function storeBrandKey(name) {
    return window.DgCatalogMerge
      ? DgCatalogMerge.normalizeBrandKey(name)
      : normalizeText(name).replace(/[^a-z0-9]/g, '');
  }

  function getStoreMenuLabel(name) {
    var key = storeBrandKey(name);
    var hit = FEATURED_STORE_BRANDS.find(function (item) { return item.key === key; });
    return hit ? hit.menuLabel : String(name || '').trim();
  }

  function sortStoresWithFeatured(list) {
    var rank = function (store) {
      var key = storeBrandKey(store.name || store._id);
      var idx = -1;
      FEATURED_STORE_BRANDS.forEach(function (item, i) {
        if (item.key === key) idx = i;
      });
      return idx >= 0 ? idx : FEATURED_STORE_BRANDS.length + 1;
    };
    return (list || []).slice().sort(function (a, b) {
      var diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  function parseStorePath(pathname) {
    var parts = String(pathname || '').replace(/\/+$/, '').split('/').filter(Boolean);
    var result = { category: 'all', subcategory: 'all' };
    if (parts[0] !== 'store') return result;
    if (parts[1]) {
      var dept = departmentFromSlug(parts[1]);
      if (dept) result.category = dept;
    }
    if (parts[2] && result.category !== 'all') {
      var sub = subcategoryFromSlug(parts[2], result.category);
      if (sub) result.subcategory = sub;
    }
    return result;
  }

  global.DgStoreCategories = {
    STORE_DEPARTMENTS: STORE_DEPARTMENTS,
    ORGANIC_FOOD_SUBCATEGORIES: ORGANIC_FOOD_SUBCATEGORIES,
    DAIRY_SUBCATEGORIES: DAIRY_SUBCATEGORIES,
    STORE_SUBCATEGORIES: STORE_SUBCATEGORIES,
    FEATURED_STORE_BRANDS: FEATURED_STORE_BRANDS,
    normalizeDepartment: normalizeDepartment,
    normalizeDepartmentKey: normalizeDepartmentKey,
    productMatchesDepartment: productMatchesDepartment,
    classifyStoreSubcategory: classifyStoreSubcategory,
    productMatchesSubcategory: productMatchesSubcategory,
    normalizeSubcategoryLabel: normalizeSubcategoryLabel,
    departmentIconClass: departmentIconClass,
    getStoreMenuLabel: getStoreMenuLabel,
    sortStoresWithFeatured: sortStoresWithFeatured,
    toStoreSlug: toStoreSlug,
    departmentFromSlug: departmentFromSlug,
    subcategoryFromSlug: subcategoryFromSlug,
    storePathFor: storePathFor,
    parseStorePath: parseStorePath
  };
})(typeof window !== 'undefined' ? window : globalThis);

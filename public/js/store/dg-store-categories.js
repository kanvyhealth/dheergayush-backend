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

  var AYURVEDIC_MEDICINE_SUBCATEGORIES = [
    'Ark',
    'Asava & Arishta',
    'Kadha',
    'Avaleha Pak',
    'Ayurvedic Proprietary',
    'Bhasma',
    'Churna',
    'Ghrit & Gruthalu',
    'Guggulu',
    'Kupi Pakwa Rasayan',
    'Lauh Mandoor',
    'Tail',
    'Others',
    'Parpati',
    'Pishti',
    'Ras Rasayan',
    'Shodhit Dravya Satva',
    'Swarna Yukthi Aushadhi',
    'Vati Gutika'
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
    'Ayurvedic Medicines': AYURVEDIC_MEDICINE_SUBCATEGORIES,
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

  var AYURVEDIC_SUBCATEGORY_ALIASES = {
    ark: 'Ark',
    arka: 'Ark',
    asava: 'Asava & Arishta',
    asavam: 'Asava & Arishta',
    arishta: 'Asava & Arishta',
    arishtam: 'Asava & Arishta',
    'asava arishta': 'Asava & Arishta',
    'asava and arishta': 'Asava & Arishta',
    kadha: 'Kadha',
    kwath: 'Kadha',
    kashayam: 'Kadha',
    kashaya: 'Kadha',
    avaleha: 'Avaleha Pak',
    'avaleha pak': 'Avaleha Pak',
    lehyam: 'Avaleha Pak',
    proprietary: 'Ayurvedic Proprietary',
    'ayurvedic proprietary': 'Ayurvedic Proprietary',
    'ayurvedic propreitary': 'Ayurvedic Proprietary',
    patent: 'Ayurvedic Proprietary',
    bhasma: 'Bhasma',
    churna: 'Churna',
    choorna: 'Churna',
    churnam: 'Churna',
    choornam: 'Churna',
    ghrit: 'Ghrit & Gruthalu',
    ghrita: 'Ghrit & Gruthalu',
    gruthalu: 'Ghrit & Gruthalu',
    'ghrit and gruthalu': 'Ghrit & Gruthalu',
    guggulu: 'Guggulu',
    guggul: 'Guggulu',
    'kupi pakwa rasayan': 'Kupi Pakwa Rasayan',
    kupipakwa: 'Kupi Pakwa Rasayan',
    'lauh mandoor': 'Lauh Mandoor',
    lauh: 'Lauh Mandoor',
    mandoor: 'Lauh Mandoor',
    mandur: 'Lauh Mandoor',
    tail: 'Tail',
    taila: 'Tail',
    tailam: 'Tail',
    thailam: 'Tail',
    others: 'Others',
    parpati: 'Parpati',
    pishti: 'Pishti',
    'ras rasayan': 'Ras Rasayan',
    rasayan: 'Ras Rasayan',
    'shodhit dravya satva': 'Shodhit Dravya Satva',
    shodhit: 'Shodhit Dravya Satva',
    satva: 'Shodhit Dravya Satva',
    'swarna yukthi aushadhi': 'Swarna Yukthi Aushadhi',
    swarna: 'Swarna Yukthi Aushadhi',
    'vati gutika': 'Vati Gutika',
    vati: 'Vati Gutika',
    gutika: 'Vati Gutika',
    gulika: 'Vati Gutika'
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

  function matchSubcategoryInList(raw, list, aliases) {
    var key = normalizeText(raw);
    if (!key) return null;
    if (aliases && aliases[key]) return aliases[key];
    for (var i = 0; i < list.length; i++) {
      if (normalizeText(list[i]) === key) return list[i];
    }
    return null;
  }

  function normalizeSubcategoryLabel(raw) {
    var key = normalizeText(raw);
    if (!key) return null;
    if (AYURVEDIC_SUBCATEGORY_ALIASES[key]) return AYURVEDIC_SUBCATEGORY_ALIASES[key];
    if (SUBCATEGORY_ALIASES[key]) return SUBCATEGORY_ALIASES[key];
    var lists = [AYURVEDIC_MEDICINE_SUBCATEGORIES, ORGANIC_FOOD_SUBCATEGORIES, DAIRY_SUBCATEGORIES];
    var li;
    for (li = 0; li < lists.length; li++) {
      var hit = matchSubcategoryInList(key, lists[li], null);
      if (hit) return hit;
    }
    for (var alias in SUBCATEGORY_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(SUBCATEGORY_ALIASES, alias)) continue;
      if (key.indexOf(alias) >= 0) return SUBCATEGORY_ALIASES[alias];
    }
    return null;
  }

  function departmentHasSubcategoryNav(name) {
    return name === 'Organic Foods' || name === 'Ayurvedic Medicines';
  }

  function normalizeSubcategoryKey(raw) {
    var label = normalizeSubcategoryLabel(raw) || String(raw || '').trim();
    return normalizeText(label);
  }

  function classifyAyurvedicSubcategory(med) {
    var nameCat = String((med && med.category) || '') + ' ' + String((med && med.name) || '');
    var n = ' ' + normalizeText(nameCat) + ' ';
    var compact = n.replace(/\s+/g, '');
    if (/\bparpati\b/.test(n) || compact.indexOf('parpati') >= 0) return 'Parpati';
    if (/\bpishti\b/.test(n) || /\bpisht\b/.test(n) || compact.indexOf('pishti') >= 0) return 'Pishti';
    if (compact.indexOf('bhasma') >= 0) return 'Bhasma';
    if (/kupipakwa|kupi pakwa|rasa sindoor|rasasindoor|makaradhwaj|makardhwaj/.test(n)
      || /kupipakwa|rasasindoor|makaradhwaj|makardhwaj/.test(compact)) {
      return 'Kupi Pakwa Rasayan';
    }
    if (/\bshodhit\b|\bsatva\b|\bsatwa\b/.test(n) || compact.indexOf('shodhit') >= 0) return 'Shodhit Dravya Satva';
    if (/\barka\b|\barkam\b|\bark\b/.test(n)) return 'Ark';
    if (/asava|asavam|arishta|arishtam|arista/.test(compact)) return 'Asava & Arishta';
    if (/\bkadha\b|\bkwath\b|\bkwatha\b|\bkashayam\b|\bkashaya\b/.test(n) || /kashayam|kashaya/.test(compact)) return 'Kadha';
    if (/avaleha|lehyam|leham|lehya|chyawanprash|chyavanprash|chyavanaprasam|prasam/.test(compact)) return 'Avaleha Pak';
    if (compact.indexOf('guggul') >= 0) return 'Guggulu';
    if (/ghrita|ghritam|ghritham|\bghrit\b|gruthalu|gritha|grutha/.test(n) || /ghrita|ghritam|ghritham|gruthalu/.test(compact)) {
      return 'Ghrit & Gruthalu';
    }
    if (/mandoor|mandur|mandoora|\blauha\b|\blauh\b/.test(n) || /mandoor|mandur|lauha/.test(compact)) return 'Lauh Mandoor';
    if (/tailam|thailam|taila|thaila|\btail\b|\boil\b|kuzhambu/.test(n) || /tailam|thailam|taila|thaila|kuzhambu/.test(compact)) {
      return 'Tail';
    }
    if (/churna|choorna|churnam|choornam|chooran/.test(compact)) return 'Churna';
    if (/vatakam|gutika|gulika|ghanvati|\bvati\b|\bguti\b/.test(n) || /vatakam|gutika|gulika|ghanvati/.test(compact) || /vati$/.test(compact)) {
      return 'Vati Gutika';
    }
    if (/rasayanam|rasayana|rasayan|\bras\b|\brasa\b/.test(n) || compact.indexOf('rasayan') >= 0) return 'Ras Rasayan';
    if (/swarna|suvarna/.test(compact)) return 'Swarna Yukthi Aushadhi';
    if (/proprietary|patent|\btablet\b|\bcapsule\b|\bsyrup\b|\bointment\b|\bcream\b|\bgranules\b|\bdrops\b/.test(n)
      || /tablet|capsule|syrup|ointment|granule/.test(compact)) {
      return 'Ayurvedic Proprietary';
    }
    return 'Others';
  }

  function classifyStoreSubcategory(med) {
    var category = String((med && med.category) || '').trim();
    var deptKey = normalizeDepartmentKey(category);
    if (deptKey === 'ayurvedic medicines') {
      var explicitAyur = matchSubcategoryInList(
        med && (med.subCategory || med.subcategory),
        AYURVEDIC_MEDICINE_SUBCATEGORIES,
        AYURVEDIC_SUBCATEGORY_ALIASES
      );
      if (explicitAyur) return explicitAyur;
      return classifyAyurvedicSubcategory(med);
    }
    var explicit = normalizeSubcategoryLabel(med && (med.subCategory || med.subcategory));
    if (explicit && deptKey === 'organic foods' && ORGANIC_FOOD_SUBCATEGORIES.indexOf(explicit) >= 0) return explicit;
    if (explicit && deptKey === 'dairy products' && DAIRY_SUBCATEGORIES.indexOf(explicit) >= 0) return explicit;
    if (deptKey === 'dairy products') {
      var n = String((med && med.name) || '').toLowerCase();
      if (/junnu/.test(n)) return 'Junnu';
      if (/ghee/.test(n)) return 'Ghee';
      if (/\bmilk\b/.test(n)) return 'Milk';
      if (/paneer|curd|dahi|lassi|buttermilk|cheese/.test(n)) return 'Curd and Paneer';
      return 'Other Dairy';
    }
    var fromCat = normalizeSubcategoryLabel(category);
    if (fromCat && category !== 'Organic Foods' && category !== 'Cooking Essentials' && ORGANIC_FOOD_SUBCATEGORIES.indexOf(fromCat) >= 0) {
      return fromCat;
    }
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
    var want = normalizeSubcategoryKey(subcategory);
    var explicit = normalizeSubcategoryKey(med && (med.subCategory || med.subcategory));
    if (explicit && explicit === want) return true;
    return normalizeSubcategoryKey(classifyStoreSubcategory(med)) === want;
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
    AYURVEDIC_MEDICINE_SUBCATEGORIES: AYURVEDIC_MEDICINE_SUBCATEGORIES,
    STORE_SUBCATEGORIES: STORE_SUBCATEGORIES,
    FEATURED_STORE_BRANDS: FEATURED_STORE_BRANDS,
    normalizeDepartment: normalizeDepartment,
    normalizeDepartmentKey: normalizeDepartmentKey,
    productMatchesDepartment: productMatchesDepartment,
    classifyStoreSubcategory: classifyStoreSubcategory,
    productMatchesSubcategory: productMatchesSubcategory,
    normalizeSubcategoryLabel: normalizeSubcategoryLabel,
    departmentHasSubcategoryNav: departmentHasSubcategoryNav,
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

/* Store department taxonomy — mirrors lib/storeCategories.js for the shop UI */
(function (global) {
  var STORE_DEPARTMENTS = [
    'Ayurvedic Medicines',
    'Personal and Beauty Care',
    'Organic Foods',
    'Yoga and Meditation Accessories',
    'Medical Devices'
  ];

  var DEPARTMENT_KEYS = {
    'ayurvedic medicines': 'Ayurvedic Medicines',
    'personal and beauty care': 'Personal and Beauty Care',
    'organic foods': 'Organic Foods',
    'yoga and meditation accessories': 'Yoga and Meditation Accessories',
    'medical devices': 'Medical Devices',
    'ayurvedic beauty': 'Personal and Beauty Care',
    'ayurvedic wellness': 'Organic Foods',
    'beauty care': 'Personal and Beauty Care',
    'organic food': 'Organic Foods',
    'personal care': 'Personal and Beauty Care'
  };

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  function departmentIconClass(category) {
    var key = normalizeDepartmentKey(category);
    if (key === 'personal and beauty care') return 'fa-spa';
    if (key === 'organic foods') return 'fa-leaf';
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

  global.DgStoreCategories = {
    STORE_DEPARTMENTS: STORE_DEPARTMENTS,
    FEATURED_STORE_BRANDS: FEATURED_STORE_BRANDS,
    normalizeDepartment: normalizeDepartment,
    normalizeDepartmentKey: normalizeDepartmentKey,
    productMatchesDepartment: productMatchesDepartment,
    departmentIconClass: departmentIconClass,
    getStoreMenuLabel: getStoreMenuLabel,
    sortStoresWithFeatured: sortStoresWithFeatured
  };
})(typeof window !== 'undefined' ? window : globalThis);

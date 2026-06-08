/* Shared catalog dedup — one brand once, one medicine once, all pack sizes in weights[] */
(function (global) {
  var BRAND_ALIASES = {
    dabur: 'dabur',
    baidyanath: 'baidyanath',
    himalaya: 'himalaya',
    zandu: 'zandu',
    patanjali: 'patanjali',
    'charak pharma': 'charak',
    'charak': 'charak',
    'kerala ayurveda': 'kerala',
    imis: 'imis',
    manphar: 'manphar',
    nagarjuna: 'nagarjuna',
    boroplus: 'boroplus',
    navaratna: 'navaratna',
    dermicool: 'dermicool',
    'shree dhootapapeshwar limited': 'sdpl',
    'dhootapapeshwar': 'sdpl',
    'dr rao': 'drrao',
    "dr rao's herbal pharma": 'drrao',
    'ayurphala': 'ayurphala',
    'vasu labs': 'vasu',
    'vasu': 'vasu',
    'aimil': 'aimil',
    'gufic': 'gufic',
    'himalaya drugs and pharmaceuticals': 'himalayadrugs',
    'dabur classical division': 'daburclassical',
    'revinto ayurvedic': 'revinto',
    'revinto': 'revinto',
    'imc ayurvedic': 'imc',
    'imc': 'imc'
  };

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeBrandKey(str) {
    var key = String(str || '').toLowerCase().trim();
    if (!key) return '';
    if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];
    var stripped = key.replace(/[^a-z0-9]/g, '');
    var alias;
    for (alias in BRAND_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(BRAND_ALIASES, alias)) continue;
      var aliasNorm = alias.replace(/[^a-z0-9]/g, '');
      if (stripped === aliasNorm || (aliasNorm.length >= 4 && stripped.indexOf(aliasNorm) === 0)) {
        return BRAND_ALIASES[alias];
      }
    }
    var first = key.split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
    if (first && BRAND_ALIASES[first]) return BRAND_ALIASES[first];
    return stripped;
  }

  function inferBrandFromName(name) {
    var n = String(name || '').toLowerCase().trim();
    if (!n) return '';
    var aliases = Object.keys(BRAND_ALIASES).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i];
      if (n === alias || n.indexOf(alias + ' ') === 0) return BRAND_ALIASES[alias];
    }
    return '';
  }

  function normalizeNameKey(name, brandRaw) {
    var n = normalizeText(name);
    var brand = normalizeBrandKey(brandRaw);
    if (!n) return n;
    if (!brand) return n;
    var rawBrand = normalizeText(brandRaw);
    if (n === brand || n === rawBrand) return brand;
    if (rawBrand && n.indexOf(rawBrand + ' ') === 0) n = n.slice(rawBrand.length).trim();
    else if (brand && n.indexOf(brand + ' ') === 0) n = n.slice(brand.length).trim();
    return normalizeText(n);
  }

  function productMergeKey(med, defaultBrand) {
    var brandRaw = med.company || med.storeName || defaultBrand || inferBrandFromName(med.name) || '';
    var brand = normalizeBrandKey(brandRaw);
    var name = normalizeNameKey(med.name, brandRaw);
    if (brand && (!name || name === brand)) return brand + '|__product__';
    if (!brand) return '|' + name;
    return brand + '|' + name;
  }

  function mergeWeightLists(existing, incoming) {
    var merged = (existing || []).slice();
    (incoming || []).forEach(function (w) {
      var idx = merged.findIndex(function (x) { return x.value === w.value && x.unit === w.unit; });
      if (idx === -1) merged.push(Object.assign({}, w));
      else if (Number(w.price) < Number(merged[idx].price)) merged[idx] = Object.assign({}, w);
    });
    merged.sort(function (a, b) {
      if (a.unit === b.unit) return a.value - b.value;
      return String(a.unit).localeCompare(String(b.unit));
    });
    return merged;
  }

  function pickDisplayName(a, b, brandRaw) {
    a = String(a || '').trim();
    b = String(b || '').trim();
    if (!a) return b;
    if (!b) return a;
    var brand = normalizeBrandKey(brandRaw);
    var aNorm = normalizeNameKey(a, brandRaw);
    var bNorm = normalizeNameKey(b, brandRaw);
    if (aNorm === brand && bNorm !== brand) return b;
    if (bNorm === brand && aNorm !== brand) return a;
    return a.length >= b.length ? a : b;
  }

  function mergeProducts(items, defaultBrand) {
    var groups = {};
    (items || []).forEach(function (med) {
      var brandRaw = med.company || med.storeName || defaultBrand || inferBrandFromName(med.name) || '';
      var key = productMergeKey(med, defaultBrand);
      if (!groups[key]) {
        groups[key] = Object.assign({}, med, {
          company: med.company || brandRaw,
          storeName: med.storeName || brandRaw,
          weights: (med.weights || []).map(function (w) {
            return Object.assign({}, w, { medicineId: w.medicineId || med._id });
          })
        });
        return;
      }
      var group = groups[key];
      group.weights = mergeWeightLists(
        group.weights,
        (med.weights || []).map(function (w) {
          return Object.assign({}, w, { medicineId: w.medicineId || med._id });
        })
      );
      group.name = pickDisplayName(group.name, med.name, brandRaw);
      if (!group.imageFile && med.imageFile) group.imageFile = med.imageFile;
      if (!group.imageUrl && med.imageUrl) group.imageUrl = med.imageUrl;
      else if (!group.imageUrl && med.imageFile) {
        group.imageUrl = '/medicine-assets/' + encodeURIComponent(med.imageFile);
      }
      if ((med.description || '').length > (group.description || '').length) {
        group.description = med.description;
      }
    });
    return foldUnbrandedDuplicates(Object.keys(groups).map(function (k) { return groups[k]; }));
  }

  function foldUnbrandedDuplicates(medicines) {
    var branded = medicines.filter(function (m) { return normalizeBrandKey(m.company || m.storeName); });
    var orphans = medicines.filter(function (m) { return !normalizeBrandKey(m.company || m.storeName); });
    if (!orphans.length) return medicines;
    var removeIds = {};
    orphans.forEach(function (orphan) {
      var oName = normalizeNameKey(orphan.name, '') || normalizeText(orphan.name);
      if (!oName) return;
      var matches = branded.filter(function (b) {
        if (removeIds[b._id]) return false;
        return normalizeNameKey(b.name, b.company || b.storeName) === oName;
      });
      var brands = {};
      matches.forEach(function (m) { brands[normalizeBrandKey(m.company || m.storeName)] = true; });
      if (matches.length !== 1 || Object.keys(brands).length !== 1) return;
      var target = matches[0];
      target.weights = mergeWeightLists(
        target.weights,
        (orphan.weights || []).map(function (w) {
          return Object.assign({}, w, { medicineId: w.medicineId || orphan._id });
        })
      );
      if (!target.imageFile && orphan.imageFile) target.imageFile = orphan.imageFile;
      if (!target.imageUrl && orphan.imageUrl) target.imageUrl = orphan.imageUrl;
      else if (!target.imageUrl && orphan.imageFile) {
        target.imageUrl = '/medicine-assets/' + encodeURIComponent(orphan.imageFile);
      }
      removeIds[orphan._id] = true;
    });
    return medicines.filter(function (m) { return !removeIds[m._id]; });
  }

  function dedupeStores(list) {
    var map = {};
    (list || []).forEach(function (s) {
      var key = normalizeBrandKey(s.name || s._id);
      if (!key) key = String(s._id || '').toLowerCase();
      if (!map[key]) {
        map[key] = Object.assign({}, s);
        return;
      }
      map[key].medicineCount = (map[key].medicineCount || 0) + (s.medicineCount || 0);
      if ((s.name || '').length <= (map[key].name || '').length) map[key].name = s.name;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function displayStoreLabel(med) {
    var brand = (med.storeName || med.company || '').trim();
    var name = (med.name || '').trim();
    if (!brand || !name) return brand;
    if (normalizeBrandKey(brand) === normalizeNameKey(name, brand)) return '';
    if (normalizeText(name).indexOf(normalizeText(brand) + ' ') === 0) return '';
    return brand;
  }

  global.DgCatalogMerge = {
    normalizeBrandKey: normalizeBrandKey,
    normalizeNameKey: normalizeNameKey,
    mergeProducts: mergeProducts,
    dedupeStores: dedupeStores,
    displayStoreLabel: displayStoreLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);

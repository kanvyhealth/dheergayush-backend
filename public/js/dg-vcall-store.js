/**
 * Video-call store catalog — same product experience as stores.html
 */
(function (global) {
  'use strict';

  var PAGE_SIZE = 48;
  var products = [];
  var stores = [];
  var currentBrand = 'all';
  var currentPage = 0;
  var totalProducts = 0;
  var hasMore = true;
  var loading = false;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function mergeProducts(items, brand) {
    return global.DgCatalogMerge
      ? DgCatalogMerge.mergeProducts(items || [], brand)
      : (items || []);
  }

  function dedupeStores(list) {
    return global.DgCatalogMerge ? DgCatalogMerge.dedupeStores(list || []) : (list || []);
  }

  function displayStoreLabel(med) {
    return global.DgCatalogMerge
      ? DgCatalogMerge.displayStoreLabel(med)
      : (med.storeName || med.company || '');
  }

  function storeBrandKey(name) {
    return global.DgCatalogMerge
      ? DgCatalogMerge.normalizeBrandKey(name)
      : String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function getStoreMenuLabel(store) {
    if (store.menuLabel) return store.menuLabel;
    return global.DgStoreCategories
      ? DgStoreCategories.getStoreMenuLabel(store.name)
      : store.name;
  }

  function sortStores(list) {
    return global.DgStoreCategories
      ? DgStoreCategories.sortStoresWithFeatured(list)
      : (list || []).slice();
  }

  function minPrice(med) {
    var weights = med.weights || [];
    if (!weights.length) return parseFloat(med.price || med.mrp || 0) || 0;
    return Math.min.apply(null, weights.map(function (w) { return Number(w.price) || 0; }));
  }

  function productImageHtml(med) {
    var url = med.imageUrl || (global.getMedicineImageUrl ? getMedicineImageUrl(med) : '');
    var icon = global.DgStoreCategories
      ? DgStoreCategories.departmentIconClass(med.category)
      : 'fa-mortar-pestle';
    var fallback = '<div class="vcall-product-img-fallback" style="display:none"><i class="fas ' + icon + '"></i></div>';
    if (url) {
      return '<img src="' + escapeHtml(url) + '" alt="" class="vcall-product-img" loading="lazy" ' +
        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' + fallback;
    }
    return '<div class="vcall-product-img-fallback" style="display:flex"><i class="fas fa-pills"></i></div>';
  }

  function productActionsHtml(idx, browseOnly, cartQty) {
    if (browseOnly) {
      return '<span class="vcall-browse-only-tag"><i class="fas fa-eye"></i> View only</span>';
    }
    var qty = Math.max(0, parseInt(cartQty, 10) || 0);
    if (qty > 0) {
      return '<div class="vcall-product-qty vcall-product-qty--active">' +
        '<button type="button" class="vcall-qty-btn vcall-qty-dec" data-idx="' + idx + '">−</button>' +
        '<span class="vcall-qty-val" data-idx="' + idx + '">' + qty + '</span>' +
        '<button type="button" class="vcall-qty-btn vcall-qty-inc" data-idx="' + idx + '">+</button>' +
        '</div>';
    }
    return '<button type="button" class="vcall-prescribe-btn" data-idx="' + idx + '">' +
      '<i class="fas fa-prescription"></i> Prescribe</button>';
  }

  function productCardHtml(med, idx, browseOnly, cartQty) {
    var rating = global.getStaticRating ? getStaticRating(med.name) : '4.5';
    var reviews = global.getReviewCount ? getReviewCount(med.name) : 120;
    var stars = global.renderStarsHtml ? renderStarsHtml(rating) : '';
    var weights = med.weights || [];
    var minP = minPrice(med);
    var weightOptions = weights.map(function (w, i) {
      var medId = w.medicineId || med._id;
      return '<option value="' + idx + '|' + medId + '|' + w.value + '|' + w.unit + '|' + w.price + '"' +
        (i === 0 ? ' selected' : '') + '>' + w.value + ' ' + w.unit + ' — ₹' + w.price + '</option>';
    }).join('');
    var packSelect = weights.length > 1
      ? '<label class="vcall-pack-label">Pack size</label><select class="vcall-product-weight">' + weightOptions + '</select>'
      : (weights.length === 1
        ? '<input type="hidden" class="vcall-product-weight" value="' + idx + '|' + (weights[0].medicineId || med._id) +
          '|' + weights[0].value + '|' + weights[0].unit + '|' + weights[0].price + '">' +
          '<div class="vcall-pack-single">' + weights[0].value + ' ' + weights[0].unit + ' — ₹' + weights[0].price + '</div>'
        : '<p class="vcall-no-pack">Price unavailable</p>');
    var storeLabel = displayStoreLabel(med);
    var actions = productActionsHtml(idx, browseOnly, cartQty);

    return '<article class="vcall-product-card" data-idx="' + idx + '">' +
      '<div class="vcall-product-img-wrap">' + productImageHtml(med) + '</div>' +
      '<div class="vcall-product-body">' +
      (storeLabel ? '<span class="vcall-product-brand">' + escapeHtml(storeLabel) + '</span>' : '') +
      '<h4 class="vcall-product-title">' + escapeHtml(med.name) + '</h4>' +
      '<p class="vcall-product-desc">' + escapeHtml(med.description || 'Authentic Ayurvedic formulation') + '</p>' +
      '<div class="vcall-product-rating">' + stars +
      '<span class="vcall-rating-num">' + rating + '</span>' +
      '<span class="vcall-review-count">(' + Number(reviews).toLocaleString() + ')</span></div>' +
      '<div class="vcall-product-price">₹<span>' + minP + '</span>' +
      (weights.length > 1 ? '<span class="vcall-price-note"> onwards</span>' : '') + '</div>' +
      packSelect +
      '<div class="vcall-product-actions">' + actions + '</div>' +
      '</div></article>';
  }

  function mapSummary(list) {
    return sortStores(dedupeStores((list || []).map(function (s) {
      var key = storeBrandKey(s.name || s._id);
      return {
        _id: key || s._id,
        name: s.name,
        menuLabel: getStoreMenuLabel(s),
        medicineCount: s.medicineCount || 0
      };
    })));
  }

  async function loadSummary() {
    try {
      var res = await fetch('/api/stores/summary');
      if (!res.ok) throw new Error('summary failed');
      stores = mapSummary(await res.json());
      return stores;
    } catch (_) {
      return loadLegacySummary();
    }
  }

  async function loadLegacySummary() {
    try {
      var res = await fetch('/data/medicine-catalog.json');
      if (!res.ok) throw new Error('legacy failed');
      var legacy = await res.json();
      stores = mapSummary(legacy);
      return stores;
    } catch (_) {
      stores = [];
      return stores;
    }
  }

  function apiQuery(page, searchTerm) {
    var params = new URLSearchParams();
    params.set('page', String(page || 1));
    params.set('limit', String(PAGE_SIZE));
    if (currentBrand !== 'all') params.set('company', currentBrand);
    if (searchTerm) params.set('q', searchTerm);
    return params.toString();
  }

  async function fetchProductsPage(page, searchTerm, append) {
    if (loading) return { items: products.slice(), hasMore: hasMore };
    loading = true;
    var targetPage = append ? (currentPage + 1) : (page || 1);
    if (!append) {
      products = [];
      currentPage = 0;
      hasMore = true;
    }
    try {
      var res = await fetch('/api/medicines?' + apiQuery(targetPage, searchTerm));
      if (!res.ok) throw new Error('medicines failed');
      var data = await res.json();
      var items = mergeProducts(data.items || data, '');
      if (Array.isArray(data.items)) {
        totalProducts = data.total || items.length;
        hasMore = data.page < data.pages;
        currentPage = data.page;
      } else {
        totalProducts = items.length;
        hasMore = false;
        currentPage = 1;
      }
      if (append) {
        products = products.concat(items);
      } else {
        products = items;
      }
      return { items: items, hasMore: hasMore };
    } catch (_) {
      if (!append) await loadLegacyProducts(searchTerm);
      hasMore = false;
      return { items: products, hasMore: false };
    } finally {
      loading = false;
    }
  }

  async function loadLegacyProducts(searchTerm) {
    try {
      var res = await fetch('/data/medicine-catalog.json');
      if (!res.ok) throw new Error('legacy');
      var legacyStores = await res.json();
      var list = [];
      legacyStores.forEach(function (s) {
        var brandKey = storeBrandKey(s.name);
        if (currentBrand !== 'all' && brandKey !== currentBrand) return;
        (s.medicines || []).forEach(function (m) {
          var imageFile = m.imageFile || (m._id ? m._id + '.jpg' : '');
          list.push(Object.assign({}, m, {
            storeId: brandKey,
            storeName: s.name,
            company: m.company || m.brand || s.name,
            imageUrl: m.imageUrl || (imageFile ? '/medicine-assets/' + encodeURIComponent(imageFile) : null)
          }));
        });
      });
      products = mergeProducts(list, '');
      if (searchTerm) {
        products = global.DgFuzzySearch
          ? DgFuzzySearch.searchMedicines(products, searchTerm)
          : products.filter(function (m) {
            var q = searchTerm.toLowerCase();
            return (m.name || '').toLowerCase().indexOf(q) >= 0 ||
              (m.description || '').toLowerCase().indexOf(q) >= 0;
          });
      }
      totalProducts = products.length;
    } catch (_) {
      products = [];
      totalProducts = 0;
    }
  }

  function renderBrandChips(container, onChange) {
    if (!container) return;
    var html = '<button type="button" class="vcall-brand-chip' + (currentBrand === 'all' ? ' active' : '') +
      '" data-brand="all">All brands</button>';
    stores.forEach(function (store) {
      html += '<button type="button" class="vcall-brand-chip' + (currentBrand === store._id ? ' active' : '') +
        '" data-brand="' + escapeHtml(store._id) + '">' + escapeHtml(store.menuLabel || store.name) +
        ' <span>(' + (store.medicineCount || 0) + ')</span></button>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.vcall-brand-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentBrand = btn.getAttribute('data-brand') || 'all';
        container.querySelectorAll('.vcall-brand-chip').forEach(function (chip) {
          chip.classList.toggle('active', chip.getAttribute('data-brand') === currentBrand);
        });
        if (typeof onChange === 'function') onChange(currentBrand);
      });
    });
  }

  function renderProductGrid(container, browseOnly, qtyForCard) {
    if (!container) return;
    if (!products.length) {
      container.innerHTML = '<p class="vcall-empty-catalog">No products found. Try another brand or search term.</p>';
      return;
    }
    var lookup = typeof qtyForCard === 'function' ? qtyForCard : function () { return 0; };
    container.innerHTML = '<div class="vcall-product-grid">' +
      products.map(function (med, i) { return productCardHtml(med, i, browseOnly, lookup(i, med)); }).join('') +
      '</div>';
    global.__vcallProductIndex = products;
  }

  function updateProductCardActions(card, idx, browseOnly, cartQty) {
    if (!card) return;
    var actions = card.querySelector('.vcall-product-actions');
    if (!actions) return;
    actions.innerHTML = productActionsHtml(idx, browseOnly, cartQty);
  }

  function prescriptionItemHtml(item) {
    var weight = item.selectedWeight || {};
    var pack = [weight.value, weight.unit].filter(Boolean).join(' ');
    var unitPrice = item.unitPrice || item.pricePerUnit || 0;
    var img = item.imageUrl || (global.getMedicineImageUrl ? getMedicineImageUrl({ name: item.name }) : '');
    var thumb = img
      ? '<img src="' + escapeHtml(img) + '" alt="" class="vcall-rx-thumb" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="vcall-rx-thumb-fallback" style="display:none"><i class="fas fa-pills"></i></div>'
      : '<div class="vcall-rx-thumb-fallback"><i class="fas fa-pills"></i></div>';
    return '<div class="vcall-rx-item">' +
      '<div class="vcall-rx-thumb-wrap">' + thumb + '</div>' +
      '<div class="vcall-rx-details">' +
      (item.storeName ? '<span class="vcall-rx-brand">' + escapeHtml(item.storeName) + '</span>' : '') +
      '<strong class="vcall-rx-name">' + escapeHtml(item.name || 'Medicine') + '</strong>' +
      (item.description ? '<p class="vcall-rx-desc">' + escapeHtml(item.description) + '</p>' : '') +
      '<div class="vcall-rx-meta">' +
      (pack ? '<span><i class="fas fa-box"></i> ' + escapeHtml(pack) + '</span>' : '') +
      '<span><i class="fas fa-hashtag"></i> Qty: ' + (item.quantity || 1) + '</span>' +
      '<span><i class="fas fa-indian-rupee-sign"></i> ₹' + unitPrice + ' each</span>' +
      '</div>' +
      '<div class="vcall-rx-line-total">Line total: <strong>₹' + (item.totalPrice || unitPrice * (item.quantity || 1)) + '</strong></div>' +
      '</div></div>';
  }

  function resetCatalog() {
    products = [];
    currentPage = 0;
    hasMore = true;
    totalProducts = 0;
  }

  function setBrand(brand) {
    currentBrand = brand || 'all';
  }

  global.DgVcallStore = {
    loadSummary: loadSummary,
    fetchProductsPage: fetchProductsPage,
    renderBrandChips: renderBrandChips,
    renderProductGrid: renderProductGrid,
    updateProductCardActions: updateProductCardActions,
    productActionsHtml: productActionsHtml,
    prescriptionItemHtml: prescriptionItemHtml,
    patientEditableItemHtml: function (item, index) {
      var weight = item.selectedWeight || {};
      var pack = [weight.value, weight.unit].filter(Boolean).join(' ');
      var unitPrice = Number(item.pricePerUnit || item.price || item.unitPrice || 0);
      var qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      var lineTotal = Number(item.totalPrice) || unitPrice * qty;
      return '<div class="dg-patient-rx-item" data-rx-idx="' + index + '">' +
        '<div class="dg-patient-rx-item-main">' +
        '<strong>' + escapeHtml(item.name || 'Medicine') + '</strong>' +
        (pack ? '<span class="dg-patient-rx-pack">' + escapeHtml(pack) + '</span>' : '') +
        '<span class="dg-patient-rx-unit">₹' + unitPrice + ' each</span>' +
        '</div>' +
        '<div class="dg-patient-rx-item-controls">' +
        '<button type="button" class="dg-patient-rx-dec" data-rx-idx="' + index + '">−</button>' +
        '<span class="dg-patient-rx-qty" data-rx-idx="' + index + '">' + qty + '</span>' +
        '<button type="button" class="dg-patient-rx-inc" data-rx-idx="' + index + '">+</button>' +
        '<button type="button" class="dg-patient-rx-remove" data-rx-idx="' + index + '" title="Remove">×</button>' +
        '</div>' +
        '<div class="dg-patient-rx-line-total">₹' + lineTotal + '</div>' +
        '</div>';
    },
    resetCatalog: resetCatalog,
    setBrand: setBrand,
    getProducts: function () { return products; },
    getProduct: function (idx) { return products[idx] || null; },
    getStores: function () { return stores; },
    hasMore: function () { return hasMore; },
    isLoading: function () { return loading; },
    getTotalProducts: function () { return totalProducts; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

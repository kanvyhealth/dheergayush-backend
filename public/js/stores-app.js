/* DHEERGAYUSH Stores — paginated catalog with lazy images */
(function () {
  var PAGE_SIZE = 36;
  var STORE_CACHE_PREFIX = 'dg-store-page-v2:';
  var STORE_CACHE_TTL_MS = 5 * 60 * 1000;
  var stores = [];
  var products = [];
  var cart = [];
  var currentStore = null;
  var currentCategory = 'all';
  var currentStoreFilter = 'all';
  var currentPage = 0;
  var totalProducts = 0;
  var hasMore = true;
  var loading = false;
  var searchTimer = null;
  var observer = null;
  var cartToastTimer = null;
  var legacyMode = false;
  var legacyFiltered = [];
  var DOCTOR_DISCOUNT_RATE = 0.2;
  var isDoctor = localStorage.getItem('isDoctor') === '1' ||
    localStorage.getItem('userRole') === 'doctor';
  var consultationContext = { appointmentId: '', prescriptionId: '' };
  var appUserContext = {
    uid: '',
    email: '',
    name: '',
    phone: '',
    addresses: [],
    defaultAddressId: '',
    selectedAddressId: '',
    source: ''
  };

  (function readConsultationContextFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      consultationContext.appointmentId = String(params.get('appointmentId') || '').trim();
      consultationContext.prescriptionId = String(params.get('prescriptionId') || '').trim();
    } catch (_) { /* ignore */ }
  })();

  var els = {
    storesStrip: document.getElementById('storesStrip'),
    productGrid: document.getElementById('productGrid'),
    productCount: document.getElementById('productCount'),
    searchInput: document.getElementById('globalSearch'),
    sortSelect: document.getElementById('sortSelect'),
    cartBadge: document.getElementById('cartBadge'),
    cartItems: document.getElementById('cartItems'),
    cartTotal: document.getElementById('cartTotal'),
    checkoutBtn: document.getElementById('checkoutBtn'),
    paymentForm: document.getElementById('paymentForm'),
    paymentAmount: document.getElementById('paymentAmount'),
    checkoutOrderSummary: document.getElementById('checkoutOrderSummary'),
    placeOrderBtn: document.getElementById('placeOrderBtn'),
    checkoutStatus: document.getElementById('checkoutStatus'),
    successMessage: document.getElementById('successMessage'),
    breadcrumb: document.getElementById('breadcrumb'),
    loadSentinel: document.getElementById('loadSentinel'),
    savedAddressGroup: document.getElementById('savedAddressGroup'),
    savedAddressSelect: document.getElementById('savedAddressSelect'),
    deliveryAddress: document.getElementById('deliveryAddress'),
    deliveryAddressId: document.getElementById('deliveryAddressId'),
    appUserUid: document.getElementById('appUserUid'),
    mobileFilterToggle: document.getElementById('mobileFilterToggle'),
    filtersSidebar: document.getElementById('filtersSidebar')
  };

  function formatAddressLine(address) {
    if (!address || typeof address !== 'object') return '';
    var parts = [
      address.line1 || address.address,
      address.line2,
      address.city,
      address.state,
      address.pincode
    ].map(function (p) { return String(p || '').trim(); }).filter(Boolean);
    return parts.join(', ');
  }

  function applySelectedAddress(addressId) {
    var addresses = appUserContext.addresses || [];
    var chosen = null;
    for (var i = 0; i < addresses.length; i++) {
      if (String(addresses[i].id) === String(addressId)) {
        chosen = addresses[i];
        break;
      }
    }
    if (!chosen && addressId === '__manual__') {
      appUserContext.selectedAddressId = '';
      if (els.deliveryAddressId) els.deliveryAddressId.value = '';
      return;
    }
    if (!chosen) return;
    appUserContext.selectedAddressId = String(chosen.id);
    if (els.deliveryAddress) {
      els.deliveryAddress.value = formatAddressLine(chosen);
    }
    if (els.deliveryAddressId) {
      els.deliveryAddressId.value = String(chosen.id);
    }
    if (chosen.phone && document.getElementById('customerPhone')) {
      var phoneEl = document.getElementById('customerPhone');
      if (!phoneEl.value.trim()) {
        phoneEl.value = String(chosen.phone).replace(/\D/g, '').slice(-10);
      }
    }
  }

  function renderSavedAddressPicker() {
    var addresses = appUserContext.addresses || [];
    if (!els.savedAddressGroup || !els.savedAddressSelect) return;
    if (!addresses.length) {
      els.savedAddressGroup.style.display = 'none';
      return;
    }
    els.savedAddressGroup.style.display = 'block';
    var selected = appUserContext.selectedAddressId ||
      appUserContext.defaultAddressId ||
      (addresses[0] && addresses[0].id) ||
      '';
    var html = addresses.map(function (a) {
      var label = (a.label || 'Address') + ': ' + formatAddressLine(a);
      var sel = String(a.id) === String(selected) ? ' selected' : '';
      return '<option value="' + escapeHtml(String(a.id)) + '"' + sel + '>' +
        escapeHtml(label) + '</option>';
    }).join('');
    html += '<option value="__manual__">Enter a different address</option>';
    els.savedAddressSelect.innerHTML = html;
    applySelectedAddress(selected);
  }

  function setAppUserContext(payload) {
    if (!payload || typeof payload !== 'object') return;
    appUserContext.uid = String(payload.uid || '').trim();
    appUserContext.email = String(payload.email || '').trim();
    appUserContext.name = String(payload.name || '').trim();
    appUserContext.phone = String(payload.phone || '').trim();
    appUserContext.source = String(payload.source || '').trim();
    appUserContext.defaultAddressId = String(payload.defaultAddressId || '').trim();
    appUserContext.selectedAddressId = String(
      payload.selectedAddressId || payload.defaultAddressId || ''
    ).trim();
    appUserContext.addresses = Array.isArray(payload.addresses)
      ? payload.addresses.filter(function (a) {
          return a && typeof a === 'object' && String(a.line1 || a.address || '').trim();
        })
      : [];

    if (els.appUserUid) els.appUserUid.value = appUserContext.uid;
    var nameEl = document.getElementById('customerName');
    var phoneEl = document.getElementById('customerPhone');
    var emailEl = document.getElementById('customerEmail');
    if (nameEl && appUserContext.name && !nameEl.value.trim()) {
      nameEl.value = appUserContext.name;
    }
    if (phoneEl && appUserContext.phone && !phoneEl.value.trim()) {
      phoneEl.value = appUserContext.phone.replace(/\D/g, '').slice(-10);
    }
    if (emailEl && appUserContext.email && !emailEl.value.trim()) {
      emailEl.value = appUserContext.email;
    }
    renderSavedAddressPicker();
  }

  function showSection(id) {
    document.querySelectorAll('.store-section').forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function apiQuery() {
    var params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('limit', String(PAGE_SIZE));
    if (currentStoreFilter !== 'all') params.set('company', currentStoreFilter);
    if (currentCategory !== 'all') params.set('category', currentCategory);
    var q = (els.searchInput && els.searchInput.value.trim()) || '';
    if (q) params.set('q', q);
    return params.toString();
  }

  function storeCacheKey() {
    var q = (els.searchInput && els.searchInput.value.trim()) || '';
    return STORE_CACHE_PREFIX + [
      currentStoreFilter || 'all',
      currentCategory || 'all',
      q,
      els.sortSelect ? els.sortSelect.value : 'featured',
      PAGE_SIZE
    ].join('|');
  }

  function readStoreCache() {
    try {
      var raw = sessionStorage.getItem(storeCacheKey());
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || Date.now() - cached.savedAt > STORE_CACHE_TTL_MS) return null;
      return cached;
    } catch (_) {
      return null;
    }
  }

  function writeStoreCache(pageData) {
    try {
      sessionStorage.setItem(storeCacheKey(), JSON.stringify({
        savedAt: Date.now(),
        stores: stores,
        currentStoreFilter: currentStoreFilter,
        currentCategory: currentCategory,
        pageData: pageData
      }));
    } catch (_) { /* storage can be unavailable or full */ }
  }

  function renderCachedStore(cached) {
    if (!cached || !cached.pageData) return false;
    stores = cached.stores || stores;
    currentPage = 1;
    products = [];
    hasMore = true;
    totalProducts = 0;
    renderStoresStrip();
    updateBreadcrumb();
    if (els.productGrid) els.productGrid.innerHTML = '';
    applyProductsPage(cached.pageData, { skipCacheWrite: true });
    return true;
  }

  function sortProducts(list) {
    var sort = els.sortSelect ? els.sortSelect.value : 'featured';
    if (sort === 'price-low') {
      list.sort(function (a, b) { return minPrice(a) - minPrice(b); });
    } else if (sort === 'price-high') {
      list.sort(function (a, b) { return minPrice(b) - minPrice(a); });
    } else if (sort === 'rating') {
      list.sort(function (a, b) {
        return parseFloat(getStaticRating(b.name)) - parseFloat(getStaticRating(a.name));
      });
    }
    return list;
  }

  function minPrice(med) {
    if (!med.weights || !med.weights.length) return Number(med.price || med.mrp || med.pricePerUnit || med.unitPrice || 0) || 0;
    return Math.min.apply(null, med.weights.map(function (w) { return w.price; }));
  }

  function mergeProducts(items, defaultBrand) {
    var list = window.DgCatalogMerge
      ? DgCatalogMerge.mergeProducts(items, defaultBrand)
      : items;
    return (list || []).map(function (item) {
      if (Array.isArray(item.weights) && item.weights.length) return item;
      var price = Number(item.price || item.mrp || item.pricePerUnit || item.unitPrice || 0);
      if (price <= 0) return item;
      return Object.assign({}, item, {
        weights: [{
          medicineId: item._id || item.id || item.medicineId || item.name,
          value: item.weightValue || item.packSize || item.pack || 1,
          unit: item.weightUnit || item.unit || 'unit',
          price: price
        }]
      });
    });
  }

  function dedupeStores(list) {
    return window.DgCatalogMerge ? DgCatalogMerge.dedupeStores(list) : list;
  }

  function displayStoreLabel(med) {
    return window.DgCatalogMerge ? DgCatalogMerge.displayStoreLabel(med) : (med.storeName || med.company || '');
  }

  function productImageHtml(med, cardIdx) {
    var url = med.imageUrl || getMedicineImageUrl(med);
    var icon = window.DgStoreCategories
      ? DgStoreCategories.departmentIconClass(med.category)
      : 'fa-mortar-pestle';
    var fallback = '<div class="product-img-fallback" style="display:none"><i class="fas ' + icon + '"></i></div>';
    if (url) {
      var eager = cardIdx !== undefined && cardIdx < 12;
      var loadAttrs = eager
        ? 'loading="eager" fetchpriority="high" decoding="async"'
        : 'loading="lazy" fetchpriority="low" decoding="async"';
      return '<img src="' + escapeHtml(url) + '" alt="" class="product-img" width="220" height="220" ' + loadAttrs + ' ' +
        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' + fallback;
    }
    return '<div class="product-img-fallback" style="display:flex"><i class="fas fa-pills"></i></div>';
  }

  function preloadProductImages(items) {
    (items || []).slice(0, 8).forEach(function (med) {
      var url = med.imageUrl || getMedicineImageUrl(med);
      if (!url || document.querySelector('link[rel="preload"][href="' + url + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
    });
  }

  function getStoreMenuLabel(store) {
    if (store.menuLabel) return store.menuLabel;
    return window.DgStoreCategories
      ? DgStoreCategories.getStoreMenuLabel(store.name)
      : store.name;
  }

  function sortStoresForMenu(list) {
    return window.DgStoreCategories
      ? DgStoreCategories.sortStoresWithFeatured(list)
      : (list || []).slice();
  }

  function renderStoresStrip() {
    if (!els.storesStrip) return;
    var html = '<button type="button" class="store-chip' + (currentStoreFilter === 'all' ? ' active' : '') +
      '" data-store="all">All brands</button>';
    sortStoresForMenu(stores).forEach(function (store) {
      html += '<button type="button" class="store-chip' + (currentStoreFilter === store._id ? ' active' : '') +
        '" data-store="' + store._id + '">' + escapeHtml(getStoreMenuLabel(store)) +
        ' <span class="chip-count">(' + (store.medicineCount || 0) + ')</span></button>';
    });
    els.storesStrip.innerHTML = html;
    els.storesStrip.querySelectorAll('.store-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentStoreFilter = btn.dataset.store;
        currentStore = currentStoreFilter === 'all' ? null : stores.find(function (s) { return s._id === currentStoreFilter; });
        updateBreadcrumb();
        renderStoresStrip();
        resetAndLoadProducts();
      });
    });
  }

  function updateBreadcrumb() {
    if (!els.breadcrumb) return;
    if (currentStoreFilter === 'all') {
      els.breadcrumb.innerHTML = '<a href="/">Home</a> <span>›</span> <strong>Ayurvedic Store</strong>';
    } else if (currentStore) {
      els.breadcrumb.innerHTML = '<a href="/">Home</a> <span>›</span> <a href="stores.html">Store</a> <span>›</span> <strong>' +
        escapeHtml(getStoreMenuLabel(currentStore)) + '</strong>';
    }
  }

  function getCardWeightParts(card) {
    var sel = card.querySelector('.product-weight');
    if (!sel || !sel.value) return null;
    var parts = sel.value.split('|');
    return {
      medicineId: parts[1],
      value: parts[2],
      unit: parts[3],
      price: Number(parts[4])
    };
  }

  function getCartQtyForVariant(med, medicineId, value, unit) {
    var storeId = med.storeId || currentStoreFilter;
    var existing = cart.find(function (c) {
      return c.medicineId === medicineId && c.storeId === storeId &&
        String(c.selectedWeight.value) === String(value) && c.selectedWeight.unit === unit;
    });
    return existing ? existing.quantity : 0;
  }

  function productActionHtml(globalIdx, med) {
    var card = els.productGrid && els.productGrid.querySelector('.product-card[data-idx="' + globalIdx + '"]');
    var parts = card ? getCardWeightParts(card) : null;
    var qty = 0;
    if (parts) {
      qty = getCartQtyForVariant(med, parts.medicineId, parts.value, parts.unit);
    } else {
      var weights = med.weights || [];
      if (weights.length) {
        var w0 = weights[0];
        qty = getCartQtyForVariant(med, w0.medicineId || med._id, w0.value, w0.unit);
      }
    }
    if (qty > 0) {
      return '<div class="product-qty-stepper" data-idx="' + globalIdx + '">' +
        '<button type="button" class="qty-btn qty-dec" data-qty-dec="' + globalIdx + '" aria-label="Decrease quantity">−</button>' +
        '<span class="qty-value" aria-live="polite">' + qty + '</span>' +
        '<button type="button" class="qty-btn qty-inc" data-qty-inc="' + globalIdx + '" aria-label="Increase quantity">+</button>' +
        '</div>';
    }
    return '<button type="button" class="btn-add-cart" data-add="' + globalIdx + '">Add to Cart</button>';
  }

  function syncCardAction(card) {
    if (!card) return;
    var idx = parseInt(card.dataset.idx, 10);
    var med = window.__productIndex[idx];
    if (!med) return;
    var actions = card.querySelector('.product-actions');
    if (!actions) return;
    actions.innerHTML = productActionHtml(idx, med);
  }

  function syncAllCardActions() {
    if (!els.productGrid) return;
    els.productGrid.querySelectorAll('.product-card').forEach(syncCardAction);
  }

  function productCardHtml(item, globalIdx) {
    var med = item;
    var rating = getStaticRating(med.name);
    var reviews = getReviewCount(med.name);
    var minP = minPrice(med);
    var weights = med.weights || [];
    var weightOptions = weights.map(function (w, i) {
      var medId = w.medicineId || med._id;
      return '<option value="' + globalIdx + '|' + medId + '|' + w.value + '|' + w.unit + '|' + w.price + '"' +
        (i === 0 ? ' selected' : '') + '>' + w.value + ' ' + w.unit + ' — ₹' + w.price + '</option>';
    }).join('');
    var packSelect = weights.length > 1
      ? '<label class="pack-label">Pack size</label><select class="product-weight dg-select" aria-label="Pack size">' + weightOptions + '</select>'
      : (weights.length === 1
        ? '<input type="hidden" class="product-weight" value="' + globalIdx + '|' + (weights[0].medicineId || med._id) + '|' + weights[0].value + '|' + weights[0].unit + '|' + weights[0].price + '">' +
          '<div class="pack-single">' + weights[0].value + ' ' + weights[0].unit + ' — ₹' + weights[0].price + '</div>'
        : '');
    var storeLabel = displayStoreLabel(med);
    return '<article class="product-card" data-idx="' + globalIdx + '">' +
      '<div class="product-img-wrap">' + productImageHtml(med, globalIdx) + '</div>' +
      '<div class="product-body">' +
      (storeLabel ? '<span class="product-store">' + escapeHtml(storeLabel) + '</span>' : '') +
      '<h3 class="product-title" title="' + escapeHtml(med.name) + '">' + escapeHtml(med.name) + '</h3>' +
      '<p class="product-desc">' + escapeHtml(med.description || 'Authentic Ayurvedic formulation') + '</p>' +
      '<div class="product-rating">' + renderStarsHtml(rating) +
      '<span class="rating-num">' + rating + '</span>' +
      '<span class="review-count">(' + reviews.toLocaleString() + ')</span></div>' +
      '<div class="product-price">₹<span class="price-from">' + minP + '</span>' +
      (weights.length > 1 ? '<span class="price-note"> onwards</span>' : '') + '</div>' +
      '<div class="product-prime"><i class="fas fa-truck"></i> DHEERGAYUSH Delivery</div>' +
      packSelect +
      '<div class="product-actions">' + productActionHtml(globalIdx, med) + '</div></div></article>';
  }

  function bindAddToCart() {
    syncAllCardActions();
  }

  function setupProductGridEvents() {
    if (!els.productGrid || els.productGrid.dataset.cartEventsBound) return;
    els.productGrid.dataset.cartEventsBound = '1';

    els.productGrid.addEventListener('click', function (e) {
      var addBtn = e.target.closest('[data-add]');
      var incBtn = e.target.closest('[data-qty-inc]');
      var decBtn = e.target.closest('[data-qty-dec]');
      var idx;
      var med;
      var card;
      var parts;

      if (addBtn) {
        idx = parseInt(addBtn.dataset.add, 10);
        med = window.__productIndex[idx];
        if (!med) return;
        card = addBtn.closest('.product-card');
        parts = getCardWeightParts(card);
        if (!parts) return;
        addBtn.classList.add('btn-add-cart--pop');
        setTimeout(function () {
          setCartQty(med, parts.medicineId, parts.value, parts.unit, parts.price, 1);
          showCartAddedToast(med.name);
        }, 180);
        return;
      }

      if (incBtn || decBtn) {
        var stepBtn = incBtn || decBtn;
        idx = parseInt(stepBtn.dataset.qtyInc || stepBtn.dataset.qtyDec, 10);
        med = window.__productIndex[idx];
        if (!med) return;
        card = stepBtn.closest('.product-card');
        parts = getCardWeightParts(card);
        if (!parts) return;
        var current = getCartQtyForVariant(med, parts.medicineId, parts.value, parts.unit);
        var next = incBtn ? Math.min(99, current + 1) : Math.max(0, current - 1);
        setCartQty(med, parts.medicineId, parts.value, parts.unit, parts.price, next);
      }
    });

    els.productGrid.addEventListener('change', function (e) {
      if (e.target.classList.contains('product-weight')) {
        syncCardAction(e.target.closest('.product-card'));
      }
    });
  }

  function appendProducts(items) {
    if (!items.length && currentPage === 1) {
      els.productGrid.innerHTML = '<p class="empty-grid">No products match your filters. Try another category or search term.</p>';
      return;
    }
    var startIdx = products.length - items.length;
    var html = items.map(function (item, i) {
      return productCardHtml(item, startIdx + i);
    }).join('');
    if (currentPage === 1) {
      els.productGrid.innerHTML = html;
    } else {
      els.productGrid.insertAdjacentHTML('beforeend', html);
    }
    window.__productIndex = products;
    bindAddToCart();
  }

  function updateProductCount() {
    if (!els.productCount) return;
    var shown = products.length;
    if (totalProducts > shown) {
      els.productCount.textContent = 'Showing ' + shown + ' of ' + totalProducts + ' products';
    } else {
      els.productCount.textContent = totalProducts + ' result' + (totalProducts === 1 ? '' : 's');
    }
  }

  function setLoadingState(on) {
    loading = on;
    if (!els.loadSentinel) return;
    if (on) {
      els.loadSentinel.style.display = 'block';
      els.loadSentinel.innerHTML = '<span class="spinner"></span> Loading products…';
    } else if (hasMore) {
      els.loadSentinel.style.display = 'block';
      els.loadSentinel.innerHTML = 'Scroll for more';
    } else if (products.length) {
      els.loadSentinel.style.display = 'block';
      els.loadSentinel.innerHTML = 'All products loaded';
    } else {
      els.loadSentinel.style.display = 'none';
    }
  }

  function applyProductsPage(data, opts) {
    opts = opts || {};
    var items = data.items || data;
    if (Array.isArray(data.items)) {
      totalProducts = data.total || items.length;
      hasMore = data.page < data.pages;
      currentPage = data.page;
    } else {
      totalProducts = items.length;
      hasMore = false;
      products = mergeProducts(sortProducts(items.slice()));
      window.__productIndex = products;
      renderFullLegacy(products);
      updateProductCount();
      return;
    }
    products = products.concat(items);
    if (currentPage === 1) sortProducts(products);
    appendProducts(items);
    if (currentPage === 1) preloadProductImages(items);
    updateProductCount();
    if (currentPage === 1 && !opts.skipCacheWrite) {
      writeStoreCache(data);
    }
  }

  function appendLegacyPage() {
    var start = products.length;
    var chunk = legacyFiltered.slice(start, start + PAGE_SIZE);
    if (!chunk.length) {
      hasMore = false;
      return;
    }
    products = products.concat(chunk);
    currentPage = Math.ceil(products.length / PAGE_SIZE) || 1;
    hasMore = products.length < legacyFiltered.length;
    appendProducts(chunk);
    updateProductCount();
  }

  async function fetchProductsPage(force) {
    if (loading || (!force && !hasMore)) return;
    loading = true;
    setLoadingState(true);
    try {
      if (legacyMode) {
        appendLegacyPage();
        return;
      }
      var res = await fetch('/api/medicines?' + apiQuery(), { cache: 'force-cache' });
      if (!res.ok) throw new Error('fail');
      var data = await res.json();
      applyProductsPage(data);
    } catch (e) {
      if (legacyMode && products.length) {
        appendLegacyPage();
      } else if (currentPage <= 1) {
        await loadLegacyFallback();
      }
    } finally {
      loading = false;
      setLoadingState(false);
    }
  }

  function renderFullLegacy(items) {
    els.productGrid.innerHTML = items.map(function (item, i) {
      return productCardHtml(item, i);
    }).join('');
    bindAddToCart();
  }

  var excludedBrandKeys = {
    plum: 1,
    deepayurveda: 1,
    nutriorg: 1,
    neutriog: 1,
    organicindia: 1,
    soultree: 1,
    ayurvedaexperience: 1
  };

  function isExcludedStoreName(name) {
    var key = storeBrandKey(name);
    return !!(key && excludedBrandKeys[key]);
  }

  function isExcludedProduct(med) {
    return isExcludedStoreName(med.brand || med.company || med.storeName || '');
  }

  function storeBrandKey(name) {
    return window.DgCatalogMerge
      ? DgCatalogMerge.normalizeBrandKey(name)
      : String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function mapStoreSummary(list) {
    return sortStoresForMenu(dedupeStores((list || []).map(function (s) {
      var key = storeBrandKey(s.name || s._id);
      return {
        _id: key || s._id,
        name: s.name,
        menuLabel: s.menuLabel || getStoreMenuLabel(s),
        medicineCount: s.medicineCount || (s.medicines || []).length
      };
    })));
  }

  function filterLegacyProducts(list) {
    var out = (list || []).filter(function (m) { return !isExcludedProduct(m); });
    if (currentStoreFilter !== 'all') {
      out = out.filter(function (m) {
        return storeBrandKey(m.company || m.storeName) === currentStoreFilter;
      });
    }
    if (currentCategory !== 'all') {
      out = out.filter(function (m) {
        return window.DgStoreCategories
          ? DgStoreCategories.productMatchesDepartment(m, currentCategory)
          : String(m.category || '').toLowerCase() === String(currentCategory || '').toLowerCase();
      });
    }
    var q = (els.searchInput && els.searchInput.value.trim()) || '';
    if (q) {
      out = window.DgFuzzySearch
        ? DgFuzzySearch.searchMedicines(out, q)
        : out.filter(function (m) {
          var lower = q.toLowerCase();
          return (m.name || '').toLowerCase().indexOf(lower) >= 0
            || (m.description || '').toLowerCase().indexOf(lower) >= 0
            || (m.company || '').toLowerCase().indexOf(lower) >= 0;
        });
    }
    return sortProducts(out.slice());
  }

  async function loadLegacyFallback() {
    try {
      var fallback = await fetch('/data/medicine-catalog.json');
      if (!fallback.ok) throw new Error('empty');
      var legacyStores = (await fallback.json()).filter(function (s) {
        return !isExcludedStoreName(s.name);
      });
      stores = mapStoreSummary(legacyStores);
      products = [];
      legacyStores.forEach(function (s) {
        var brandKey = storeBrandKey(s.name);
        (s.medicines || []).forEach(function (m) {
          if (isExcludedProduct(m)) return;
          var imageFile = m.imageFile || (m._id ? m._id + '.jpg' : '');
          var imageUrl = m.imageUrl || (imageFile ? '/medicine-assets/' + encodeURIComponent(imageFile) : null);
          products.push(Object.assign({}, m, {
            imageFile: imageFile,
            storeId: brandKey,
            storeName: s.name,
            company: m.company || m.brand || s.name,
            imageUrl: imageUrl
          }));
        });
      });
      products = mergeProducts(products);
      legacyMode = true;
      legacyFiltered = filterLegacyProducts(products);
      totalProducts = legacyFiltered.length;
      products = [];
      currentPage = 0;
      hasMore = legacyFiltered.length > 0;
      renderStoresStrip();
      if (els.productGrid) els.productGrid.innerHTML = '';
      appendLegacyPage();
    } catch (err) {
      els.productGrid.innerHTML = '<p class="empty-grid">Could not load store. Please ensure the server is running.</p>';
    }
  }

  function resetAndLoadProducts() {
    currentPage = 0;
    products = [];
    legacyMode = false;
    legacyFiltered = [];
    hasMore = true;
    totalProducts = 0;
    currentPage = 1;
    var renderedCached = renderCachedStore(readStoreCache());
    if (!renderedCached && els.productGrid) els.productGrid.innerHTML = '';
    fetchProductsPage(true);
  }

  function setupInfiniteScroll() {
    if (!els.loadSentinel || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && hasMore && !loading) {
          currentPage++;
          fetchProductsPage();
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(els.loadSentinel);
  }

  function setCartQty(med, medicineId, value, unit, price, qty) {
    var storeId = med.storeId || currentStoreFilter;
    var storeName = med.storeName || med.company || '';
    var idx = cart.findIndex(function (c) {
      return c.medicineId === medicineId && c.storeId === storeId &&
        String(c.selectedWeight.value) === String(value) && c.selectedWeight.unit === unit;
    });
    if (qty <= 0) {
      if (idx >= 0) cart.splice(idx, 1);
    } else if (idx >= 0) {
      cart[idx].quantity = qty;
      cart[idx].pricePerUnit = price;
      cart[idx].totalPrice = price * qty;
    } else {
      cart.push({
        medicineId: medicineId,
        storeId: storeId,
        storeName: storeName,
        name: med.name,
        imageUrl: med.imageUrl || '',
        selectedWeight: { value: Number(value), unit: unit },
        pricePerUnit: price,
        quantity: qty,
        totalPrice: price * qty
      });
    }
    updateCartBadge();
    flashCart();
    syncAllCardActions();
    var cartSection = document.getElementById('cartSection');
    if (cartSection && cartSection.classList.contains('active')) {
      renderCart();
    }
  }

  function changeCartLineQuantity(lineIndex, delta) {
    var item = cart[lineIndex];
    if (!item) return;
    var med = {
      storeId: item.storeId,
      storeName: item.storeName,
      name: item.name,
      imageUrl: item.imageUrl
    };
    var next = Math.min(99, Math.max(0, item.quantity + delta));
    setCartQty(
      med,
      item.medicineId,
      item.selectedWeight.value,
      item.selectedWeight.unit,
      item.pricePerUnit,
      next
    );
  }

  function flashCart() {
    var btn = document.getElementById('cartBtn');
    if (btn) {
      btn.classList.add('pulse');
      setTimeout(function () { btn.classList.remove('pulse'); }, 400);
    }
  }

  function showCartAddedToast(productName) {
    var el = document.getElementById('cartAddedToast');
    if (!el) return;
    var label = productName ? String(productName).trim() : 'Product';
    if (label.length > 48) label = label.slice(0, 45) + '…';
    el.innerHTML = '<i class="fas fa-cart-plus" aria-hidden="true"></i><span><strong>Added to cart</strong> — ' +
      escapeHtml(label) + '</span>';
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(cartToastTimer);
    cartToastTimer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 350);
    }, 2800);
  }

  function updateCartBadge() {
    var n = cart.reduce(function (s, i) { return s + i.quantity; }, 0);
    els.cartBadge.textContent = n;
    els.cartBadge.style.display = n > 0 ? 'flex' : 'none';
  }

  function computeCartTotals() {
    var subtotal = cart.reduce(function (t, i) { return t + i.pricePerUnit * i.quantity; }, 0);
    var discount = isDoctor ? Math.round(subtotal * DOCTOR_DISCOUNT_RATE) : 0;
    var after = subtotal - discount;
    var delivery = after > 1000 ? 0 : 150;
    var total = after + delivery;
    return { subtotal: subtotal, discount: discount, delivery: delivery, total: total };
  }

  function renderCheckoutSummary() {
    if (!els.checkoutOrderSummary) return;
    if (!cart.length) {
      els.checkoutOrderSummary.innerHTML = '';
      return;
    }
    var totals = computeCartTotals();
    var itemLines = cart.map(function (item) {
      var lineTotal = item.pricePerUnit * item.quantity;
      var weight = item.selectedWeight.value + item.selectedWeight.unit;
      return '<div class="sum-row checkout-line">' +
        '<strong>' + escapeHtml(item.name) + '</strong>' +
        '<span class="checkout-line-calc">' +
        '<span>' + item.quantity + ' × ₹' + item.pricePerUnit + '</span>' +
        '<span>= ₹' + lineTotal + '</span>' +
        '</span>' +
        '<small style="color:#888;">' + escapeHtml(weight) + ' · ' + escapeHtml(item.storeName) + '</small>' +
        '</div>';
    }).join('');
    els.checkoutOrderSummary.innerHTML =
      '<div class="checkout-bill-title">Order summary</div>' +
      itemLines +
      '<div class="sum-row"><span>Subtotal</span><span>₹' + totals.subtotal + '</span></div>' +
      (isDoctor ? '<div class="sum-row discount"><span>Discount</span><span>-₹' + totals.discount + '</span></div>' : '') +
      '<div class="sum-row"><span>Delivery</span><span>' + (totals.delivery ? '₹' + totals.delivery : 'FREE') + '</span></div>' +
      '<div class="sum-row total"><span>Total payable</span><span>₹' + totals.total + '</span></div>';
  }

  function renderCart() {
    if (!cart.length) {
      els.cartItems.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
      els.cartTotal.innerHTML = '';
      els.checkoutBtn.disabled = true;
      return;
    }
    els.cartItems.innerHTML = cart.map(function (item, i) {
      var img = item.imageUrl || getMedicineImageUrl({ name: item.name });
      var thumb = img
        ? '<img src="' + img + '" alt="" class="cart-thumb" loading="lazy">'
        : '<div class="cart-thumb-placeholder"><i class="fas fa-pills"></i></div>';
      return '<div class="cart-row">' + thumb +
        '<div class="cart-row-info"><strong>' + escapeHtml(item.name) + '</strong>' +
        '<span>' + item.selectedWeight.value + item.selectedWeight.unit + '</span>' +
        '<span class="cart-store-tag">' + escapeHtml(item.storeName) + '</span></div>' +
        '<div class="cart-qty-stepper">' +
        '<button type="button" class="qty-btn qty-dec" data-cart-dec="' + i + '" aria-label="Decrease">−</button>' +
        '<span class="qty-value">' + item.quantity + '</span>' +
        '<button type="button" class="qty-btn qty-inc" data-cart-inc="' + i + '" aria-label="Increase">+</button>' +
        '</div>' +
        '<div class="cart-row-price">₹' + (item.pricePerUnit * item.quantity) + '</div>' +
        '<button type="button" class="cart-remove" data-i="' + i + '" aria-label="Remove">&times;</button></div>';
    }).join('');
    var subtotal = cart.reduce(function (t, i) { return t + i.pricePerUnit * i.quantity; }, 0);
    var delivery = subtotal > 1000 ? 0 : 150;
    var total = subtotal + delivery;
    els.cartTotal.innerHTML =
      '<div class="sum-row"><span>Subtotal</span><span>₹' + subtotal + '</span></div>' +
      '<div class="sum-row"><span>Delivery</span><span>' + (delivery ? '₹' + delivery : 'FREE') + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span>₹' + total + '</span></div>';
    els.checkoutBtn.disabled = false;
    els.cartItems.querySelectorAll('.cart-remove').forEach(function (b) {
      b.addEventListener('click', function () {
        cart.splice(parseInt(b.dataset.i, 10), 1);
        renderCart();
        updateCartBadge();
        syncAllCardActions();
      });
    });
    els.cartItems.querySelectorAll('[data-cart-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        changeCartLineQuantity(parseInt(b.dataset.cartInc, 10), 1);
      });
    });
    els.cartItems.querySelectorAll('[data-cart-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        changeCartLineQuantity(parseInt(b.dataset.cartDec, 10), -1);
      });
    });
  }

  async function loadStores() {
    try {
      currentPage = 1;
      products = [];
      hasMore = true;
      totalProducts = 0;
      var renderedCached = renderCachedStore(readStoreCache());
      if (!renderedCached && els.productGrid) els.productGrid.innerHTML = '';

      var fetchOpts = { cache: 'force-cache' };
      var summaryPromise = fetch('/api/stores/summary', fetchOpts).catch(function () { return fetch('/api/stores', fetchOpts); });
      var productsPromise = fetch('/api/medicines?' + apiQuery(), fetchOpts);

      var summaryRes = await summaryPromise;
      if (!summaryRes.ok) throw new Error('fail');
      var data = await summaryRes.json();
      stores = mapStoreSummary(data);
      if (!stores.length) throw new Error('empty');
      renderStoresStrip();

      loading = true;
      if (!renderedCached) setLoadingState(true);
      var productsRes = await productsPromise;
      if (!productsRes.ok) throw new Error('products fail');
      applyProductsPage(await productsRes.json());
    } catch (e) {
      await loadLegacyFallback();
    } finally {
      loading = false;
      setLoadingState(false);
    }
  }

  document.querySelectorAll('.filter-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelectorAll('.filter-link').forEach(function (l) { l.classList.remove('active'); });
      link.classList.add('active');
      currentCategory = link.dataset.category;
      resetAndLoadProducts();
    });
  });

  if (els.searchInput) {
    els.searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(resetAndLoadProducts, 350);
    });
  }
  if (els.sortSelect) {
    els.sortSelect.addEventListener('change', function () {
      sortProducts(products);
      var sorted = products.slice();
      products = [];
      currentPage = 1;
      hasMore = false;
      els.productGrid.innerHTML = '';
      products = sorted;
      appendProducts(sorted);
      updateProductCount();
    });
  }

  document.getElementById('cartBtn').addEventListener('click', function () {
    renderCart();
    showSection('cartSection');
  });
  document.getElementById('backToShop').addEventListener('click', function () { showSection('shopSection'); });
  document.getElementById('backToCart').addEventListener('click', function () {
    renderCart();
    showSection('cartSection');
  });
  document.getElementById('checkoutBtn').addEventListener('click', function () {
    var totals = computeCartTotals();
    renderCheckoutSummary();
    els.paymentAmount.textContent = totals.total;
    if (els.checkoutStatus) {
      els.checkoutStatus.style.display = 'none';
      els.checkoutStatus.textContent = '';
    }
    showSection('checkoutSection');
  });

  function setCheckoutStatus(msg, isError) {
    if (!els.checkoutStatus) return;
    els.checkoutStatus.style.display = 'block';
    els.checkoutStatus.style.color = isError ? '#c62828' : '#2e7d32';
    els.checkoutStatus.textContent = msg;
  }

  els.paymentForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = document.getElementById('customerName').value.trim();
    var phone = document.getElementById('customerPhone').value.trim();
    var email = document.getElementById('customerEmail').value.trim();
    var address = document.getElementById('deliveryAddress').value.trim();
    var notes = document.getElementById('notes').value.trim();
    var deliveryAddressId = (els.deliveryAddressId && els.deliveryAddressId.value) ||
      appUserContext.selectedAddressId ||
      '';
    var appUid = (els.appUserUid && els.appUserUid.value) || appUserContext.uid || '';
    if (!/^[A-Za-z ]+$/.test(name)) { alert('Name: letters only.'); return; }
    if (!/^\d{10}$/.test(phone)) { alert('Phone: 10 digits.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Invalid email.'); return; }
    if (!/^[A-Za-z0-9 ,\.\-#]{10,}$/.test(address)) { alert('Address: min 10 characters.'); return; }
    if (!window.DgRazorpayCheckout || !window.DgStorePayment) {
      alert('Payment system failed to load. Refresh the page.');
      return;
    }
    var totals = computeCartTotals();
    var selectedAddressSnapshot = null;
    if (deliveryAddressId) {
      for (var ai = 0; ai < (appUserContext.addresses || []).length; ai++) {
        if (String(appUserContext.addresses[ai].id) === String(deliveryAddressId)) {
          selectedAddressSnapshot = appUserContext.addresses[ai];
          break;
        }
      }
    }
    var orderData = {
      customerName: name, customerPhone: phone, customerEmail: email,
      deliveryAddress: address, notes: notes, items: cart,
      subtotal: totals.subtotal, discount: totals.discount, deliveryFee: totals.delivery,
      totalAmount: totals.total, orderStatus: 'pending', orderDate: new Date(),
      source: (consultationContext.appointmentId || consultationContext.prescriptionId)
        ? 'prescription'
        : (appUserContext.source === 'flutter_app' ? 'flutter_app' : 'website')
    };
    if (appUid) {
      orderData.uid = appUid;
      orderData.userId = appUid;
      orderData.patientId = appUid;
    }
    if (deliveryAddressId) {
      orderData.deliveryAddressId = deliveryAddressId;
    }
    if (selectedAddressSnapshot) {
      orderData.deliveryAddressSnapshot = selectedAddressSnapshot;
    }
    if (consultationContext.appointmentId) {
      orderData.appointmentId = consultationContext.appointmentId;
    }
    if (consultationContext.prescriptionId) {
      orderData.prescriptionId = consultationContext.prescriptionId;
    }
    if (els.placeOrderBtn) els.placeOrderBtn.disabled = true;
    setCheckoutStatus('Opening Razorpay…', false);
    try {
      if (isDoctor && window.DgAuth && DgAuth.ensureValidToken) {
        var doctorToken = await DgAuth.ensureValidToken();
        if (!doctorToken) {
          throw new Error('Doctor session expired. Log in again from the doctor dashboard.');
        }
      }
      setCheckoutStatus('Complete payment in the Razorpay window…', false);
      await DgStorePayment.checkoutCartOrder({
        orderData: orderData,
        description: 'DHEERGAYUSH Store — ' + cart.length + ' item(s)',
        prefill: { name: name, contact: phone, email: email }
      });
      cart = [];
      updateCartBadge();
      showSection('shopSection');
      els.successMessage.classList.add('show');
      setTimeout(function () { els.successMessage.classList.remove('show'); }, 4000);
      if (isDoctor) localStorage.removeItem('isDoctor');
    } catch (err) {
      var msg = err.message || 'Payment failed';
      console.error('Store checkout error:', err);
      if (msg.indexOf('cancelled') !== -1) {
        setCheckoutStatus('Payment cancelled.', true);
      } else {
        setCheckoutStatus(msg, true);
      }
    } finally {
      if (els.placeOrderBtn) els.placeOrderBtn.disabled = false;
    }
  });

  function addPrescriptionItemsToCart(items) {
    if (!Array.isArray(items)) {
      return { added: 0, skipped: 0 };
    }
    var added = 0;
    var skipped = 0;
    items.forEach(function (item) {
      if (!item || typeof item !== 'object') {
        skipped++;
        return;
      }
      var medicineId = String(item.medicineId || item.productId || item.id || '');
      if (!medicineId) {
        skipped++;
        return;
      }
      var price = Number(item.pricePerUnit != null ? item.pricePerUnit : item.price);
      if (!isFinite(price) || price <= 0) {
        skipped++;
        return;
      }
      var qty = Math.min(99, Math.max(1, Number(item.quantity || 1)));
      var value = Number(item.weightValue != null ? item.weightValue : 1);
      if (!isFinite(value) || value <= 0) value = 1;
      var unit = String(item.weightUnit || item.unit || 'unit');
      var med = {
        storeId: String(item.storeId || 'all'),
        storeName: String(item.storeName || item.company || ''),
        name: String(item.name || 'Medicine'),
        imageUrl: String(item.imageUrl || '')
      };
      setCartQty(med, medicineId, value, unit, price, qty);
      added++;
    });
    return { added: added, skipped: skipped };
  }

  function consumeSavedPrescriptionCart() {
    var raw = '';
    try {
      raw = localStorage.getItem('dgStorePrescriptionCartHandoff') || '';
    } catch (_) {
      raw = '';
    }
    if (!raw) return;
    try {
      var payload = JSON.parse(raw);
      var result = addPrescriptionItemsToCart(payload.items || []);
      if (payload.roomId) consultationContext.appointmentId = consultationContext.appointmentId || String(payload.roomId);
      if (result.added > 0) {
        renderCart();
        updateCartBadge();
        showSection('cartSection');
      }
      localStorage.removeItem('dgStorePrescriptionCartHandoff');
    } catch (err) {
      console.warn('Could not import saved prescription cart:', err);
    }
  }

  window.DgStoreCartBridge = {
    setAppUserContext: setAppUserContext,
    addPrescriptionItems: addPrescriptionItemsToCart,
    openCart: function () {
      showSection('cartSection');
    },
    setConsultationContext: function (ctx) {
      if (!ctx || typeof ctx !== 'object') return;
      if (ctx.appointmentId) {
        consultationContext.appointmentId = String(ctx.appointmentId).trim();
      }
      if (ctx.prescriptionId) {
        consultationContext.prescriptionId = String(ctx.prescriptionId).trim();
      }
    }
  };

  if (els.savedAddressSelect) {
    els.savedAddressSelect.addEventListener('change', function () {
      applySelectedAddress(els.savedAddressSelect.value);
    });
  }

  if (els.mobileFilterToggle && els.filtersSidebar) {
    els.mobileFilterToggle.addEventListener('click', function () {
      var open = els.filtersSidebar.classList.toggle('is-open');
      els.mobileFilterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      els.mobileFilterToggle.innerHTML = open
        ? '<i class="fas fa-times"></i> Hide filters'
        : '<i class="fas fa-sliders-h"></i> Filters';
    });
  }

  updateBreadcrumb();
  setupInfiniteScroll();
  setupProductGridEvents();
  loadStores();
  consumeSavedPrescriptionCart();
  updateCartBadge();
})();

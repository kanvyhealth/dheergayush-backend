/* DHEERGAYUSH Stores — paginated catalog with lazy images */
(function () {
  var PAGE_SIZE = 48;
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
  var isDoctor = localStorage.getItem('isDoctor') === '1';
  var consultationContext = { appointmentId: '', prescriptionId: '' };

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
    loadSentinel: document.getElementById('loadSentinel')
  };

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
    if (!med.weights || !med.weights.length) return 0;
    return Math.min.apply(null, med.weights.map(function (w) { return w.price; }));
  }

  function mergeProducts(items, defaultBrand) {
    return window.DgCatalogMerge
      ? DgCatalogMerge.mergeProducts(items, defaultBrand)
      : items;
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
        : 'loading="lazy" decoding="async"';
      return '<img src="' + url + '" alt="" class="product-img" ' + loadAttrs + ' ' +
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

  function applyProductsPage(data) {
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

  async function fetchProductsPage() {
    if (loading || !hasMore) return;
    loading = true;
    setLoadingState(true);
    try {
      if (legacyMode) {
        appendLegacyPage();
        return;
      }
      var res = await fetch('/api/medicines?' + apiQuery());
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
    if (els.productGrid) els.productGrid.innerHTML = '';
    currentPage = 1;
    fetchProductsPage();
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

  function isTestOnlyCart() {
    return cart.length === 1 && cart[0].medicineId === 'dheergayush_test_1rupee';
  }

  function computeCartTotals() {
    var subtotal = cart.reduce(function (t, i) { return t + i.pricePerUnit * i.quantity; }, 0);
    var discount = isDoctor ? Math.round(subtotal * 0.1) : 0;
    var after = subtotal - discount;
    var delivery = isTestOnlyCart() ? 0 : (after > 1000 ? 0 : 150);
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
      (isDoctor ? '<div class="sum-row discount"><span>Doctor discount (10%)</span><span>-₹' + totals.discount + '</span></div>' : '') +
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
    var discount = isDoctor ? Math.round(subtotal * 0.1) : 0;
    var after = subtotal - discount;
    var delivery = isTestOnlyCart() ? 0 : (after > 1000 ? 0 : 150);
    var total = after + delivery;
    els.cartTotal.innerHTML =
      '<div class="sum-row"><span>Subtotal</span><span>₹' + subtotal + '</span></div>' +
      (isDoctor ? '<div class="sum-row discount"><span>Doctor discount (10%)</span><span>-₹' + discount + '</span></div>' : '') +
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
      if (els.productGrid) els.productGrid.innerHTML = '';

      var summaryPromise = fetch('/api/stores/summary').catch(function () { return fetch('/api/stores'); });
      var productsPromise = fetch('/api/medicines?' + apiQuery());

      var summaryRes = await summaryPromise;
      if (!summaryRes.ok) throw new Error('fail');
      var data = await summaryRes.json();
      stores = mapStoreSummary(data);
      if (!stores.length) throw new Error('empty');
      renderStoresStrip();

      loading = true;
      setLoadingState(true);
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
    if (!/^[A-Za-z ]+$/.test(name)) { alert('Name: letters only.'); return; }
    if (!/^\d{10}$/.test(phone)) { alert('Phone: 10 digits.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Invalid email.'); return; }
    if (!/^[A-Za-z0-9 ,\.\-#]{10,}$/.test(address)) { alert('Address: min 10 characters.'); return; }
    if (!window.DgRazorpayCheckout || !window.DgStorePayment) {
      alert('Payment system failed to load. Refresh the page.');
      return;
    }
    var totals = computeCartTotals();
    var orderData = {
      customerName: name, customerPhone: phone, customerEmail: email,
      deliveryAddress: address, notes: notes, items: cart,
      subtotal: totals.subtotal, discount: totals.discount, deliveryFee: totals.delivery,
      totalAmount: totals.total, orderStatus: 'pending', orderDate: new Date(),
      source: (consultationContext.appointmentId || consultationContext.prescriptionId)
        ? 'prescription'
        : 'website'
    };
    if (consultationContext.appointmentId) {
      orderData.appointmentId = consultationContext.appointmentId;
    }
    if (consultationContext.prescriptionId) {
      orderData.prescriptionId = consultationContext.prescriptionId;
    }
    if (els.placeOrderBtn) els.placeOrderBtn.disabled = true;
    setCheckoutStatus('Opening Razorpay…', false);
    try {
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

  if (isDoctor) {
    var banner = document.createElement('div');
    banner.className = 'doctor-banner';
    banner.textContent = 'Doctor discount: 10% applied at checkout';
    document.querySelector('.shop-layout').prepend(banner);
  }

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

  window.DgStoreCartBridge = {
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

  updateBreadcrumb();
  setupInfiniteScroll();
  setupProductGridEvents();
  loadStores();
  updateCartBadge();
})();

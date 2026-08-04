/**
 * Product details page — gallery, variants, cart handoff, recommendations.
 */
(function () {
  'use strict';

  var CART_KEY = 'dgWebStoreCart';
  var MAX_QTY = 99;

  var state = {
    med: null,
    weights: [],
    weightIndex: 0,
    qty: 1
  };

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (_) {
      return '';
    }
  }

  function readCart() {
    try {
      var raw = sessionStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeCart(cart) {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart || []));
    } catch (_) { /* storage can be unavailable or full */ }
  }

  function updateCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var count = readCart().reduce(function (sum, line) {
      return sum + (Number(line.quantity) || 0);
    }, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  function imageUrl(med) {
    if (!med) return '';
    if (med.imageUrl) {
      var u = String(med.imageUrl).trim();
      // Cloudinary / external CDN — use catalog imageUrl directly
      if (/^https?:\/\//i.test(u) && !/\/medicine-assets\//i.test(u) && !/\/medicine-thumbs\//i.test(u)) {
        return u;
      }
      var abs = u.match(/^https?:\/\/[^/]+(\/medicine-(?:assets|thumbs)\/.+)$/i);
      if (abs) {
        if (/\/medicine-thumbs\//i.test(abs[1])) {
          var t = abs[1].match(/\/medicine-thumbs\/\d+\/([^/?#]+)/i);
          if (t) {
            var thumbFile = t[1];
            try { thumbFile = decodeURIComponent(thumbFile); } catch (_) { /* keep */ }
            return '/medicine-assets/' + encodeURIComponent(thumbFile);
          }
        }
        return abs[1];
      }
      if (u.startsWith('/')) return u;
    }
    var file = med.imageFile || '';
    if (file) return '/medicine-assets/' + encodeURIComponent(String(file).split('/').pop());
    if (typeof getMedicineImageUrl === 'function') return getMedicineImageUrl(med) || '';
    return '';
  }

  function categoryIcon(category) {
    var key = String(category || '').toLowerCase();
    if (key.indexOf('organic') >= 0) return 'fa-leaf';
    if (key.indexOf('beauty') >= 0 || key.indexOf('personal') >= 0) return 'fa-spa';
    if (key.indexOf('yoga') >= 0) return 'fa-om';
    if (key.indexOf('device') >= 0) return 'fa-stethoscope';
    return 'fa-mortar-pestle';
  }

  function ratingFor(med) {
    if (typeof getStaticRating === 'function') return getStaticRating(med.name);
    return '4.5';
  }

  function reviewsFor(med) {
    if (typeof getReviewCount === 'function') return getReviewCount(med.name);
    return 0;
  }

  function starsFor(rating) {
    if (typeof renderStarsHtml === 'function') return renderStarsHtml(rating);
    return '';
  }

  function minPrice(med) {
    var weights = med.weights || [];
    if (!weights.length) return Number(med.price || 0) || 0;
    return Math.min.apply(null, weights.map(function (w) { return Number(w.price) || 0; }));
  }

  function ensureWeights(med) {
    if (Array.isArray(med.weights) && med.weights.length) return med;
    var price = Number(med.price || med.mrp || med.pricePerUnit || 0);
    if (price <= 0) return med;
    return Object.assign({}, med, {
      weights: [{
        medicineId: med._id || med.id || med.medicineId || med.name,
        value: med.weightValue || med.packSize || 1,
        unit: med.weightUnit || med.unit || 'unit',
        price: price
      }]
    });
  }

  function packLabel(weight) {
    return String(weight.value) + ' ' + (weight.unit || 'unit');
  }

  function formatPrice(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function storeLink(department, subcategory) {
    if (!window.DgStoreCategories || !department) return '';
    return DgStoreCategories.storePathFor(department, subcategory);
  }

  function showToast(msg) {
    var el = document.getElementById('cartAddedToast');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = '<i class="fas fa-check-circle"></i><span>' + escapeHtml(msg) + '</span>';
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      el.hidden = true;
    }, 2200);
  }

  function addToCart(med, weight, quantity) {
    var cart = readCart();
    var medicineId = weight.medicineId || med._id || med.id;
    var storeId = String(med.storeId || qs('store') || med.company || med.storeName || 'general').trim();
    if (!storeId || storeId === 'all') storeId = 'general';
    var price = Number(weight.price) || 0;
    var qty = Math.max(1, Math.min(MAX_QTY, Number(quantity) || 1));
    var idx = cart.findIndex(function (c) {
      var cStore = String(c.storeId || '').trim() || 'general';
      if (cStore === 'all') cStore = 'general';
      return c.medicineId === medicineId && cStore === storeId &&
        String(c.selectedWeight.value) === String(weight.value) && c.selectedWeight.unit === weight.unit;
    });
    if (idx >= 0) {
      cart[idx].quantity = Math.min(MAX_QTY, Number(cart[idx].quantity || 0) + qty);
      cart[idx].pricePerUnit = price;
      cart[idx].totalPrice = price * cart[idx].quantity;
      cart[idx].storeId = storeId;
    } else {
      cart.push({
        medicineId: medicineId,
        storeId: storeId,
        storeName: med.storeName || med.company || med.brand || '',
        name: med.name,
        imageUrl: imageUrl(med),
        selectedWeight: { value: Number(weight.value), unit: weight.unit },
        pricePerUnit: price,
        quantity: qty,
        totalPrice: price * qty
      });
    }
    writeCart(cart);
    updateCartBadge();
    showToast(qty > 1 ? qty + ' items added to cart' : 'Added to cart');
  }

  function recommend(all, current, limit) {
    var id = String(current._id || current.id || '');
    var brand = String(current.brand || current.company || current.storeName || '').toLowerCase();
    var category = String(current.category || '').toLowerCase();
    var subCategory = String(current.subCategory || '').toLowerCase();
    var scored = (all || [])
      .map(function (m) {
        var mid = String(m._id || m.id || '');
        if (!mid || mid === id) return null;
        var b = String(m.brand || m.company || m.storeName || '').toLowerCase();
        var c = String(m.category || '').toLowerCase();
        var s = String(m.subCategory || '').toLowerCase();
        var score = 0;
        if (brand && b === brand) score += 2;
        if (category && c === category) score += 1;
        if (subCategory && s === subCategory) score += 2;
        if (!score) return null;
        return { med: m, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score || minPrice(a.med) - minPrice(b.med); });
    return scored.slice(0, limit || 8).map(function (x) { return x.med; });
  }

  function renderRecs(list, storeId) {
    var section = document.getElementById('pdRecsSection');
    var grid = document.getElementById('pdRecs');
    if (!section || !grid) return;
    if (!list.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    grid.innerHTML = list.map(function (m) {
      var mid = m._id || m.id;
      var href = '/product-details.html?id=' + encodeURIComponent(mid) +
        (storeId ? '&store=' + encodeURIComponent(storeId) : '');
      var img = imageUrl(m);
      var brand = m.brand || m.company || m.storeName || '';
      return (
        '<a class="pd-rec-card" href="' + href + '">' +
        '<div class="pd-rec-thumb">' +
        (img
          ? '<img src="' + escapeHtml(img) + '" alt="" loading="lazy">'
          : '<i class="fas ' + categoryIcon(m.category) + '"></i>') +
        '</div>' +
        '<div class="body">' +
        (brand ? '<span class="brand">' + escapeHtml(brand) + '</span>' : '') +
        '<h3>' + escapeHtml(m.name || '') + '</h3>' +
        '<span class="price">' + formatPrice(minPrice(m)) + '</span>' +
        '</div></a>'
      );
    }).join('');
  }

  function selectedWeight() {
    return state.weights[state.weightIndex] || state.weights[0] || null;
  }

  function syncPrice() {
    var weight = selectedWeight();
    var unitPrice = weight ? Number(weight.price) || 0 : minPrice(state.med);
    var priceEl = document.getElementById('pdPrice');
    var unitEl = document.getElementById('pdPriceUnit');
    var stickyEl = document.getElementById('pdStickyPrice');
    var qtyVal = document.getElementById('pdQtyVal');
    var minusBtn = document.getElementById('pdQtyMinus');
    var plusBtn = document.getElementById('pdQtyPlus');

    if (priceEl) priceEl.textContent = formatPrice(unitPrice);
    if (unitEl) unitEl.textContent = weight ? 'per ' + packLabel(weight) + ' pack' : '';
    if (stickyEl) stickyEl.textContent = formatPrice(unitPrice * state.qty);
    if (qtyVal) qtyVal.textContent = state.qty;
    if (minusBtn) minusBtn.disabled = state.qty <= 1;
    if (plusBtn) plusBtn.disabled = state.qty >= MAX_QTY;
  }

  function packsHtml() {
    if (state.weights.length < 2) {
      var single = state.weights[0];
      if (!single) return '';
      return '<span class="pd-field-label">Pack size</span>' +
        '<div class="pd-packs"><button type="button" class="pd-pack" data-idx="0" aria-pressed="true">' +
        escapeHtml(packLabel(single)) + '<span>' + formatPrice(single.price) + '</span></button></div>';
    }
    return '<span class="pd-field-label">Pack size · ' + state.weights.length + ' options</span>' +
      '<div class="pd-packs" id="pdPacks" role="group" aria-label="Pack size">' +
      state.weights.map(function (w, i) {
        return '<button type="button" class="pd-pack" data-idx="' + i + '" aria-pressed="' +
          (i === state.weightIndex ? 'true' : 'false') + '">' +
          escapeHtml(packLabel(w)) + '<span>' + formatPrice(w.price) + '</span></button>';
      }).join('') +
      '</div>';
  }

  function specsHtml(med) {
    var rows = [];
    var brand = med.brand || med.company || med.storeName || '';
    if (brand) rows.push(['Brand', brand]);
    if (med.category) rows.push(['Category', med.category]);
    if (med.subCategory) rows.push(['Subcategory', med.subCategory]);
    if (state.weights.length) {
      rows.push(['Available packs', state.weights.map(packLabel).join(', ')]);
    }
    if (med._id || med.id) rows.push(['Product code', String(med._id || med.id)]);
    if (!rows.length) return '';
    return '<section class="pd-panel"><h2>Product details</h2><dl class="pd-specs">' +
      rows.map(function (row) {
        return '<div class="pd-spec"><dt>' + escapeHtml(row[0]) + '</dt><dd>' +
          escapeHtml(row[1]) + '</dd></div>';
      }).join('') +
      '</dl></section>';
  }

  function updateBreadcrumb(med) {
    var crumb = document.getElementById('pdCrumb');
    var name = med.name || 'Product';
    if (!crumb) return;
    var parts = ['<a href="/">Home</a>', '<span class="sep">›</span>', '<a href="/store">Store</a>'];
    var catHref = storeLink(med.category);
    if (med.category && catHref) {
      parts.push('<span class="sep">›</span>',
        '<a href="' + escapeHtml(catHref) + '">' + escapeHtml(med.category) + '</a>');
    }
    var subHref = storeLink(med.category, med.subCategory);
    if (med.subCategory && subHref && subHref !== catHref) {
      parts.push('<span class="sep">›</span>',
        '<a href="' + escapeHtml(subHref) + '">' + escapeHtml(med.subCategory) + '</a>');
    }
    parts.push('<span class="sep">›</span>', '<strong>' + escapeHtml(name) + '</strong>');
    crumb.innerHTML = parts.join(' ');
  }

  function renderProduct(med) {
    med = ensureWeights(med);
    state.med = med;
    state.weights = med.weights || [];
    state.weightIndex = 0;
    state.qty = 1;

    var root = document.getElementById('pdRoot');
    var name = med.name || 'Product';
    document.title = name + ' — DHEERGAYUSH';
    updateBreadcrumb(med);

    var img = imageUrl(med);
    var brand = med.brand || med.company || med.storeName || '';
    var rating = ratingFor(med);
    var reviews = reviewsFor(med);

    root.innerHTML =
      '<div class="pd-shell">' +
      '<div class="pd-gallery">' +
      '<div class="pd-stage">' +
      (med.category ? '<span class="pd-stage-tag">' + escapeHtml(med.category) + '</span>' : '') +
      (img
        ? '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(name) + '" ' +
          'decoding="async" ' +
          'onerror="this.onerror=null;this.src=this.src.replace(/\\/medicine-thumbs\\/\\d+\\//,\'/medicine-assets/\');if(!this.dataset.fallback){this.dataset.fallback=1;this.style.display=\'none\';var f=this.nextElementSibling;if(f)f.style.display=\'grid\';}">' +
          '<div class="pd-stage-fallback" style="display:none"><i class="fas ' + categoryIcon(med.category) +
          '"></i><span>Image coming soon</span></div>'
        : '<div class="pd-stage-fallback"><i class="fas ' + categoryIcon(med.category) +
          '"></i><span>Image coming soon</span></div>') +
      '</div>' +
      '<div class="pd-assure">' +
      '<div><i class="fas fa-certificate"></i>Authentic brands</div>' +
      '<div><i class="fas fa-truck"></i>Free delivery above ₹1,000</div>' +
      '<div><i class="fas fa-lock"></i>Secure payment</div>' +
      '</div></div>' +

      '<div class="pd-buybox">' +
      (brand ? '<span class="pd-brand"><i class="fas fa-shield-halved"></i>' + escapeHtml(brand) + '</span>' : '') +
      '<h1 class="pd-title">' + escapeHtml(name) + '</h1>' +
      '<div class="pd-rating">' +
      '<span class="stars">' + starsFor(rating) + '</span>' +
      '<span class="score">' + escapeHtml(String(rating)) + '</span>' +
      '<span>(' + reviews.toLocaleString('en-IN') + ' ratings)</span>' +
      '<span class="dot">•</span>' +
      '<span class="in-stock"><i class="fas fa-circle-check"></i> In stock</span>' +
      '</div>' +
      '<div class="pd-price-row">' +
      '<span class="pd-price" id="pdPrice">—</span>' +
      '<span class="pd-price-unit" id="pdPriceUnit"></span>' +
      '</div>' +
      '<p class="pd-tax-note">Inclusive of all taxes</p>' +
      packsHtml() +
      '<span class="pd-field-label">Quantity</span>' +
      '<div class="pd-buy-row">' +
      '<div class="pd-qty">' +
      '<button type="button" id="pdQtyMinus" aria-label="Decrease quantity">−</button>' +
      '<span class="val" id="pdQtyVal">1</span>' +
      '<button type="button" id="pdQtyPlus" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<button type="button" class="dg-btn-primary" id="pdAddCart">' +
      '<i class="fas fa-cart-plus"></i> Add to cart</button>' +
      '<a class="dg-btn-outline" href="/store"><i class="fas fa-store"></i> Continue shopping</a>' +
      '</div>' +
      '<ul class="pd-trust">' +
      '<li><i class="fas fa-truck-fast"></i><span>Dispatched by DHEERGAYUSH from verified brand inventory</span></li>' +
      '<li><i class="fas fa-mortar-pestle"></i><span>Sourced from physician-trusted Ayurvedic manufacturers</span></li>' +
      '<li><i class="fas fa-headset"></i><span>Order support available through your consultation team</span></li>' +
      '</ul>' +
      '</div></div>' +

      '<section class="pd-panel"><h2>About this product</h2><p>' +
      escapeHtml(med.description || 'Authentic Ayurvedic formulation sourced from ' + (brand || 'a verified brand') + '.') +
      '</p></section>' +
      specsHtml(med);

    var packs = document.getElementById('pdPacks');
    if (packs) {
      packs.addEventListener('click', function (e) {
        var btn = e.target.closest('.pd-pack');
        if (!btn) return;
        state.weightIndex = Number(btn.dataset.idx) || 0;
        packs.querySelectorAll('.pd-pack').forEach(function (el) {
          el.setAttribute('aria-pressed', el === btn ? 'true' : 'false');
        });
        syncPrice();
      });
    }

    var minusBtn = document.getElementById('pdQtyMinus');
    var plusBtn = document.getElementById('pdQtyPlus');
    if (minusBtn) {
      minusBtn.addEventListener('click', function () {
        state.qty = Math.max(1, state.qty - 1);
        syncPrice();
      });
    }
    if (plusBtn) {
      plusBtn.addEventListener('click', function () {
        state.qty = Math.min(MAX_QTY, state.qty + 1);
        syncPrice();
      });
    }

    function handleAdd() {
      var weight = selectedWeight();
      if (!weight) {
        showToast('No pack size available');
        return;
      }
      addToCart(state.med, weight, state.qty);
      var cartBtn = document.getElementById('cartBtn');
      if (cartBtn) {
        cartBtn.classList.add('pulse');
        setTimeout(function () { cartBtn.classList.remove('pulse'); }, 400);
      }
    }

    var addBtn = document.getElementById('pdAddCart');
    if (addBtn) addBtn.addEventListener('click', handleAdd);

    var sticky = document.getElementById('pdSticky');
    var stickyAdd = document.getElementById('pdStickyAdd');
    if (sticky) sticky.hidden = false;
    if (stickyAdd) stickyAdd.addEventListener('click', handleAdd);
    document.body.classList.add('pd-has-product');

    syncPrice();
  }

  function renderError(message) {
    var root = document.getElementById('pdRoot');
    if (!root) return;
    root.innerHTML = '<div class="pd-error"><i class="fas fa-circle-exclamation"></i>' +
      escapeHtml(message) + ' <a href="/store">Return to store</a>.</div>';
  }

  async function loadMedicine(id) {
    var res = await fetch('/api/medicines/batch?ids=' + encodeURIComponent(id));
    if (res.ok) {
      var data = await res.json();
      var list = Array.isArray(data) ? data : (data.medicines || data.items || []);
      var found = list.find(function (m) {
        return String(m._id || m.id) === String(id);
      });
      if (found) return found;
    }
    var allRes = await fetch('/api/medicines?all=1');
    if (allRes.ok) {
      var all = await allRes.json();
      var arr = Array.isArray(all) ? all : (all.medicines || []);
      return arr.find(function (m) { return String(m._id || m.id) === String(id); }) || null;
    }
    return null;
  }

  async function loadCatalog() {
    try {
      var res = await fetch('/api/medicines?all=1');
      if (res.ok) {
        var data = await res.json();
        return Array.isArray(data) ? data : (data.medicines || []);
      }
    } catch (_) { /* fall through */ }
    try {
      var fallback = await fetch('/data/medicine-catalog.json');
      if (!fallback.ok) return [];
      var catalog = await fallback.json();
      var stores = Array.isArray(catalog) ? catalog : (catalog.stores || []);
      var out = [];
      stores.forEach(function (s) {
        (s.medicines || []).forEach(function (m) {
          out.push(Object.assign({}, m, {
            storeId: m.storeId || s.id || s._id,
            storeName: m.storeName || s.name,
            brand: m.brand || m.company || s.name
          }));
        });
      });
      return out;
    } catch (_) {
      return [];
    }
  }

  async function boot() {
    updateCartBadge();
    var id = qs('id');
    var store = qs('store');
    if (!id) {
      renderError('Missing product id.');
      return;
    }
    try {
      var med = await loadMedicine(id);
      if (!med) {
        var catalog = await loadCatalog();
        med = catalog.find(function (m) { return String(m._id || m.id) === String(id); }) || null;
      }
      if (!med) {
        renderError('Product not found.');
        return;
      }
      if (store && !med.storeId) med.storeId = store;
      renderProduct(med);
      var all = await loadCatalog();
      renderRecs(recommend(all, med, 8), store || med.storeId || '');
    } catch (err) {
      renderError('Could not load product.');
      console.error(err);
    }
  }

  boot();
})();

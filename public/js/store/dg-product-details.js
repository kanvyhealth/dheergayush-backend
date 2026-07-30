/**
 * Product details page — variants, cart handoff, recommendations.
 */
(function () {
  'use strict';

  var CART_KEY = 'dgWebStoreCart';

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
    } catch (_) { /* ignore */ }
  }

  function imageUrl(med) {
    if (med.imageUrl) return med.imageUrl;
    if (med.imageFile) return '/medicine-assets/' + encodeURIComponent(med.imageFile);
    if (window.DgMedicineImages && typeof DgMedicineImages.resolve === 'function') {
      return DgMedicineImages.resolve(med) || '';
    }
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

  function showToast(msg) {
    var el = document.getElementById('cartAddedToast');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      el.hidden = true;
    }, 2200);
  }

  function addToCart(med, weight) {
    var cart = readCart();
    var medicineId = weight.medicineId || med._id || med.id;
    var storeId = med.storeId || qs('store') || '';
    var value = weight.value;
    var unit = weight.unit;
    var price = Number(weight.price) || 0;
    var idx = cart.findIndex(function (c) {
      return c.medicineId === medicineId && c.storeId === storeId &&
        String(c.selectedWeight.value) === String(value) && c.selectedWeight.unit === unit;
    });
    if (idx >= 0) {
      cart[idx].quantity = Math.min(99, Number(cart[idx].quantity || 0) + 1);
      cart[idx].pricePerUnit = price;
      cart[idx].totalPrice = price * cart[idx].quantity;
    } else {
      cart.push({
        medicineId: medicineId,
        storeId: storeId,
        storeName: med.storeName || med.company || med.brand || '',
        name: med.name,
        imageUrl: imageUrl(med),
        selectedWeight: { value: Number(value), unit: unit },
        pricePerUnit: price,
        quantity: 1,
        totalPrice: price
      });
    }
    writeCart(cart);
    showToast('Added to cart');
  }

  function recommend(all, current, limit) {
    var id = String(current._id || current.id || '');
    var brand = String(current.brand || current.company || current.storeName || '').toLowerCase();
    var category = String(current.category || '').toLowerCase();
    var scored = (all || [])
      .map(function (m) {
        var mid = String(m._id || m.id || '');
        if (!mid || mid === id) return null;
        var b = String(m.brand || m.company || m.storeName || '').toLowerCase();
        var c = String(m.category || '').toLowerCase();
        var score = 0;
        if (brand && b === brand) score += 2;
        if (category && c === category) score += 1;
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
      return (
        '<a class="pd-rec-card" href="' + href + '">' +
        (img ? '<img src="' + escapeHtml(img) + '" alt="">' : '<div style="aspect-ratio:1;background:#f3f3f3;"></div>') +
        '<div class="body"><h3>' + escapeHtml(m.name || '') + '</h3>' +
        '<div class="price">₹' + minPrice(m) + '</div></div></a>'
      );
    }).join('');
  }

  function renderProduct(med) {
    med = ensureWeights(med);
    var root = document.getElementById('pdRoot');
    var crumb = document.getElementById('pdCrumbName');
    if (crumb) crumb.textContent = med.name || 'Product';
    document.title = (med.name || 'Product') + ' — DHEERGAYUSH';

    var weights = med.weights || [];
    var img = imageUrl(med);
    var brand = med.brand || med.company || med.storeName || '';
    var options = weights.map(function (w, i) {
      return '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' +
        escapeHtml(String(w.value) + ' ' + w.unit + ' — ₹' + w.price) + '</option>';
    }).join('');

    root.innerHTML =
      '<div class="pd-main">' +
      '<div class="pd-media">' +
      (img ? '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(med.name || '') + '">' : '<span>No image</span>') +
      '</div>' +
      '<div class="pd-info">' +
      (brand ? '<span class="pd-brand">' + escapeHtml(brand) + '</span>' : '') +
      '<h1 class="pd-title">' + escapeHtml(med.name || '') + '</h1>' +
      '<p class="pd-desc">' + escapeHtml(med.description || 'Authentic Ayurvedic formulation') + '</p>' +
      '<div class="pd-meta">' +
      (med.category ? '<div><strong>Category:</strong> ' + escapeHtml(med.category) + '</div>' : '') +
      '</div>' +
      '<div class="pd-price" id="pdPrice">₹' + (weights[0] ? weights[0].price : minPrice(med)) + '</div>' +
      (weights.length
        ? '<label class="pack-label" for="pdVariant">Pack size</label>' +
          '<select id="pdVariant" class="dg-select" style="max-width:280px;">' + options + '</select>'
        : '') +
      '<div class="pd-actions">' +
      '<button type="button" class="dg-btn-primary" id="pdAddCart"><i class="fas fa-cart-plus"></i> Add to cart</button>' +
      '<a class="dg-btn-outline" href="/store">View cart</a>' +
      '</div></div></div>';

    var select = document.getElementById('pdVariant');
    var priceEl = document.getElementById('pdPrice');
    if (select && priceEl) {
      select.addEventListener('change', function () {
        var w = weights[Number(select.value)] || weights[0];
        if (w) priceEl.textContent = '₹' + w.price;
      });
    }
    var addBtn = document.getElementById('pdAddCart');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var w = weights[select ? Number(select.value) : 0] || weights[0];
        if (!w) {
          showToast('No pack size available');
          return;
        }
        addToCart(med, w);
      });
    }
  }

  async function loadMedicine(id) {
    var res = await fetch('/api/medicines/batch?ids=' + encodeURIComponent(id), { cache: 'force-cache' });
    if (res.ok) {
      var data = await res.json();
      var list = Array.isArray(data) ? data : (data.medicines || data.items || []);
      var found = list.find(function (m) {
        return String(m._id || m.id) === String(id);
      });
      if (found) return found;
    }
    var allRes = await fetch('/api/medicines?all=1', { cache: 'force-cache' });
    if (allRes.ok) {
      var all = await allRes.json();
      var arr = Array.isArray(all) ? all : (all.medicines || []);
      return arr.find(function (m) { return String(m._id || m.id) === String(id); }) || null;
    }
    return null;
  }

  async function loadCatalog() {
    try {
      var res = await fetch('/api/medicines?all=1', { cache: 'force-cache' });
      if (res.ok) {
        var data = await res.json();
        return Array.isArray(data) ? data : (data.medicines || []);
      }
    } catch (_) { /* fall through */ }
    try {
      var fallback = await fetch('/data/medicine-catalog.json', { cache: 'force-cache' });
      if (!fallback.ok) return [];
      var catalog = await fallback.json();
      var out = [];
      (catalog.stores || []).forEach(function (s) {
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
    var id = qs('id');
    var store = qs('store');
    var root = document.getElementById('pdRoot');
    if (!id) {
      root.innerHTML = '<div class="pd-error">Missing product id. Go back to the <a href="/store">store</a>.</div>';
      return;
    }
    try {
      var med = await loadMedicine(id);
      if (!med) {
        var catalog = await loadCatalog();
        med = catalog.find(function (m) { return String(m._id || m.id) === String(id); }) || null;
      }
      if (!med) {
        root.innerHTML = '<div class="pd-error">Product not found. <a href="/store">Return to store</a>.</div>';
        return;
      }
      if (store && !med.storeId) med.storeId = store;
      renderProduct(med);
      var all = await loadCatalog();
      renderRecs(recommend(all, med, 8), store || med.storeId || '');
    } catch (err) {
      root.innerHTML = '<div class="pd-error">Could not load product. <a href="/store">Return to store</a>.</div>';
      console.error(err);
    }
  }

  boot();
})();

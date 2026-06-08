/**
 * Shared API helpers — admin Bearer token, JSON fetch, server wake-up UX.
 */
(function (global) {
  const ADMIN_TOKEN_KEY = 'dgAdminToken';
  const DEFAULT_HEALTH_URL = '/api/health';

  function getAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  }

  function setAdminToken(token) {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  }

  async function apiFetch(url, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    const token = getAdminToken();
    const needsAdminAuth =
      String(url).indexOf('/api/admin/') !== -1 ||
      (String(url).indexOf('/api/orders') !== -1 && (!options.method || options.method === 'GET' || ['PUT', 'DELETE'].includes(String(options.method || '').toUpperCase())));
    if (token && needsAdminAuth) {
      headers.Authorization = 'Bearer ' + token;
    }
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 401 && needsAdminAuth) {
      setAdminToken('');
      if (typeof global.onAdminSessionExpired === 'function') {
        global.onAdminSessionExpired();
      }
    }
    return res;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function checkHealth(healthUrl) {
    try {
      const res = await fetch(healthUrl || DEFAULT_HEALTH_URL, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json().catch(function () { return {}; });
      // Server is awake once /api/health responds — full `ok` also needs Firestore/Razorpay.
      if (data.ready === true || typeof data.uptime === 'number') return true;
      return data.ok !== false;
    } catch (e) {
      return false;
    }
  }

  async function fetchHealthStatus(healthUrl) {
    try {
      const res = await fetch(healthUrl || DEFAULT_HEALTH_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json().catch(function () { return null; });
    } catch (e) {
      return null;
    }
  }

  async function waitForServer(options) {
    options = options || {};
    const maxAttempts = options.maxAttempts || 10;
    const delayMs = options.delayMs || 2500;
    const healthUrl = options.healthUrl || DEFAULT_HEALTH_URL;
    for (let i = 0; i < maxAttempts; i++) {
      if (await checkHealth(healthUrl)) return true;
      if (i < maxAttempts - 1) await sleep(delayMs);
    }
    return false;
  }

  function ensureConnectingOverlay() {
    var existing = document.getElementById('dgServerConnecting');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'dgServerConnecting';
    wrap.className = 'dg-server-connecting hidden';
    wrap.innerHTML =
      '<div class="dg-server-connecting-card" role="alertdialog" aria-live="polite">' +
        '<div class="dg-server-connecting-spinner" aria-hidden="true"></div>' +
        '<h2>Connecting to DHEERGAYUSH secure server…</h2>' +
        '<p id="dgServerConnectingMsg">Waking up the server. This may take up to a minute on free hosting.</p>' +
        '<button type="button" class="dg-server-retry-btn" id="dgServerRetryBtn" style="display:none">Retry connection</button>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function showConnectingOverlay(message) {
    var overlay = ensureConnectingOverlay();
    overlay.classList.remove('hidden');
    var msg = document.getElementById('dgServerConnectingMsg');
    if (msg && message) msg.textContent = message;
    var retry = document.getElementById('dgServerRetryBtn');
    if (retry) retry.style.display = 'none';
  }

  function hideConnectingOverlay() {
    var overlay = document.getElementById('dgServerConnecting');
    if (overlay) overlay.classList.add('hidden');
  }

  function showRetryOnOverlay(onRetry) {
    var retry = document.getElementById('dgServerRetryBtn');
    if (!retry) return;
    retry.style.display = 'inline-flex';
    retry.onclick = function () {
      retry.disabled = true;
      retry.textContent = 'Retrying…';
      Promise.resolve(onRetry && onRetry()).finally(function () {
        retry.disabled = false;
        retry.textContent = 'Retry connection';
      });
    };
  }

  async function bootstrapApp(options) {
    options = options || {};
    if (options.skipOnLocalhost && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
      return true;
    }
    showConnectingOverlay(options.message);
    var ok = await waitForServer(options);
    if (ok) {
      hideConnectingOverlay();
      return true;
    }
    showConnectingOverlay('Server is still starting. Tap retry or wait a moment.');
    showRetryOnOverlay(function () {
      showConnectingOverlay('Connecting to DHEERGAYUSH secure server…');
      return waitForServer(options).then(function (ready) {
        if (ready) hideConnectingOverlay();
        else showConnectingOverlay('Server is still starting. Tap retry or wait a moment.');
        return ready;
      });
    });
    return false;
  }

  global.DgApi = {
    getAdminToken,
    setAdminToken,
    apiFetch,
    checkHealth,
    fetchHealthStatus,
    waitForServer,
    showConnectingOverlay,
    hideConnectingOverlay,
    bootstrapApp
  };
})(typeof window !== 'undefined' ? window : global);

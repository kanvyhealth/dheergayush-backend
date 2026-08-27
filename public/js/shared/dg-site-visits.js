/**
 * Count public page visits (one ping per page load). Unique visitors are
 * counted server-side from a stable browser id, once per IST calendar day.
 */
(function () {
  'use strict';

  if (window.__dgVisitSent) return;

  var path = String(window.location.pathname || '/');
  if (/^\/admin(\.html)?$/i.test(path) || path.indexOf('/admin') === 0) return;
  if (String(navigator.doNotTrack || window.doNotTrack || '') === '1') return;

  function visitorId() {
    var key = 'dgVisitorId';
    try {
      var existing = localStorage.getItem(key);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
      var id = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
      return id;
    } catch (_) {
      return 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  window.__dgVisitSent = true;
  try {
    fetch('/api/site-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId(), path: path }),
      keepalive: true,
      cache: 'no-store'
    }).catch(function () { /* ignore */ });
  } catch (_) { /* ignore */ }
})();

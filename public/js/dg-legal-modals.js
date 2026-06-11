/**
 * Legacy hash/modal links → redirect to standalone legal pages.
 */
(function () {
  'use strict';

  var PAGE_ROUTES = {
    privacy: '/privacy-policy',
    terms: '/terms-and-conditions',
    refund: '/refund-policy',
    'delete-account': '/account-deletion',
    support: '/support',
    contact: '/contact-us',
    about: '/about-us'
  };

  function routeForKey(key) {
    return PAGE_ROUTES[key] || null;
  }

  function redirectFromHash() {
    var h = (location.hash || '').replace('#', '');
    if (!h.startsWith('legal-')) return;
    var key = h.replace('legal-', '');
    var target = routeForKey(key);
    if (target) location.replace(target);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-legal]');
    if (!t) return;
    var target = routeForKey(t.getAttribute('data-legal'));
    if (!target) return;
    e.preventDefault();
    location.href = target;
  });

  document.addEventListener('DOMContentLoaded', redirectFromHash);
  window.addEventListener('hashchange', redirectFromHash);

  window.DgLegal = {
    open: function (key) {
      var target = routeForKey(key);
      if (target) location.href = target;
    },
    close: function () {}
  };
})();

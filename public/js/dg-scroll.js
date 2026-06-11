/**
 * DHEERGAYUSH — nested scroll regions: chain to page scroll at edges,
 * show hints when more content (e.g. submit buttons) is below the fold.
 */
(function () {
  'use strict';

  if (window.__dgScrollInit) return;
  window.__dgScrollInit = true;

  var REGION_SELECTORS = [
    '.form-container',
    '.dg-form-panel',
    '.auth-form',
    '.login-card',
    '.card#loginCard',
    '#adminLoginContainer',
    '#custom-prejoin',
    '#paymentFormContainer',
    '.modal-content',
    '.modal-body',
    '.reports-modal-content',
    '.diagnosis-modal-content',
    '.prescription-modal .modal-content',
    '#regdocsec .auth-form',
    '.checkout-grid .dg-form-panel',
    '#orderPaymentForm.dg-form-panel',
    '.dg-form-scroll',
    '.dg-nav-links.open',
    'nav.navbar:not(#navbar) .nav-links.open'
  ];

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.offsetWidth > 0 || el.offsetHeight > 0;
  }

  function updateRegion(el) {
    if (!isVisible(el)) return;

    el.classList.add('dg-scroll-region');

    var scrollable = el.scrollHeight > el.clientHeight + 6;
    var atTop = el.scrollTop <= 6;
    var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 6;

    el.classList.toggle('dg-scroll-has-more', scrollable && !atBottom);
    el.classList.toggle('dg-scroll-at-top', atTop);
    el.classList.toggle('dg-scroll-at-bottom', atBottom);
    el.classList.toggle('dg-scroll-is-scrollable', scrollable);
  }

  function bindRegion(el) {
    if (el.__dgScrollBound) {
      updateRegion(el);
      return;
    }
    el.__dgScrollBound = true;
    el.addEventListener('scroll', function () {
      updateRegion(el);
    }, { passive: true });
    updateRegion(el);
  }

  function scanRegions() {
    REGION_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(bindRegion);
    });
  }

  function init() {
    scanRegions();

    window.addEventListener('resize', scanRegions, { passive: true });
    window.addEventListener('orientationchange', scanRegions, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      var observer = new ResizeObserver(function () {
        requestAnimationFrame(scanRegions);
      });
      REGION_SELECTORS.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el) {
          observer.observe(el);
        });
      });
    }

    document.addEventListener('click', function () {
      requestAnimationFrame(scanRegions);
    });

    if (typeof MutationObserver !== 'undefined') {
      var mutationObserver = new MutationObserver(function () {
        requestAnimationFrame(scanRegions);
      });
      mutationObserver.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
        childList: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

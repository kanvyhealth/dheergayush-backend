/**
 * Mobile navigation for .dg-navbar and legacy .navbar pages (except index #navbar).
 */
(function () {
  function createToggle(label) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dg-nav-toggle nav-toggle';
    btn.setAttribute('aria-label', label || 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
    return btn;
  }

  function wireNav(toggle, links, closeOnNavigate) {
    if (!toggle || !links) return;

    function setOpen(open) {
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.innerHTML = open
        ? '<i class="fas fa-times" aria-hidden="true"></i>'
        : '<i class="fas fa-bars" aria-hidden="true"></i>';
    }

    function closeMenu() {
      setOpen(false);
    }

    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!links.classList.contains('open'));
    });

    if (closeOnNavigate) {
      links.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', closeMenu);
      });
    }

    document.addEventListener('click', function (e) {
      if (!links.classList.contains('open')) return;
      if (toggle.contains(e.target) || links.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 993px)').matches) closeMenu();
    });
  }

  function initDgNavbar(nav) {
    var inner = nav.querySelector('.dg-nav-inner');
    var links = nav.querySelector('.dg-nav-links');
    if (!inner || !links || inner.querySelector('.dg-nav-toggle')) return;

    var toggle = createToggle('Open menu');
    toggle.setAttribute('aria-controls', links.id || 'dgNavLinks');
    if (!links.id) links.id = 'dgNavLinks-' + Math.random().toString(36).slice(2, 8);

    var cartBtn = inner.querySelector('.cart-btn-nav');
    if (cartBtn) {
      inner.insertBefore(toggle, cartBtn);
    } else {
      inner.appendChild(toggle);
    }

    wireNav(toggle, links, true);
  }

  function initLegacyNavbar(nav) {
    if (nav.id === 'navbar') return;

    var container = nav.querySelector('.nav-container');
    var links = nav.querySelector('.nav-links');
    if (!container || !links || container.querySelector('.nav-toggle')) return;

    var toggle = createToggle('Open menu');
    toggle.className = 'nav-toggle dg-nav-toggle';
    toggle.setAttribute('aria-controls', links.id || 'navLinksPanel');
    if (!links.id) links.id = 'navLinksPanel-' + Math.random().toString(36).slice(2, 8);
    container.appendChild(toggle);
    wireNav(toggle, links, true);
  }

  function init() {
    document.querySelectorAll('.dg-navbar').forEach(initDgNavbar);
    document.querySelectorAll('nav.navbar').forEach(initLegacyNavbar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  (function loadContactStrip() {
    if (window.__dgContactStripRequested) return;
    window.__dgContactStripRequested = true;
    var base = document.currentScript && document.currentScript.src
      ? document.currentScript.src.replace(/[^/]+$/, '')
      : 'js/';
    function appendScript(name, onload) {
      var script = document.createElement('script');
      script.src = base + name;
      script.defer = true;
      if (onload) script.onload = onload;
      document.body.appendChild(script);
    }
    appendScript('dg-site-contact.js', function () {
      appendScript('dg-contact-strip.js');
    });
  })();
})();

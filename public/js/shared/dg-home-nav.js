/**
 * Homepage mobile navigation toggle
 */
(function () {
  function initHomeNav() {
    var navbar = document.getElementById('navbar');
    var navToggle = document.getElementById('navToggle');
    var navLinks = document.getElementById('navLinks');
    var logoImg = document.getElementById('siteLogoImg');
    var siteLogo = document.getElementById('siteLogo');

    if (!navToggle || !navLinks) return;

    if (logoImg && siteLogo) {
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        siteLogo.classList.add('logo--has-image');
      } else {
        logoImg.addEventListener('load', function () {
          siteLogo.classList.add('logo--has-image');
        });
        logoImg.addEventListener('error', function () {
          logoImg.remove();
        });
      }
    }

    function setMenuOpen(open) {
      navLinks.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      navToggle.innerHTML = open
        ? '<i class="fas fa-times" aria-hidden="true"></i>'
        : '<i class="fas fa-bars" aria-hidden="true"></i>';
    }

    function closeMobileNav() {
      setMenuOpen(false);
    }

    navToggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(!navLinks.classList.contains('open'));
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileNav);
    });

    document.addEventListener('click', function (e) {
      if (!navLinks.classList.contains('open')) return;
      if (navToggle.contains(e.target) || navLinks.contains(e.target)) return;
      closeMobileNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileNav();
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 993px)').matches) {
        closeMobileNav();
      }
    });

    if (navbar) {
      window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 24);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeNav);
  } else {
    initHomeNav();
  }
})();

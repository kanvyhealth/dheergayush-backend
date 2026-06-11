/**
 * Premium shell for legal / policy standalone pages.
 */
(function () {
  'use strict';

  var LEGAL_NAV = [
    { href: '/privacy-policy', label: 'Privacy', icon: 'fa-shield-halved', key: 'privacy' },
    { href: '/terms-and-conditions', label: 'Terms', icon: 'fa-file-contract', key: 'terms' },
    { href: '/refund-policy', label: 'Refund', icon: 'fa-rotate-left', key: 'refund' },
    { href: '/account-deletion', label: 'Delete Account', icon: 'fa-user-xmark', key: 'delete' },
    { href: '/contact-us', label: 'Contact', icon: 'fa-envelope', key: 'contact' },
    { href: '/support', label: 'Support', icon: 'fa-headset', key: 'support' }
  ];

  function currentKey() {
    var path = (location.pathname || '').toLowerCase();
    if (path.indexOf('privacy') !== -1) return 'privacy';
    if (path.indexOf('terms') !== -1) return 'terms';
    if (path.indexOf('refund') !== -1) return 'refund';
    if (path.indexOf('account-deletion') !== -1 || path.indexOf('delete-account') !== -1) return 'delete';
    if (path.indexOf('contact') !== -1) return 'contact';
    if (path.indexOf('support') !== -1) return 'support';
    return '';
  }

  function buildBackground() {
    return (
      '<div class="dg-landing-bg" aria-hidden="true">' +
        '<span class="dg-landing-orb dg-landing-orb--1"></span>' +
        '<span class="dg-landing-orb dg-landing-orb--2"></span>' +
        '<span class="dg-landing-orb dg-landing-orb--3"></span>' +
      '</div>'
    );
  }

  function buildNav() {
    return (
      '<header class="dg-landing-nav">' +
        '<div class="dg-landing-nav-inner">' +
          '<a href="/" class="dg-nav-logo" aria-label="DHEERGAYUSH home">' +
            '<img src="/logos/logo-horizontal.png" alt="DHEERGAYUSH" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';">' +
            '<span class="dg-nav-logo-text">DHEERGAYUSH</span>' +
          '</a>' +
          '<nav class="dg-landing-nav-actions" aria-label="Page navigation">' +
            '<a href="/" class="dg-home-link"><i class="fas fa-house" aria-hidden="true"></i> Home</a>' +
            '<a href="stores.html" class="dg-home-link dg-home-link--muted"><i class="fas fa-store" aria-hidden="true"></i> Stores</a>' +
          '</nav>' +
        '</div>' +
      '</header>'
    );
  }

  function buildFooter() {
    var links = LEGAL_NAV.map(function (item) {
      return '<a href="' + item.href + '">' + item.label + '</a>';
    }).join('');
    return (
      '<footer class="dg-landing-footer">' +
        '<div class="dg-landing-footer-inner">' +
          '<p>&copy; ' + new Date().getFullYear() + ' DHEERGAYUSH INDIA PRIVATE LIMITED</p>' +
          '<p style="margin:8px 0 0;font-size:0.9rem;">' +
            '<a href="tel:+917842736777">+91 7842736777</a>' +
            ' &nbsp;&middot;&nbsp; ' +
            '<a href="mailto:contact@dheergayush.net">contact@dheergayush.net</a>' +
          '</p>' +
          '<nav class="dg-landing-footer-links" aria-label="Legal links">' + links + '</nav>' +
        '</div>' +
      '</footer>'
    );
  }

  function buildHero(title, icon, meta) {
    var metaHtml = meta ? '<p class="dg-legal-meta">' + meta + '</p>' : '';
    return (
      '<div class="dg-legal-hero">' +
        '<div class="dg-legal-eyebrow"><i class="fas fa-leaf" aria-hidden="true"></i> Legal &amp; Policies</div>' +
        '<div class="dg-legal-hero-icon"><i class="fas ' + icon + '" aria-hidden="true"></i></div>' +
        '<h1>' + title + '</h1>' +
        metaHtml +
      '</div>'
    );
  }

  function buildPills(activeKey) {
    var pills = LEGAL_NAV.filter(function (n) {
      return ['privacy', 'terms', 'refund', 'delete'].indexOf(n.key) !== -1;
    }).map(function (item) {
      var cls = 'dg-legal-pill' + (item.key === activeKey ? ' dg-legal-pill--active' : '');
      return '<a class="' + cls + '" href="' + item.href + '"><i class="fas ' + item.icon + '"></i> ' + item.label + '</a>';
    }).join('');
    return '<nav class="dg-legal-pills" aria-label="Related policies">' + pills + '</nav>';
  }

  function enhancePage() {
    var body = document.body;
    if (!body.classList.contains('dg-legal-page')) return;

    var title = body.getAttribute('data-legal-title') || 'Policy';
    var icon = body.getAttribute('data-legal-icon') || 'fa-file-lines';
    var meta = body.getAttribute('data-legal-meta') || '';
    var active = currentKey();

    body.insertAdjacentHTML('afterbegin', buildBackground() + buildNav());

    var wrap = document.querySelector('.dg-legal-wrap');
    if (wrap) {
      wrap.insertAdjacentHTML('afterbegin', buildHero(title, icon, meta));
      var card = wrap.querySelector('.dg-legal-card');
      if (card && !card.querySelector('.dg-legal-pills')) {
        card.insertAdjacentHTML('beforeend', buildPills(active));
      }
    }

    body.insertAdjacentHTML('beforeend', buildFooter());

    if (window.DgSiteContact) {
      var phoneEl = document.getElementById('dgContactPhone');
      var emailEl = document.getElementById('dgContactEmail');
      if (phoneEl) {
        phoneEl.href = 'tel:' + DgSiteContact.phoneTel;
        phoneEl.textContent = DgSiteContact.phoneFormatted;
      }
      if (emailEl) {
        emailEl.href = 'mailto:' + DgSiteContact.email;
        emailEl.textContent = DgSiteContact.email;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhancePage);
  } else {
    enhancePage();
  }
})();

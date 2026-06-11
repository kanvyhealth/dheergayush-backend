/**
 * Shared site footer — centered containers, legal links, doctor registration.
 */
(function () {
  'use strict';

  var DOCTOR_REG_URL = 'telemedicine_platform.html?role=doctor#regdocsec';

  function contact() {
    var c = window.DgSiteContact || {};
    return {
      email: c.email || 'shaikmasthanjavidvali@gmail.com',
      phoneTel: c.phoneTel || '+919908797474',
      phoneFormatted: c.phoneFormatted || '+91 9908797474',
      website: c.website || 'https://dheergayush.net',
      companyName: c.companyName || 'DHEERGAYUSH INDIA PRIVATE LIMITED',
      addressHtml: (c.addressLines || [
        '21-8-89, Revenue Ward 46,',
        'Satyanarayanapuram,',
        'Vijayawada Urban,',
        'Krishna District – 520011,',
        'Andhra Pradesh, India'
      ]).join('<br>')
    };
  }

  function footerHtml() {
    var info = contact();
    return (
      '<footer class="dg-site-footer-band" role="contentinfo">' +
        '<div class="dg-site-footer-center">' +
          '<div class="dg-footer-cards">' +
            '<div class="dg-footer-card">' +
              '<h3><i class="fas fa-building" aria-hidden="true"></i> Company</h3>' +
              '<p><strong>' + info.companyName + '</strong></p>' +
              '<p>' + info.addressHtml + '</p>' +
            '</div>' +
            '<div class="dg-footer-card">' +
              '<h3><i class="fas fa-headset" aria-hidden="true"></i> Support</h3>' +
              '<p><strong>Support Email:</strong><br><a href="mailto:' + info.email + '">' + info.email + '</a></p>' +
              '<p><strong>Support Phone:</strong><br><a href="tel:' + info.phoneTel + '">' + info.phoneFormatted + '</a></p>' +
            '</div>' +
            '<div class="dg-footer-card">' +
              '<h3><i class="fas fa-link" aria-hidden="true"></i> Quick Links</h3>' +
              '<ul class="dg-footer-card-list">' +
                '<li><a href="/privacy-policy">Privacy Policy</a></li>' +
                '<li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li>' +
                '<li><a href="/refund-policy">Refund Policy</a></li>' +
                '<li><a href="/account-deletion">Delete Account</a></li>' +
                '<li><a href="/support">Support</a></li>' +
                '<li><a href="/contact-us">Contact Us</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="dg-footer-doctor-block">' +
            '<h3><i class="fas fa-user-md" aria-hidden="true"></i> Join us as Doctor</h3>' +
            '<p>Certified Ayurvedic practitioners can register to offer secure video consultations on DHEERGAYUSH.</p>' +
            '<a href="' + DOCTOR_REG_URL + '" class="dg-footer-doctor-btn">' +
              '<i class="fas fa-stethoscope" aria-hidden="true"></i> Doctor Registration Form' +
            '</a>' +
          '</div>' +
          '<nav class="dg-site-footer-legal-bar" aria-label="Legal and policies">' +
            '<a href="/privacy-policy">Privacy Policy</a>' +
            '<a href="/terms-and-conditions">Terms &amp; Conditions</a>' +
            '<a href="/refund-policy">Refund Policy</a>' +
            '<a href="/account-deletion">Delete Account</a>' +
            '<a href="/support">Support</a>' +
            '<a href="/contact-us">Contact Us</a>' +
          '</nav>' +
          '<p class="dg-site-footer-copy">' +
            '&copy; 2026 DHEERGAYUSH INDIA PRIVATE LIMITED. All rights reserved.' +
          '</p>' +
        '</div>' +
      '</footer>'
    );
  }

  function mountFooter() {
    var target = document.getElementById('dg-site-footer');
    if (!target) return;
    target.innerHTML = footerHtml();
  }

  function loadFabScript() {
    if (document.querySelector('script[src*="dg-doctor-fab.js"]')) return;
    var s = document.createElement('script');
    s.src = 'js/dg-doctor-fab.js';
    s.defer = true;
    document.body.appendChild(s);
  }

  function init() {
    mountFooter();
    loadFabScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

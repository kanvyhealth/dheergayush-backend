/**
 * Slim scrolling contact strip — tap phone or email for support.
 */
(function () {
  function contact() {
    var c = window.DgSiteContact || {};
    return {
      email: c.email || 'shaikmasthanjavidvali@gmail.com',
      phoneDisplay: c.phoneDisplay || '9908797474',
      phoneTel: c.phoneTel || '+919908797474'
    };
  }

  var SKIP_PATHS = ['/admin.html', '/video-call.html', '/ZegoCloudVideoCall.html', '/VideoCall.html', '/i.html'];
  var PHONE_ICON =
    '<svg class="dg-contact-strip__svg" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M6.6 10.8c1.5 2.9 3.7 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.2 1L6.6 10.8z"/>' +
    '</svg>';

  function ensureStyles() {
    if (document.querySelector('link[href*="dg-assets.css"], link[href*="dheergayush-theme.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/dg-assets.css';
    document.head.appendChild(link);
  }

  function shouldSkip() {
    if (document.body && document.body.hasAttribute('data-dg-no-contact-strip')) return true;
    var path = window.location.pathname || '';
    return SKIP_PATHS.some(function (p) {
      return path.endsWith(p) || path === p.replace('.html', '');
    });
  }

  function chunkHtml(info) {
    return (
      '<span class="dg-contact-strip__chunk">' +
      '<span class="dg-contact-strip__icon" aria-hidden="true">' + PHONE_ICON + '</span>' +
      '<span>Support</span>' +
      '<span class="dg-contact-strip__dot" aria-hidden="true">•</span>' +
      '<a class="dg-contact-strip__link dg-contact-strip__number" href="tel:' + info.phoneTel + '">' + info.phoneDisplay + '</a>' +
      '<span class="dg-contact-strip__dot" aria-hidden="true">•</span>' +
      '<a class="dg-contact-strip__link dg-contact-strip__email" href="mailto:' + info.email + '">' + info.email + '</a>' +
      '</span>'
    );
  }

  function init() {
    if (shouldSkip() || document.getElementById('dgContactStrip')) return;
    ensureStyles();

    var info = contact();
    var strip = document.createElement('div');
    strip.id = 'dgContactStrip';
    strip.className = 'dg-contact-strip';
    strip.setAttribute('role', 'contentinfo');
    strip.setAttribute('aria-label', 'DHEERGAYUSH support contact');
    strip.innerHTML =
      '<div class="dg-contact-strip__viewport">' +
      '<div class="dg-contact-strip__track">' +
      chunkHtml(info) +
      chunkHtml(info) +
      '</div></div>';

    document.body.appendChild(strip);
    document.body.classList.add('dg-has-contact-strip');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Site-wide fixed stethoscope — opens doctor registration form.
 */
(function () {
  'use strict';

  var DOCTOR_REG_URL = 'telemedicine_platform.html?role=doctor#regdocsec';

  function shouldSkip() {
    if (document.getElementById('dgDoctorFab')) return true;
    if (document.getElementById('consultationIcon')) return true;
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('video-call') !== -1) return true;
    if (path.indexOf('telemedicine_platform') !== -1) {
      var role = new URLSearchParams(window.location.search).get('role');
      if (role === 'doctor') return true;
    }
    return false;
  }

  function mount() {
    if (shouldSkip()) return;

    var link = document.createElement('a');
    link.id = 'dgDoctorFab';
    link.className = 'dg-doctor-fab';
    link.href = DOCTOR_REG_URL;
    link.setAttribute('aria-label', 'Join us as Doctor — open registration form');
    link.title = 'Join us as Doctor';
    link.innerHTML = '<i class="fas fa-stethoscope" aria-hidden="true"></i>';
    document.body.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

/**
 * DHEERGAYUSH — landing page patient auth shortcuts
 */
(function () {
  'use strict';

  function init() {
    var params = new URLSearchParams(window.location.search);
    var presetMode = params.get('mode');

    document.querySelectorAll('.register-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        localStorage.setItem('userRole', 'patient');
        localStorage.setItem('regRole', 'patient');
        window.location.href = 'telemedicine_platform.html?role=patient';
      });
    });

    document.querySelectorAll('.login-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        localStorage.setItem('userRole', 'patient');
        localStorage.removeItem('regRole');
        window.location.href = 'patient.html';
      });
    });

    if (presetMode === 'register') {
      localStorage.setItem('userRole', 'patient');
      localStorage.setItem('regRole', 'patient');
      window.location.replace('telemedicine_platform.html?role=patient');
      return;
    }

    if (presetMode === 'login') {
      localStorage.setItem('userRole', 'patient');
      localStorage.removeItem('regRole');
      window.location.replace('patient.html');
      return;
    }

    if (window.DgAuth && DgAuth.getToken()) {
      fetch('/api/auth/me', { headers: DgAuth.authHeaders() })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (!data || !data.redirectTo) return;
          window.location.replace(data.redirectTo);
        })
        .catch(function () { /* stay on landing */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

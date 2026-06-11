/**
 * DHEERGAYUSH — combined doctor login & registration page
 */
(function () {
  'use strict';

  function init() {
    var loginTab = document.getElementById('doctorTabLogin');
    var registerTab = document.getElementById('doctorTabRegister');
    var loginPanel = document.getElementById('doctorLoginPanel');
    var registerPanel = document.getElementById('doctorRegisterPanel');
    var registerBtn = document.getElementById('doctorRegisterContinueBtn');

    if (!loginTab || !registerTab || !loginPanel || !registerPanel) return;

    function showTab(tab) {
      var isLogin = tab === 'login';
      loginTab.classList.toggle('active', isLogin);
      registerTab.classList.toggle('active', !isLogin);
      loginTab.setAttribute('aria-selected', isLogin ? 'true' : 'false');
      registerTab.setAttribute('aria-selected', isLogin ? 'false' : 'true');
      loginPanel.classList.toggle('visible', isLogin);
      loginPanel.classList.toggle('hidden', !isLogin);
      loginPanel.hidden = !isLogin;
      registerPanel.classList.toggle('visible', !isLogin);
      registerPanel.classList.toggle('hidden', isLogin);
      registerPanel.hidden = isLogin;
    }

    loginTab.addEventListener('click', function () { showTab('login'); });
    registerTab.addEventListener('click', function () { showTab('register'); });

    if (registerBtn) {
      registerBtn.addEventListener('click', function () {
        localStorage.setItem('userRole', 'doctor');
        localStorage.setItem('regRole', 'doctor');
        window.location.href = 'telemedicine_platform.html?role=doctor#regdocsec';
      });
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'register') {
      showTab('register');
    }

    if (window.DgAuth && DgAuth.getToken()) {
      fetch('/api/auth/me', { headers: DgAuth.authHeaders() })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (data && data.redirectTo) {
            window.location.replace(data.redirectTo);
          }
        })
        .catch(function () { /* stay on page */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

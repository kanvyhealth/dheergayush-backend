/**
 * DHEERGAYUSH — landing page role selection wizard
 */
(function () {
  'use strict';

  var TRANSITION_MS = 480;

  function init() {
    var mainCard = document.getElementById('mainCard');
    var doctorOptionsCard = document.getElementById('doctorOptionsCard');
    var patientOptionsCard = document.getElementById('patientOptionsCard');
    var doctorBtn = document.getElementById('doctorBtn');
    var patientBtn = document.getElementById('patientBtn');
    var doctorBackBtn = document.getElementById('doctorBackBtn');
    var patientBackBtn = document.getElementById('patientBackBtn');
    var progressFill = document.getElementById('landingProgressFill');
    var stepLabel = document.getElementById('landingStepLabel');

    if (!mainCard || !doctorOptionsCard || !patientOptionsCard) return;

    var panels = [mainCard, doctorOptionsCard, patientOptionsCard];
    var transitioning = false;

    function setStep(step) {
      if (progressFill) {
        progressFill.style.width = step === 1 ? '50%' : '100%';
      }
      if (stepLabel) {
        stepLabel.textContent = 'Step ' + step + ' of 2';
      }
    }

    function setPanelA11y(activePanel) {
      panels.forEach(function (panel) {
        panel.setAttribute('aria-hidden', panel === activePanel ? 'false' : 'true');
      });
    }

    function showPanel(hidePanel, showPanelEl, step) {
      if (transitioning || !hidePanel || !showPanelEl || hidePanel === showPanelEl) return;
      transitioning = true;

      hidePanel.classList.remove('visible');
      hidePanel.classList.add('hidden');

      var backBtn = showPanelEl.querySelector('.dg-landing-back');
      if (backBtn) backBtn.classList.add('is-visible');

      setTimeout(function () {
        showPanelEl.classList.remove('hidden');
        showPanelEl.classList.add('visible');
        setPanelA11y(showPanelEl);
        setStep(step);

        var focusTarget =
          showPanelEl.querySelector('.dg-landing-back') ||
          showPanelEl.querySelector('button, [href]');
        if (focusTarget) focusTarget.focus({ preventScroll: true });

        transitioning = false;
      }, TRANSITION_MS);
    }

    function showMainCard(fromPanel) {
      var backBtn = fromPanel && fromPanel.querySelector('.dg-landing-back');
      if (backBtn) backBtn.classList.remove('is-visible');
      showPanel(fromPanel, mainCard, 1);
    }

    doctorBtn.addEventListener('click', function () {
      showPanel(mainCard, doctorOptionsCard, 2);
    });

    patientBtn.addEventListener('click', function () {
      showPanel(mainCard, patientOptionsCard, 2);
    });

    if (doctorBackBtn) {
      doctorBackBtn.addEventListener('click', function () {
        showMainCard(doctorOptionsCard);
      });
    }

    if (patientBackBtn) {
      patientBackBtn.addEventListener('click', function () {
        showMainCard(patientOptionsCard);
      });
    }

    document.querySelectorAll('.register-btn').forEach(function (button) {
      button.addEventListener('click', function (event) {
        var role = event.currentTarget.dataset.role;
        if (!role) return;
        localStorage.setItem('userRole', role);
        localStorage.setItem('regRole', role);
        window.location.href = 'telemedicine_platform.html';
      });
    });

    document.querySelectorAll('.login-btn').forEach(function (button) {
      button.addEventListener('click', function (event) {
        var role = event.currentTarget.dataset.role;
        if (!role) return;
        localStorage.setItem('userRole', role);
        localStorage.removeItem('regRole');
        window.location.href = role === 'doctor' ? 'doctor.html' : 'patient.html';
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (doctorOptionsCard.classList.contains('visible')) {
        showMainCard(doctorOptionsCard);
      } else if (patientOptionsCard.classList.contains('visible')) {
        showMainCard(patientOptionsCard);
      }
    });

    setPanelA11y(mainCard);
    setStep(1);

    var params = new URLSearchParams(window.location.search);
    var presetRole = params.get('role');
    if (presetRole === 'doctor') {
      showPanel(mainCard, doctorOptionsCard, 2);
    } else if (presetRole === 'patient') {
      showPanel(mainCard, patientOptionsCard, 2);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('dgDeleteSubmit');
    var statusEl = document.getElementById('dgDeleteStatus');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      var email = (document.getElementById('dgDeleteEmail') || {}).value || '';
      var phone = (document.getElementById('dgDeletePhone') || {}).value || '';
      var reason = (document.getElementById('dgDeleteReason') || {}).value || '';
      var supportEmail = (window.DgSiteContact && DgSiteContact.email) || 'shaikmasthanjavidvali@gmail.com';

      if (!email || email.indexOf('@') === -1) {
        if (statusEl) {
          statusEl.textContent = 'Please enter a valid email.';
          statusEl.className = 'error';
        }
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting…';
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = '';
      }

      try {
        var res = await fetch('/api/account/deletion-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), phone: phone.trim(), reason: reason.trim() })
        });
        var data = await res.json();
        if (res.ok) {
          if (statusEl) {
            statusEl.textContent = data.message || 'Request submitted. We will process it within 7 business days.';
            statusEl.className = 'success';
          }
        } else {
          if (statusEl) {
            statusEl.textContent = data.message || ('Could not submit. Email ' + supportEmail);
            statusEl.className = 'error';
          }
        }
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = 'Network error. Email ' + supportEmail + ' with your details.';
          statusEl.className = 'error';
        }
      }

      btn.disabled = false;
      btn.textContent = 'Send deletion request';
    });
  });
})();

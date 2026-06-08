/**
 * In-app legal & account features (modals — not separate page flows).
 */
(function () {
  function contact() {
    var c = window.DgSiteContact || {};
    return {
      email: c.email || 'contact@dheergayush.net',
      phoneTel: c.phoneTel || '+917842736777',
      phoneFormatted: c.phoneFormatted || '+91 7842736777'
    };
  }

  function emailLink() {
    var o = contact();
    return '<a href="mailto:' + o.email + '">' + o.email + '</a>';
  }

  function phoneLink() {
    var o = contact();
    return '<a href="tel:' + o.phoneTel + '">' + o.phoneFormatted + '</a>';
  }

  function contactLines() {
    return (
      '<p><strong>Email:</strong> ' + emailLink() + '<br>' +
      '<strong>Phone:</strong> ' + phoneLink() + '</p>'
    );
  }

  function getLegal() {
    return {
      privacy: {
        title: 'Privacy Policy',
        html: `
        <p class="dg-legal-meta">Effective Date: January 1, 2026 · Last Updated: May 23, 2026</p>
        <p>DHEERGAYUSH INDIA PRIVATE LIMITED operates the Dheergayush application and website. This policy explains how we collect, use, and protect your information.</p>
        <h3>Information We Collect</h3>
        <ul><li>Full Name, Email, Mobile Number</li><li>Date of Birth, Gender</li><li>Medical Reports &amp; Consultation Data</li><li>Payment, Device, IP, Firebase Token, Usage Data</li></ul>
        <h3>How We Use Information</h3>
        <ul><li>Authentication, appointments, consultations</li><li>Notifications, support, security, improvements, legal compliance</li></ul>
        <h3>Third-Party Services</h3>
        <ul><li>Firebase (Auth, Firestore, Messaging, Storage)</li><li>Google Maps, Payment Gateways</li></ul>
        <h3>Your Rights</h3>
        <ul><li>Access, correct, or delete your account</li><li>Contact us regarding privacy</li></ul>
        <p><strong>Contact:</strong> ${emailLink()}</p>`
      },
      terms: {
        title: 'Terms & Conditions',
        html: `
        <p>By using Dheergayush you agree to these terms.</p>
        <h3>User Responsibilities</h3>
        <ul><li>Provide accurate information</li><li>Do not misuse the platform or impersonate others</li><li>Use services responsibly</li></ul>
        <h3>Medical Disclaimer</h3>
        <p>Dheergayush is not an emergency service. Contact hospitals or emergency services in emergencies. Healthcare professionals consult independently.</p>
        <h3>Payments &amp; Liability</h3>
        <p>Charges and cancellation rules vary by provider. We are not liable for medical decisions, network delays, or third-party outages.</p>
        ${contactLines()}`
      },
      refund: {
        title: 'Refund Policy',
        html: `
        <p>Refund eligibility depends on the consultation type.</p>
        <h3>May qualify</h3>
        <ul><li>Failed sessions, duplicate payments, platform technical failures</li></ul>
        <h3>May not qualify</h3>
        <ul><li>Completed consultations, user connectivity issues, missed appointments without cancellation</li></ul>
        <p>Approved refunds: <strong>7–10 business days</strong>.</p>
        <p>Email: ${emailLink()} · Phone: ${phoneLink()}</p>`
      },
      support: {
        title: 'Support',
        html: `
        <p>Technical support, payments, appointments, and account help.</p>
        ${contactLines()}
        <p><strong>Website:</strong> <a href="https://dheergayush.net" target="_blank" rel="noopener">dheergayush.net</a></p>
        <h3>Categories</h3>
        <ul><li>Login, appointments, payments, deletion, technical, consultation, privacy</li></ul>
        <p>Response time: <strong>24–48 business hours</strong>.</p>`
      },
      contact: {
        title: 'Contact Us',
        html: `
        <p><strong>DHEERGAYUSH INDIA PRIVATE LIMITED</strong><br>
        21-8-89, Revenue Ward 46, Satyanarayanapuram, Vijayawada Urban,<br>
        Krishna District – 520011, Andhra Pradesh, India</p>
        <p>Email: ${emailLink()}<br>
        Phone: ${phoneLink()}</p>`
      },
      about: {
        title: 'About Dheergayush',
        html: `
        <p>Healthcare technology by DHEERGAYUSH INDIA PRIVATE LIMITED — secure online consultations and digital health services across India.</p>
        <h3>Platform supports</h3>
        <ul><li>Online consultations &amp; scheduling</li><li>Prescriptions, reports, reminders</li><li>Secure multi-device access</li></ul>
        ${contactLines()}`
      },
      'delete-account': {
        title: 'Delete Account',
        html: `
        <p>Request permanent deletion of your account and personal data.</p>
        <h3>Removed</h3>
        <ul><li>Profile, consultation history, uploads, preferences, auth records</li></ul>
        <h3>May be retained</h3>
        <ul><li>Legal, fraud prevention, security, financial compliance</li></ul>
        <h3>How to delete</h3>
        <p><strong>App:</strong> Profile → Settings → Delete Account</p>
        <p><strong>Email:</strong> Send request to ${emailLink()} with registered mobile &amp; email.</p>
        <p>Processed within <strong>7 business days</strong>.</p>
        <div class="dg-delete-form">
          <label>Registered email</label>
          <input type="email" id="dgDeleteEmail" class="dg-input" placeholder="your@email.com">
          <label>Registered mobile</label>
          <input type="tel" id="dgDeletePhone" class="dg-input" placeholder="10-digit mobile">
          <label>Reason (optional)</label>
          <textarea id="dgDeleteReason" class="dg-textarea" rows="2"></textarea>
          <button type="button" class="dg-btn-primary" id="dgDeleteSubmit" style="margin-top:12px;width:100%;border:none;cursor:pointer;">Send deletion request</button>
        </div>`
      }
    };
  }

  function ensureShell() {
    if (document.getElementById('dgLegalOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dgLegalOverlay';
    overlay.className = 'dg-legal-overlay';
    overlay.innerHTML = `
      <div class="dg-legal-modal" role="dialog" aria-modal="true">
        <button type="button" class="dg-legal-close" aria-label="Close">&times;</button>
        <h2 id="dgLegalTitle"></h2>
        <div id="dgLegalBody" class="dg-legal-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.dg-legal-close').onclick = closeLegal;
    overlay.onclick = function (e) {
      if (e.target === overlay) closeLegal();
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLegal();
    });
  }

  function openLegal(key) {
    const data = getLegal()[key];
    if (!data) return;
    ensureShell();
    const overlay = document.getElementById('dgLegalOverlay');
    document.getElementById('dgLegalTitle').textContent = data.title;
    document.getElementById('dgLegalBody').innerHTML = data.html;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (key === 'delete-account') {
      const btn = document.getElementById('dgDeleteSubmit');
      const supportEmail = contact().email;
      if (btn) {
        btn.onclick = async function () {
          const email = (document.getElementById('dgDeleteEmail') || {}).value || '';
          const phone = (document.getElementById('dgDeletePhone') || {}).value || '';
          const reason = (document.getElementById('dgDeleteReason') || {}).value || '';
          if (!email || email.indexOf('@') === -1) {
            alert('Please enter a valid email.');
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Submitting…';
          try {
            const res = await fetch('/api/account/deletion-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, phone, reason })
            });
            const data = await res.json();
            if (res.ok) {
              alert(data.message || 'Request submitted.');
              closeLegal();
            } else {
              alert(data.message || ('Could not submit. Email ' + supportEmail));
            }
          } catch (e) {
            alert('Network error. Email ' + supportEmail + ' with your details.');
          }
          btn.disabled = false;
          btn.textContent = 'Send deletion request';
        };
      }
    }
  }

  function closeLegal() {
    const overlay = document.getElementById('dgLegalOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-legal]');
    if (t) {
      e.preventDefault();
      openLegal(t.getAttribute('data-legal'));
    }
  });

  function hashToLegal() {
    const h = (location.hash || '').replace('#', '');
    if (h.startsWith('legal-')) openLegal(h.replace('legal-', ''));
  }

  document.addEventListener('DOMContentLoaded', hashToLegal);
  window.addEventListener('hashchange', hashToLegal);
  window.DgLegal = { open: openLegal, close: closeLegal };
})();

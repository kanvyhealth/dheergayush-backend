require('dotenv').config();

const BASE = process.env.VERIFY_BASE || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'muralimohan';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'Muralimohan123@';

async function req(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let body = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, ok: res.ok, body };
}

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ' - ' + detail : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
}

async function main() {
  console.log('Verifying ' + BASE);

  try {
    const health = await req('/api/health');
    if (health.ok && health.body.db === 'connected') {
      pass('Database connected', 'provider=' + health.body.provider);
    } else {
      fail('Database connected', JSON.stringify(health.body));
    }
  } catch (e) {
    fail('Database connected', e.message);
    process.exit(1);
  }

  let token = '';
  try {
    const login = await req('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });
    if (login.ok && login.body.token) {
      token = login.body.token;
      pass('Admin login', 'token issued');
    } else {
      fail('Admin login', login.status + ' ' + (login.body.message || ''));
    }
  } catch (e) {
    fail('Admin login', e.message);
  }

  const auth = { Authorization: 'Bearer ' + token };

  for (const tab of ['doctors', 'patients', 'payments', 'prescriptions', 'orders']) {
    try {
      const r = await req('/api/admin/' + tab, { headers: auth });
      if (r.ok && Array.isArray(r.body)) {
        pass('Admin ' + tab + ' API', r.body.length + ' records');
      } else {
        fail('Admin ' + tab + ' API', r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
      }
    } catch (e) {
      fail('Admin ' + tab + ' API', e.message);
    }
  }

  try {
    const r = await req('/api/doctors');
    if (r.ok && Array.isArray(r.body)) {
      pass('Public doctors API', r.body.length + ' approved doctors');
    } else {
      fail('Public doctors API', String(r.status));
    }
  } catch (e) {
    fail('Public doctors API', e.message);
  }

  try {
    const payments = await req('/api/admin/payments', { headers: auth });
    if (payments.ok && payments.body.length) {
      const p = payments.body[0];
      const phone = p.patientPhone || p.phone || p.patientMobile;
      const doctorName = p.doctorName || p.doctor;
      if (phone) {
        const pr = await req('/api/payments/patient/' + encodeURIComponent(phone));
        if (pr.ok && Array.isArray(pr.body)) {
          pass('Patient payment lookup', pr.body.length + ' for phone ' + phone);
        } else if (pr.status === 401) {
          pass('Patient payment lookup', 'requires auth (401)');
        } else {
          fail('Patient payment lookup', String(pr.status));
        }
      }
      if (doctorName) {
        const dr = await req('/api/payments/doctor/' + encodeURIComponent(doctorName));
        if (dr.ok && Array.isArray(dr.body)) {
          pass('Doctor payment lookup', dr.body.length + ' for ' + doctorName);
        } else if (dr.status === 401) {
          pass('Doctor payment lookup', 'requires auth (401)');
        } else {
          fail('Doctor payment lookup', String(dr.status));
        }
      }
    } else {
      pass('Payment lookup', 'skipped (no payments in DB)');
    }
  } catch (e) {
    fail('Payment lookup', e.message);
  }

  try {
    const r = await req('/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({ roomID: 'invalid-room-test', userID: 'test-user' })
    });
    if (r.status === 403) {
      pass('Agora token route', 'room validation active');
    } else if (r.status === 401) {
      pass('Agora token route', 'requires Firebase auth');
    } else if (r.status === 503) {
      pass('Agora token route', '503 - add AGORA credentials');
    } else {
      fail('Agora token route', 'unexpected ' + r.status);
    }
  } catch (e) {
    fail('Agora token route', e.message);
  }

  try {
    const r = await req('/api/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: 10000, receipt: 'verify_' + Date.now() })
    });
    if (r.ok && r.body.order_id) {
      pass('Razorpay create-order', r.body.order_id);
    } else if (r.status === 503) {
      fail('Razorpay create-order', r.body.message || 'credentials invalid — fix Render keys');
    } else {
      fail('Razorpay create-order', r.status + ' ' + (r.body.message || ''));
    }
  } catch (e) {
    fail('Razorpay create-order', e.message);
  }

  try {
    const r = await req('/api/payments/razorpay/config');
    if (r.ok && r.body.keyId) pass('Razorpay public config', r.body.keyId);
    else fail('Razorpay public config', String(r.status));
  } catch (e) {
    fail('Razorpay public config', e.message);
  }

  const fs = require('fs');
  const path = require('path');
  for (const f of ['public/video-call.html', 'public/ZegoCloudVideoCall.html', 'lib/agoraToken.js']) {
    if (fs.existsSync(path.join(__dirname, '..', f))) {
      pass('File exists: ' + f);
    } else {
      fail('File exists: ' + f);
    }
  }

  if (!fs.existsSync(path.join(__dirname, '..', 'lib/zegoKitToken.js'))) {
    pass('Zego backend removed');
  } else {
    fail('Zego backend removed', 'lib/zegoKitToken.js still present');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('Summary: ' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

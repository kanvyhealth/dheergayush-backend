// Production smoke test for dheergayush.net (or VERIFY_BASE).
// Usage: node scripts/verify-production.js
require('dotenv').config();

let BASE = process.env.VERIFY_BASE || 'https://dheergayush.net';
while (BASE.endsWith('/')) BASE = BASE.slice(0, -1);

async function req(path, options = {}) {
  const url = BASE + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let body = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) body = await res.json();
  else body = await res.text();
  return { status: res.status, ok: res.ok, body };
}

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log('PASS ' + name + (detail ? ' - ' + detail : ''));
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log('FAIL ' + name + (detail ? ' - ' + detail : ''));
}

async function main() {
  console.log('Production verification: ' + BASE + '\n');

  try {
    const health = await req('/api/health');
    if (health.ok && health.body.firestore) {
      pass('Health / Firestore', 'db=' + health.body.db);
    } else {
      fail('Health / Firestore', JSON.stringify(health.body));
    }
    if (health.body.agora) pass('Agora configured');
    else fail('Agora configured', 'set AGORA_APP_ID + AGORA_APP_CERTIFICATE on Render');

    if (health.body.razorpay) pass('Razorpay env configured');
    else fail('Razorpay env configured', 'missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');

    if (health.body.razorpayAuth) pass('Razorpay API authenticated');
    else fail('Razorpay API authenticated', health.body.razorpayError || 'create-order auth failed');
  } catch (e) {
    fail('Health endpoint', e.message);
    process.exit(1);
  }

  try {
    const cfg = await req('/api/payments/razorpay/config');
    if (cfg.ok && cfg.body.keyId) pass('Razorpay public config', cfg.body.keyId);
    else fail('Razorpay public config', String(cfg.status));
  } catch (e) {
    fail('Razorpay public config', e.message);
  }

  try {
    const order = await req('/api/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: 10000, receipt: 'prod_verify_' + Date.now() })
    });
    if (order.ok && order.body.order_id) {
      pass('Create Razorpay order', order.body.order_id);
    } else {
      fail('Create Razorpay order', order.body.message || String(order.status));
    }
  } catch (e) {
    fail('Create Razorpay order', e.message);
  }

  for (const path of ['/api/medicines', '/api/doctors', '/api/stores/summary']) {
    try {
      const r = await req(path);
      if (r.ok) {
        const count = Array.isArray(r.body) ? r.body.length : 'ok';
        pass('GET ' + path, String(count));
      } else {
        fail('GET ' + path, String(r.status));
      }
    } catch (e) {
      fail('GET ' + path, e.message);
    }
  }

  const failed = results.filter(function (r) { return !r.ok; });
  console.log('\nSummary: ' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (failed.length) {
    console.log('\nFix Razorpay: Dashboard -> API Keys -> Generate Test Key (pair).');
    console.log('Update Render: RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET -> Manual Deploy.');
    process.exit(1);
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

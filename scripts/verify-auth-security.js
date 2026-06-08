/**
 * Smoke tests for auth, rate limits, and protected routes.
 * Usage: VERIFY_BASE=http://localhost:3000 node scripts/verify-auth-security.js
 */
require('dotenv').config();

const BASE = (process.env.VERIFY_BASE || 'http://localhost:3000').replace(/\/+$/, '');

async function req(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });s
  let body = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
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
  console.log('Auth/security checks on ' + BASE);

  try {
    const health = await req('/api/health');
    if (health.ok) pass('Health endpoint', health.body.provider || 'ok');
    else fail('Health endpoint', String(health.status));
  } catch (e) {
    fail('Health endpoint', e.message);
    console.error('Server not reachable. Start with: npm start');
    process.exit(1);
  }

  try {
    const r = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'secret12',
        name: 'Test',
        phone: '9999999999'
      })
    });
    if (r.status === 400 && String(r.body.message || '').toLowerCase().includes('required')) {
      pass('Register validates required fields');
    } else if (r.status === 201 || r.status === 400) {
      pass('Register endpoint reachable', String(r.status));
    } else {
      fail('Register endpoint', JSON.stringify(r.body).slice(0, 120));
    }
  } catch (e) {
    fail('Register endpoint', e.message);
  }

  try {
    const r = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (r.status === 400) pass('Login requires email and password');
    else fail('Login requires email and password', r.status + '');
  } catch (e) {
    fail('Login requires email and password', e.message);
  }

  try {
    const r = await req('/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({ channelName: 'test', uid: 1 })
    });
    if (r.status === 401) pass('Agora token requires Firebase auth');
    else fail('Agora token requires Firebase auth', r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
  } catch (e) {
    fail('Agora token requires Firebase auth', e.message);
  }

  try {
    const r = await req('/api/account/deletion-request', {
      method: 'POST',
      body: JSON.stringify({ reason: 'test' })
    });
    if (r.status === 401) pass('Account deletion requires Firebase auth');
    else fail('Account deletion requires Firebase auth', r.status + '');
  } catch (e) {
    fail('Account deletion requires Firebase auth', e.message);
  }

  try {
    const r = await req('/api/payment', { method: 'POST', body: '{}' });
    if (r.status === 401) pass('Payment POST requires Firebase auth');
    else fail('Payment POST requires Firebase auth', r.status + '');
  } catch (e) {
    fail('Payment POST requires Firebase auth', e.message);
  }

  try {
    const r = await req('/api/doctors/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ doctorName: 'Test Doctor' })
    });
    if (r.status === 404 || r.status === 200) {
      pass('Doctor heartbeat does not require Bearer token', String(r.status));
    } else if (r.status === 401) {
      fail('Doctor heartbeat should be public (exempt)', '401');
    } else {
      pass('Doctor heartbeat reachable without auth', String(r.status));
    }
  } catch (e) {
    fail('Doctor heartbeat', e.message);
  }

  try {
    const r = await req('/api/register-doctor', { method: 'POST', body: '{}' });
    if (r.status === 400 || r.status === 401) {
      pass('Register-doctor guarded (multipart)', String(r.status));
    } else {
      fail('Register-doctor guarded', r.status + '');
    }
  } catch (e) {
    fail('Register-doctor guarded', e.message);
  }

  try {
    const r = await req('/api/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: 10000, receipt: 'sec_test_' + Date.now() })
    });
    if (r.ok && r.body.order_id) pass('Create-order is public (guest checkout)', r.body.order_id);
    else if (r.status === 401) fail('Create-order should not require auth', '401');
    else pass('Create-order reachable without Bearer token', String(r.status));
  } catch (e) {
    fail('Create-order public access', e.message);
  }

  const failed = results.filter((x) => !x.ok);
  console.log('\n' + results.length + ' checks, ' + failed.length + ' failed');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

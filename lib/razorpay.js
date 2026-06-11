/**
 * Razorpay server helpers (orders, signature verify, payment fetch).
 */
const crypto = require('crypto');

function normalizeEnv(value) {
  return String(value || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

function getRazorpayConfig() {
  const keyId = normalizeEnv(process.env.RAZORPAY_KEY_ID);
  const keySecret = normalizeEnv(process.env.RAZORPAY_KEY_SECRET);
  if (!keyId || !keySecret) {
    const err = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    err.status = 503;
    throw err;
  }
  return { keyId, keySecret };
}

function getPublicKeyId() {
  return normalizeEnv(process.env.RAZORPAY_KEY_ID);
}

function isRazorpayConfigured() {
  const { keyId, keySecret } = { keyId: normalizeEnv(process.env.RAZORPAY_KEY_ID), keySecret: normalizeEnv(process.env.RAZORPAY_KEY_SECRET) };
  return !!(keyId && keySecret);
}

function authHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${token}`;
}

function mapRazorpayApiError(data, fallback) {
  const code = data?.error?.code || '';
  const desc = data?.error?.description || data?.error?.reason || fallback;
  if (code === 'BAD_REQUEST_ERROR' && /authentication failed/i.test(desc)) {
    return 'Razorpay API authentication failed. Key ID and Secret must be a matching pair from the same Razorpay dashboard (Test or Live). Regenerate both at https://dashboard.razorpay.com/app/keys and update Render env vars.';
  }
  return desc;
}

function verifySignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createOrder({ amountInPaise, currency = 'INR', receipt, notes = {} }) {
  const { keyId, keySecret } = getRazorpayConfig();
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: authHeader(keyId, keySecret),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency,
      receipt: String(receipt || `rcpt_${Date.now()}`).slice(0, 40),
      payment_capture: 1,
      notes
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = mapRazorpayApiError(data, 'Unable to create Razorpay order');
    throw Object.assign(new Error(msg), { status: res.status === 401 ? 503 : res.status });
  }
  return { keyId, orderId: data.id, amount: data.amount, currency: data.currency, receipt: data.receipt };
}

async function fetchPayment(paymentId) {
  const { keyId, keySecret } = getRazorpayConfig();
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: authHeader(keyId, keySecret) }
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.description || 'Payment fetch failed'), { status: res.status });
  }
  return data;
}

async function capturePayment(paymentId, amountInPaise) {
  const { keyId, keySecret } = getRazorpayConfig();
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(keyId, keySecret),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amount: amountInPaise, currency: 'INR' })
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.description || 'Capture failed'), { status: res.status });
  }
  return data;
}

async function createRefund(paymentId, amountInPaise, notes = {}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const body = { notes: notes || {} };
  if (amountInPaise != null && amountInPaise > 0) {
    body.amount = amountInPaise;
  }
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(keyId, keySecret),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = mapRazorpayApiError(data, 'Refund failed');
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

async function verifyAndFetchPayment({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayConfig();
  if (!verifySignature({ orderId, paymentId, signature, keySecret })) {
    throw Object.assign(new Error('Razorpay signature verification failed'), { status: 403 });
  }
  let payment = await fetchPayment(paymentId);
  if (payment.order_id !== orderId) {
    throw Object.assign(new Error('Payment does not match order'), { status: 403 });
  }
  if (payment.status === 'authorized') {
    payment = await capturePayment(paymentId, payment.amount);
  }
  if (payment.status !== 'captured' && payment.status !== 'paid') {
    throw Object.assign(new Error('Payment is not completed'), { status: 402 });
  }
  return payment;
}

/** Standard Checkout — verify signature only (HMAC SHA256) */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayConfig();
  const ok = verifySignature({ orderId, paymentId, signature, keySecret });
  if (!ok) {
    throw Object.assign(new Error('Razorpay signature verification failed'), { status: 400 });
  }
  return { verified: true, orderId, paymentId };
}

/** Verify Key ID + Secret against Razorpay API (creates a ₹1 test order). */
async function verifyCredentials() {
  if (!isRazorpayConfigured()) {
    return { ok: false, configured: false, error: 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set' };
  }
  try {
    const order = await createOrder({
      amountInPaise: 100,
      receipt: 'verify_' + Date.now()
    });
    return { ok: true, configured: true, keyId: order.keyId, orderId: order.orderId };
  } catch (err) {
    return { ok: false, configured: true, keyId: getPublicKeyId(), error: err.message };
  }
}

module.exports = {
  getRazorpayConfig,
  getPublicKeyId,
  isRazorpayConfigured,
  verifyCredentials,
  verifySignature,
  verifyPaymentSignature,
  createOrder,
  fetchPayment,
  capturePayment,
  createRefund,
  verifyAndFetchPayment
};

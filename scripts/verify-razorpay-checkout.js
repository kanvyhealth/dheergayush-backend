/**
 * Smoke test: Razorpay create-order + signature verify (no real payment).
 * Usage: node scripts/verify-razorpay-checkout.js
 */
require('dotenv').config();
const { createOrder, verifyPaymentSignature, verifySignature, getRazorpayConfig } = require('../lib/razorpay');
const crypto = require('crypto');

async function main() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    process.exit(1);
  }

  const order = await createOrder({
    amountInPaise: 100,
    receipt: 'test_' + Date.now()
  });
  console.log('PASS create-order', order.orderId, order.amount);

  const { keySecret } = getRazorpayConfig();
  const fakePaymentId = 'pay_test123';
  const sig = crypto.createHmac('sha256', keySecret).update(`${order.orderId}|${fakePaymentId}`).digest('hex');

  const bad = verifySignature({
    orderId: order.orderId,
    paymentId: fakePaymentId,
    signature: 'bad',
    keySecret
  });
  if (bad) {
    console.error('FAIL bad signature should not verify');
    process.exit(1);
  }
  console.log('PASS rejects invalid signature');

  verifyPaymentSignature({
    orderId: order.orderId,
    paymentId: fakePaymentId,
    signature: sig
  });
  console.log('PASS HMAC verify matches test vector');
  console.log('Razorpay checkout API ready. Complete a real payment via payment.html to test end-to-end.');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});

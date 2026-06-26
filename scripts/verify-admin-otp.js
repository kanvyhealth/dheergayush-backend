const assert = require('assert');

process.env.NODE_ENV = 'development';
process.env.ADMIN_OTP_RESEND_MS = '0';
process.env.ADMIN_OTP_TTL_MS = '300000';
process.env.ADMIN_OTP_EMAIL = 'kanvyhealthcare@gmail.com';
process.env.ADMIN_OTP_PHONE = '7842736777';

const {
  createAdminOtpChallenge,
  verifyAdminOtp,
  regenerateAdminOtp,
  sendAdminOtp,
  maskEmail,
  maskPhone
} = require('../lib/adminOtp');

(async () => {
  assert.strictEqual(maskEmail('kanvyhealthcare@gmail.com'), 'ka***@gmail.com');
  assert.strictEqual(maskPhone('7842736777'), '******6777');

  const challenge = createAdminOtpChallenge({ ip: '127.0.0.1', ua: 'test' });
  assert(challenge.challengeId, 'challenge id is required');
  assert(/^\d{6}$/.test(challenge.otp), 'otp must be six digits');

  const delivery = await sendAdminOtp(challenge.otp);
  assert.strictEqual(delivery.ok, true, 'dev delivery fallback should pass');

  const wrong = verifyAdminOtp(challenge.challengeId, '000000');
  assert.strictEqual(wrong.ok, false, 'wrong otp must fail');

  const resent = regenerateAdminOtp(challenge.challengeId);
  assert.strictEqual(resent.ok, true, 'resend should create a new otp');
  assert(/^\d{6}$/.test(resent.otp), 'resent otp must be six digits');

  const verified = verifyAdminOtp(challenge.challengeId, resent.otp);
  assert.strictEqual(verified.ok, true, 'correct resent otp must pass');

  const reused = verifyAdminOtp(challenge.challengeId, resent.otp);
  assert.strictEqual(reused.ok, false, 'used challenge must not be reusable');

  console.log('Admin OTP checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

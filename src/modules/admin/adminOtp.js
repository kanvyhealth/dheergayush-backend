const crypto = require('crypto');

const OTP_TTL_MS = Number(process.env.ADMIN_OTP_TTL_MS || 5 * 60 * 1000);
const RESEND_MS = Number(process.env.ADMIN_OTP_RESEND_MS || 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.ADMIN_OTP_MAX_ATTEMPTS || 5);

const ADMIN_OTP_EMAIL =
  process.env.ADMIN_OTP_EMAIL ||
  process.env.ADMIN_REGISTERED_EMAIL ||
  process.env.ADMIN_EMAIL ||
  'kanvyhealthcare@gmail.com';
const ADMIN_OTP_PHONE =
  process.env.ADMIN_OTP_PHONE ||
  process.env.ADMIN_REGISTERED_PHONE ||
  process.env.ADMIN_PHONE ||
  '7842736777';

/** @type {Map<string, {hash:string, otp:string, expiresAt:number, resendAt:number, attempts:number, ip:string, ua:string}>} */
const challenges = new Map();

function now() {
  return Date.now();
}

function pruneExpired() {
  const t = now();
  for (const [id, row] of challenges.entries()) {
    if (row.expiresAt <= t) challenges.delete(id);
  }
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `******${digits.slice(-4)}`;
}

function createAdminOtpChallenge({ ip = '', ua = '' } = {}) {
  pruneExpired();
  const id = crypto.randomBytes(20).toString('hex');
  const otp = generateOtp();
  const t = now();
  challenges.set(id, {
    hash: hashOtp(otp),
    otp,
    expiresAt: t + OTP_TTL_MS,
    resendAt: t + RESEND_MS,
    attempts: 0,
    ip,
    ua
  });
  return publicChallenge(id, otp);
}

function publicChallenge(id, otp = '') {
  const row = challenges.get(id);
  if (!row) return null;
  return {
    challengeId: id,
    otp,
    expiresAt: row.expiresAt,
    resendAt: row.resendAt,
    expiresIn: Math.max(0, Math.ceil((row.expiresAt - now()) / 1000)),
    resendIn: Math.max(0, Math.ceil((row.resendAt - now()) / 1000)),
    email: ADMIN_OTP_EMAIL,
    phone: ADMIN_OTP_PHONE,
    maskedEmail: maskEmail(ADMIN_OTP_EMAIL),
    maskedPhone: maskPhone(ADMIN_OTP_PHONE)
  };
}

function verifyAdminOtp(challengeId, otp) {
  pruneExpired();
  const id = String(challengeId || '').trim();
  const row = challenges.get(id);
  if (!row) return { ok: false, status: 400, message: 'OTP expired. Please login again.' };
  if (row.expiresAt <= now()) {
    challenges.delete(id);
    return { ok: false, status: 400, message: 'OTP expired. Please login again.' };
  }
  row.attempts += 1;
  if (row.attempts > MAX_ATTEMPTS) {
    challenges.delete(id);
    return { ok: false, status: 429, message: 'Too many incorrect attempts. Please login again.' };
  }
  if (hashOtp(String(otp || '').trim()) !== row.hash) {
    return { ok: false, status: 401, message: 'Invalid OTP.' };
  }
  challenges.delete(id);
  return { ok: true };
}

function regenerateAdminOtp(challengeId) {
  pruneExpired();
  const id = String(challengeId || '').trim();
  const row = challenges.get(id);
  if (!row) return { ok: false, status: 400, message: 'OTP expired. Please login again.' };
  const t = now();
  if (row.expiresAt <= t) {
    challenges.delete(id);
    return { ok: false, status: 400, message: 'OTP expired. Please login again.' };
  }
  if (row.resendAt > t) {
    return {
      ok: false,
      status: 429,
      message: 'Please wait before requesting another OTP.',
      resendIn: Math.ceil((row.resendAt - t) / 1000)
    };
  }
  const otp = generateOtp();
  row.hash = hashOtp(otp);
  row.otp = otp;
  row.resendAt = t + RESEND_MS;
  row.attempts = 0;
  return { ok: true, ...publicChallenge(id, otp) };
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 240) || `HTTP ${res.status}`);
  }
  return text;
}

async function sendAdminOtpEmail(otp) {
  const to = ADMIN_OTP_EMAIL;
  if (!to) return { ok: false, provider: 'none', error: 'Admin registered email is not configured.' };
  const subject = 'DHEERGAYUSH admin login OTP';
  const text = `Your DHEERGAYUSH admin login OTP is ${otp}. It expires in ${Math.ceil(OTP_TTL_MS / 60000)} minutes.`;

  if (process.env.RESEND_API_KEY) {
    await postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      {
        from: process.env.ADMIN_OTP_FROM_EMAIL || 'DHEERGAYUSH <onboarding@resend.dev>',
        to: [to],
        subject,
        text
      }
    );
    return { ok: true, provider: 'resend' };
  }

  if (process.env.SENDGRID_API_KEY) {
    await postJson(
      'https://api.sendgrid.com/v3/mail/send',
      { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.ADMIN_OTP_FROM_EMAIL || 'contact@dheergayush.net' },
        subject,
        content: [{ type: 'text/plain', value: text }]
      }
    );
    return { ok: true, provider: 'sendgrid' };
  }

  if (process.env.BREVO_API_KEY) {
    await postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': process.env.BREVO_API_KEY },
      {
        sender: {
          name: 'DHEERGAYUSH',
          email: process.env.ADMIN_OTP_FROM_EMAIL || 'contact@dheergayush.net'
        },
        to: [{ email: to }],
        subject,
        textContent: text
      }
    );
    return { ok: true, provider: 'brevo' };
  }

  if (process.env.ADMIN_OTP_EMAIL_WEBHOOK_URL) {
    await postJson(process.env.ADMIN_OTP_EMAIL_WEBHOOK_URL, {}, { to, subject, text, otp });
    return { ok: true, provider: 'email-webhook' };
  }

  // Console fallback when providers missing (unless ADMIN_REQUIRE_OTP_PROVIDERS=true)
  if (String(process.env.ADMIN_REQUIRE_OTP_PROVIDERS || '').toLowerCase() !== 'true') {
    console.warn(`Admin OTP email fallback for ${to}: ${otp}`);
    return { ok: true, provider: 'console-dev' };
  }

  return { ok: false, provider: 'none', error: 'Email OTP provider is not configured.' };
}

async function sendAdminOtpSms(otp) {
  if (!ADMIN_OTP_PHONE) return { ok: false, provider: 'none', error: 'Admin registered phone is not configured.' };
  const digits = ADMIN_OTP_PHONE.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return { ok: false, provider: 'none', error: 'Admin registered phone must be a 10-digit mobile number.' };
  const e164 = `91${digits}`;
  const message = `Your DHEERGAYUSH admin login OTP is ${otp}. It expires in ${Math.ceil(OTP_TTL_MS / 60000)} minutes.`;

  if (process.env.FAST2SMS_API_KEY) {
    const body = new URLSearchParams({
      route: 'otp',
      variables_values: otp,
      numbers: digits
    }).toString();
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 240) || `HTTP ${res.status}`);
    return { ok: true, provider: 'fast2sms' };
  }

  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID) {
    const url =
      `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(process.env.MSG91_OTP_TEMPLATE_ID)}` +
      `&mobile=${encodeURIComponent(e164)}&otp=${encodeURIComponent(otp)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { authkey: process.env.MSG91_AUTH_KEY }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 240) || `HTTP ${res.status}`);
    return { ok: true, provider: 'msg91' };
  }

  if (process.env.ADMIN_OTP_SMS_WEBHOOK_URL) {
    await postJson(process.env.ADMIN_OTP_SMS_WEBHOOK_URL, {}, { to: digits, phone: digits, message, otp });
    return { ok: true, provider: 'sms-webhook' };
  }

  if (String(process.env.ADMIN_REQUIRE_OTP_PROVIDERS || '').toLowerCase() !== 'true') {
    console.warn(`Admin OTP SMS fallback for ${digits}: ${otp}`);
    return { ok: true, provider: 'console-dev' };
  }

  return { ok: false, provider: 'none', error: 'SMS OTP provider is not configured.' };
}

function isConsoleDevProvider(result) {
  return result && result.ok && result.provider === 'console-dev';
}

async function sendAdminOtp(otp) {
  const [email, sms] = await Promise.allSettled([
    sendAdminOtpEmail(otp),
    sendAdminOtpSms(otp)
  ]);
  const emailResult = email.status === 'fulfilled' ? email.value : { ok: false, error: email.reason?.message };
  const smsResult = sms.status === 'fulfilled' ? sms.value : { ok: false, error: sms.reason?.message };
  const requireBoth = String(process.env.ADMIN_REQUIRE_OTP_PROVIDERS || '').toLowerCase() === 'true';
  const ok = requireBoth
    ? !!(emailResult.ok && smsResult.ok)
    : !!(emailResult.ok || smsResult.ok);
  return {
    ok,
    email: emailResult,
    sms: smsResult,
    consoleDev: isConsoleDevProvider(emailResult) || isConsoleDevProvider(smsResult)
  };
}

function dropAdminOtpChallenge(challengeId) {
  challenges.delete(String(challengeId || '').trim());
}

module.exports = {
  createAdminOtpChallenge,
  verifyAdminOtp,
  regenerateAdminOtp,
  sendAdminOtp,
  dropAdminOtpChallenge,
  maskEmail,
  maskPhone
};

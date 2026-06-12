/**
 * Read/write doctor payout fields using existing Firestore keys (no schema migration).
 * Supports common aliases used by the mobile app and website.
 */

const FIELD_ALIASES = {
  upiId: ['upiId', 'upi_id', 'upi', 'UPI', 'upiID', 'upiID'],
  bankName: ['bankName', 'bank_name', 'bank'],
  accountNumber: ['accountNumber', 'account_number', 'bankAccountNumber', 'bank_account_number'],
  ifsc: ['ifscCode', 'ifsc', 'ifsc_code', 'IFSC'],
  accountHolderName: ['accountHolderName', 'account_holder_name', 'accountName', 'account_name', 'holderName'],
  paymentMethod: ['paymentMethod', 'payment_method', 'payoutMethod', 'payout_method', 'payoutType']
};

function doctorData(doctor) {
  if (!doctor) return {};
  return doctor.toObject ? doctor.toObject() : { ...doctor };
}

function pickExistingKey(doctor, canonical) {
  const aliases = FIELD_ALIASES[canonical] || [];
  const data = doctorData(doctor);
  for (const key of aliases) {
    if (data[key] !== undefined && data[key] !== null) return key;
  }
  return aliases[0] || canonical;
}

function readField(data, canonical) {
  const aliases = FIELD_ALIASES[canonical] || [canonical];
  for (const key of aliases) {
    const val = data[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function inferPaymentMode(details) {
  const pm = String(details.paymentMethod || '').toLowerCase();
  if (pm.includes('bank')) return 'bank';
  if (pm.includes('upi')) return 'upi';
  if (details.upiId) return 'upi';
  if (details.accountNumber && details.ifsc) return 'bank';
  return '';
}

function extractDoctorPaymentDetails(doctor) {
  const data = doctorData(doctor);
  const details = {
    upiId: readField(data, 'upiId'),
    bankName: readField(data, 'bankName'),
    accountNumber: readField(data, 'accountNumber'),
    ifsc: readField(data, 'ifsc'),
    accountHolderName: readField(data, 'accountHolderName'),
    paymentMethod: readField(data, 'paymentMethod')
  };
  details.paymentMode = inferPaymentMode(details);
  return details;
}

function normalizePaymentInput(body = {}) {
  const b = body || {};
  return {
    paymentMode: String(b.paymentMode || b.payoutMethod || b.payoutType || '').trim().toLowerCase(),
    upiId: String(b.upiId || b.upi_id || b.upi || '').trim(),
    accountHolderName: String(b.accountHolderName || b.account_holder_name || b.accountName || '').trim(),
    bankName: String(b.bankName || b.bank_name || b.bank || '').trim(),
    accountNumber: String(b.accountNumber || b.account_number || b.bankAccountNumber || '').trim(),
    ifsc: String(b.ifsc || b.ifscCode || b.ifsc_code || '').trim().toUpperCase()
  };
}

function isValidUpiId(upi) {
  const v = String(upi || '').trim();
  if (!v) return false;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{2,}$/.test(v);
}

function validatePaymentDetailsInput(input) {
  const data = normalizePaymentInput(input);
  const mode =
    data.paymentMode === 'bank' || data.paymentMode === 'upi'
      ? data.paymentMode
      : data.upiId
        ? 'upi'
        : data.accountNumber
          ? 'bank'
          : '';

  if (mode === 'upi') {
    if (!isValidUpiId(data.upiId)) {
      return { ok: false, error: 'Valid UPI ID is required (e.g. yourname@bank).' };
    }
    return { ok: true, mode: 'upi', data };
  }

  if (mode === 'bank') {
    const missing = [];
    if (!data.accountHolderName) missing.push('account holder name');
    if (!data.bankName) missing.push('bank name');
    if (!data.accountNumber) missing.push('account number');
    if (!data.ifsc) missing.push('IFSC code');
    if (missing.length) {
      return { ok: false, error: `Complete bank details: ${missing.join(', ')}.` };
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc)) {
      return { ok: false, error: 'IFSC code format looks invalid (e.g. SBIN0001234).' };
    }
    return { ok: true, mode: 'bank', data };
  }

  return { ok: false, error: 'Provide UPI ID or complete bank account details for consultation payouts.' };
}

function buildPaymentDetailsPatch(input, existingDoctor) {
  const check = validatePaymentDetailsInput(input);
  if (!check.ok) return { ok: false, error: check.error };

  const data = check.data;
  const patch = {};

  if (check.mode === 'upi') {
    patch[pickExistingKey(existingDoctor, 'upiId')] = data.upiId;
    patch[pickExistingKey(existingDoctor, 'paymentMethod')] = 'UPI';
  } else {
    patch[pickExistingKey(existingDoctor, 'accountHolderName')] = data.accountHolderName;
    patch[pickExistingKey(existingDoctor, 'bankName')] = data.bankName;
    patch[pickExistingKey(existingDoctor, 'accountNumber')] = data.accountNumber;
    patch[pickExistingKey(existingDoctor, 'ifsc')] = data.ifsc;
    patch[pickExistingKey(existingDoctor, 'paymentMethod')] = 'Bank';
  }

  return { ok: true, patch };
}

const PROTECTED_SELF_SERVICE_KEYS = new Set([
  'Regstatus',
  'approvalStatus',
  'status',
  'working',
  'presenceStatus',
  'uid',
  'role',
  'videoRoomId',
  'zegoRoomId',
  '_id',
  'id',
  'email',
  'password',
  'verificationLocked',
  'isApproved',
  'bookable',
  'effectiveStatus',
  'scheduleStatus',
  'dbStatus',
  'websiteDoctorDocId',
  'toObject',
  'save'
]);

function parseConsultationFeeInput(body = {}) {
  const raw = body.consultationFee ?? body.fee ?? body.consultation_fee;
  if (raw == null || raw === '') return { ok: true, skipped: true };
  const feeNum = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  if (Number.isNaN(feeNum) || feeNum < 0) {
    return { ok: false, error: 'Enter a valid consultation fee (₹0 or more).' };
  }
  if (feeNum > 500000) {
    return { ok: false, error: 'Consultation fee is too high. Contact support if you need a higher limit.' };
  }
  return { ok: true, fee: feeNum };
}

function applyConsultationFeePatch(profile, body = {}) {
  const parsed = parseConsultationFeeInput(body);
  if (!parsed.ok) return parsed;
  if (parsed.skipped) {
    delete profile.consultationFee;
    delete profile.consultation_fee;
    return { ok: true };
  }
  profile.fee = parsed.fee;
  profile.consultationFee = parsed.fee;
  delete profile.consultation_fee;
  return { ok: true };
}

function parseDoctorSelfServiceProfile(body = {}) {
  const profile = { ...body };
  for (const key of PROTECTED_SELF_SERVICE_KEYS) {
    delete profile[key];
  }
  delete profile.paymentMode;
  delete profile.payoutMethod;
  delete profile.payoutType;
  delete profile.upi_id;
  delete profile.upi;
  delete profile.ifscCode;
  delete profile.ifsc_code;
  delete profile.bank_account_number;
  delete profile.bankAccountNumber;
  delete profile.account_name;
  delete profile.account_holder_name;
  delete profile.bank_name;

  if (profile.languages != null && !Array.isArray(profile.languages)) {
    profile.languages = String(profile.languages)
      .split(/[,|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  applyConsultationFeePatch(profile, body);
  if (profile.experience != null) {
    const expNum = parseInt(profile.experience, 10);
    if (!Number.isNaN(expNum)) profile.experience = expNum;
  }

  if (profile.bio != null) {
    profile.about = String(profile.bio).trim();
  }

  return profile;
}

function mergePaymentBodyWithExisting(body, doctor) {
  const existing = extractDoctorPaymentDetails(doctor);
  const input = normalizePaymentInput(body);
  return {
    paymentMode: input.paymentMode || existing.paymentMode,
    upiId: input.upiId || existing.upiId,
    accountHolderName: input.accountHolderName || existing.accountHolderName,
    bankName: input.bankName || existing.bankName,
    accountNumber: input.accountNumber || existing.accountNumber,
    ifsc: input.ifsc || existing.ifsc
  };
}

module.exports = {
  FIELD_ALIASES,
  extractDoctorPaymentDetails,
  normalizePaymentInput,
  validatePaymentDetailsInput,
  buildPaymentDetailsPatch,
  mergePaymentBodyWithExisting,
  parseConsultationFeeInput,
  applyConsultationFeePatch,
  parseDoctorSelfServiceProfile,
  isValidUpiId
};

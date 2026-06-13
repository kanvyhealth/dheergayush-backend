/**
 * 15-day consultation access: pay once → up to 3 free follow-up video calls with same doctor.
 */
const { ConsultationAccess } = require('./data');
const { findDoctorByName } = require('./doctorPresence');
const { normalizePhone } = require('./userQueries');

const CONSULTATION_ACCESS_MS = 15 * 24 * 60 * 60 * 1000;
const FREE_FOLLOWUP_LIMIT = 3;

function accessDocId(doc) {
  return doc?._id || doc?.id || null;
}

function buildAccessKey(patientUid, patientPhone, doctorName) {
  const phone = normalizePhone(patientPhone);
  const doctor = String(doctorName || '').trim().toLowerCase();
  const patient = String(patientUid || phone || '').trim();
  return `${patient}::${doctor}`;
}

function freeConsultationsUsed(record) {
  return Math.max(0, parseInt(record?.freeConsultationsUsed, 10) || 0);
}

function freeConsultationsLimit(record) {
  const limit = parseInt(record?.freeConsultationsLimit, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : FREE_FOLLOWUP_LIMIT;
}

function freeConsultationsRemaining(record) {
  if (!record) return 0;
  return Math.max(0, freeConsultationsLimit(record) - freeConsultationsUsed(record));
}

function canUseFreeFollowUp(record) {
  return isAccessActive(record) && freeConsultationsRemaining(record) > 0;
}

function enrichAccessFields(record) {
  if (!record) return null;
  const remaining = freeConsultationsRemaining(record);
  const limit = freeConsultationsLimit(record);
  const used = freeConsultationsUsed(record);
  return {
    ...record,
    daysRemaining: daysRemaining(record),
    freeConsultationsLimit: limit,
    freeConsultationsUsed: used,
    freeConsultationsRemaining: remaining,
    freeFollowUpAvailable: isAccessActive(record) && remaining > 0
  };
}

async function findAccessRecord(patientUid, patientPhone, doctorName) {
  const doctor = await findDoctorByName(doctorName);
  const doctorId = doctor ? String(doctor.uid || doctor._id || doctor.id || '') : '';
  const phone = normalizePhone(patientPhone);
  const uid = String(patientUid || '').trim();

  const candidates = await ConsultationAccess.find({}).sort({ expiresAt: -1 });
  const match = candidates.find((row) => {
    const r = row.toObject ? row.toObject() : row;
    const sameDoctor =
      String(r.doctorName || '').trim() === String(doctorName || '').trim() ||
      (doctorId && String(r.doctorId || '') === doctorId);
    if (!sameDoctor) return false;
    if (uid && String(r.patientId || r.patientUid || '') === uid) return true;
    if (phone && normalizePhone(r.patientPhone) === phone) return true;
    return false;
  });
  return match ? (match.toObject ? match.toObject() : match) : null;
}

function isAccessActive(record) {
  if (!record) return false;
  const exp = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
  if (Number.isNaN(exp.getTime())) return false;
  return Date.now() <= exp.getTime();
}

function daysRemaining(record) {
  if (!record || !record.expiresAt) return 0;
  const exp = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
  const ms = exp.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

async function findActiveAccess({ patientUid, patientPhone, doctorName }) {
  const record = await findAccessRecord(patientUid, patientPhone, doctorName);
  if (!isAccessActive(record)) return null;
  return enrichAccessFields({
    ...record,
    expiresAt: record.expiresAt
  });
}

async function grantConsultationAccess({
  patientUid,
  patientPhone,
  patientName,
  doctorName,
  sourcePaymentId,
  amount
}) {
  const doctor = await findDoctorByName(doctorName);
  const doctorId = doctor ? String(doctor.uid || doctor._id || doctor.id || '') : '';
  const now = new Date();
  const newExpiry = new Date(now.getTime() + CONSULTATION_ACCESS_MS);
  const existing = await findAccessRecord(patientUid, patientPhone, doctorName);

  if (existing && isAccessActive(existing)) {
    const currentExpiry = new Date(existing.expiresAt);
    const expiresAt = newExpiry > currentExpiry ? newExpiry : currentExpiry;
    const id = accessDocId(existing);
    await ConsultationAccess.findByIdAndUpdate(id, {
      expiresAt,
      lastPaymentId: sourcePaymentId,
      lastPaidAmount: amount,
      freeConsultationsLimit: FREE_FOLLOWUP_LIMIT,
      freeConsultationsUsed: 0,
      updatedAt: now
    });
    return enrichAccessFields({ ...existing, expiresAt });
  }

  const created = await ConsultationAccess.create({
    accessKey: buildAccessKey(patientUid, patientPhone, doctorName),
    patientId: patientUid || '',
    patientUid: patientUid || '',
    patientPhone: normalizePhone(patientPhone) || patientPhone,
    patientName: patientName || '',
    doctorId,
    doctorName,
    sourcePaymentId,
    lastPaymentId: sourcePaymentId,
    lastPaidAmount: amount,
    freeConsultationsLimit: FREE_FOLLOWUP_LIMIT,
    freeConsultationsUsed: 0,
    paidAt: now,
    expiresAt: newExpiry,
    createdAt: now,
    updatedAt: now
  });
  const doc = created.toObject ? created.toObject() : created;
  return enrichAccessFields(doc);
}

async function consumeFreeFollowUpConsultation({ patientUid, patientPhone, doctorName }) {
  const record = await findAccessRecord(patientUid, patientPhone, doctorName);
  if (!record || !canUseFreeFollowUp(record)) {
    return {
      ok: false,
      error: `You have used all ${FREE_FOLLOWUP_LIMIT} free follow-up consultations for this 15-day plan. Please pay for a new consultation.`
    };
  }
  const id = accessDocId(record);
  const used = freeConsultationsUsed(record) + 1;
  const now = new Date();
  await ConsultationAccess.findByIdAndUpdate(id, {
    freeConsultationsUsed: used,
    updatedAt: now
  });
  return {
    ok: true,
    freeConsultationsUsed: used,
    freeConsultationsRemaining: Math.max(0, freeConsultationsLimit(record) - used)
  };
}

async function listAccessForPatient(patientUid, patientPhone) {
  const phone = normalizePhone(patientPhone);
  const uid = String(patientUid || '').trim();
  const all = await ConsultationAccess.find({}).sort({ expiresAt: -1 });
  return all
    .map((row) => (row.toObject ? row.toObject() : row))
    .filter((row) => {
      if (uid && String(row.patientId || row.patientUid || '') === uid) return true;
      if (phone && normalizePhone(row.patientPhone) === phone) return true;
      return false;
    })
    .map((row) => {
      const enriched = enrichAccessFields(row);
      return {
        doctorName: row.doctorName,
        doctorId: row.doctorId,
        expiresAt: row.expiresAt,
        daysRemaining: enriched.daysRemaining,
        active: isAccessActive(row),
        paidAt: row.paidAt,
        lastPaidAmount: row.lastPaidAmount,
        freeConsultationsLimit: enriched.freeConsultationsLimit,
        freeConsultationsUsed: enriched.freeConsultationsUsed,
        freeConsultationsRemaining: enriched.freeConsultationsRemaining,
        freeFollowUpAvailable: enriched.freeFollowUpAvailable
      };
    });
}

module.exports = {
  CONSULTATION_ACCESS_MS,
  FREE_FOLLOWUP_LIMIT,
  findActiveAccess,
  grantConsultationAccess,
  consumeFreeFollowUpConsultation,
  listAccessForPatient,
  isAccessActive,
  daysRemaining,
  freeConsultationsRemaining,
  freeConsultationsLimit,
  freeConsultationsUsed,
  canUseFreeFollowUp,
  enrichAccessFields
};

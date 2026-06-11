/**
 * 15-day consultation access: pay once → free follow-up video calls with same doctor.
 */
const { ConsultationAccess } = require('./data');
const { findDoctorByName } = require('./doctorPresence');
const { normalizePhone } = require('./userQueries');

const CONSULTATION_ACCESS_MS = 15 * 24 * 60 * 60 * 1000;

function accessDocId(doc) {
  return doc?._id || doc?.id || null;
}

function buildAccessKey(patientUid, patientPhone, doctorName) {
  const phone = normalizePhone(patientPhone);
  const doctor = String(doctorName || '').trim().toLowerCase();
  const patient = String(patientUid || phone || '').trim();
  return `${patient}::${doctor}`;
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
  return {
    ...record,
    daysRemaining: daysRemaining(record),
    expiresAt: record.expiresAt
  };
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
      updatedAt: now
    });
    return { ...existing, expiresAt, daysRemaining: daysRemaining({ expiresAt }) };
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
    paidAt: now,
    expiresAt: newExpiry,
    createdAt: now,
    updatedAt: now
  });
  const doc = created.toObject ? created.toObject() : created;
  return { ...doc, daysRemaining: daysRemaining(doc) };
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
    .map((row) => ({
      doctorName: row.doctorName,
      doctorId: row.doctorId,
      expiresAt: row.expiresAt,
      daysRemaining: daysRemaining(row),
      active: isAccessActive(row),
      paidAt: row.paidAt,
      lastPaidAmount: row.lastPaidAmount
    }));
}

module.exports = {
  CONSULTATION_ACCESS_MS,
  findActiveAccess,
  grantConsultationAccess,
  listAccessForPatient,
  isAccessActive,
  daysRemaining
};

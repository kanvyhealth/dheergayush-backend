/**
 * Clears stuck accepted/in_call consultations and stale doctor Busy presence.
 */
const { ConsultationRequest, Payment } = require('./data');
const { normalizeConsultationStatus, buildConsultationStatusFields } = require('./consultationWorkflow');
const { findDoctorByName, updateDoctorPresence } = require('./doctorPresence');
const { buildStatusPayload, emitDoctorStatus } = require('./realtime');

const STALE_ACTIVE_MS = 45 * 60 * 1000;
const VIDEO_CALL_INACTIVITY_MS = 60 * 1000;
const ACTIVE_STATUSES = ['accepted', 'in_call'];

function consultationTimestamp(consultation, status) {
  if (!consultation) return 0;
  const normalized = status || normalizeConsultationStatus(consultation, null);
  const raw =
    (normalized === 'in_call' ? consultation.lastCallActivityAt : null) ||
    consultation.callDisconnectedAt ||
    consultation.updatedAt ||
    consultation.acceptedAt ||
    consultation.startedAt ||
    consultation.createdAt;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function staleThresholdForStatus(status, maxAgeMs = STALE_ACTIVE_MS) {
  if (status === 'in_call') return VIDEO_CALL_INACTIVITY_MS;
  return maxAgeMs;
}

function isStaleActiveConsultation(consultation, maxAgeMs = STALE_ACTIVE_MS) {
  if (!consultation) return false;
  const status = normalizeConsultationStatus(consultation, null);
  if (!ACTIVE_STATUSES.includes(status)) return false;
  let threshold = staleThresholdForStatus(status, maxAgeMs);
  if (consultation.callDisconnectedAt) threshold = VIDEO_CALL_INACTIVITY_MS;
  const ts = consultationTimestamp(consultation, status);
  if (!ts) return true;
  return Date.now() - ts > threshold;
}

async function markConsultationCompletedLocal(consultation) {
  const id = consultation._id || consultation.id;
  const room = consultation.roomId || consultation.videoRoomId;
  if (id) {
    await ConsultationRequest.findByIdAndUpdate(id, {
      $set: buildConsultationStatusFields('completed', id)
    });
  }
  if (consultation.paymentId) {
    await Payment.findByIdAndUpdate(consultation.paymentId, {
      consultationStatus: 'completed'
    }).catch(() => {});
  }
  return room ? String(room) : null;
}

async function clearStaleDoctorConsultations(doctorName, options = {}) {
  const exceptRoomId = String(options.exceptRoomId || '').trim();
  const maxAgeMs = options.maxAgeMs || STALE_ACTIVE_MS;
  const all = await ConsultationRequest.find({ doctorName }).exec();
  const list = Array.isArray(all) ? all : [];
  const cleared = [];

  for (const row of list) {
    const c = row.toObject ? row.toObject() : row;
    const status = normalizeConsultationStatus(c, null);
    if (!ACTIVE_STATUSES.includes(status)) continue;
    const room = String(c.roomId || c.videoRoomId || '');
    if (exceptRoomId && room && room === exceptRoomId) continue;
    if (!isStaleActiveConsultation(c, maxAgeMs)) continue;
    const endedRoom = await markConsultationCompletedLocal(c);
    if (endedRoom) cleared.push(endedRoom);
  }

  if (cleared.length) {
    const doctor = await findDoctorByName(doctorName);
    if (doctor) {
      const stillActive = list.filter((row) => {
        const c = row.toObject ? row.toObject() : row;
        const status = normalizeConsultationStatus(c, null);
        if (!ACTIVE_STATUSES.includes(status)) return false;
        const room = String(c.roomId || c.videoRoomId || '');
        if (exceptRoomId && room === exceptRoomId) return true;
        return !isStaleActiveConsultation(c, maxAgeMs);
      });
      if (!stillActive.length) {
        await updateDoctorPresence(doctor, 'Available');
        const payload = await buildStatusPayload(doctor);
        if (payload) emitDoctorStatus(doctorName, payload);
      }
    }
  }

  return { cleared, count: cleared.length };
}

async function hasLiveActiveConsultation(doctorName, exceptRoomId = '') {
  await clearStaleDoctorConsultations(doctorName, { exceptRoomId });
  const all = await ConsultationRequest.find({ doctorName }).exec();
  const list = Array.isArray(all) ? all : [];
  return list.some((row) => {
    const c = row.toObject ? row.toObject() : row;
    const status = normalizeConsultationStatus(c, null);
    if (!ACTIVE_STATUSES.includes(status)) return false;
    const room = String(c.roomId || c.videoRoomId || '');
    if (exceptRoomId && room && room === exceptRoomId) return false;
    return !isStaleActiveConsultation(c);
  });
}

async function autoHealStaleRoomContext(ctx) {
  if (!ctx?.consultation) return ctx;
  if (!isStaleActiveConsultation(ctx.consultation)) return ctx;
  await markConsultationCompletedLocal(ctx.consultation);
  const refreshed = await ConsultationRequest.findById(ctx.consultation._id || ctx.consultation.id);
  if (refreshed) {
    ctx.consultation = refreshed.toObject ? refreshed.toObject() : refreshed;
  }
  if (ctx.payment) {
    ctx.payment = Object.assign({}, ctx.payment, { consultationStatus: 'completed' });
  }
  return ctx;
}

module.exports = {
  STALE_ACTIVE_MS,
  VIDEO_CALL_INACTIVITY_MS,
  ACTIVE_STATUSES,
  isStaleActiveConsultation,
  clearStaleDoctorConsultations,
  hasLiveActiveConsultation,
  autoHealStaleRoomContext,
  markConsultationCompletedLocal
};

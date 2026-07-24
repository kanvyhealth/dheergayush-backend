/**
 * Consultation lifecycle helpers - status normalization, Firestore transitions, video access rules.
 */
const { getFirestore } = require('../../core/firebase');

const APPOINTMENTS_COLLECTION = 'appointments';
const RINGING_STATUSES = ['ringing', 'waiting'];
const PATIENT_VIDEO_ALLOWED = new Set(['ringing', 'waiting', 'accepted', 'in_call']);
const TERMINAL_STATUSES = new Set(['completed', 'rejected', 'cancelled', 'timeout', 'refunded']);

function normalizeLifecycleStatus(value, options = {}) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'active' || s === 'calling') return 'accepted';
  if (s === 'in_progress' || s === 'in-consultation' || s === 'in_consultation') return 'in_call';
  if (s === 'confirmed' || s === 'paid' || s === 'included') return 'ringing';
  if (s === 'not_started') return 'ringing';
  if (s === 'completed' && options.ignorePaymentCompleted) return '';
  return s;
}

function firstConsultationStatus(...values) {
  for (const value of values) {
    const normalized = normalizeLifecycleStatus(value);
    if (normalized) return normalized;
  }
  return '';
}

function normalizeConsultationStatus(consultation, payment) {
  if (consultation) {
    return firstConsultationStatus(
      consultation.status,
      consultation.consultationStatus,
      consultation.ringingStatus,
      consultation.appointmentStatus,
      consultation.consultationQueueStatus
    );
  }
  if (payment) {
    const cs = normalizeLifecycleStatus(payment.consultationStatus, { ignorePaymentCompleted: true });
    if (cs) return cs;
    if (payment.consultationId || payment.videoRoomId || payment.roomName) return 'ringing';
    const s = normalizeLifecycleStatus(payment.status, { ignorePaymentCompleted: true });
    if (s && !TERMINAL_STATUSES.has(s)) return s;
  }
  return '';
}

function patientCanJoinVideo(status) {
  return PATIENT_VIDEO_ALLOWED.has(String(status || '').toLowerCase());
}

const {
  mergeAppStatusFields
} = require('./appAppointmentSync');

function buildConsultationStatusFields(status, appointmentId) {
  const s = String(status).trim().toLowerCase();
  const patch = {
    status: s,
    consultationStatus: s,
    updatedAt: new Date(),
    ...(appointmentId ? mergeAppStatusFields(s, appointmentId) : {})
  };
  if (s === 'ringing' && !patch.ringingStatus) patch.ringingStatus = 'ringing';
  else if (s && !patch.ringingStatus) patch.ringingStatus = s;
  return patch;
}

async function transitionConsultation(consultationId, fromStatuses, patch) {
  const db = getFirestore();
  const ref = db.collection(APPOINTMENTS_COLLECTION).doc(String(consultationId));
  const allowed = fromStatuses.map((x) => String(x).toLowerCase());

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      const err = new Error('Consultation not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const data = snap.data() || {};
    const current = normalizeConsultationStatus(data, null);
    if (!allowed.includes(current)) {
      const err = new Error('Consultation is ' + (current || 'unknown'));
      err.code = 'CONFLICT';
      err.current = current;
      throw err;
    }
    const next = { ...patch, updatedAt: new Date() };
    transaction.update(ref, next);
    return { _id: snap.id, id: snap.id, ...data, ...next };
  });
}

function formatConsultationResponse(consultation) {
  if (!consultation) return consultation;
  const doc = consultation.toObject ? consultation.toObject() : consultation;
  const status = normalizeConsultationStatus(doc, null);
  return {
    ...doc,
    status,
    consultationStatus: doc.consultationStatus || status,
    roomId: doc.roomId || doc.videoRoomId || '',
    videoRoomId: doc.videoRoomId || doc.roomId || ''
  };
}

module.exports = {
  RINGING_STATUSES,
  PATIENT_VIDEO_ALLOWED,
  normalizeLifecycleStatus,
  normalizeConsultationStatus,
  patientCanJoinVideo,
  buildConsultationStatusFields,
  transitionConsultation,
  formatConsultationResponse
};

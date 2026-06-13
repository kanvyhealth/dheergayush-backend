// Align website Firestore writes with Flutter app schema (hosp_test).
const crypto = require('crypto');
const { ensurePatientUid } = require('./patientLinking');

const QUEUE_WAITING = 'WAITING_IN_QUEUE';
const QUEUE_CALLING = 'CALLING';
const QUEUE_IN_CONSULTATION = 'IN_CONSULTATION';
const QUEUE_COMPLETED = 'COMPLETED';

function scheduledCallId(appointmentId) {
  return `consultation_${String(appointmentId)}`;
}

function videoRoomIdForAppointment(appointmentId) {
  return `room_${String(appointmentId)}`;
}

function ringingInitialState() {
  return {
    ringingStatus: 'not_started',
    ringingStartedAt: null,
    doctorJoinStatus: 'waiting',
    userJoinStatus: 'waiting',
    doctorNotificationSent: false,
    userNotificationSent: false,
    callActive: false,
    videoCallEnabled: false,
    activeCallId: null
  };
}

async function resolvePatientUid({ phone, firebaseUid, name, email }) {
  return ensurePatientUid({ phone, firebaseUid, name, email });
}

function buildWebPaidAppointmentFields(opts) {
  const paid = Number(opts.amount) || 0;
  const videoRoomId = videoRoomIdForAppointment(opts.appointmentId);
  return Object.assign({
    appointmentId: String(opts.appointmentId),
    consultationId: String(opts.appointmentId),
    patientId: opts.patientId || '',
    userId: opts.patientId || '',
    patientName: opts.patientName || '',
    patientPhone: opts.patientPhone || '',
    doctorId: opts.doctorId || '',
    doctorName: opts.doctorName || '',
    roomId: videoRoomId,
    videoRoomId,
    amount: paid,
    consultationFee: paid,
    consultationFeePaid: paid,
    totalAmountPaid: paid,
    paymentStatus: 'completed',
    appointmentStatus: 'confirmed',
    consultationStatus: 'confirmed',
    consultationQueueStatus: QUEUE_WAITING,
    source: 'website'
  }, ringingInitialState());
}

function buildWebPaidPaymentFields(opts) {
  const room = opts.videoRoomId || videoRoomIdForAppointment(opts.appointmentId);
  return {
    appointmentId: String(opts.appointmentId),
    consultationId: String(opts.appointmentId),
    patientId: opts.patientId || '',
    doctorId: opts.doctorId || '',
    amount: Number(opts.amount) || 0,
    status: 'completed',
    paymentStatus: 'completed',
    videoRoomId: room,
    roomName: room,
    serviceType: 'consultation',
    source: 'website'
  };
}

function buildAppAcceptedFields(appointmentId) {
  const activeCallId = scheduledCallId(appointmentId);
  return {
    status: 'accepted',
    consultationStatus: 'active',
    appointmentStatus: 'active',
    consultationQueueStatus: QUEUE_CALLING,
    ringingStatus: 'ringing',
    activeCallId,
    videoCallEnabled: true
  };
}

function buildActiveCallRecord({ appointmentId, appointment, doctorId, patientId }) {
  const id = scheduledCallId(appointmentId);
  const roomId = appointment && (appointment.videoRoomId || appointment.roomId) || videoRoomIdForAppointment(appointmentId);
  const now = new Date();
  return {
    _id: id,
    callId: id,
    appointmentId: String(appointmentId),
    doctorId: doctorId || (appointment && appointment.doctorId) || '',
    patientId: patientId || (appointment && (appointment.patientId || appointment.userId)) || '',
    status: 'ringing',
    callRoomId: roomId,
    provider: 'agora',
    createdAt: now,
    updatedAt: now
  };
}

function buildAppInCallFields() {
  return {
    status: 'in_call',
    consultationStatus: 'in_progress',
    consultationQueueStatus: QUEUE_IN_CONSULTATION,
    callActive: true
  };
}

function buildAppCompletedFields() {
  return {
    status: 'completed',
    consultationStatus: 'completed',
    appointmentStatus: 'completed',
    consultationQueueStatus: QUEUE_COMPLETED,
    consultationCompleted: true,
    completedAt: new Date(),
    callActive: false,
    videoCallEnabled: false,
    activeCallId: null,
    ringingStatus: 'completed'
  };
}

function buildAppTerminalFields(webStatus) {
  const s = String(webStatus || '').trim().toLowerCase();
  const cleared = {
    callActive: false,
    videoCallEnabled: false,
    activeCallId: null
  };
  if (s === 'rejected') {
    return {
      status: 'rejected',
      consultationStatus: 'rejected',
      appointmentStatus: 'rejected',
      consultationQueueStatus: QUEUE_WAITING,
      ringingStatus: 'rejected',
      ...cleared
    };
  }
  if (s === 'cancelled') {
    return {
      status: 'cancelled',
      consultationStatus: 'cancelled',
      appointmentStatus: 'cancelled',
      consultationQueueStatus: QUEUE_WAITING,
      ringingStatus: 'cancelled',
      ...cleared
    };
  }
  if (s === 'timeout') {
    return {
      status: 'timeout',
      consultationStatus: 'timeout',
      appointmentStatus: 'timeout',
      consultationQueueStatus: QUEUE_WAITING,
      ringingStatus: 'timeout',
      ...cleared
    };
  }
  if (s === 'refunded') {
    return {
      status: 'refunded',
      consultationStatus: 'refunded',
      appointmentStatus: 'refunded',
      consultationQueueStatus: QUEUE_WAITING,
      ringingStatus: 'refunded',
      ...cleared
    };
  }
  return {};
}

function buildConsultationRingingFields() {
  return {
    consultationQueueStatus: QUEUE_WAITING,
    ringingStatus: 'not_started',
    appointmentStatus: 'confirmed',
    paymentStatus: 'completed'
  };
}

function mergeAppStatusFields(webStatus, appointmentId) {
  const s = String(webStatus || '').toLowerCase();
  if (s === 'ringing' || s === 'waiting') return buildConsultationRingingFields();
  if (s === 'accepted') return buildAppAcceptedFields(appointmentId);
  if (s === 'in_call') return buildAppInCallFields();
  if (s === 'completed') return buildAppCompletedFields();
  const terminal = buildAppTerminalFields(s);
  if (Object.keys(terminal).length) return terminal;
  return {};
}

function agoraUidForUserId(userId) {
  const hash = crypto.createHash('sha256').update(String(userId || 'user')).digest();
  const uid = hash.readUInt32BE(0) & 0x7fffffff;
  return uid === 0 ? 1 : uid;
}

function isValidAgoraChannelName(channelName) {
  return /^[A-Za-z0-9._@-]{1,64}$/.test(String(channelName || ''));
}

module.exports = {
  QUEUE_WAITING,
  QUEUE_CALLING,
  QUEUE_IN_CONSULTATION,
  QUEUE_COMPLETED,
  scheduledCallId,
  videoRoomIdForAppointment,
  resolvePatientUid,
  buildWebPaidAppointmentFields,
  buildWebPaidPaymentFields,
  buildAppAcceptedFields,
  buildActiveCallRecord,
  buildAppInCallFields,
  buildAppCompletedFields,
  buildAppTerminalFields,
  buildConsultationRingingFields,
  mergeAppStatusFields,
  agoraUidForUserId,
  isValidAgoraChannelName
};
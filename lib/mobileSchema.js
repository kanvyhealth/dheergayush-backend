/**
 * Map mobile app Firestore schemas ↔ web API field names.
 */
const {
  getDoctorPresenceStatus,
  getDoctorTimeSlot,
  isDoctorApproved,
  isPublicDoctorRecord
} = require('./doctorAvailability');

const { enrichDoctorApiFields } = require('./doctorFields');

function normalizeDoctorForWeb(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  const enriched = enrichDoctorApiFields(d);
  const langs = enriched.languages || enriched.language || [];
  const specs = enriched.specializations || (enriched.specialization ? [enriched.specialization] : []);

  return {
    ...enriched,
    _id: enriched._id || enriched.id || enriched.uid,
    id: enriched.id || enriched._id || enriched.uid,
    uid: enriched.uid || enriched._id || enriched.id,
    license: enriched.license || enriched.doctorId || '',
    doctorId: enriched.doctorId || enriched.license || '',
    dbStatus: enriched.dbStatus,
    specialization: enriched.specialization || specs[0] || '',
    specializations: specs,
    languages: Array.isArray(langs) ? langs : [langs].filter(Boolean),
    language: Array.isArray(langs) ? langs : [langs].filter(Boolean),
    availableTime: getDoctorTimeSlot(enriched),
    slotTime: enriched.slotTime || enriched.availableTime || '',
    photo: enriched.photo || enriched.profileUrl || '',
    profileUrl: enriched.profileUrl || enriched.photo || '',
    zegoRoomId: enriched.zegoRoomId || enriched.videoRoomId || '',
    videoRoomId: enriched.videoRoomId || enriched.zegoRoomId || '',
    location: enriched.location || (Array.isArray(enriched.selectedLocations) ? enriched.selectedLocations[0] : '')
  };
}

function normalizeUserForWeb(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  const role = String(d.role || '').trim();
  if (role === 'Doctor') {
    return normalizeDoctorForWeb(doc);
  }
  return {
    ...d,
    _id: d._id || d.id || d.uid,
    id: d.id || d._id || d.uid,
    uid: d.uid || d.userId || d._id,
    patientId: d.patientId || d.name || d.id
  };
}

function normalizePatientForWeb(doc) {
  return normalizeUserForWeb(doc);
}

function normalizeAppointmentForWeb(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  return {
    ...d,
    _id: d._id || d.id || d.appointmentId,
    roomId: d.roomId || d.videoRoomId || '',
    videoRoomId: d.videoRoomId || d.roomId || '',
    roomName: d.roomName || d.videoRoomId || d.roomId || '',
    status: d.status || d.consultationStatus || d.ringingStatus || d.appointmentStatus || '',
    consultationStatus: d.consultationStatus || d.status || '',
    patientPhone: d.patientPhone || d.phone || '',
    patientName: d.patientName || d.userName || d.name || ''
  };
}

function normalizePaymentForWeb(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  const paymentStatus = d.status || '';
  const consultationStatus = d.consultationStatus || d.ringingStatus || '';
  return {
    ...d,
    _id: d._id || d.id || d.paymentId,
    roomName: d.roomName || d.videoRoomId || '',
    videoRoomId: d.videoRoomId || d.roomName || '',
    selectedDoctorName: d.selectedDoctorName || d.doctorName || '',
    doctorName: d.doctorName || d.selectedDoctorName || '',
    phone: d.phone || d.patientPhone || '',
    patientPhone: d.patientPhone || d.phone || '',
    name: d.name || d.patientName || '',
    patientName: d.patientName || d.name || '',
    paymentProofPath: d.paymentProofPath || d.paymentProof || d.receiptUrl || '',
    paymentStatus,
    consultationStatus: consultationStatus || (paymentStatus === 'ringing' ? 'ringing' : paymentStatus === 'completed' ? 'completed' : ''),
    status: consultationStatus || paymentStatus
  };
}

function normalizeDocumentForWeb(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  return {
    ...d,
    _id: d._id || d.id,
    filePath: d.filePath || d.downloadUrl || '',
    downloadUrl: d.downloadUrl || d.filePath || '',
    roomId: d.roomId || d.appointmentId || ''
  };
}

function transformDoctorQuery(filter = {}) {
  const f = { ...filter };
  if (f.license) {
    f.$or = [{ license: f.license }, { doctorId: f.license }];
    delete f.license;
  }
  if (f.zegoRoomId) {
    f.$or = [{ zegoRoomId: f.zegoRoomId }, { videoRoomId: f.zegoRoomId }];
    delete f.zegoRoomId;
  }
  if (f.Regstatus) {
    f._webRegstatus = f.Regstatus;
    delete f.Regstatus;
  }
  if (f.status && ['Available', 'Busy', 'Offline'].includes(f.status)) {
    f._webPresence = f.status;
    delete f.status;
  }
  delete f._webRegstatus;
  delete f._publicOnly;
  delete f._webPresence;
  return f;
}

function postFilterDoctor(doc, filter = {}) {
  const d = doc.toObject ? doc.toObject() : doc;
  const regFilter = filter._webRegstatus || filter.Regstatus;
  if (regFilter) {
    const want = String(regFilter).toLowerCase();
    const approved = isDoctorApproved(d);
    if (want === 'approved' && !approved) return false;
    if (want === 'pending' && approved) return false;
    if (want === 'rejected') {
      const reg = String(d.Regstatus || d.approvalStatus || '').toLowerCase();
      if (reg !== 'rejected') return false;
    }
  }
  const presenceFilter = filter._webPresence || filter.status;
  if (presenceFilter && ['Available', 'Busy', 'Offline'].includes(presenceFilter)) {
    if (getDoctorPresenceStatus(d) !== presenceFilter) return false;
  }
  if (filter._publicOnly) {
    if (!isPublicDoctorRecord(d)) return false;
  }
  if (filter.license && d.license !== filter.license && d.doctorId !== filter.license) return false;
  if (filter.zegoRoomId && d.zegoRoomId !== filter.zegoRoomId && d.videoRoomId !== filter.zegoRoomId) {
    return false;
  }
  return true;
}

function transformAppointmentQuery(filter = {}) {
  const f = { ...filter };
  if (f.roomId) {
    f.videoRoomId = f.roomId;
    delete f.roomId;
  }
  if (f.status) {
    f.consultationStatus = f.status;
    delete f.status;
  }
  return f;
}

function postFilterAppointment(doc, filter = {}) {
  const d = normalizeAppointmentForWeb(doc);
  if (filter.roomId && d.roomId !== filter.roomId && d.videoRoomId !== filter.roomId) return false;
  if (filter.status) {
    const statuses = filter.status?.$in || [filter.status];
    const current = d.status || d.consultationStatus || d.ringingStatus || '';
    if (!statuses.includes(current)) return false;
  }
  return true;
}

function transformPaymentQuery(filter = {}) {
  const f = { ...filter };
  if (f.roomName) {
    f.videoRoomId = f.roomName;
    delete f.roomName;
  }
  if (f.phone) {
    f._webPhone = f.phone;
    delete f.phone;
  }
  if (f.selectedDoctorName) {
    f._webDoctorName = f.selectedDoctorName;
    delete f.selectedDoctorName;
  }
  return f;
}

function postFilterPayment(doc, filter = {}) {
  const d = normalizePaymentForWeb(doc);
  if (filter.roomName && d.roomName !== filter.roomName && d.videoRoomId !== filter.roomName) return false;
  if (filter._webPhone) {
    const needle = String(filter._webPhone).replace(/\D/g, '').slice(-10);
    const hay = [d.phone, d.patientPhone, d.patientId, d.uid].map((v) => String(v || '').replace(/\D/g, '').slice(-10));
    if (needle && !hay.includes(needle) && d.patientId !== filter._webPhone && d.uid !== filter._webPhone) return false;
  }
  if (filter._webDoctorName) {
    const want = filter._webDoctorName;
    if (d.selectedDoctorName !== want && d.doctorName !== want && String(d.doctorId || '') !== want) return false;
  }
  return true;
}

/** All Firestore collection names in the mobile app project */
const MOBILE_COLLECTIONS = [
  'appointments',
  'banners',
  'consultation_access',
  'consultation_coupons',
  'consultation_queue',
  'consultation_sessions',
  'doctor_availability',
  'documents',
  'inventory_products',
  'medicine_orders',
  'medicines',
  'metadata',
  'notifications',
  'orders',
  'payments',
  'prescriptions',
  'product_categories',
  'stores',
  'users'
];

module.exports = {
  normalizeDoctorForWeb,
  normalizeUserForWeb,
  normalizePatientForWeb,
  normalizeAppointmentForWeb,
  normalizePaymentForWeb,
  normalizeDocumentForWeb,
  transformDoctorQuery,
  postFilterDoctor,
  transformAppointmentQuery,
  postFilterAppointment,
  transformPaymentQuery,
  postFilterPayment,
  MOBILE_COLLECTIONS
};

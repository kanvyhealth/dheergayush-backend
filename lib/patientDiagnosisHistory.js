const { Payment, ConsultationRequest, PrescribedCart } = require('./data');
const { listConsultationHistoryForDoctor } = require('./paymentLookup');
const { normalizePhone } = require('./userQueries');

function doctorNamesMatch(storedName, sessionName) {
  const a = String(storedName || '').trim().toLowerCase();
  const b = String(sessionName || '').trim().toLowerCase();
  return !!a && !!b && a === b;
}

async function resolveVideoRoomContext(roomId) {
  const room = String(roomId || '').trim();
  if (!room) return null;

  let payment = await Payment.findOne({
    $or: [{ roomName: room }, { videoRoomId: room }]
  }).sort({ createdAt: -1 });

  let consultation = null;
  if (payment?.consultationId) {
    consultation = await ConsultationRequest.findById(payment.consultationId);
  }
  if (!consultation) {
    consultation = await ConsultationRequest.findOne({
      $or: [{ roomId: room }, { videoRoomId: room }]
    }).sort({ createdAt: -1 });
  }
  if (!payment && consultation?.paymentId) {
    payment = await Payment.findById(consultation.paymentId);
  }

  if (!payment && !consultation) return null;

  const patientPhone = normalizePhone(
    payment?.phone || payment?.patientPhone || consultation?.patientPhone || ''
  );
  const patientName = payment?.name || payment?.patientName || consultation?.patientName || '';
  const doctorName = payment?.selectedDoctorName || payment?.doctorName || consultation?.doctorName || '';

  return {
    roomId: room,
    patientPhone,
    patientName,
    doctorName,
    patientSymptoms: String(payment?.patientSymptoms || consultation?.patientSymptoms || '').trim(),
    doctorDiagnosis: String(payment?.doctorDiagnosis || consultation?.doctorDiagnosis || '').trim(),
    consultationNotes: String(payment?.consultationNotes || consultation?.consultationNotes || '').trim(),
    createdAt: payment?.createdAt || consultation?.createdAt || null,
    paymentId: payment?._id || null,
    consultationId: consultation?._id || null
  };
}

async function loadPrescribedMedicines(roomId) {
  if (!roomId) return [];
  const cart = await PrescribedCart.findOne({ roomId: String(roomId) }).sort({ prescribedAt: -1 });
  if (!cart?.cartItems?.length) return [];
  return cart.cartItems.map((item) => ({
    name: item.name || 'Medicine',
    quantity: item.quantity || 1,
    selectedWeight: item.selectedWeight || null
  }));
}

async function enrichVisitRow(row) {
  const roomId = row.roomId || '';
  let payment = null;
  let consultation = null;

  if (roomId) {
    payment = await Payment.findOne({
      $or: [{ roomName: roomId }, { videoRoomId: roomId }]
    }).sort({ createdAt: -1 });
  }
  if (row.consultationId) {
    consultation = await ConsultationRequest.findById(row.consultationId);
  }
  if (!consultation && row.paymentId) {
    payment = payment || (await Payment.findById(row.paymentId));
    if (payment?.consultationId) {
      consultation = await ConsultationRequest.findById(payment.consultationId);
    }
  }

  const prescribedMedicines = await loadPrescribedMedicines(roomId);

  return {
    roomId,
    date: row.createdAt || payment?.createdAt || consultation?.createdAt || null,
    status: row.status || payment?.consultationStatus || consultation?.status || '',
    symptoms: String(payment?.patientSymptoms || consultation?.patientSymptoms || '').trim(),
    diagnosis: String(payment?.doctorDiagnosis || consultation?.doctorDiagnosis || '').trim(),
    notes: String(payment?.consultationNotes || consultation?.consultationNotes || '').trim(),
    prescribedMedicines
  };
}

async function getPatientDiagnosisHistoryForDoctor(roomId, doctorName) {
  const ctx = await resolveVideoRoomContext(roomId);
  if (!ctx) {
    return { error: 'not_found', message: 'No consultation found for this room.' };
  }

  const decodedDoctor = decodeURIComponent(String(doctorName || '').trim());
  if (!decodedDoctor || !doctorNamesMatch(ctx.doctorName, decodedDoctor)) {
    return { error: 'forbidden', message: 'Not authorized for this consultation.' };
  }
  if (!ctx.patientPhone) {
    return { error: 'not_found', message: 'Patient record not found for this room.' };
  }

  const doctorHistory = await listConsultationHistoryForDoctor(decodedDoctor);
  const pastRows = doctorHistory.filter((row) => {
    const rowPhone = normalizePhone(row.patientPhone || '');
    const rowRoom = String(row.roomId || '');
    return rowPhone === ctx.patientPhone && rowRoom && rowRoom !== ctx.roomId;
  });

  const pastVisits = await Promise.all(pastRows.map(enrichVisitRow));
  const currentPrescribed = await loadPrescribedMedicines(ctx.roomId);

  return {
    patient: {
      name: ctx.patientName,
      phone: ctx.patientPhone
    },
    current: {
      roomId: ctx.roomId,
      date: ctx.createdAt,
      symptoms: ctx.patientSymptoms,
      diagnosis: ctx.doctorDiagnosis,
      notes: ctx.consultationNotes,
      prescribedMedicines: currentPrescribed
    },
    pastVisits
  };
}

async function saveConsultationClinicalNotes(roomId, doctorName, payload) {
  const ctx = await resolveVideoRoomContext(roomId);
  if (!ctx) {
    return { error: 'not_found', message: 'No consultation found for this room.' };
  }
  if (!doctorNamesMatch(ctx.doctorName, doctorName)) {
    return { error: 'forbidden', message: 'Not authorized for this consultation.' };
  }

  const update = {};
  if (payload.patientSymptoms !== undefined) {
    update.patientSymptoms = String(payload.patientSymptoms || '').trim().slice(0, 2000);
  }
  if (payload.doctorDiagnosis !== undefined) {
    update.doctorDiagnosis = String(payload.doctorDiagnosis || '').trim().slice(0, 2000);
  }
  if (payload.consultationNotes !== undefined) {
    update.consultationNotes = String(payload.consultationNotes || '').trim().slice(0, 2000);
  }

  if (!Object.keys(update).length) {
    return { error: 'bad_request', message: 'No clinical notes to save.' };
  }

  const tasks = [];
  if (ctx.paymentId) {
    tasks.push(Payment.findByIdAndUpdate(ctx.paymentId, { $set: update }));
  }
  if (ctx.consultationId) {
    tasks.push(ConsultationRequest.findByIdAndUpdate(ctx.consultationId, { $set: update }));
  }
  await Promise.all(tasks);

  return { ok: true, ...update };
}

module.exports = {
  resolveVideoRoomContext,
  getPatientDiagnosisHistoryForDoctor,
  saveConsultationClinicalNotes
};

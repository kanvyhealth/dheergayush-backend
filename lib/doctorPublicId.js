const { getFirestore } = require('./firebase');

const DOCTOR_ID_PATTERN = /^KH\d+$/;

function normalizeDoctorPublicId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return DOCTOR_ID_PATTERN.test(normalized) ? normalized : '';
}

async function nextDoctorPublicId() {
  const db = getFirestore();
  const counterRef = db.collection('metadata').doc('doctor_counter');

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    const currentCount = Number((snap.data() || {}).count || 0) + 1;
    const doctorPublicId = `KH${String(currentCount).padStart(2, '0')}`;
    transaction.set(counterRef, { count: currentCount }, { merge: true });
    return doctorPublicId;
  });
}

async function ensureDoctorPublicId(doctor) {
  if (!doctor) return null;

  const existing = normalizeDoctorPublicId(
    doctor.doctorId || doctor.license || ''
  );
  if (existing) {
    return existing;
  }

  const doctorPublicId = await nextDoctorPublicId();
  const ids = new Set();
  const primaryId = doctor._id || doctor.id;
  if (primaryId) ids.add(String(primaryId));
  if (doctor.uid) ids.add(String(doctor.uid));

  const patch = {
    doctorId: doctorPublicId,
    doctorIdAssignedAt: new Date(),
    updatedAt: new Date()
  };

  const { Doctor } = require('./data');
  for (const id of ids) {
    await Doctor.findByIdAndUpdate(id, { $set: patch }, { new: true });
  }

  return doctorPublicId;
}

module.exports = {
  normalizeDoctorPublicId,
  nextDoctorPublicId,
  ensureDoctorPublicId
};

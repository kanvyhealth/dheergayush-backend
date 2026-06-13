/**
 * Keep active_calls collection aligned with website + mobile app video lifecycle.
 */
const { getFirestore } = require('./firebase');
const { scheduledCallId } = require('./appAppointmentSync');

async function deleteActiveCallForAppointment(appointmentId) {
  const id = scheduledCallId(appointmentId);
  if (!id || id === 'consultation_') return false;
  try {
    const db = getFirestore();
    await db.collection('active_calls').doc(id).delete();
    return true;
  } catch (err) {
    console.warn('active_calls delete:', err.message);
    return false;
  }
}

async function updateActiveCallForAppointment(appointmentId, patch = {}) {
  const id = scheduledCallId(appointmentId);
  if (!id || id === 'consultation_') return false;
  try {
    const db = getFirestore();
    await db.collection('active_calls').doc(id).set(
      { ...patch, updatedAt: new Date() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn('active_calls update:', err.message);
    return false;
  }
}

async function deleteActiveCallsForDoctor(doctorUid, exceptAppointmentId = '') {
  const uid = String(doctorUid || '').trim();
  if (!uid) return 0;
  try {
    const db = getFirestore();
    const snap = await db.collection('active_calls').where('doctorId', '==', uid).get();
    const exceptId = exceptAppointmentId ? scheduledCallId(exceptAppointmentId) : '';
    const batch = db.batch();
    let count = 0;
    snap.forEach((doc) => {
      if (exceptId && doc.id === exceptId) return;
      batch.delete(doc.ref);
      count += 1;
    });
    if (count) await batch.commit();
    return count;
  } catch (err) {
    console.warn('active_calls doctor cleanup:', err.message);
    return 0;
  }
}

module.exports = {
  deleteActiveCallForAppointment,
  updateActiveCallForAppointment,
  deleteActiveCallsForDoctor
};

/**
 * Pure helpers for prescription-linked website order auth.
 * Used by POST /api/orders and contract tests (no Firestore I/O here).
 */

function isPrescriptionLinkedOrder(orderData = {}) {
  const source = String(orderData.source || '').toLowerCase();
  return !!(
    orderData.appointmentId ||
    orderData.prescriptionId ||
    source === 'prescription' ||
    source === 'flutter_prescription'
  );
}

/**
 * Decide whether a verified Firebase uid may place a prescription-linked order.
 * @returns {{ ok: true, userId: string } | { ok: false, status: number, message: string }}
 */
function evaluatePrescriptionOrderAuth({
  firebaseUid,
  orderData = {},
  prescription = null,
  appointment = null
} = {}) {
  if (!isPrescriptionLinkedOrder(orderData)) {
    return { ok: true, userId: firebaseUid || null, guestAllowed: true };
  }

  if (!firebaseUid) {
    return {
      ok: false,
      status: 401,
      message: 'Sign in required to place a prescription-linked store order.'
    };
  }

  if (prescription) {
    const rxPatientId = String(
      prescription.patientId ||
      prescription.user_id ||
      prescription.userId ||
      ''
    ).trim();
    const shared =
      prescription.sharedWithPatient === true ||
      prescription.sharedWithCustomer === true ||
      prescription.shareStatus === 'shared';

    if (rxPatientId && rxPatientId !== firebaseUid) {
      return {
        ok: false,
        status: 403,
        message: 'Prescription does not belong to the signed-in patient.'
      };
    }
    if (rxPatientId && !shared) {
      return {
        ok: false,
        status: 403,
        message: 'Prescription has not been shared with the patient yet.'
      };
    }
  }

  if (appointment) {
    const apptPatientId = String(
      appointment.patientId ||
      appointment.userId ||
      appointment.user_id ||
      appointment.customerId ||
      ''
    ).trim();
    if (apptPatientId && apptPatientId !== firebaseUid) {
      return {
        ok: false,
        status: 403,
        message: 'Appointment does not belong to the signed-in patient.'
      };
    }
  }

  return { ok: true, userId: firebaseUid, guestAllowed: false };
}

/**
 * Strip client-forged identity fields; bind to verified uid when present.
 */
function bindOrderIdentity(orderData = {}, firebaseUid = '') {
  const next = { ...orderData };
  if (firebaseUid) {
    next.userId = firebaseUid;
    next.patientId = firebaseUid;
    delete next.uid;
    return next;
  }
  delete next.userId;
  delete next.patientId;
  delete next.uid;
  return next;
}

module.exports = {
  isPrescriptionLinkedOrder,
  evaluatePrescriptionOrderAuth,
  bindOrderIdentity
};

/**
 * Dual-write consultation status to appointments + payments + active_calls (app parity).
 */
const { Payment } = require('./data');
const { mergeAppStatusFields } = require('./appAppointmentSync');
const { buildConsultationStatusFields } = require('./consultationWorkflow');
const {
  deleteActiveCallForAppointment,
  updateActiveCallForAppointment
} = require('./activeCallSync');

function buildPaymentLifecyclePatch(webStatus, appointmentId) {
  const s = String(webStatus || '').trim().toLowerCase();
  const appFields = mergeAppStatusFields(s, appointmentId);
  const patch = {
    consultationStatus: s,
    updatedAt: new Date()
  };

  if (appFields.status) patch.status = appFields.status;
  if (appFields.appointmentStatus) patch.appointmentStatus = appFields.appointmentStatus;
  if (appFields.consultationQueueStatus) patch.consultationQueueStatus = appFields.consultationQueueStatus;

  if (s === 'completed') {
    patch.status = 'completed';
    patch.paymentStatus = 'completed';
  }
  if (s === 'in_call') {
    patch.appointmentStatus = appFields.appointmentStatus || 'active';
  }
  if (s === 'accepted') {
    patch.appointmentStatus = appFields.appointmentStatus || 'active';
    patch.status = appFields.status || 'accepted';
  }
  if (['rejected', 'cancelled', 'timeout'].includes(s)) {
    patch.appointmentStatus = appFields.appointmentStatus || s;
    patch.status = appFields.status || s;
  }
  if (s === 'refunded') {
    patch.paymentStatus = 'refunded';
    patch.appointmentStatus = appFields.appointmentStatus || 'refunded';
    patch.status = 'refunded';
  }

  return patch;
}

async function syncPaymentForConsultationStatus(paymentId, webStatus, appointmentId) {
  if (!paymentId) return;
  await Payment.findByIdAndUpdate(paymentId, {
    $set: buildPaymentLifecyclePatch(webStatus, appointmentId)
  });
}

async function syncActiveCallForStatus(appointmentId, webStatus) {
  const id = String(appointmentId || '').trim();
  if (!id) return;
  const s = String(webStatus || '').trim().toLowerCase();

  if (['completed', 'rejected', 'cancelled', 'timeout', 'refunded'].includes(s)) {
    await deleteActiveCallForAppointment(id);
    return;
  }
  if (s === 'in_call') {
    await updateActiveCallForAppointment(id, { status: 'in_call', callActive: true });
  }
}

function mergeConsultationStatusPatch(webStatus, appointmentId, extra = {}) {
  return {
    ...buildConsultationStatusFields(webStatus, appointmentId),
    ...extra
  };
}

module.exports = {
  buildPaymentLifecyclePatch,
  syncPaymentForConsultationStatus,
  syncActiveCallForStatus,
  mergeConsultationStatusPatch
};

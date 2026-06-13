/**
 * Consultation payment refunds via Razorpay (idempotent).
 */
const { Payment, ConsultationRequest } = require('./data');
const { createRefund, isRazorpayConfigured, verifyPaymentSignature, fetchPayment } = require('./razorpay');
const {
  normalizeConsultationStatus,
  buildConsultationStatusFields
} = require('./consultationWorkflow');

const VIDEO_FAILURE_REASONS = new Set([
  'connection_failed',
  'token_failed',
  'video_join_failed',
  'no_peer_connected'
]);

async function findLatestPaymentForRoom(room) {
  let payment = await Payment.findOne({ roomName: room }).sort({ createdAt: -1 });
  if (!payment) payment = await Payment.findOne({ videoRoomId: room }).sort({ createdAt: -1 });
  return payment;
}

async function findLatestConsultationForRoom(room) {
  let consultation = await ConsultationRequest.findOne({ roomId: room }).sort({ createdAt: -1 });
  if (!consultation) {
    consultation = await ConsultationRequest.findOne({ videoRoomId: room }).sort({ createdAt: -1 });
  }
  return consultation;
}

async function loadRoomContext(roomId) {
  const room = String(roomId || '').trim();
  if (!room) return null;
  const [payment, consultation] = await Promise.all([
    findLatestPaymentForRoom(room),
    findLatestConsultationForRoom(room)
  ]);
  if (!payment && !consultation) return null;
  return { room, payment, consultation };
}

function paymentDocId(payment) {
  return payment?._id || payment?.id || null;
}

function consultationDocId(consultation) {
  return consultation?._id || consultation?.id || null;
}

function canRefundConsultation(payment, consultation, reason) {
  if (!payment) {
    return { ok: false, status: 404, message: 'No payment found for this consultation.' };
  }

  if (payment.refundStatus === 'processed') {
    return {
      ok: true,
      alreadyRefunded: true,
      amount: Number(payment.amount) || 0,
      refundId: payment.refundId || null,
      message: 'Refund has already been processed.'
    };
  }

  const amount = Number(payment.amount) || 0;
  if (amount <= 0) {
    return {
      ok: true,
      freeConsultation: true,
      amount: 0,
      message: 'This was a free consultation — no refund needed.'
    };
  }

  if (!payment.razorpayPaymentId) {
    return { ok: false, status: 400, message: 'No Razorpay payment on file for this consultation.' };
  }

  const status = normalizeConsultationStatus(consultation, payment);
  if (status === 'completed') {
    return { ok: false, status: 409, message: 'This consultation has already been completed.' };
  }
  if (status === 'refunded') {
    return {
      ok: true,
      alreadyRefunded: true,
      amount,
      refundId: payment.refundId || null,
      message: 'Refund has already been processed.'
    };
  }

  if (status === 'in_call' && !VIDEO_FAILURE_REASONS.has(reason)) {
    return {
      ok: false,
      status: 409,
      message: 'Call is in progress. Refund is only available if video could not connect.'
    };
  }

  return { ok: true, amount, status };
}

function userRefundMessage(amount, reason) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return 'No payment was charged for this consultation.';
  const base = `A refund of ₹${amt} has been initiated to your original payment method. It may take 5–7 business days to appear.`;
  const byReason = {
    doctor_timeout: 'The doctor did not respond in time. ' + base,
    doctor_rejected: 'The doctor declined this consultation. ' + base,
    consultation_cancelled: 'This consultation was cancelled. ' + base,
    connection_failed: 'We could not connect your video consultation. ' + base,
    token_failed: 'We could not start the video call. ' + base,
    video_join_failed: 'We could not join the video call. ' + base,
    no_peer_connected: 'The doctor did not join the video call. ' + base,
    booking_failed: 'We could not complete your consultation booking after payment. ' + base
  };
  return byReason[reason] || 'Your consultation could not be completed. ' + base;
}

async function refundConsultationForRoom(roomId, reason = 'connection_failed') {
  const ctx = await loadRoomContext(roomId);
  if (!ctx) {
    return { ok: false, status: 404, message: 'Consultation room not found.' };
  }

  const eligibility = canRefundConsultation(ctx.payment, ctx.consultation, reason);
  if (!eligibility.ok) return { ok: false, ...eligibility };
  if (eligibility.alreadyRefunded || eligibility.freeConsultation) {
    return {
      ok: true,
      refunded: false,
      alreadyRefunded: !!eligibility.alreadyRefunded,
      freeConsultation: !!eligibility.freeConsultation,
      amount: eligibility.amount || 0,
      message: eligibility.message
    };
  }

  if (!isRazorpayConfigured()) {
    return { ok: false, status: 503, message: 'Refund service is not configured. Please contact support.' };
  }

  const paymentId = paymentDocId(ctx.payment);
  const amount = eligibility.amount;
  const amountInPaise = Math.round(amount * 100);

  try {
    await Payment.findByIdAndUpdate(paymentId, {
      refundStatus: 'processing',
      refundReason: reason
    });

    const refund = await createRefund(ctx.payment.razorpayPaymentId, amountInPaise, {
      roomId: ctx.room,
      reason
    });

    const refundedAt = new Date();
    await Payment.findByIdAndUpdate(paymentId, {
      refundStatus: 'processed',
      refundId: refund.id,
      refundedAt,
      refundReason: reason,
      consultationStatus: 'refunded',
      paymentStatus: 'refunded'
    });

    const consultationId = consultationDocId(ctx.consultation);
    if (consultationId) {
      await ConsultationRequest.findByIdAndUpdate(consultationId, {
        $set: buildConsultationStatusFields('refunded', consultationId)
      });
      const { syncActiveCallForStatus } = require('./consultationLifecycleSync');
      await syncActiveCallForStatus(consultationId, 'refunded');
    }

    return {
      ok: true,
      refunded: true,
      amount,
      refundId: refund.id,
      message: userRefundMessage(amount, reason)
    };
  } catch (err) {
    console.error('Consultation refund error:', err.message);
    if (paymentId) {
      await Payment.findByIdAndUpdate(paymentId, {
        refundStatus: 'failed',
        refundReason: reason,
        refundError: err.message
      }).catch(() => {});
    }
    return {
      ok: false,
      status: err.status || 500,
      message: err.message || 'Could not process refund. Please contact support with your payment ID.'
    };
  }
}

async function refundCapturedRazorpayPayment({
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
  reason = 'booking_failed'
}) {
  if (!razorpayPaymentId) {
    return { ok: false, status: 400, message: 'Payment id is required for refund.' };
  }

  const existing = await Payment.findOne({ razorpayPaymentId: String(razorpayPaymentId) });
  if (existing) {
    if (existing.refundStatus === 'processed') {
      return {
        ok: true,
        refunded: false,
        alreadyRefunded: true,
        amount: Number(existing.amount) || 0,
        message: 'Refund has already been processed.'
      };
    }
    if (existing.consultationId || existing.appointmentId) {
      return {
        ok: false,
        status: 409,
        message: 'Payment is already linked to a consultation. Contact support if you need help.'
      };
    }
  }

  if (!isRazorpayConfigured()) {
    return { ok: false, status: 503, message: 'Refund service is not configured. Please contact support.' };
  }

  if (razorpayOrderId && razorpaySignature) {
    verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature
    });
  }

  const payment = await fetchPayment(razorpayPaymentId);
  const amountInPaise = Number(payment.amount) || 0;
  const amount = amountInPaise / 100;
  if (amount <= 0) {
    return { ok: true, refunded: false, freeConsultation: true, amount: 0, message: 'No payment was charged.' };
  }

  const refund = await createRefund(razorpayPaymentId, amountInPaise, {
    reason,
    orderId: razorpayOrderId || payment.order_id || ''
  });

  if (existing) {
    await Payment.findByIdAndUpdate(paymentDocId(existing), {
      refundStatus: 'processed',
      refundId: refund.id,
      refundedAt: new Date(),
      refundReason: reason,
      consultationStatus: 'refunded',
      paymentStatus: 'refunded'
    });
  }

  return {
    ok: true,
    refunded: true,
    amount,
    refundId: refund.id,
    message: userRefundMessage(amount, reason)
  };
}

module.exports = {
  loadRoomContext,
  refundConsultationForRoom,
  refundCapturedRazorpayPayment,
  userRefundMessage
};

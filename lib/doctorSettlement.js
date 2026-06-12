const { extractDoctorPaymentDetails } = require('./doctorPaymentDetails');

function getPaymentGrossAmount(payment) {
  const amount = Number(payment?.amount);
  if (!Number.isNaN(amount) && amount > 0) return amount;
  const fee = Number(payment?.selectedDoctorFee);
  if (!Number.isNaN(fee) && fee > 0) return fee;
  return 0;
}

function normalizeCommissionPercent(value) {
  const pct = Number(value);
  if (Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

function calcSettlement(gross, commissionPercent) {
  const grossAmount = Math.max(0, Number(gross) || 0);
  const pct = normalizeCommissionPercent(commissionPercent) ?? 0;
  const commissionAmount = Math.round(grossAmount * pct) / 100;
  const roundedCommission = Math.round(commissionAmount * 100) / 100;
  const doctorNetAmount = Math.round((grossAmount - roundedCommission) * 100) / 100;
  return {
    grossAmount,
    commissionPercent: pct,
    commissionAmount: roundedCommission,
    doctorNetAmount
  };
}

function formatDoctorPayoutSummary(paymentDetails) {
  const details = paymentDetails || {};
  if (details.paymentMode === 'upi' && details.upiId) {
    return 'UPI: ' + details.upiId;
  }
  if (details.paymentMode === 'bank' && details.accountNumber) {
    const masked = String(details.accountNumber).replace(/\d(?=\d{4})/g, '*');
    return (details.bankName || 'Bank') + ' · ' + masked + ' · ' + (details.ifsc || '');
  }
  if (details.upiId) return 'UPI: ' + details.upiId;
  if (details.accountNumber) return 'Bank: ' + details.accountNumber;
  return 'Not provided';
}

function enrichSettlementRow(payment, doctor) {
  const grossAmount = getPaymentGrossAmount(payment);
  const commissionPercent = normalizeCommissionPercent(
    payment.settlementCommissionPercent ?? payment.commissionPercent
  );
  const settlementStatus = String(payment.settlementStatus || 'pending').toLowerCase();
  const settlement = commissionPercent == null ? null : calcSettlement(grossAmount, commissionPercent);
  const payout = doctor ? extractDoctorPaymentDetails(doctor) : null;

  return {
    paymentId: payment._id || payment.id,
    createdAt: payment.createdAt || null,
    patientName: payment.name || payment.patientName || '',
    patientPhone: payment.phone || payment.patientPhone || '',
    doctorId: payment.doctorId || payment.selectedDoctorId || '',
    doctorName: payment.doctorName || payment.selectedDoctorName || '',
    roomId: payment.roomName || payment.videoRoomId || payment.roomId || '',
    paymentMethod: payment.paymentMethod || payment.razorpayPaymentId ? 'razorpay' : '',
    razorpayPaymentId: payment.razorpayPaymentId || '',
    grossAmount,
    commissionPercent,
    commissionAmount: settlement?.commissionAmount ?? null,
    doctorNetAmount: settlement?.doctorNetAmount ?? null,
    settlementStatus,
    settledAt: payment.settledAt || null,
    settlementNote: payment.settlementNote || '',
    settlementReference: payment.settlementReference || '',
    settledBy: payment.settledBy || '',
    doctorPayout: payout,
    doctorPayoutSummary: payout ? formatDoctorPayoutSummary(payout) : 'Not provided'
  };
}

function buildSettlementPatch(body = {}) {
  const patch = { updatedAt: new Date() };
  const commissionPercent = normalizeCommissionPercent(
    body.commissionPercent ?? body.settlementCommissionPercent
  );

  if (commissionPercent != null) {
    patch.settlementCommissionPercent = commissionPercent;
    patch.commissionPercent = commissionPercent;
  }

  if (body.settlementStatus != null) {
    const status = String(body.settlementStatus).trim().toLowerCase();
    if (status === 'settled' || status === 'pending') {
      patch.settlementStatus = status;
      if (status === 'settled') {
        patch.settledAt = body.settledAt ? new Date(body.settledAt) : new Date();
      } else {
        patch.settledAt = null;
      }
    }
  }

  if (body.settlementNote != null) patch.settlementNote = String(body.settlementNote).trim();
  if (body.settlementReference != null) {
    patch.settlementReference = String(body.settlementReference).trim();
  }
  if (body.settledBy != null) patch.settledBy = String(body.settledBy).trim();

  return patch;
}

module.exports = {
  getPaymentGrossAmount,
  normalizeCommissionPercent,
  calcSettlement,
  formatDoctorPayoutSummary,
  enrichSettlementRow,
  buildSettlementPatch
};

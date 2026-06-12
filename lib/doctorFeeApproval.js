function parseFeeNumber(value) {
  if (value == null || value === '') return null;
  const feeNum = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isNaN(feeNum) ? null : feeNum;
}

function getActiveConsultationFee(doctor) {
  const raw = doctor?.fee ?? doctor?.consultationFee;
  const feeNum = parseFeeNumber(raw);
  return feeNum == null ? 0 : feeNum;
}

function getPendingConsultationFee(doctor) {
  if (!doctor || doctor.pendingConsultationFee == null || doctor.pendingConsultationFee === '') {
    return null;
  }
  return parseFeeNumber(doctor.pendingConsultationFee);
}

function hasPendingFeeChange(doctor) {
  return getPendingConsultationFee(doctor) != null;
}

function buildPendingFeeRequestPatch(doctor, requestedFee) {
  const current = getActiveConsultationFee(doctor);
  if (requestedFee === current) {
    return { ok: false, error: 'This is already your current consultation fee.' };
  }
  return {
    ok: true,
    patch: {
      pendingConsultationFee: requestedFee,
      pendingFeeRequestedAt: new Date(),
      pendingFeePreviousFee: current,
      updatedAt: new Date()
    }
  };
}

function buildApprovedFeePatch(doctor) {
  const pendingFee = getPendingConsultationFee(doctor);
  if (pendingFee == null) {
    return { ok: false, error: 'No pending fee change for this doctor.' };
  }
  return {
    ok: true,
    patch: {
      fee: pendingFee,
      consultationFee: pendingFee,
      pendingConsultationFee: null,
      pendingFeeRequestedAt: null,
      pendingFeePreviousFee: null,
      pendingFeeApprovedAt: new Date(),
      pendingFeeRejectedAt: null,
      updatedAt: new Date()
    },
    approvedFee: pendingFee
  };
}

function buildRejectedFeePatch() {
  return {
    ok: true,
    patch: {
      pendingConsultationFee: null,
      pendingFeeRequestedAt: null,
      pendingFeePreviousFee: null,
      pendingFeeRejectedAt: new Date(),
      updatedAt: new Date()
    }
  };
}

function enrichDoctorFeeFields(doctor) {
  const activeFee = getActiveConsultationFee(doctor);
  const pendingFee = getPendingConsultationFee(doctor);
  return {
    fee: activeFee,
    consultationFee: activeFee,
    pendingConsultationFee: pendingFee,
    pendingFeeRequestedAt: doctor?.pendingFeeRequestedAt || null,
    pendingFeePreviousFee: doctor?.pendingFeePreviousFee ?? null,
    feeChangePending: pendingFee != null,
    feePendingApproval: pendingFee != null
  };
}

module.exports = {
  parseFeeNumber,
  getActiveConsultationFee,
  getPendingConsultationFee,
  hasPendingFeeChange,
  buildPendingFeeRequestPatch,
  buildApprovedFeePatch,
  buildRejectedFeePatch,
  enrichDoctorFeeFields
};

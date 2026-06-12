function parseFeeNumber(value) {
  if (value == null || value === '') return null;
  const feeNum = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isNaN(feeNum) ? null : feeNum;
}

/** Admin-approved fee used for patient booking and website display. */
function getActiveConsultationFee(doctor) {
  const approved = parseFeeNumber(doctor?.approvedConsultationFee);
  if (approved != null) return approved;
  const legacy = parseFeeNumber(doctor?.fee ?? doctor?.consultationFee ?? doctor?.consultation_fee);
  return legacy == null ? 0 : legacy;
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

function isTrustedFeeWrite(payload = {}) {
  if (payload._skipFeeApproval === true) return true;
  if (payload.pendingFeeApprovedAt) return true;
  return false;
}

function extractIncomingFeeFromPayload(payload = {}) {
  return parseFeeNumber(payload.consultationFee ?? payload.fee ?? payload.consultation_fee);
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
      pendingFeeRejectedAt: null,
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
      approvedConsultationFee: pendingFee,
      pendingConsultationFee: null,
      pendingFeeRequestedAt: null,
      pendingFeePreviousFee: null,
      pendingFeeApprovedAt: new Date(),
      pendingFeeRejectedAt: null,
      updatedAt: new Date(),
      _skipFeeApproval: true
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

/** Admin sets consultation fee directly — applies everywhere immediately. */
function buildAdminApprovedFeePatch(fee) {
  const requestedFee = parseFeeNumber(fee);
  if (requestedFee == null) {
    return { ok: false, error: 'Enter a valid consultation fee (₹0 or more).' };
  }
  if (requestedFee > 500000) {
    return { ok: false, error: 'Consultation fee is too high. Contact support if you need a higher limit.' };
  }
  return {
    ok: true,
    patch: {
      fee: requestedFee,
      consultationFee: requestedFee,
      approvedConsultationFee: requestedFee,
      pendingConsultationFee: null,
      pendingFeeRequestedAt: null,
      pendingFeePreviousFee: null,
      pendingFeeApprovedAt: new Date(),
      pendingFeeRejectedAt: null,
      feeChangeSource: 'admin',
      updatedAt: new Date(),
      _skipFeeApproval: true
    },
    approvedFee: requestedFee
  };
}

/** Convert direct mobile/app fee writes into pending admin approval. */
function sanitizeDoctorFeeUpdate(currentDoctor, update) {
  const raw = update && typeof update === 'object' ? update : {};
  const payload = raw.$set ? { ...raw.$set } : { ...raw };

  if (isTrustedFeeWrite(payload)) {
    delete payload._skipFeeApproval;
    return raw.$set ? { $set: payload } : payload;
  }

  const incomingFee = extractIncomingFeeFromPayload(payload);
  if (incomingFee == null) {
    return update;
  }

  const activeFee = getActiveConsultationFee(currentDoctor);
  if (incomingFee === activeFee) {
    delete payload.fee;
    delete payload.consultationFee;
    delete payload.consultation_fee;
    return raw.$set ? { $set: payload } : payload;
  }

  const pending = buildPendingFeeRequestPatch(currentDoctor, incomingFee);
  delete payload.fee;
  delete payload.consultationFee;
  delete payload.consultation_fee;

  if (!pending.ok) {
    return raw.$set ? { $set: payload } : payload;
  }

  Object.assign(payload, pending.patch);
  payload.fee = activeFee;
  payload.consultationFee = activeFee;
  if (currentDoctor?.approvedConsultationFee != null) {
    payload.approvedConsultationFee = getActiveConsultationFee(currentDoctor);
  }
  payload.feeChangeSource = 'mobile_app';
  return raw.$set ? { $set: payload } : payload;
}

function getAppReportedFee(doctor, activeFee) {
  const candidates = [
    parseFeeNumber(doctor?.consultationFee),
    parseFeeNumber(doctor?.consultation_fee),
    parseFeeNumber(doctor?.fee)
  ].filter((n) => n != null);
  const changed = candidates.filter((n) => n !== activeFee);
  if (changed.length) return changed[changed.length - 1];
  return candidates[0] ?? null;
}

/** Reconcile stored doctor row after mobile app wrote consultationFee directly. */
function reconcileDoctorFeeFromApp(doctor) {
  if (!doctor) return null;

  const activeFee = getActiveConsultationFee(doctor);
  const storedRaw = getAppReportedFee(doctor, activeFee);
  const pendingFee = getPendingConsultationFee(doctor);

  if (doctor.approvedConsultationFee == null && activeFee > 0) {
    return {
      approvedConsultationFee: activeFee,
      fee: activeFee,
      consultationFee: activeFee,
      updatedAt: new Date(),
      _skipFeeApproval: true
    };
  }

  if (storedRaw == null) return null;

  if (pendingFee != null && storedRaw === activeFee) {
    return null;
  }

  if (storedRaw != null && storedRaw !== activeFee && storedRaw !== pendingFee) {
    const pending = buildPendingFeeRequestPatch(
      { ...doctor, approvedConsultationFee: activeFee, fee: activeFee, consultationFee: activeFee },
      storedRaw
    );
    if (!pending.ok) {
      return {
        fee: activeFee,
        consultationFee: activeFee,
        approvedConsultationFee: activeFee,
        updatedAt: new Date()
      };
    }
    return {
      ...pending.patch,
      fee: activeFee,
      consultationFee: activeFee,
      approvedConsultationFee: activeFee,
      feeChangeSource: 'mobile_app_reconcile',
      _skipFeeApproval: true
    };
  }

  return null;
}

async function reconcileDoctorFeeAndPersist(doctor) {
  if (!doctor) return null;
  const patch = reconcileDoctorFeeFromApp(doctor);
  if (!patch) return doctor;
  const { syncDoctorRecordsUpdate } = require('./doctorPresence');
  return syncDoctorRecordsUpdate(doctor, patch);
}

function enrichDoctorFeeFields(doctor) {
  const activeFee = getActiveConsultationFee(doctor);
  const pendingFee = getPendingConsultationFee(doctor);
  return {
    fee: activeFee,
    consultationFee: activeFee,
    approvedConsultationFee: activeFee,
    pendingConsultationFee: pendingFee,
    pendingFeeRequestedAt: doctor?.pendingFeeRequestedAt || null,
    pendingFeePreviousFee: doctor?.pendingFeePreviousFee ?? null,
    feeChangePending: pendingFee != null,
    feePendingApproval: pendingFee != null,
    feeChangeSource: doctor?.feeChangeSource || null
  };
}

module.exports = {
  parseFeeNumber,
  getActiveConsultationFee,
  getPendingConsultationFee,
  hasPendingFeeChange,
  isTrustedFeeWrite,
  buildPendingFeeRequestPatch,
  buildApprovedFeePatch,
  buildRejectedFeePatch,
  buildAdminApprovedFeePatch,
  sanitizeDoctorFeeUpdate,
  reconcileDoctorFeeFromApp,
  reconcileDoctorFeeAndPersist,
  enrichDoctorFeeFields
};

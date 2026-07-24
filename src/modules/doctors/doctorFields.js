const APPROVAL_VALUES = new Set(['pending', 'approved', 'rejected']);

function isApprovalStatus(value) {
  return APPROVAL_VALUES.has(String(value || '').trim().toLowerCase());
}

function workingFromUiLabel(label) {
  const s = String(label || '').trim();
  if (/^available$/i.test(s) || /^online$/i.test(s)) return 'available';
  if (/^busy$/i.test(s) || /^in_consultation$/i.test(s)) return 'busy';
  return 'offline';
}

function getDoctorApprovalStatus(doctor) {
  if (!doctor) return 'pending';
  const raw = doctor.approvalStatus || doctor.Regstatus || doctor.regStatus || doctor.status;
  const s = String(raw || '').trim().toLowerCase();
  if (APPROVAL_VALUES.has(s)) return s;
  if (['available', 'busy', 'offline', 'online', 'in_consultation'].includes(s)) return 'pending';
  return 'pending';
}

/** One-time admin verification at registration; locked after approved. */
function isDoctorVerificationLocked(doctor) {
  return getDoctorApprovalStatus(doctor) === 'approved';
}

function validateApprovalTransition(doctor, nextStatus) {
  const current = getDoctorApprovalStatus(doctor);
  const next = String(nextStatus || '').trim().toLowerCase();
  if (!APPROVAL_VALUES.has(next)) {
    return { ok: false, error: 'Invalid verification status' };
  }
  if (current === next) return { ok: true };
  if (current === 'approved') {
    return {
      ok: false,
      error: 'Doctor was already verified by admin. Verification status cannot be changed.',
    };
  }
  if (current === 'rejected') {
    return {
      ok: false,
      error: 'Rejected registration is final. The doctor must sign up again.',
    };
  }
  if (current === 'pending' && (next === 'approved' || next === 'rejected')) {
    return { ok: true };
  }
  return { ok: false, error: `Cannot change verification from ${current} to ${next}` };
}

function getDoctorWorkingRaw(doctor) {
  if (!doctor) return 'offline';
  if (doctor.working) return String(doctor.working).trim().toLowerCase();
  if (doctor.presenceStatus) return String(doctor.presenceStatus).trim().toLowerCase();
  const legacy = String(doctor.status || '').trim().toLowerCase();
  if (['available', 'busy', 'offline', 'online', 'in_consultation'].includes(legacy)) {
    return legacy === 'online' ? 'available' : legacy;
  }
  return 'offline';
}

function buildApprovalFirestorePatch(approvalStatus) {
  const normalized = String(approvalStatus || 'pending').trim().toLowerCase();
  const safe = APPROVAL_VALUES.has(normalized) ? normalized : 'pending';
  return { status: safe, approvalStatus: safe, Regstatus: safe, updatedAt: new Date() };
}

function buildWorkingFirestorePatch(workingOrUiLabel) {
  const working = workingFromUiLabel(workingOrUiLabel);
  return { working, presenceStatus: working, updatedAt: new Date() };
}

function enrichDoctorApiFields(doctor) {
  if (!doctor) return doctor;
  const d = doctor.toObject ? doctor.toObject() : { ...doctor };
  const { getEffectiveStatus, getDoctorPresenceStatus } = require('./doctorAvailability');
  const approvalStatus = getDoctorApprovalStatus(d);
  const working = getDoctorWorkingRaw(d);
  const avail = getEffectiveStatus(d);
  const presence = getDoctorPresenceStatus(d);
  return {
    ...d,
    approvalStatus,
    Regstatus: d.Regstatus || approvalStatus,
    status: approvalStatus,
    working,
    presenceStatus: d.presenceStatus || working,
    dbStatus: avail.dbStatus || presence,
    effectiveStatus: avail.effective,
    scheduleStatus: avail.scheduleStatus,
    bookable: avail.bookable,
    isApproved: approvalStatus === 'approved',
    verificationLocked: approvalStatus === 'approved',
  };
}

function parseAdminDoctorUpdates(body = {}, doctor = null) {
  const profile = { ...body };
  let approval = null;
  let working = null;
  if (profile.Regstatus != null) {
    approval = profile.Regstatus;
    delete profile.Regstatus;
  }
  if (profile.approvalStatus != null) {
    approval = profile.approvalStatus;
    delete profile.approvalStatus;
  }
  if (profile.working != null) {
    working = profile.working;
    delete profile.working;
  }
  if (profile.presenceStatus != null) {
    working = profile.presenceStatus;
    delete profile.presenceStatus;
  }
  if (profile.status != null) {
    const s = String(profile.status).trim();
    if (isApprovalStatus(s)) approval = s;
    else working = s;
    delete profile.status;
  }
  delete profile.dbStatus;
  delete profile.effectiveStatus;
  delete profile.scheduleStatus;
  delete profile.bookable;
  delete profile.isApproved;
  delete profile.verificationLocked;

  if (doctor && isDoctorVerificationLocked(doctor)) {
    approval = null;
    working = null;
  }

  return { profile, approval, working };
}

module.exports = {
  APPROVAL_VALUES,
  isApprovalStatus,
  getDoctorApprovalStatus,
  getDoctorWorkingRaw,
  isDoctorVerificationLocked,
  validateApprovalTransition,
  buildApprovalFirestorePatch,
  buildWorkingFirestorePatch,
  enrichDoctorApiFields,
  parseAdminDoctorUpdates,
  workingFromUiLabel,
};

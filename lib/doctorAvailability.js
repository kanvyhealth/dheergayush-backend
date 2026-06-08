/** Shared doctor schedule + DB status logic (web + mobile Firestore schemas) */

function convertToMinutes(time) {
  if (!time || typeof time !== 'string') return 0;
  const parts = time.trim().split(/\s+/);
  if (parts.length < 2) return 0;
  const hourPart = parts[0];
  const modifier = parts[1].toUpperCase();
  let hours;
  let minutes = 0;
  if (hourPart.includes(':')) {
    [hours, minutes] = hourPart.split(':').map(Number);
  } else {
    hours = parseInt(hourPart, 10);
  }
  if (Number.isNaN(hours)) return 0;
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return hours * 60 + (minutes || 0);
}

function getScheduleStatus(availableTime) {
  if (!availableTime || typeof availableTime !== 'string') return 'Offline';

  const separator = availableTime.includes(' to ')
    ? ' to '
    : availableTime.includes('-')
      ? '-'
      : null;

  if (!separator) return 'Offline';

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [start, end] = availableTime.split(separator);
  const startMinutes = convertToMinutes(start);
  const endMinutes = convertToMinutes(end);
  if (startMinutes === 0 && endMinutes === 0) return 'Offline';
  if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
    return 'Available';
  }
  return 'Offline';
}

function normalizeDbStatus(status) {
  if (!status) return 'Offline';
  const s = String(status).trim();
  if (/^available$/i.test(s) || /^online$/i.test(s)) return 'Available';
  if (/^busy$/i.test(s) || /^in_consultation$/i.test(s)) return 'Busy';
  if (/^offline$/i.test(s)) return 'Offline';
  return 'Offline';
}

function workingToPresenceValue(presence) {
  return normalizeDbStatus(presence).toLowerCase();
}

const { getDoctorApprovalStatus, getDoctorWorkingRaw, isApprovalStatus: isApprovalField } = require('./doctorFields');

function isApprovalStatus(status) {
  return isApprovalField(status);
}

function getDoctorTimeSlot(doctor) {
  if (!doctor) return '';
  return doctor.availableTime || doctor.slotTime || '';
}

function getDoctorPresenceStatus(doctor) {
  if (!doctor) return 'Offline';
  return normalizeDbStatus(getDoctorWorkingRaw(doctor));
}

function isDoctorApproved(doctor) {
  return getDoctorApprovalStatus(doctor) === 'approved';
}

/** Admin/staff rows stored in doctors collection — never show on patient-facing lists */
function isStaffOrAdminAccount(doctor) {
  if (!doctor) return true;
  if (doctor.isAdmin === true || doctor.admin === true) return true;
  const role = String(doctor.role || doctor.userRole || '').trim().toLowerCase();
  if (role && role !== 'doctor') return true;
  const ut = String(doctor.userType || doctor.accountType || '').trim().toLowerCase();
  if (['admin', 'staff', 'superadmin'].includes(ut)) return true;
  const email = String(doctor.email || '').toLowerCase();
  if (/\badmin\b|admin@|@admin\./.test(email)) return true;
  const spec = String(doctor.specialization || '').trim().toLowerCase();
  if (['admin', 'administrator', 'admin panel'].includes(spec)) return true;
  const name = String(doctor.name || doctor.displayName || '').trim().toLowerCase();
  if (/^(admin|administrator|super\s*admin)\b/.test(name)) return true;
  return false;
}

/** Approved clinical doctors only — excludes admin/staff/user rows in the doctors collection */
function isPublicDoctorRecord(doctor) {
  if (!doctor || !isDoctorApproved(doctor)) return false;
  if (isStaffOrAdminAccount(doctor)) return false;
  const role = String(doctor.role || '').trim();
  if (role && role !== 'Doctor') return false;
  const license = String(doctor.license || doctor.doctorId || '').trim();
  if (!license) return false;
  const spec = doctor.specialization || doctor.specializations;
  if (!spec || (Array.isArray(spec) && !spec.length)) return false;
  return true;
}

function getEffectiveStatus(doctor) {
  const dbStatus = getDoctorPresenceStatus(doctor);
  const scheduleStatus = getScheduleStatus(getDoctorTimeSlot(doctor));
  let effective = 'Offline';
  let bookable = false;

  if (!isDoctorApproved(doctor)) {
    return { dbStatus, scheduleStatus, effective: 'Offline', bookable: false };
  }

  if (dbStatus === 'Offline') {
    effective = 'Offline';
  } else if (dbStatus === 'Busy') {
    effective = 'Busy';
  } else if (dbStatus === 'Available') {
    // Doctor explicitly went online — visible to patients regardless of schedule slot
    effective = 'Available';
    bookable = true;
  } else {
    effective = 'Offline';
  }
  return { dbStatus, scheduleStatus, effective, bookable };
}

module.exports = {
  convertToMinutes,
  getScheduleStatus,
  normalizeDbStatus,
  workingToPresenceValue,
  isApprovalStatus,
  getDoctorTimeSlot,
  getDoctorPresenceStatus,
  isDoctorApproved,
  isStaffOrAdminAccount,
  isPublicDoctorRecord,
  getEffectiveStatus
};

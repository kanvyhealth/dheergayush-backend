const {
  normalizeDbStatus,
  workingToPresenceValue,
  isDoctorApproved
} = require('./doctorAvailability');

const { Doctor } = require('./data');

const { findDoctorByName } = require('./userQueries');



function isMobileDoctor(doctor) {

  return !!(doctor && (doctor.uid || doctor.doctorId));

}



function presenceToWorking(presence) {
  return workingToPresenceValue(presence);
}

function buildPresenceUpdate(presence) {
  const { buildWorkingFirestorePatch } = require('./doctorFields');
  return buildWorkingFirestorePatch(presence);
}



async function updateDoctorPresence(doctor, presence) {
  if (!doctor) return null;

  const patch = buildPresenceUpdate(presence);
  const ids = new Set();
  const primaryId = doctor._id || doctor.id;
  if (primaryId) ids.add(String(primaryId));
  if (doctor.uid) ids.add(String(doctor.uid));

  if (!ids.size) return null;

  let updated = null;
  for (const id of ids) {
    updated = await Doctor.findByIdAndUpdate(id, { $set: patch }, { new: true });
  }

  if (updated) {
    const { mirrorDoctorToAuthUid } = require('./doctorMirror');
    await mirrorDoctorToAuthUid(updated);
  }

  return updated;
}



function isDoctorBusy(doctor) {

  const { getDoctorPresenceStatus } = require('./doctorAvailability');

  return getDoctorPresenceStatus(doctor) === 'Busy';

}



function isDoctorAvailable(doctor) {

  const { getDoctorPresenceStatus } = require('./doctorAvailability');

  return getDoctorPresenceStatus(doctor) === 'Available';

}



function buildApprovalUpdate(approvalStatus) {
  const { buildApprovalFirestorePatch } = require('./doctorFields');
  return buildApprovalFirestorePatch(approvalStatus);
}



module.exports = {

  isMobileDoctor,

  buildPresenceUpdate,

  updateDoctorPresence,

  findDoctorByName,

  isDoctorBusy,

  isDoctorAvailable,

  isDoctorApproved,

  buildApprovalUpdate,

  presenceToWorking

};



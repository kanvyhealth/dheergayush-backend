const {
  normalizeDbStatus,
  workingToPresenceValue,
  isDoctorApproved
} = require('./doctorAvailability');

const { Doctor } = require('./data');

const { findDoctorByName } = require('./userQueries');

/** Website + mirrored authUid rows can share one clinician — keep presence in sync on all of them. */
async function collectDoctorDocumentIds(doctor) {
  const ids = new Set();
  const add = (doc) => {
    if (!doc) return;
    const id = doc._id || doc.id;
    if (id) ids.add(String(id));
  };

  add(doctor);

  const uid = String(doctor.uid || '').trim();
  const name = String(doctor.name || doctor.displayName || '').trim();
  const nameLower = name.toLowerCase();

  if (uid) {
    add(await Doctor.findById(uid));
    const byUid = await Doctor.find({ uid });
    (Array.isArray(byUid) ? byUid : []).forEach(add);
  }

  if (name) {
    add(await Doctor.findOne({ name }));
    const all = await Doctor.find({});
    (Array.isArray(all) ? all : []).forEach((doc) => {
      const docName = String(doc.name || doc.displayName || '').trim().toLowerCase();
      if (docName && docName === nameLower) add(doc);
    });
  }

  return ids;
}



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
  const normalized = normalizeDbStatus(presence);
  if (normalized === 'Available') {
    patch.lastOnlineAt = new Date();
    patch.presenceSource = 'manual';
  } else if (normalized === 'Offline') {
    patch.presenceSource = null;
  }

  const ids = await collectDoctorDocumentIds(doctor);
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

async function syncDoctorRecordsUpdate(doctor, patch) {
  if (!doctor || !patch || typeof patch !== 'object') return null;

  const ids = await collectDoctorDocumentIds(doctor);
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

  collectDoctorDocumentIds,

  updateDoctorPresence,

  syncDoctorRecordsUpdate,

  findDoctorByName,

  isDoctorBusy,

  isDoctorAvailable,

  isDoctorApproved,

  buildApprovalUpdate,

  presenceToWorking

};



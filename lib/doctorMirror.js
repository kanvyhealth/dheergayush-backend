const { getFirestore } = require('./firebase');

/**
 * Mirror website doctor profiles to doctors/{authUid} for app + security rules.
 */
async function mirrorDoctorToAuthUid(doctor) {
  if (!doctor) return;

  const authUid = String(doctor.uid || '').trim();
  const sourceId = String(doctor._id || doctor.id || '').trim();
  if (!authUid || !sourceId || authUid === sourceId) {
    return;
  }

  const db = getFirestore();
  const payload = { ...doctor };
  delete payload._id;
  delete payload.id;
  delete payload.toObject;
  delete payload.save;

  await db.collection('doctors').doc(authUid).set(
    {
      ...payload,
      uid: authUid,
      websiteDoctorDocId: sourceId,
      updatedAt: new Date()
    },
    { merge: true }
  );
}

async function syncAllDoctorMirrors() {
  const db = getFirestore();
  const snapshot = await db.collection('doctors').get();
  let mirrored = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const authUid = String(data.uid || '').trim();
    if (!authUid || doc.id === authUid) {
      continue;
    }
    await mirrorDoctorToAuthUid({ ...data, _id: doc.id, id: doc.id, uid: authUid });
    mirrored += 1;
  }

  return mirrored;
}

module.exports = {
  mirrorDoctorToAuthUid,
  syncAllDoctorMirrors
};

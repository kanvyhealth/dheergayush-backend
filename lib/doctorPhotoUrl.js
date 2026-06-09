/**
 * Resolve doctor profile photos from Firebase Storage (refresh expired download URLs).
 */
const { ensureStorage, storagePathFromUrl } = require('./firebaseStorage');

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

async function fileExists(file) {
  try {
    const [exists] = await file.exists();
    return exists;
  } catch {
    return false;
  }
}

async function firstExistingFile(bucket, paths) {
  for (const storagePath of paths) {
    const file = bucket.file(storagePath);
    if (await fileExists(file)) return file;
  }
  return null;
}

async function firstFileFromPrefixes(bucket, prefixes) {
  for (const prefix of prefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix, maxResults: 20 });
      const match =
        files.find((f) => /profile\.(jpe?g|png|webp)$/i.test(f.name)) ||
        files.find((f) => IMAGE_EXT.test(f.name));
      if (match) return match;
    } catch {
      /* billing or permission errors — try next prefix */
    }
  }
  return null;
}

async function signedUrlForFile(file) {
  const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
  return url;
}

function doctorUid(doctor) {
  return String(doctor?.uid || doctor?._id || doctor?.id || '').trim();
}

function storedPhoto(doctor) {
  return String(doctor?.profileUrl || doctor?.photo || '').trim();
}

/** Candidate storage paths for a doctor profile image. */
function candidatePaths(doctor) {
  const uid = doctorUid(doctor);
  const stored = storedPhoto(doctor);
  const paths = [];
  const seen = new Set();

  function add(path) {
    const p = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!p || seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  }

  if (stored) {
    const fromUrl = storagePathFromUrl(stored);
    if (fromUrl) add(fromUrl);
    if (!/^https?:\/\//i.test(stored)) add(stored);
  }

  if (uid) {
    add(`doctors/${uid}/profile.jpg`);
    add(`Doctor/${uid}/profile.jpg`);
  }

  return paths;
}

/** Find the first existing profile file in Firebase Storage. */
async function findDoctorPhotoFile(doctorOrUid, storedHint) {
  let doctor = doctorOrUid;
  if (typeof doctorOrUid === 'string') {
    doctor = { uid: doctorOrUid, profileUrl: storedHint || '' };
  }

  try {
    const bucket = await ensureStorage();
    const paths = candidatePaths(doctor);
    const direct = await firstExistingFile(bucket, paths);
    if (direct) return direct;

    const uid = doctorUid(doctor);
    if (!uid) return null;

    return await firstFileFromPrefixes(bucket, [`doctors/${uid}/`, `Doctor/${uid}/`]);
  } catch (err) {
    console.warn('findDoctorPhotoFile:', err.message);
  }

  return null;
}

/** Fresh signed URL for a doctor profile photo, or null. */
async function resolveDoctorPhoto(doctor) {
  const file = await findDoctorPhotoFile(doctor);
  if (!file) {
    const stored = storedPhoto(doctor);
    return /^https?:\/\//i.test(stored) ? stored : null;
  }
  try {
    return await signedUrlForFile(file);
  } catch (err) {
    console.warn('resolveDoctorPhoto signed URL:', err.message);
    return storedPhoto(doctor) || null;
  }
}

/** Stream doctor photo for /api/doctors/:uid/photo */
async function streamDoctorPhoto(uid, storedHint) {
  const file = await findDoctorPhotoFile(uid, storedHint);
  if (!file) return null;

  const [metadata] = await file.getMetadata().catch(() => [{}]);
  return {
    stream: file.createReadStream(),
    contentType: metadata.contentType || 'image/jpeg'
  };
}

async function enrichDoctorPhotos(doctors) {
  if (!Array.isArray(doctors) || !doctors.length) return doctors || [];

  return Promise.all(
    doctors.map(async (doctor) => {
      const base = doctor?.toObject ? doctor.toObject() : { ...doctor };
      const resolved = await resolveDoctorPhoto(base);
      if (resolved) {
        base.photo = resolved;
        base.profileUrl = resolved;
      }
      return base;
    })
  );
}

module.exports = {
  candidatePaths,
  findDoctorPhotoFile,
  resolveDoctorPhoto,
  streamDoctorPhoto,
  enrichDoctorPhotos
};

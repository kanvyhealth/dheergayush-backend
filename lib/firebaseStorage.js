/**
 * Firebase Storage — upload files and resolve public URLs (same bucket as mobile app).
 */
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getStorageBucket, initFirebase } = require('./firebase');

async function ensureStorage() {
  await initFirebase();
  const bucket = getStorageBucket();
  if (!bucket) {
    throw new Error('FIREBASE_STORAGE_BUCKET is not configured in .env');
  }
  return bucket;
}

function sanitizeName(name) {
  return String(name || 'file').replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
}

/** Extract Firebase Storage object path from a stored URL or bare path. */
function storagePathFromUrl(value) {
  const v = String(value || '').trim().replace(/\\/g, '/');
  if (!v) return null;

  if (!/^https?:\/\//i.test(v)) {
    return v.replace(/^\/+/, '') || null;
  }

  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase();

    if (host === 'firebasestorage.googleapis.com') {
      const segs = u.pathname.split('/').filter(Boolean);
      const oIdx = segs.indexOf('o');
      if (segs[0] === 'v0' && segs[1] === 'b' && oIdx >= 0 && oIdx + 1 < segs.length) {
        return decodeURIComponent(segs.slice(oIdx + 1).join('/'));
      }
    }

    if (host === 'storage.googleapis.com') {
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length >= 2) {
        return segs.slice(1).join('/');
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Upload a buffer or local file path to Firebase Storage.
 * @returns {{ storagePath, downloadUrl, fileName }}
 */
async function uploadFile(source, storagePath, options = {}) {
  const bucket = await ensureStorage();
  const file = bucket.file(storagePath);
  const contentType = options.contentType || 'application/octet-stream';

  if (Buffer.isBuffer(source)) {
    await file.save(source, {
      metadata: { contentType, metadata: options.metadata || {} },
      public: false
    });
  } else if (typeof source === 'string') {
    await bucket.upload(source, {
      destination: storagePath,
      metadata: { contentType, metadata: options.metadata || {} },
      public: false
    });
  } else {
    throw new Error('uploadFile requires a Buffer or local file path');
  }

  const [downloadUrl] = await file.getSignedUrl({
    action: 'read',
    expires: options.signedUrlExpiry || '03-01-2500'
  });

  return {
    storagePath,
    downloadUrl,
    fileName: path.basename(storagePath)
  };
}

async function uploadMulterFile(multerFile, folder, options = {}) {
  if (!multerFile) return null;
  const ts = Date.now();
  const safeName = sanitizeName(multerFile.originalname);
  const storagePath = `${folder}/${ts}_${safeName}`;

  if (multerFile.buffer) {
    return uploadFile(multerFile.buffer, storagePath, {
      contentType: multerFile.mimetype,
      ...options
    });
  }

  const localPath = multerFile.path;
  if (localPath) {
    return uploadFile(localPath, storagePath, {
      contentType: multerFile.mimetype,
      ...options
    });
  }

  return null;
}

function generateVideoRoomId() {
  return `room_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
}

/** Resolve stored path/URL to a usable download URL (refreshes expired Firebase tokens). */
async function resolveFileUrl(stored) {
  if (!stored) return null;
  const value = String(stored).replace(/\\/g, '/').trim();

  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;

  const storagePath = storagePathFromUrl(value);
  const pathToTry = storagePath || (/^https?:\/\//i.test(value) ? null : value.replace(/^\/+/, ''));

  if (pathToTry) {
    try {
      const bucket = await ensureStorage();
      const file = bucket.file(pathToTry);
      const [exists] = await file.exists();
      if (exists) {
        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
        return url;
      }
    } catch {
      /* fall through */
    }
  }

  if (/^https?:\/\//i.test(value)) return value;

  return value.startsWith('/') ? value : `/${value}`;
}

module.exports = {
  uploadFile,
  uploadMulterFile,
  generateVideoRoomId,
  resolveFileUrl,
  storagePathFromUrl,
  ensureStorage,
  sanitizeName
};

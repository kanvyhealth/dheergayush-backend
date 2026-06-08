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

/** Resolve stored path/URL to a usable download URL */
async function resolveFileUrl(stored) {
  if (!stored) return null;
  const value = String(stored).replace(/\\/g, '/');

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith('uploads/')) {
    return `/${value}`;
  }

  try {
    const bucket = await ensureStorage();
    const file = bucket.file(value);
    const [exists] = await file.exists();
    if (!exists) return `/${value.startsWith('/') ? value.slice(1) : value}`;
    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
    return url;
  } catch {
    return value;
  }
}

module.exports = {
  uploadFile,
  uploadMulterFile,
  generateVideoRoomId,
  resolveFileUrl,
  sanitizeName
};

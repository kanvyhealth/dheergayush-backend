/**
 * Firebase Admin initialization (Firestore + optional Storage).
 */
const fs = require('fs');
const path = require('path');

let admin = null;
let db = null;
let bucket = null;
let initialized = false;
let hasServiceAccount = false;

function isCloudHost() {
  return !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME);
}

function loadServiceAccount() {
  const jsonInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonInline) {
    try {
      return JSON.parse(jsonInline);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  const jsonPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!jsonPath) return null;

  const resolved = path.resolve(jsonPath);
  if (fs.existsSync(resolved)) {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }

  console.warn(
    `⚠️ Service account file not found: ${jsonPath}. ` +
      'On Render, remove GOOGLE_APPLICATION_CREDENTIALS and set FIREBASE_SERVICE_ACCOUNT_JSON instead.'
  );
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return null;
}

async function verifyFirestoreRead() {
  const firestore = getFirestore();
  const snap = await firestore.collection('doctors').limit(1).get();
  return { ok: true, sampleSize: snap.size };
}

async function initFirebase() {
  if (initialized) return { admin, db, bucket };

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required. Add it to .env — see FIREBASE_MIGRATION.md');
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount && isCloudHost()) {
    throw new Error(
      'Firebase service account missing on cloud host. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_JSON in Render (minified service account JSON). ' +
        'Remove GOOGLE_APPLICATION_CREDENTIALS — that path only works locally.'
    );
  }

  admin = require('firebase-admin');
  hasServiceAccount = !!serviceAccount;

  if (!admin.apps.length) {
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
      });
    } else {
      admin.initializeApp({
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
      });
    }
  }

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  if (process.env.FIREBASE_STORAGE_BUCKET) {
    bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
  }

  if (serviceAccount) {
    await verifyFirestoreRead();
  }

  initialized = true;
  console.log('✅ Connected to Firebase Firestore (project:', projectId + ')');
  return { admin, db, bucket };
}

function getFirestore() {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}

function getStorageBucket() {
  return bucket;
}

function isFirebaseReady() {
  return initialized && !!db && hasServiceAccount;
}

module.exports = {
  initFirebase,
  verifyFirestoreRead,
  getFirestore,
  getStorageBucket,
  isFirebaseReady,
  hasServiceAccount: () => hasServiceAccount,
  getAdmin: () => admin
};

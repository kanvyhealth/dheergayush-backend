/**
 * Database bootstrap — Firebase Firestore.
 */
const { getProvider } = require('./data');
const { initFirebase, isFirebaseReady, getAdmin } = require('./firebase');

function requireDb(req, res, next) {
  if (isFirebaseReady()) return next();
  return res.status(503).json({
    message: 'Firebase is not connected. Set FIREBASE_PROJECT_ID and service account credentials.',
    provider: 'firebase'
  });
}

function isConnected() {
  return isFirebaseReady();
}

async function connectDatabase() {
  console.log('📦 Database provider: firebase');
  await initFirebase();
  return 'firebase';
}

async function disconnectDatabase() {
  const admin = getAdmin();
  if (admin && admin.apps.length) {
    await Promise.all(admin.apps.map((app) => app.delete()));
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  requireDb,
  isConnected,
  getProvider
};

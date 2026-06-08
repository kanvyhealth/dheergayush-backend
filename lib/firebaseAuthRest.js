/**
 * Firebase Auth via Identity Toolkit REST API (same users as Android app).
 */
const { getAdmin, initFirebase } = require('./firebase');

function getApiKey() {
  return process.env.FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '';
}

async function parseIdentityToolkitResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (text.trim().startsWith('<')) {
      const err = new Error(
        'Firebase Auth API returned an HTML error. Check FIREBASE_API_KEY and authorized domains.'
      );
      err.code = 'auth/rest-html-error';
      throw err;
    }
    throw new Error('Firebase Auth API returned invalid JSON');
  }
}

async function signInWithPassword(email, password) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('FIREBASE_API_KEY is not configured');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );

  const data = await parseIdentityToolkitResponse(res);
  if (!res.ok) {
    const msg = data.error?.message || 'Login failed';
    throw new Error(msg.replace(/_/g, ' ').toLowerCase());
  }
  return data;
}

async function refreshIdToken(refreshToken) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('FIREBASE_API_KEY is not configured');
  if (!refreshToken) throw new Error('Refresh token is required');

  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: String(refreshToken)
      }).toString()
    }
  );

  const data = await parseIdentityToolkitResponse(res);
  if (!res.ok) {
    const msg = data.error?.message || 'Token refresh failed';
    throw new Error(msg.replace(/_/g, ' ').toLowerCase());
  }
  return data;
}

async function createAuthUser({ email, password, displayName, phoneNumber }) {
  await initFirebase();
  const admin = getAdmin();
  const payload = {
    email,
    password,
    displayName: displayName || email.split('@')[0]
  };
  if (phoneNumber) {
    payload.phoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
  }
  const user = await admin.auth().createUser(payload);
  return user;
}

async function getAuthUserByEmail(email) {
  await initFirebase();
  const admin = getAdmin();
  return admin.auth().getUserByEmail(String(email || '').trim().toLowerCase());
}

async function updateAuthUserPassword(uid, newPassword) {
  if (!newPassword || String(newPassword).length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  await initFirebase();
  await getAdmin().auth().updateUser(uid, { password: newPassword });
  return { ok: true };
}

function getPublicFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'hosp-test-app';
  return {
    apiKey: getApiKey(),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '183359905302',
    appId: process.env.FIREBASE_WEB_APP_ID || ''
  };
}

module.exports = {
  signInWithPassword,
  refreshIdToken,
  createAuthUser,
  getAuthUserByEmail,
  updateAuthUserPassword,
  getPublicFirebaseConfig,
  getApiKey
};

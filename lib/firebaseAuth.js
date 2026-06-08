/**
 * Firebase Authentication — verify ID tokens from mobile/web clients.
 */
const { initFirebase, getAdmin } = require('./firebase');

async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('Missing ID token');
  await initFirebase();
  const admin = getAdmin();
  return admin.auth().verifyIdToken(idToken);
}

async function getUserProfile(uid) {
  const { User } = require('./data');
  const byUid = await User.findOne({ uid });
  if (byUid) return byUid;
  return User.findById(uid);
}

async function syncUserFromToken(decoded, extra = {}) {
  const { User } = require('./data');
  const uid = decoded.uid;
  const existing = await getUserProfile(uid);
  const payload = {
    uid,
    email: decoded.email || extra.email || existing?.email || '',
    phone: decoded.phone_number || extra.phone || existing?.phone || '',
    name: decoded.name || extra.name || existing?.name || '',
    role: extra.role || existing?.role || 'Customer',
    status: existing?.status || 'active',
    updatedAt: new Date()
  };

  if (existing) {
    return User.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  payload.createdAt = new Date();
  return User.create({ ...payload, _id: uid });
}

/** Express middleware — optional or required Firebase Auth */
function requireFirebaseAuth(options = {}) {
  const { optional = false } = options;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      if (optional) return next();
      return res.status(401).json({ message: 'Firebase ID token required' });
    }

    try {
      const decoded = await verifyIdToken(token);
      req.firebaseUser = decoded;
      req.firebaseUid = decoded.uid;
      const profile = await getUserProfile(decoded.uid);
      if (profile) req.userProfile = profile;
      next();
    } catch (err) {
      if (optional) return next();
      return res.status(401).json({ message: 'Invalid or expired Firebase token', error: err.message });
    }
  };
}

module.exports = {
  verifyIdToken,
  getUserProfile,
  syncUserFromToken,
  requireFirebaseAuth
};

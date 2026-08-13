/**
 * Domain routes: health
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/health', async (req, res) => {
      const { hasServiceAccount, isFirebaseReady } = require('../../core/firebase');
      let dbStatus = 'disconnected';
      let firestoreOk = false;
      let firestoreError = null;

      // Do not hit Firestore on every Render health poll — that delays deploys.
      if (isFirebaseReady()) {
        dbStatus = 'connected';
        firestoreOk = true;
      } else if (isConnected() && hasServiceAccount()) {
        dbStatus = 'connecting';
      } else if (isConnected()) {
        dbStatus = 'no_credentials';
        firestoreError =
          'Firebase initialized without a service account. Set FIREBASE_SERVICE_ACCOUNT_JSON on Render.';
      }
    
      const agoraConfigured = !!(
        process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE
      );
      const razorpayConfigured = isRazorpayConfigured();
      const razorpayAuth = global.__razorpayAuth === true;
      // Store checkout only needs Firestore + Razorpay; video needs Agora separately.
      const storeReady = firestoreOk && razorpayConfigured && razorpayAuth;
      const videoReady = agoraConfigured;
      const ok = storeReady && videoReady;
    
      res.json({
        ready: true,
        ok,
        storeReady,
        videoReady,
        provider: getProvider(),
        db: dbStatus,
        firestore: firestoreOk,
        agora: agoraConfigured,
        razorpay: razorpayConfigured,
        razorpayAuth,
        credentials: hasServiceAccount() ? 'service_account' : 'missing',
        storage: !!process.env.FIREBASE_STORAGE_BUCKET,
        collections: MOBILE_COLLECTIONS.length,
        uptime: process.uptime(),
        ...(firestoreError ? { error: firestoreError } : {}),
        ...(razorpayConfigured && !razorpayAuth && global.__razorpayAuthError
          ? { razorpayError: global.__razorpayAuthError }
          : {})
      });
    });

    /** Store-only readiness — does not require Agora video infra. */
    app.get('/api/health/store', async (req, res) => {
      const { hasServiceAccount, isFirebaseReady } = require('../../core/firebase');
      let firestoreOk = isFirebaseReady();
      let firestoreError = null;
      if (!firestoreOk && isConnected() && !hasServiceAccount()) {
        firestoreError =
          'Firebase initialized without a service account. Set FIREBASE_SERVICE_ACCOUNT_JSON on Render.';
      }
      const razorpayConfigured = isRazorpayConfigured();
      const razorpayAuth = global.__razorpayAuth === true;
      const storeReady = firestoreOk && razorpayConfigured && razorpayAuth;
      res.json({
        ready: true,
        ok: storeReady,
        storeReady,
        firestore: firestoreOk,
        razorpay: razorpayConfigured,
        razorpayAuth,
        uptime: process.uptime(),
        ...(firestoreError ? { error: firestoreError } : {})
      });
    });
    
    app.get('/api/firebase/collections', async (req, res) => {
      try {
        const { initFirebase } = require('../../core/firebase');
        await initFirebase();
        const db = getFirestore();
        const cols = await db.listCollections();
        const names = cols.map((c) => c.id).sort();
        res.json({ project: process.env.FIREBASE_PROJECT_ID, collections: names });
      } catch (err) {
        res.status(500).json({ message: 'Failed to list collections', error: err.message });
      }
    });
  }
};

/**
 * Domain routes: health
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/health', async (req, res) => {
      const { verifyFirestoreRead, hasServiceAccount } = require('../../core/firebase');
      let dbStatus = 'disconnected';
      let firestoreOk = false;
      let firestoreError = null;
    
      if (isConnected() && hasServiceAccount()) {
        try {
          await verifyFirestoreRead();
          dbStatus = 'connected';
          firestoreOk = true;
        } catch (err) {
          dbStatus = 'error';
          firestoreError = err.message;
        }
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
    
      res.json({
        ready: true,
        ok: firestoreOk && agoraConfigured && razorpayConfigured && razorpayAuth,
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

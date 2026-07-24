/**
 * Domain routes: auth
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.post('/api/auth/verify', async (req, res) => {
      try {
        const idToken = req.body.idToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!idToken) return res.status(400).json({ message: 'idToken is required' });
        const decoded = await verifyIdToken(idToken);
        const profile = await getUserProfile(decoded.uid);
        res.json({ ok: true, uid: decoded.uid, email: decoded.email || null, phone: decoded.phone_number || null, profile });
      } catch (err) {
        res.status(401).json({ message: 'Invalid Firebase token', error: err.message });
      }
    });
    
    app.post('/api/auth/sync', async (req, res) => {
      try {
        const idToken = req.body.idToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!idToken) return res.status(400).json({ message: 'idToken is required' });
        const decoded = await verifyIdToken(idToken);
        const profile = await syncUserFromToken(decoded, req.body || {});
        res.json({ ok: true, profile });
      } catch (err) {
        res.status(401).json({ message: 'Auth sync failed', error: err.message });
      }
    });
    
    app.get('/api/auth/me', requireFirebaseAuth(), async (req, res) => {
      const portalInfo = await resolveAuthPortal(req.firebaseUid);
      res.json({
        ok: true,
        uid: req.firebaseUid,
        profile: req.userProfile || null,
        portal: portalInfo.portal,
        role: portalInfo.role,
        redirectTo: portalInfo.redirectTo,
        doctor: serializeDoctorSession(portalInfo.doctor)
      });
    });
    
    app.get('/api/firebase/config', (req, res) => {
      res.json(getPublicFirebaseConfig());
    });
    
    app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
      }
    
      try {
        await sendPasswordResetEmail(email);
      } catch (err) {
        if (err.code === 'EMAIL_NOT_FOUND' || /email not found/i.test(err.message || '')) {
          return res.json({
            message: 'If an account exists for this email, a password reset link has been sent.'
          });
        }
        console.warn('Password reset email failed:', err.message);
        return res.status(502).json({
          message: 'Could not send password reset email right now. Please try again later.'
        });
      }
    
      return res.json({
        message: 'If an account exists for this email, a password reset link has been sent.'
      });
    });
    
    app.post('/api/auth/register', authLimiter, async (req, res) => {
      try {
        const { email, password, name, phone, role } = req.body || {};
        if (!email || !password || !name || !phone) {
          return res.status(400).json({ message: 'Email, password, name, and phone are required.' });
        }
    
        if (role === 'Doctor') {
          return res.status(400).json({
            message: 'Doctors must register via /api/register-doctor so the app and website stay in sync.'
          });
        }
    
        const authUser = await createAuthUser({ email, password, displayName: name, phoneNumber: phone });
        const uid = authUser.uid;
    
        const userDoc = await User.create({
          _id: uid,
          uid,
          email,
          phone,
          name,
          role: 'Customer',
          status: 'approved',
          reports: [],
          createdAt: new Date()
        });
    
        await linkAppointmentsToAuthUid({ authUid: uid, phone });
        const auth = await signInWithPassword(email, password);
        const verificationSent = await safeSendEmailVerification(auth, req, 'patient');
    
        res.status(201).json({
          message: verificationSent
            ? 'Account created. A verification link has been sent to your email.'
            : 'Account created. You can log in now.',
          requiresEmailVerification: verificationSent,
          user: userDoc,
          uid
        });
      } catch (err) {
        console.error('Register error:', err.message);
        res.status(400).json({ message: err.message || 'Registration failed' });
      }
    });
    
    app.post('/api/auth/login', authLimiter, async (req, res) => {
      try {
        const { email, password } = req.body || {};
        if (!email || !password) {
          return res.status(400).json({ message: 'Email and password are required.' });
        }
        const auth = await signInWithPassword(email, password);
        const profile = await getUserProfile(auth.localId);
        if (profile?.phone) {
          await linkAppointmentsToAuthUid({ authUid: auth.localId, phone: profile.phone });
        }
        const portalInfo = await resolveAuthPortal(auth.localId);
        const userOut = profile
          ? Object.assign({}, profile, { role: portalInfo.role })
          : { uid: auth.localId, email: auth.email, name: auth.displayName, role: portalInfo.role };
        res.json({
          message: 'Login successful',
          idToken: auth.idToken,
          refreshToken: auth.refreshToken,
          user: userOut,
          portal: portalInfo.portal,
          role: portalInfo.role,
          redirectTo: portalInfo.redirectTo,
          doctor: portalInfo.doctor || null
        });
      } catch (err) {
        res.status(401).json({ message: err.message || 'Invalid email or password' });
      }
    });
    
    app.post('/api/auth/refresh', authLimiter, async (req, res) => {
      try {
        const refreshToken = req.body?.refreshToken || '';
        if (!refreshToken) {
          return res.status(400).json({ message: 'refreshToken is required' });
        }
        const auth = await refreshIdToken(refreshToken);
        const uid = auth.user_id || auth.localId;
        const refreshedToken = auth.id_token || auth.idToken;
        const decoded = await verifyIdToken(refreshedToken);
        const profile = await getUserProfile(uid);
        const portalInfo = await resolveAuthPortal(uid);
        return res.json({
          message: 'Session refreshed',
          idToken: refreshedToken,
          refreshToken: auth.refresh_token || auth.refreshToken || refreshToken,
          user: profile || { uid, email: auth.email },
          portal: portalInfo.portal,
          role: portalInfo.role,
          redirectTo: portalInfo.redirectTo,
          doctor: serializeDoctorSession(portalInfo.doctor)
        });
      } catch (err) {
        return res.status(401).json({ message: err.message || 'Could not refresh session' });
      }
    });
    
    app.post('/api/auth/login-doctor', authLimiter, async (req, res) => {
      try {
        const { email, password } = req.body || {};
    
        if (!email || !password) {
          return res.status(400).json({ message: 'Email and password are required.' });
        }
    
        const auth = await signInWithPassword(email, password);
        const doctor = await findDoctorByUid(auth.localId);
        if (!doctor) {
          return res.status(404).json({ message: 'Doctor profile not found for this account.' });
        }
        if (!isDoctorApproved(doctor)) {
          return res.status(403).json({ message: 'Your registration is pending admin approval.' });
        }
        await updateDoctorPresence(doctor, 'Available');
        const profile = await getUserProfile(auth.localId);
        return res.json({
          message: 'Login successful',
          idToken: auth.idToken,
          refreshToken: auth.refreshToken,
          user: profile,
          doctor,
          portal: 'doctor',
          role: 'Doctor',
          redirectTo: '/doctor1.html'
        });
      } catch (err) {
        res.status(401).json({ message: err.message || 'Invalid email or password' });
      }
    });
  }
};

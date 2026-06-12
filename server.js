const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const pathModule=require('path');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid'); 
const router = express.Router();
const {
  Doctor,
  Payment,
  Prescription,
  Store,
  Order,
  MedicineOrder,
  AccountDeletionRequest,
  ConsultationRequest,
  PrescribedCart,
  WrittenPresc,
  Document,
  User
} = require('./lib/data');
const { connectDatabase, requireDb, isConnected, getProvider } = require('./lib/db');
const {
  syncStoreCatalogFromImages,
  getStoresFromDatabase
} = require('./lib/storeCatalog');
const { getEffectiveStatus, normalizeDbStatus, getScheduleStatus } = require('./lib/doctorAvailability');
const {
  updateDoctorPresence,
  syncDoctorRecordsUpdate,
  findDoctorByName,
  buildPresenceUpdate,
  buildApprovalUpdate,
  isDoctorBusy,
  isDoctorAvailable,
  isDoctorApproved
} = require('./lib/doctorPresence');
const {
  verifyIdToken,
  syncUserFromToken,
  getUserProfile,
  requireFirebaseAuth
} = require('./lib/firebaseAuth');
const { generateVideoRoomId, resolveFileUrl, uploadFile } = require('./lib/firebaseStorage');
const { enrichDoctorPhotos, streamDoctorPhoto } = require('./lib/doctorPhotoUrl');
const { uploadToFirebase, saveDocumentRecord } = require('./lib/uploads');
const {
  getPublicFirebaseConfig,
  signInWithPassword,
  refreshIdToken,
  createAuthUser,
  getAuthUserByEmail,
  updateAuthUserPassword
} = require('./lib/firebaseAuthRest');
const { initFirebase, getAdmin } = require('./lib/firebase');
const {
  applySecurityMiddleware,
  applyFirebaseRouteGuards,
  applyWriteRateLimit,
  globalLimiter,
  authLimiter,
  writeLimiter,
  clientIp
} = require('./lib/security');
const {
  getStoresFromFirebase,
  getStoresSummaryFromFirebase,
  getMedicinesFromFirebase,
  getMedicinesPaginated,
  getMedicinesByIds,
  validateOrderItemsAgainstCatalog,
  getBannersFromFirebase,
  getProductCategoriesFromFirebase,
  warmCatalogCache
} = require('./lib/firebaseCatalog');
const { MOBILE_COLLECTIONS } = require('./lib/mobileSchema');
const { getFirestore } = require('./lib/firebase');
const {
  validateCredentials: validateAdminCredentials,
  issueAdminToken,
  revokeAdminToken,
  requireAdmin
} = require('./lib/adminAuth');
const { generateAgoraToken } = require('./lib/agoraToken');
const {
  listPaymentsForPatient,
  listPaymentsForDoctor,
  listConsultationHistoryForDoctor,
  listConsultationHistoryForPatient,
  listOrdersForPatient,
  listRoomIdsForDoctor,
  normalizePhone
} = require('./lib/paymentLookup');
const {
  getPatientDiagnosisHistoryForDoctor,
  saveConsultationClinicalNotes
} = require('./lib/patientDiagnosisHistory');
const { createPrescriptionStoreOrder } = require('./lib/prescriptionCheckout');
const {
  requirePatientPhoneAccess,
  requireDoctorNameAccess,
  requireConsultationDoctor,
  requireDoctorSession
} = require('./lib/workflowAuth');
const {
  extractDoctorPaymentDetails,
  validatePaymentDetailsInput,
  buildPaymentDetailsPatch,
  parseConsultationFeeInput,
  parseDoctorSelfServiceProfile,
  mergePaymentBodyWithExisting
} = require('./lib/doctorPaymentDetails');
const { findCustomerByPhone, findCustomerByUid, listCustomers, findDoctorByUid, findDoctorById, findDoctorByEmail, listDoctors } = require('./lib/userQueries');
const {
  getPublicKeyId,
  createOrder,
  verifyAndFetchPayment,
  verifyPaymentSignature,
  fetchPayment,
  isRazorpayConfigured,
  verifyCredentials
} = require('./lib/razorpay');
const { getCheckoutDisplayConfig, isMobileUserAgent } = require('./lib/razorpayCheckoutConfig');
const { injectPageSeo } = require('./lib/seoMeta');
const { resolveReportEntries } = require('./lib/reportUrls');
const {
  initRealtime,
  emitDoctorStatus,
  notifyConsultationRequest,
  notifyConsultationEvent,
  buildStatusPayload
} = require('./lib/realtime');
const {
  RINGING_STATUSES,
  normalizeConsultationStatus,
  patientCanJoinVideo,
  buildConsultationStatusFields,
  transitionConsultation,
  formatConsultationResponse
} = require('./lib/consultationWorkflow');
const {
  clearStaleDoctorConsultations,
  hasLiveActiveConsultation,
  autoHealStaleRoomContext
} = require('./lib/consultationSessionCleanup');
const { refundConsultationForRoom } = require('./lib/consultationRefund');
const {
  findActiveAccess,
  grantConsultationAccess,
  listAccessForPatient
} = require('./lib/consultationAccess');
const {
  resolvePatientUid,
  buildWebPaidAppointmentFields,
  buildWebPaidPaymentFields,
  buildActiveCallRecord,
  videoRoomIdForAppointment,
  isValidAgoraChannelName,
  agoraUidForUserId
} = require('./lib/appAppointmentSync');
const { getDoctorPresenceStatus } = require('./lib/doctorAvailability');
const {
  DEFAULT_WORKING_DAYS,
  DEFAULT_WORKING_DAYS_INT,
  parseAvailableTimeToWorkingHours,
  workingDaysToAppFormat
} = require('./lib/doctorSchedule');
const { mirrorDoctorToAuthUid, syncAllDoctorMirrors } = require('./lib/doctorMirror');
const { ensureDoctorPublicId } = require('./lib/doctorPublicId');
const { linkAppointmentsToAuthUid } = require('./lib/patientLinking');
const {
  buildSharedOrderId,
  buildFirestoreOrderPayload
} = require('./lib/webOrderSync');

function getCorsOptions() {
  const raw = String(process.env.SITE_URL || process.env.CORS_ORIGINS || '').trim();
  if (!raw) return {};
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!origins.length) return {};
  return { origin: origins, credentials: true };
}

function assertProductionSecurityConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!process.env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!process.env.FIREBASE_API_KEY && !process.env.FIREBASE_WEB_API_KEY) {
    missing.push('FIREBASE_API_KEY');
  }
  if (missing.length) {
    console.error('Production startup blocked. Missing env:', missing.join(', '));
    process.exit(1);
  }
}

assertProductionSecurityConfig();

// App Setup
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Brand assets — stable URLs for Google favicon / Organization logo crawlers
const PUBLIC_DIR = path.join(__dirname, 'public');
const BRAND_ASSET_ROUTES = [
  ['/favicon.ico', 'favicon.ico', 'image/x-icon'],
  ['/favicon-48.png', 'favicon-48.png', 'image/png'],
  ['/favicon-96.png', 'favicon-96.png', 'image/png'],
  ['/favicon.png', 'favicon.png', 'image/png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png', 'image/png'],
  ['/site.webmanifest', 'site.webmanifest', 'application/manifest+json'],
  ['/logos/logo-square.png', 'logos/logo-square.png', 'image/png']
];
BRAND_ASSET_ROUTES.forEach(([route, file, contentType]) => {
  app.get(route, (req, res) => {
    const filePath = path.join(PUBLIC_DIR, file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.type(contentType);
    res.sendFile(filePath);
  });
});

// Middleware
applySecurityMiddleware(app);
app.use(cors(getCorsOptions()));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(globalLimiter);
applyFirebaseRouteGuards(app);
applyWriteRateLimit(app);

/** Protect admin APIs and sensitive debug/order management */
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/api/admin/login' && req.method === 'POST') return next();
  if (p === '/api/admin/logout' && req.method === 'POST') return next();
  if (p.startsWith('/api/admin/')) return requireAdmin(req, res, next);
  if (p === '/api/doctors/debug') return requireAdmin(req, res, next);
  if ((p === '/api/orders' && req.method === 'GET') ||
      (p.startsWith('/api/orders/') && ['PUT', 'DELETE'].includes(req.method))) {
    return requireAdmin(req, res, next);
  }
  return next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/medicine-assets', express.static(path.join(__dirname, 'medicine', 'medicine'), {
  maxAge: '365d',
  immutable: true,
  etag: true
}));
app.use('/store-images', express.static(path.join(__dirname, 'ayurvedic_store_dataset', 'images'), {
  maxAge: '7d',
  etag: true
}));
app.use('/medicines', express.static(path.join(__dirname, 'public', 'medicines')));

/* E-Library PDF stream — registered early so it is always available */
function isAllowedElibPdfHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return h === 'archive.org' || h.endsWith('.archive.org');
}

app.get('/api/health', async (req, res) => {
  const { verifyFirestoreRead, hasServiceAccount } = require('./lib/firebase');
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
    const { initFirebase } = require('./lib/firebase');
    await initFirebase();
    const db = getFirestore();
    const cols = await db.listCollections();
    const names = cols.map((c) => c.id).sort();
    res.json({ project: process.env.FIREBASE_PROJECT_ID, collections: names });
  } catch (err) {
    res.status(500).json({ message: 'Failed to list collections', error: err.message });
  }
});

async function resolveAuthPortal(uid) {
  const doctor = await findDoctorByUid(uid);
  if (doctor && isDoctorApproved(doctor)) {
    return {
      portal: 'doctor',
      role: 'Doctor',
      redirectTo: '/doctor1.html',
      doctor
    };
  }
  return {
    portal: 'patient',
    role: 'Customer',
    redirectTo: '/patient.html',
    doctor: null
  };
}

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

    res.status(201).json({
      message: 'Account created. You can log in now.',
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
    const profile = await getUserProfile(uid);
    const portalInfo = await resolveAuthPortal(uid);
    return res.json({
      message: 'Session refreshed',
      idToken: auth.id_token || auth.idToken,
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

app.get('/api/banners', async (req, res) => {
  try {
    const banners = await getBannersFromFirebase();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load banners', error: err.message });
  }
});

app.get('/api/medicines/batch', async (req, res) => {
  try {
    const rawIds = req.query.ids;
    if (!rawIds) {
      return res.status(400).json({ message: 'ids query parameter is required' });
    }
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    const result = await getMedicinesByIds(rawIds);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load medicines', error: err.message });
  }
});

app.get('/api/medicines', async (req, res) => {
  try {
    const { page, limit, company, category, q, all } = req.query;
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    if (String(all || '') === '1') {
      const medicines = await getMedicinesFromFirebase();
      return res.json(medicines);
    }
    const result = await getMedicinesPaginated({ page, limit, company, category, q });
    return res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load medicines', error: err.message });
  }
});

app.get('/api/stores/summary', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    const summary = await getStoresSummaryFromFirebase();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching store summary', error: error.message });
  }
});

app.get('/api/product-categories', async (req, res) => {
  try {
    const categories = await getProductCategoriesFromFirebase();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load categories', error: err.message });
  }
});

app.get('/api/elibrary/ping', (req, res) => {
  res.json({ ok: true, service: 'elibrary-stream' });
});

app.get('/api/elibrary/stream', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ message: 'url query parameter is required' });
  }
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ message: 'Invalid url' });
  }
  if (target.protocol !== 'https:' || !isAllowedElibPdfHost(target.hostname)) {
    return res.status(403).json({ message: 'PDF host not permitted' });
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Dheergayush-E-Library/1.0 (educational)' }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ message: 'Could not fetch manuscript PDF' });
    }
    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline; filename="dheergayush-manuscript.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (upstream.body) {
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (err) {
    console.error('E-Library stream error:', err.message);
    res.status(502).json({ message: 'Failed to stream PDF' });
  }
});

/* DB-backed API routes use requireDb middleware after connection bootstrap */

// Ensure uploads folder exists and set up static serving
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer — memory storage, files go to Firebase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
app.get('/dev', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'developer.html'));
  });
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });
/* -------------------------------------------------------------------
   📌 API Routes
--------------------------------------------------------------------*/
app.post('/api/written-prescription/upload', upload.single('file'), async (req, res) => {
    const { roomId } = req.body;
  
    if (!req.file || !roomId) {
      return res.status(400).json({ success: false, error: 'Missing file or roomId' });
    }

    if (!(await assertDoctorBearerToken(req, res))) return;
    if (!(await prescriptionVideoRoomExists(roomId))) {
      return res.status(403).json({ success: false, error: 'Invalid or unknown video room.' });
    }
  
    try {
      const uploaded = await uploadToFirebase(req.file, `prescriptions/${roomId}`);
      const updated = await WrittenPresc.findOneAndUpdate(
        { roomId, appointmentId: roomId },
        {
          filePath: uploaded.downloadUrl,
          downloadUrl: uploaded.downloadUrl,
          fileName: uploaded.fileName,
          category: 'written_prescription',
          uploadedAt: new Date()
        },
        { upsert: true, new: true }
      );
  
      res.json({ success: true, data: updated, url: uploaded.downloadUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Upload failed' });
    }
  });
  app.get('/api/written-prescription/:roomId', async (req, res) => {
    try {
      const presc = await WrittenPresc.findOne({ roomId: req.params.roomId });
      if (!presc) {
        return res.status(404).json({ success: false, message: 'No written prescription found' });
      }
  
      const filePath = presc.filePath || presc.downloadUrl || '';
      const url = await resolveFileUrl(filePath.replace(/\\/g, '/'));
      res.json({ success: true, filePath: url || filePath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Error fetching prescription' });
    }
  });


  app.get('/api/orders', async (req, res) => {
    try {
      if (!isConnected()) {
        return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
      }
      const orders = await Order.find({}).sort({ orderDate: -1 }).exec();
      res.json(orders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      const msg = err.message || String(err);
      const isCred = /ENOENT|GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_SERVICE_ACCOUNT_JSON/i.test(msg);
      res.status(isCred ? 503 : 500).json({
        error: isCred
          ? 'Firebase is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON in Render.'
          : 'Failed to fetch orders',
        message: msg
      });
    }
  });
  app.put('/api/orders/:id/status', async (req, res) => {
    try {
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { orderStatus: req.body.orderStatus },
        { new: true }
      );
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Status update failed' });
    }
  });
  app.delete('/api/orders/:id', async (req, res) => {
    try {
      await Order.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: 'Delete failed' });
    }
  });
  

function doctorRegHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function completeDoctorAuthForExistingEmail(email, password) {
  let authUser;
  try {
    authUser = await getAuthUserByEmail(email);
  } catch (_) {
    throw doctorRegHttpError(409, 'Email already registered. Please login instead.');
  }

  const existingDoctor =
    (await findDoctorByUid(authUser.uid)) || (await findDoctorByEmail(email));
  if (existingDoctor) {
    throw doctorRegHttpError(409, 'A doctor profile already exists for this email. Please log in instead.');
  }

  try {
    await signInWithPassword(email, password);
  } catch (_) {
    throw doctorRegHttpError(
      409,
      'This email is already registered with a different password. Log in or reset your password.'
    );
  }

  const userDoc =
    (await User.findById(authUser.uid)) ||
    (await User.findOne({ email })) ||
    (await User.findOne({ uid: authUser.uid }));

  const role = String(userDoc?.role || '').trim().toLowerCase();
  if (userDoc && role === 'customer') {
    throw doctorRegHttpError(
      409,
      'This email is registered as a patient account. Use a different email for doctor registration.'
    );
  }

  return authUser.uid;
}

async function ensureDoctorAuthAccount({ email, password, name }) {
  const existingDoctor = await findDoctorByEmail(email);
  if (existingDoctor) {
    throw doctorRegHttpError(409, 'A doctor profile already exists for this email. Please log in instead.');
  }

  try {
    const authUser = await createAuthUser({ email, password, displayName: name });
    return authUser.uid;
  } catch (authErr) {
    if (authErr.code === 'auth/email-already-exists') {
      return completeDoctorAuthForExistingEmail(email, password);
    }
    throw authErr;
  }
}

async function upsertDoctorUserStub(uid, { email, name }) {
  const existing =
    (await User.findById(uid)) ||
    (await User.findOne({ email })) ||
    (await User.findOne({ uid }));

  const payload = { uid, email, name, role: 'Doctor', status: 'pending' };

  if (existing) {
    await User.findByIdAndUpdate(existing._id || existing.id || uid, { $set: payload });
    return;
  }

  await User.create({ _id: uid, ...payload, createdAt: new Date() });
}

// 👨‍⚕️ Register Doctor
app.post('/api/register-doctor', upload.fields([
    { name: 'documents', maxCount: 5 },
    { name: 'photo', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            name,
            specialization,
            license,
            location,
            availableTime,
            fee,
            bio,
            experience,
            email,
            password,
            degree,
        } = req.body;

        let languages = req.body.languages;
        if (languages && !Array.isArray(languages)) {
            languages = [languages];
        } else if (!languages) {
            languages = [];
        }

        const docFiles = (req.files && req.files.documents) ? req.files.documents : [];
        const photoFile = (req.files && req.files.photo && req.files.photo[0]) ? req.files.photo[0] : null;

        const trimmedName = String(name || '').trim();
        const trimmedSpec = String(specialization || '').trim();
        const trimmedLicense = String(license || '').trim();
        const trimmedLocation = String(location || '').trim();
        const trimmedTime = String(availableTime || '').trim();
        const trimmedBio = String(bio || '').trim();
        const trimmedEmail = String(email || '').trim().toLowerCase();
        const feeNum = parseFloat(fee);
        const expNum = parseInt(experience, 10);

        const missing = [];
        if (!trimmedName) missing.push('full name');
        if (!trimmedSpec) missing.push('specialization');
        if (!trimmedLicense) missing.push('doctor license ID');
        if (!trimmedLocation) missing.push('location');
        if (!trimmedTime || trimmedTime.includes('Select a time')) missing.push('consultation time slot');
        if (!languages.length) missing.push('at least one language');
        if (!docFiles.length) missing.push('at least one document (PDF/JPG/PNG)');
        if (!photoFile) missing.push('profile photo');
        if (!trimmedBio) missing.push('bio');
        if (Number.isNaN(feeNum) || feeNum < 0) missing.push('valid consultation fee');
        if (Number.isNaN(expNum) || expNum < 0) missing.push('years of experience');
        if (!trimmedEmail) missing.push('email');
        if (!password) missing.push('password');

        const paymentCheck = validatePaymentDetailsInput(req.body);
        if (!paymentCheck.ok) {
            return res.status(400).json({ message: paymentCheck.error });
        }

        if (missing.length) {
            return res.status(400).json({
                message: `Please complete: ${missing.join(', ')}.`
            });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            return res.status(400).json({ message: 'Valid email is required for app sync.' });
        }

        const licenseTaken = await Doctor.findOne({ license: trimmedLicense })
            || await Doctor.findOne({ doctorId: trimmedLicense });
        if (licenseTaken) {
            return res.status(409).json({ message: 'Doctor with this license already exists.' });
        }

        let uid;
        let authEmail = trimmedEmail;

        try {
            uid = await ensureDoctorAuthAccount({
                email: trimmedEmail,
                password,
                name: trimmedName
            });
            await initFirebase();
            // Doctors live in `doctors` only — no `users` stub (avoids app role conflicts).
        } catch (authErr) {
            if (authErr.status) {
                return res.status(authErr.status).json({ message: authErr.message });
            }
            const code = authErr.code || '';
            if (code === 'auth/weak-password') {
                return res.status(400).json({ message: 'Password must be at least 6 characters.' });
            }
            if (code === 'auth/invalid-email') {
                return res.status(400).json({ message: 'Invalid email address.' });
            }
            throw authErr;
        }

        const storagePrefix = `Doctor/${uid}`;
        const docUploads = await Promise.all(
            docFiles.map((file, i) => uploadToFirebase(file, `${storagePrefix}/doc_${i}`))
        );
        const documents = docUploads.map((u) => u.downloadUrl);

        let photoUp;
        try {
            photoUp = await uploadFile(photoFile.buffer, `${storagePrefix}/profile.jpg`, {
                contentType: photoFile.mimetype
            });
        } catch (uploadErr) {
            console.warn('Fixed-path profile upload failed, using fallback:', uploadErr.message);
            photoUp = await uploadToFirebase(photoFile, `${storagePrefix}/profile`);
        }
        const photo = photoUp.downloadUrl;
        const videoRoomId = generateVideoRoomId();

        const paymentPatchResult = buildPaymentDetailsPatch(req.body, null);
        if (!paymentPatchResult.ok) {
            return res.status(400).json({ message: paymentPatchResult.error });
        }

        const doctorPayload = {
            name: trimmedName,
            specialization: trimmedSpec,
            specializations: [trimmedSpec],
            license: trimmedLicense,
            doctorId: trimmedLicense,
            location: trimmedLocation,
            availableTime: trimmedTime,
            slotTime: trimmedTime,
            documents,
            photo,
            profileUrl: photo,
            aadharUrl: documents[0] || '',
            degreeCertificateUrl: documents[1] || '',
            degree: String(degree || '').trim() || trimmedSpec,
            email: authEmail,
            fee: feeNum,
            bio: trimmedBio,
            about: trimmedBio,
            experience: expNum,
            languages,
            language: languages,
            videoRoomId,
            uid,
            role: 'Doctor',
            ...paymentPatchResult.patch,
            ...require('./lib/doctorFields').buildApprovalFirestorePatch('pending'),
            ...require('./lib/doctorFields').buildWorkingFirestorePatch('offline'),
            workingHours: parseAvailableTimeToWorkingHours(trimmedTime),
            workingDays: workingDaysToAppFormat(DEFAULT_WORKING_DAYS_INT)
        };

        const doctor = new Doctor(doctorPayload);

        await doctor.save();
        await mirrorDoctorToAuthUid(doctor);

        res.status(201).json({
            message: 'Doctor registration submitted successfully. Pending admin approval.',
            doctorId: doctor._id,
            videoRoomId: doctor.videoRoomId
        });
    } catch (err) {
        console.error('❌ Error registering doctor:', err);
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Doctor with this license already exists.' });
        }
        res.status(500).json({
            message: err.message || 'Failed to register doctor. Please try again.',
            error: err.message
        });
    }
});

function enrichDoctorRow(d) {
    const { enrichDoctorApiFields } = require('./lib/doctorFields');
    const row = enrichDoctorApiFields(d);
    const payment = extractDoctorPaymentDetails(row);
    const fee = row.fee != null ? row.fee : row.consultationFee;
    return {
        ...row,
        fee,
        consultationFee: fee,
        paymentDetails: payment,
        upiId: payment.upiId || row.upiId || '',
        bankName: payment.bankName || row.bankName || '',
        accountNumber: payment.accountNumber || row.accountNumber || '',
        ifscCode: payment.ifsc || row.ifscCode || row.ifsc || '',
        accountHolderName: payment.accountHolderName || row.accountHolderName || '',
        paymentMethod: payment.paymentMethod || row.paymentMethod || ''
    };
}

function serializeDoctorSession(doctor) {
    if (!doctor) return null;
    const row = enrichDoctorRow(doctor);
    return {
        uid: row.uid || row._id || row.id || '',
        name: String(row.name || row.displayName || '').trim(),
        email: row.email || '',
        doctorId: row.doctorId || row.license || row.licenseId || '',
        license: row.license || row.licenseId || row.doctorId || '',
        specialization: row.specialization ||
            (Array.isArray(row.specializations) ? row.specializations[0] : '') ||
            row.speciality || '',
        working: row.working,
        presenceStatus: row.presenceStatus,
        effectiveStatus: row.effectiveStatus
    };
}

app.get('/api/doctor/profile', requireDoctorSession(), async (req, res) => {
    try {
        const id = req.doctor._id || req.doctor.id;
        const fresh = id ? await Doctor.findById(id) : req.doctor;
        if (!fresh) {
            return res.status(404).json({ message: 'Doctor profile not found.' });
        }
        const rows = await enrichDoctorPhotos([enrichDoctorRow(fresh)]);
        return res.json({ doctor: rows[0] || enrichDoctorRow(fresh) });
    } catch (err) {
        console.error('GET /api/doctor/profile failed:', err);
        return res.status(500).json({ message: 'Failed to load profile.', error: err.message });
    }
});

app.put(
    '/api/doctor/profile',
    requireDoctorSession(),
    upload.fields([
        { name: 'documents', maxCount: 5 },
        { name: 'photo', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const id = req.doctor._id || req.doctor.id;
            let doctor = id ? await Doctor.findById(id) : req.doctor;
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor profile not found.' });
            }

            const profile = parseDoctorSelfServiceProfile(req.body);
            const feeCheck = parseConsultationFeeInput(req.body);
            if (!feeCheck.ok) {
                return res.status(400).json({ message: feeCheck.error });
            }
            const trimmedTime = String(profile.availableTime || profile.slotTime || '').trim();
            if (trimmedTime && !trimmedTime.includes('Select a time')) {
                profile.availableTime = trimmedTime;
                profile.slotTime = trimmedTime;
                profile.workingHours = parseAvailableTimeToWorkingHours(trimmedTime);
            }

            if (profile.specialization) {
                profile.specializations = [String(profile.specialization).trim()];
            }

            const paymentBody = mergePaymentBodyWithExisting(req.body, doctor);
            const paymentPatchResult = buildPaymentDetailsPatch(paymentBody, doctor);
            if (!paymentPatchResult.ok) {
                return res.status(400).json({ message: paymentPatchResult.error });
            }

            const docFiles = (req.files && req.files.documents) ? req.files.documents : [];
            const photoFile = (req.files && req.files.photo && req.files.photo[0]) ? req.files.photo[0] : null;
            const uid = String(doctor.uid || req.firebaseUid || id || '').trim();
            const storagePrefix = uid ? `Doctor/${uid}` : `Doctor/${id}`;

            if (docFiles.length) {
                const docUploads = await Promise.all(
                    docFiles.map((file, i) => uploadToFirebase(file, `${storagePrefix}/doc_${Date.now()}_${i}`))
                );
                const newDocs = docUploads.map((u) => u.downloadUrl);
                const existing = Array.isArray(doctor.documents) ? doctor.documents : [];
                profile.documents = [...existing, ...newDocs];
            }

            if (photoFile) {
                let photoUp;
                try {
                    photoUp = await uploadFile(photoFile.buffer, `${storagePrefix}/profile.jpg`, {
                        contentType: photoFile.mimetype
                    });
                } catch (uploadErr) {
                    console.warn('Profile photo upload fallback:', uploadErr.message);
                    photoUp = await uploadToFirebase(photoFile, `${storagePrefix}/profile`);
                }
                profile.photo = photoUp.downloadUrl;
                profile.profileUrl = photoUp.downloadUrl;
            }

            const updates = {
                ...profile,
                ...paymentPatchResult.patch,
                updatedAt: new Date()
            };

            doctor = await syncDoctorRecordsUpdate(doctor, updates);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor profile not found.' });
            }

            const rows = await enrichDoctorPhotos([enrichDoctorRow(doctor)]);
            return res.json({
                message: 'Profile updated successfully.',
                doctor: rows[0] || enrichDoctorRow(doctor)
            });
        } catch (err) {
            console.error('PUT /api/doctor/profile failed:', err);
            return res.status(500).json({ message: 'Failed to update profile.', error: err.message });
        }
    }
);

app.put('/api/doctor/consultation-fee', requireDoctorSession(), async (req, res) => {
    try {
        const feeCheck = parseConsultationFeeInput(req.body);
        if (!feeCheck.ok) {
            return res.status(400).json({ message: feeCheck.error });
        }
        if (feeCheck.skipped) {
            return res.status(400).json({ message: 'Consultation fee is required.' });
        }

        let doctor = req.doctor;
        const id = doctor?._id || doctor?.id;
        if (id) {
            doctor = (await Doctor.findById(id)) || doctor;
        }
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor profile not found.' });
        }

        const updates = {
            fee: feeCheck.fee,
            consultationFee: feeCheck.fee,
            updatedAt: new Date()
        };
        doctor = await syncDoctorRecordsUpdate(doctor, updates);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor profile not found.' });
        }

        const rows = await enrichDoctorPhotos([enrichDoctorRow(doctor)]);
        return res.json({
            message: 'Consultation fee updated.',
            fee: feeCheck.fee,
            consultationFee: feeCheck.fee,
            doctor: rows[0] || enrichDoctorRow(doctor)
        });
    } catch (err) {
        console.error('PUT /api/doctor/consultation-fee failed:', err);
        return res.status(500).json({ message: 'Failed to update consultation fee.', error: err.message });
    }
});

async function enrichDoctorRows(doctors) {
    const rows = (Array.isArray(doctors) ? doctors : []).map(enrichDoctorRow);
    return enrichDoctorPhotos(rows);
}

// 🖼️ Doctor profile photo — streams from Firebase Storage (avoids expired download URLs)
app.get('/api/media/doctor-photo/:uid', async (req, res) => {
    try {
        const uid = String(req.params.uid || '').trim();
        if (!uid) return res.status(400).end();
        const hint = typeof req.query.url === 'string' ? req.query.url : '';
        const result = await streamDoctorPhoto(uid, hint);
        if (!result) return res.status(404).end();
        res.setHeader('Content-Type', result.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        result.stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
        });
        result.stream.pipe(res);
    } catch (err) {
        console.error('doctor-photo stream failed:', err.message);
        if (!res.headersSent) res.status(500).end();
    }
});

// 👨‍⚕️ Get All Doctors (appointment listing — approved clinical doctors only)
app.get('/api/doctors', async (req, res) => {
    try {
        const { bookableOnly } = req.query;
        const doctors = await listDoctors({ _webRegstatus: 'approved', _publicOnly: true }).sort({ name: 1 });
        let result = await enrichDoctorRows(doctors);

        if (bookableOnly === '1' || bookableOnly === 'true') {
            result = result.filter((d) => d.bookable);
        }

        result.sort((a, b) => {
            if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        res.status(200).json(result);
    } catch (err) {
        console.error('❌ Error fetching doctors:', err);
        res.status(500).json({ message: 'Failed to fetch doctors', error: err.message });
    }
});

// 👨‍⚕️ Admin: Get All Doctors (including pending and rejected)
app.get('/api/admin/doctors/all', async (req, res) => {
    try {
        const doctors = await listDoctors().sort({ createdAt: -1 });
        res.json(doctors);
    } catch (error) {
        console.error('Error fetching all doctors:', error);
        res.status(500).json({ message: 'Error fetching doctors', error: error.message });
    }
});

// 👨‍⚕️ Admin: one-time verify/reject at registration (locked after approved)
app.put('/api/admin/doctors/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { validateApprovalTransition } = require('./lib/doctorFields');

        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be pending, approved, or rejected.' });
        }

        const existing = await findDoctorById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        const check = validateApprovalTransition(existing, status);
        if (!check.ok) {
            return res.status(403).json({ message: check.error });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            id,
            buildApprovalUpdate(status),
            { new: true }
        );

        if (status === 'approved') {
            await ensureDoctorPublicId(doctor);
            await mirrorDoctorToAuthUid(doctor);
        }

        res.json({
            message: `Doctor ${status} successfully`,
            doctor: {
                id: doctor._id,
                name: doctor.name,
                Regstatus: doctor.Regstatus
            }
        });
    } catch (error) {
        console.error('Error updating doctor status:', error);
        res.status(500).json({ message: 'Error updating doctor status', error: error.message });
    }
});

// 🧑‍⚕️ Get All Doctors (No changes needed here, it will automatically fetch new fields)
// REMOVED: Duplicate route - using the updated version above that filters by approved status

// Legacy alias — prefer POST /api/auth/login
app.post('/api/login-patient', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const auth = await signInWithPassword(email, password);
        const profile = await getUserProfile(auth.localId);
        if (profile && profile.role && profile.role !== 'Customer') {
            return res.status(403).json({ message: 'This account is not a patient account.' });
        }
        return res.status(200).json({
            message: 'Patient logged in successfully.',
            idToken: auth.idToken,
            refreshToken: auth.refreshToken,
            patientId: profile?.name || email.split('@')[0],
            phone: profile?.phone || '',
            user: profile || { uid: auth.localId, email: auth.email, name: auth.displayName }
        });
    } catch (err) {
        console.error('❌ Patient login error:', err.message);
        res.status(401).json({ message: err.message || 'Invalid email or password.' });
    }
});
async function assertDoctorBearerToken(req, res) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) {
    res.status(401).json({ message: 'Firebase ID token required. Log in at /doctor.html first.' });
    return false;
  }
  try {
    await verifyIdToken(bearer);
    return true;
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired Firebase token.', error: err.message });
    return false;
  }
}

function normalizeVideoRoomId(roomId) {
  try {
    return decodeURIComponent(String(roomId || '').trim());
  } catch (_) {
    return String(roomId || '').trim();
  }
}

async function findPrescriptionForRoom(roomId) {
  const room = normalizeVideoRoomId(roomId);
  if (!room) return null;

  let prescription = await PrescribedCart.findOne({ roomId: room }).sort({ prescribedAt: -1 });
  if (prescription) return prescription;

  const roomLower = room.toLowerCase();
  const all = await PrescribedCart.find({}).sort({ prescribedAt: -1 });
  return all.find((p) => {
    const stored = normalizeVideoRoomId(p.roomId);
    return stored === room || stored.toLowerCase() === roomLower;
  }) || null;
}

async function prescriptionVideoRoomExists(roomId) {
  const room = normalizeVideoRoomId(roomId);
  if (!room) return false;
  const ctx = await loadRoomContext(room);
  if (ctx) return true;
  const prescription = await findPrescriptionForRoom(room);
  return !!prescription;
}

async function enrichPrescribedCartItems(cartItems = []) {
  const medicineIds = cartItems
    .map((item) => String(item.medicineId || item.id || '').trim())
    .filter(Boolean);
  let catalogById = new Map();
  if (medicineIds.length) {
    const catalog = await getMedicinesByIds(medicineIds);
    (catalog.items || []).forEach((med) => {
      const key = String(med._id || med.id || '').trim();
      if (key) catalogById.set(key, med);
    });
  }

  return cartItems.map((item) => {
    const medicineId = String(item.medicineId || item.id || '').trim();
    const catalogMed = catalogById.get(medicineId);
    const selectedWeight = item.selectedWeight || {
      value: item.weightValue,
      unit: item.weightUnit
    };
    const weightMatch = catalogMed && Array.isArray(catalogMed.weights)
      ? catalogMed.weights.find((w) =>
          String(w.value) === String(selectedWeight.value) &&
          String(w.unit || '') === String(selectedWeight.unit || '')
        )
      : null;
    const unitPrice = item.pricePerUnit || item.price || weightMatch?.price || 0;
    const quantity = item.quantity || 1;
    const imageUrl = item.imageUrl || catalogMed?.imageUrl ||
      (catalogMed?.imageFile ? `/medicine-assets/${encodeURIComponent(catalogMed.imageFile)}` : null);
    return {
      medicineId,
      storeId: item.storeId,
      name: item.name,
      description: item.description || catalogMed?.description || '',
      imageUrl,
      storeName: item.storeName || catalogMed?.storeName || catalogMed?.company || '',
      category: item.category || catalogMed?.category || '',
      selectedWeight,
      pricePerUnit: unitPrice,
      quantity,
      totalPrice: item.totalPrice || unitPrice * quantity
    };
  });
}

app.post('/api/prescribe-cart', async (req, res) => {
  try {
    const { roomId, cartItems } = req.body;

    if (!roomId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: 'Room ID and cart items are required.' });
    }

    if (!(await assertDoctorBearerToken(req, res))) return;
    if (!(await prescriptionVideoRoomExists(roomId))) {
      return res.status(403).json({ message: 'Invalid or unknown video room.' });
    }

    const normalizedRoomId = normalizeVideoRoomId(roomId);
    const enrichedItems = await enrichPrescribedCartItems(cartItems);
    const prescribedAt = new Date();
    const existing = await findPrescriptionForRoom(normalizedRoomId);

    let saved;
    if (existing?._id) {
      saved = await PrescribedCart.findByIdAndUpdate(existing._id, {
        $set: { cartItems: enrichedItems, prescribedAt, roomId: normalizedRoomId }
      });
    } else {
      saved = await PrescribedCart.create({
        roomId: normalizedRoomId,
        cartItems: enrichedItems,
        prescribedAt
      });
    }

    res.status(200).json({
      message: 'Prescription saved successfully!',
      prescribedAt: saved?.prescribedAt || prescribedAt,
      itemCount: enrichedItems.length
    });

  } catch (error) {
    console.error('Error saving prescribed cart items:', error);
    res.status(500).json({ message: 'Failed to save prescribed cart items.', error: error.message });
  }
});

app.get('/api/get-prescription/:roomId', async (req, res) => {
  try {
    const roomId = normalizeVideoRoomId(req.params.roomId);

    if (!(await prescriptionVideoRoomExists(roomId))) {
      return res.status(403).json({ message: 'Invalid or unknown video room.' });
    }

    const prescription = await findPrescriptionForRoom(roomId);

    if (!prescription) {
      return res.status(404).json({ message: 'No prescription found for this room.' });
    }

    const enrichedItems = await enrichPrescribedCartItems(
      Array.isArray(prescription.cartItems) ? prescription.cartItems : []
    );

    const payload = typeof prescription.toObject === 'function'
      ? prescription.toObject()
      : Object.assign({}, prescription);
    res.json(Object.assign({}, payload, {
      cartItems: enrichedItems,
      prescribedAt: prescription.prescribedAt || prescription.createdAt || null
    }));
  } catch (err) {
    res.status(500).json({ message: 'Error fetching prescription.', error: err.message });
  }
});
async function handleSubmitPrescription(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = await verifyIdToken(authHeader.slice(7).trim());
        req.firebaseUid = decoded.uid;
      } catch (_) { /* guest prescription checkout */ }
    }

    const payload = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const {
      name,
      address,
      phone,
      items,
      total,
      roomID,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature
    } = payload;

    if (!phone || !items || !total || !roomID) {
      return res.status(400).json({ success: false, message: 'Missing phone, items, total, or roomID' });
    }

    if (!(await prescriptionVideoRoomExists(roomID))) {
      return res.status(403).json({ success: false, message: 'Invalid or unknown video room.' });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay payment is required for prescription checkout.'
      });
    }

    await verifyAndFetchPayment({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature
    });

    const prescription = new Prescription({
      roomID,
      phone,
      name: name || '',
      address: address || '',
      items,
      total,
      paymentProof: razorpayPaymentId,
      paymentMethod: 'razorpay',
      razorpayOrderId,
      razorpayPaymentId,
      status: 'not-delivered'
    });

    await prescription.save();

    let storeOrderId = null;
    try {
      const storeOrder = await createPrescriptionStoreOrder({
        customerName: name || 'Patient',
        customerPhone: phone,
        deliveryAddress: address || '',
        items,
        total,
        roomID,
        prescriptionId: prescription._id,
        razorpayPaymentId,
        razorpayOrderId,
        userId: req.firebaseUid || null
      });
      storeOrderId = storeOrder.orderId;
      prescription.orderId = storeOrderId;
      await prescription.save();
    } catch (orderErr) {
      console.warn('Prescription store order sync failed:', orderErr.message);
    }

    res.json({
      success: true,
      prescriptionId: prescription._id,
      orderId: storeOrderId
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
  }
}

app.post('/api/submit-prescription', handleSubmitPrescription);

// 👨‍⚕️ Doctor Login — Firebase token only (passwordless ID login removed)
app.post('/api/doctor-login', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'Firebase idToken is required. Use email and password to sign in.' });
    }

    try {
        const decoded = await verifyIdToken(idToken);
        const doctor = await findDoctorByUid(decoded.uid);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor profile not found for this account.' });
        }
        if (!isDoctorApproved(doctor)) {
            return res.status(403).json({ message: 'Your registration is pending approval. Please contact admin.' });
        }
        const loginPresence = getDoctorPresenceStatus(doctor);
        if (loginPresence !== 'Busy') {
            await updateDoctorPresence(doctor, 'Available');
        }
        return res.status(200).json({
            message: 'Login successful!',
            doctor: {
                name: doctor.name,
                specialization: doctor.specialization || doctor.specializations?.[0],
                license: doctor.license || doctor.doctorId,
                doctorId: doctor.doctorId || doctor.license,
                uid: doctor.uid,
                status: 'Available'
            }
        });
    } catch (error) {
        console.error('❌ Firebase doctor login error:', error);
        return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
    }
});

/** Public Razorpay key for Checkout.js */
app.get('/api/payments/razorpay/config', (req, res) => {
  const keyId = getPublicKeyId();
  if (!keyId) {
    return res.status(503).json({ message: 'Razorpay is not configured on the server.' });
  }
  res.json({ keyId, key_id: keyId, currency: 'INR' });
});

/**
 * Razorpay Standard Checkout — Step 1: Create order
 * POST /api/create-order  { amount (paise), currency?, receipt? }
 */
app.post('/api/create-order', authLimiter, async (req, res) => {
  try {
    const amount = parseInt(req.body?.amount ?? req.body?.amountInPaise, 10);
    const currency = String(req.body?.currency || 'INR').toUpperCase();
    const receipt = String(req.body?.receipt || `rcpt_${Date.now()}`).slice(0, 40);

    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({
        message: 'Invalid amount. Minimum is 100 paise (INR 1.00).'
      });
    }

    const order = await createOrder({
      amountInPaise: amount,
      currency,
      receipt,
      notes: req.body?.notes || {}
    });

    res.json({
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key_id: order.keyId,
      checkout_config: getCheckoutDisplayConfig({
        isMobile: isMobileUserAgent(req.headers['user-agent'])
      })
    });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    console.error('create-order error:', err.message);
    res.status(status).json({
      message: err.message || 'Unable to create Razorpay order'
    });
  }
});

/**
 * Razorpay Standard Checkout — Step 3: Verify payment signature
 * POST /api/verify-payment
 */
app.post('/api/verify-payment', authLimiter, async (req, res) => {
  try {
    const orderId = req.body?.razorpay_order_id || req.body?.order_id;
    const paymentId = req.body?.razorpay_payment_id || req.body?.payment_id;
    const signature = req.body?.razorpay_signature || req.body?.signature;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.'
      });
    }

    verifyPaymentSignature({ orderId, paymentId, signature });

    let paymentMethod = 'razorpay';
    let paymentDetails = {};
    try {
      const payment = await fetchPayment(paymentId);
      if (payment && payment.order_id === orderId) {
        paymentMethod = payment.method || paymentMethod;
        paymentDetails = {
          method: payment.method || null,
          vpa: payment.vpa || null,
          wallet: payment.wallet || null,
          bank: payment.bank || null,
          card_id: payment.card_id || null
        };
      }
    } catch (fetchErr) {
      console.warn('verify-payment: could not fetch payment method:', fetchErr.message);
    }

    res.json({
      success: true,
      message: 'Payment signature verified',
      order_id: orderId,
      payment_id: paymentId,
      payment_method: paymentMethod,
      payment_details: paymentDetails
    });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      message: err.message || 'Signature verification failed'
    });
  }
});

app.post('/api/payments/razorpay/create-order', authLimiter, requireFirebaseAuth(), async (req, res) => {
  try {
    const amountInPaise = parseInt(req.body?.amountInPaise, 10);
    if (!amountInPaise || amountInPaise < 100) {
      return res.status(400).json({ message: 'Invalid payment amount.' });
    }
    const order = await createOrder({
      amountInPaise,
      receipt: req.body?.receipt || `web_${Date.now()}`,
      notes: {
        serviceType: 'consultation',
        uid: req.firebaseUid,
        doctorName: String(req.body?.doctorName || '').slice(0, 64)
      }
    });
    res.json({
      success: true,
      order_id: order.orderId,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key_id: order.keyId,
      keyId: order.keyId,
      checkout_config: getCheckoutDisplayConfig({
        isMobile: isMobileUserAgent(req.headers['user-agent'])
      })
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Could not create order' });
  }
});

async function completeWebsiteConsultationCheckout({
  firebaseUid,
  name,
  phone,
  address,
  selectedDoctorName,
  selectedDoctorFee,
  amountNum,
  doctorAvailableTime,
  patientSymptoms,
  reportFiles,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
}) {
  const doctor = await findDoctorByName(selectedDoctorName);
  if (!doctor) {
    throw Object.assign(new Error('Doctor not found.'), { status: 404 });
  }
  if (!isDoctorApproved(doctor)) {
    throw Object.assign(new Error('This doctor is not approved for consultations yet.'), { status: 403 });
  }
  await clearStaleDoctorConsultations(selectedDoctorName);
  const doctorStillBusy = await hasLiveActiveConsultation(selectedDoctorName);
  if (doctorStillBusy || isDoctorBusy(doctor)) {
    throw Object.assign(
      new Error(
        'Doctor appears to be in another consultation. Ask them to end active sessions from their dashboard, or try again in a minute.'
      ),
      { status: 409 }
    );
  }

  const patientUid = await resolvePatientUid({
    phone,
    firebaseUid,
    name,
    email: ''
  });

  const doctorFee = parseFloat(
    String(doctor.consultationFee ?? doctor.fee ?? selectedDoctorFee ?? '').replace(/[^\d.]/g, '')
  ) || 0;
  const activeAccess = await findActiveAccess({
    patientUid,
    patientPhone: phone,
    doctorName: selectedDoctorName
  });

  let effectiveAmount = amountNum;
  let isFollowUp = false;
  if (activeAccess && effectiveAmount > 0) {
    effectiveAmount = 0;
    isFollowUp = true;
  }
  if (effectiveAmount <= 0 && doctorFee > 0) {
    if (!activeAccess) {
      throw Object.assign(
        new Error('No active 15-day consultation plan for this doctor. Please pay the consultation fee first.'),
        { status: 402 }
      );
    }
    isFollowUp = true;
  }

  if (effectiveAmount > 0) {
    const razorpayPayment = await verifyAndFetchPayment({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature
    });
    const paidPaise = razorpayPayment.amount;
    const expectedPaise = Math.round(effectiveAmount * 100);
    if (paidPaise !== expectedPaise) {
      throw Object.assign(new Error('Paid amount does not match consultation fee.'), { status: 402 });
    }
  }

  const patientFolder = `medical_reports/${phone}/consultation`;
  const reportUploads = await Promise.all(
    (reportFiles || []).map((file) => uploadToFirebase(file, patientFolder))
  );
  const reportUrls = reportUploads.map((u) => u.downloadUrl);

  for (const up of reportUploads) {
    await saveDocumentRecord({
      Document,
      fileName: up.fileName,
      downloadUrl: up.downloadUrl,
      patientId: phone,
      userId: phone,
      doctorId: doctor.uid || doctor._id,
      category: 'medical_report',
      uploadedByRole: 'patient'
    });
  }

  const feeNum = parseFloat(String(selectedDoctorFee ?? '').replace(/[^\d.]/g, ''));
  const symptomsText = String(patientSymptoms || '').trim().slice(0, 2000);

  const payment = new Payment({
    name,
    phone,
    patientName: name,
    patientPhone: phone,
    address,
    selectedDoctorName,
    doctorName: selectedDoctorName,
    doctorId: doctor.uid || doctor._id,
    selectedDoctorFee: Number.isNaN(feeNum) ? String(selectedDoctorFee) : feeNum,
    amount: effectiveAmount,
    reports: reportUrls,
    patientSymptoms: symptomsText,
    doctorAvailableTime: doctorAvailableTime || doctor.availableTime || doctor.slotTime || '',
    consultationStatus: 'ringing',
    status: 'completed',
    paymentStatus: effectiveAmount > 0 ? 'completed' : 'included',
    paymentMethod: effectiveAmount > 0 ? 'razorpay' : 'follow_up',
    razorpayOrderId: effectiveAmount > 0 ? razorpayOrderId : '',
    razorpayPaymentId: effectiveAmount > 0 ? razorpayPaymentId : '',
    transactionId: effectiveAmount > 0 ? razorpayPaymentId : '',
    serviceType: 'consultation',
    source: 'website',
    isFollowUp,
    accessPlanActive: !!activeAccess,
    createdAt: new Date()
  });

  const savedPayment = await payment.save();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const doctorUid = String(doctor.uid || doctor._id || '');
  const consultation = await ConsultationRequest.create({
    paymentId: savedPayment._id,
    patientName: name,
    patientPhone: phone,
    doctorName: selectedDoctorName,
    doctorId: doctorUid,
    amount: effectiveAmount,
    patientSymptoms: symptomsText,
    doctorAvailableTime: doctorAvailableTime || doctor.availableTime || doctor.slotTime || '',
    expiresAt,
    source: 'website',
    isFollowUp,
    createdAt: new Date(),
    ...buildConsultationStatusFields('ringing')
  });

  if (effectiveAmount > 0) {
    await grantConsultationAccess({
      patientUid,
      patientPhone: phone,
      patientName: name,
      doctorName: selectedDoctorName,
      sourcePaymentId: savedPayment._id,
      amount: effectiveAmount
    });
  }

  const appointmentId = consultation._id || consultation.id;
  const videoRoomId = videoRoomIdForAppointment(appointmentId);
  const appAppointmentFields = buildWebPaidAppointmentFields({
    appointmentId,
    patientId: patientUid,
    patientName: name,
    patientPhone: phone,
    doctorId: doctorUid,
    doctorName: selectedDoctorName,
    amount: effectiveAmount,
    paymentId: savedPayment._id,
    doctorAvailableTime: doctorAvailableTime || doctor.availableTime || doctor.slotTime || ''
  });
  const appPaymentFields = buildWebPaidPaymentFields({
    appointmentId,
    patientId: patientUid,
    doctorId: doctorUid,
    doctorName: selectedDoctorName,
    patientName: name,
    patientPhone: phone,
    amount: effectiveAmount,
    paymentId: savedPayment._id,
    videoRoomId
  });

  await ConsultationRequest.findByIdAndUpdate(appointmentId, {
    $set: { ...appAppointmentFields, ...buildConsultationStatusFields('ringing', appointmentId) }
  });
  await Payment.findByIdAndUpdate(savedPayment._id, {
    $set: {
      consultationId: appointmentId,
      appointmentId,
      roomName: videoRoomId,
      videoRoomId,
      ...appPaymentFields
    }
  });

  setTimeout(async () => {
    try {
      const c = await ConsultationRequest.findById(consultation._id);
      if (c && RINGING_STATUSES.includes(String(c.status || c.consultationStatus || '').toLowerCase())) {
        await ConsultationRequest.findByIdAndUpdate(c._id || c.id, {
          $set: buildConsultationStatusFields('timeout', c._id || c.id)
        });
        await Payment.findByIdAndUpdate(savedPayment._id, { consultationStatus: 'timeout' });
        const d = await findDoctorByName(selectedDoctorName);
        if (d && isDoctorBusy(d)) {
          await updateDoctorPresence(d, 'Available');
          const payload = await buildStatusPayload(d);
          if (payload) emitDoctorStatus(d.name, payload);
        }
        const timeoutRefund = effectiveAmount > 0
          ? await refundConsultationForRoom(videoRoomId, 'doctor_timeout').catch((e) => ({
              ok: false,
              message: e.message
            }))
          : { ok: true, refunded: false, message: 'Consultation request timed out.' };
        notifyConsultationEvent(String(consultation._id), 'consultation:timeout', {
          consultationId: String(consultation._id),
          message: timeoutRefund.message || 'Consultation request timed out.',
          refunded: !!timeoutRefund.refunded,
          amount: timeoutRefund.amount || 0
        });
      }
    } catch (e) {
      console.error('Consultation timeout error:', e.message);
    }
  }, 5 * 60 * 1000);

  notifyConsultationRequest(selectedDoctorName, {
    consultationId: String(consultation._id),
    paymentId: String(savedPayment._id),
    patientName: name,
    patientPhone: phone,
    doctorName: selectedDoctorName,
    roomId: videoRoomId,
    amount: effectiveAmount,
    isFollowUp,
    doctorAvailableTime: consultation.doctorAvailableTime,
    status: 'ringing',
    expiresAt
  });

  try {
    const customer = await findCustomerByPhone(phone);
    if (customer && reportUrls.length) {
      const existingReportsSet = new Set(customer.reports || []);
      const reportsToAdd = reportUrls.filter((url) => !existingReportsSet.has(url));
      if (reportsToAdd.length) {
        await User.findByIdAndUpdate(customer._id || customer.id, {
          $set: { reports: [...(customer.reports || []), ...reportsToAdd] }
        });
      }
    }
  } catch (customerUpdateErr) {
    console.warn('Customer reports update skipped:', customerUpdateErr.message);
  }

  return { savedPayment, consultation, videoRoomId };
}

app.post(
  '/api/payments/razorpay/confirm-consultation',
  upload.fields([{ name: 'reports', maxCount: 5 }]),
  requireFirebaseAuth(),
  async (req, res) => {
    try {
      const {
        name,
        phone,
        address,
        selectedDoctorName,
        selectedDoctorFee,
        amount,
        doctorAvailableTime,
        patientSymptoms,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;

      const amountNum = parseFloat(String(amount ?? '').replace(/[^\d.]/g, ''));
      const reportFiles = req.files?.reports || [];

      if (!name || !phone || !address || !selectedDoctorName) {
        return res.status(400).json({ message: 'Patient details and doctor name are required.' });
      }
      if (amountNum > 0 && (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)) {
        return res.status(400).json({ message: 'Razorpay payment verification data is required.' });
      }
      if (Number.isNaN(amountNum) || amountNum < 0) {
        return res.status(400).json({ message: 'Invalid consultation amount.' });
      }

      const result = await completeWebsiteConsultationCheckout({
        firebaseUid: req.firebaseUid,
        name,
        phone,
        address,
        selectedDoctorName,
        selectedDoctorFee,
        amountNum,
        doctorAvailableTime,
        patientSymptoms,
        reportFiles,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature
      });

      res.status(201).json({
        message: 'Payment successful. Waiting for doctor to accept.',
        payment: result.savedPayment,
        consultation: result.consultation,
        roomId: result.videoRoomId,
        videoRoomId: result.videoRoomId
      });
    } catch (err) {
      console.error('Razorpay confirm error:', err.message);
      res.status(err.status || 500).json({ message: err.message || 'Payment confirmation failed' });
    }
  }
);

// Legacy UPI proof upload — disabled; use Razorpay
app.post('/api/payment', upload.fields([
    { name: 'paymentProof', maxCount: 1 },
    { name: 'reports', maxCount: 5 }
]), async (req, res) => {
    res.status(410).json({
        message:
          'Manual UPI payment proof is no longer accepted. Please pay with Razorpay on the payment page.'
    });
});

// Legacy UPI payment handler removed — use Razorpay (completeWebsiteConsultationCheckout).

// 🧑‍🦰 Get Patient's Payments (Appointments)
app.get('/api/payments/patient/:phoneNumber', requirePatientPhoneAccess('phoneNumber'), async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required.' });
        }

        const identifiers = new Set([phoneNumber]);
        if (req.firebaseUid) identifiers.add(req.firebaseUid);

        const customer = await findCustomerByPhone(phoneNumber);
        if (customer?.uid) identifiers.add(String(customer.uid));
        if (customer?._id) identifiers.add(String(customer._id));

        const seen = new Set();
        const merged = [];
        for (const id of identifiers) {
            const batch = await listPaymentsForPatient(id);
            for (const p of batch) {
                const key = String(p._id || p.id);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(p);
                }
            }
        }

        merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        res.status(200).json(merged);
    } catch (err) {
        console.error('❌ Error fetching patient payments:', err);
        res.status(500).json({ message: 'Failed to fetch appointments.', error: err.message });
    }
});

// 👨‍⚕️ Get Doctor's Patient Appointments
app.get('/api/payments/doctor/:doctorName', requireDoctorNameAccess('doctorName'), async (req, res) => {
    try {
        const { doctorName } = req.params;
        if (!doctorName) {
            return res.status(400).json({ message: 'Doctor name is required.' });
        }
        const payments = await listPaymentsForDoctor(doctorName);
        res.status(200).json(payments);
    } catch (err) {
        console.error('❌ Error fetching doctor payments:', err);
        res.status(500).json({ message: 'Failed to fetch appointments.', error: err.message });
    }
});

// 🧑‍🦰 Merged consultation history for patient (payments + appointments)
app.get('/api/patient/consultation-history/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
    try {
        const { phoneOrUid } = req.params;
        if (!phoneOrUid) {
            return res.status(400).json({ message: 'Phone or user id is required.' });
        }
        const identifiers = new Set([phoneOrUid]);
        if (req.firebaseUid) identifiers.add(req.firebaseUid);
        const customer = await findCustomerByPhone(phoneOrUid);
        if (customer?.uid) identifiers.add(String(customer.uid));
        if (customer?._id) identifiers.add(String(customer._id));

        const seen = new Set();
        const merged = [];
        for (const id of identifiers) {
            const batch = await listConsultationHistoryForPatient(id);
            for (const row of batch) {
                const key = String(row.id || row.consultationId || row.roomId);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(row);
                }
            }
        }
        merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        res.status(200).json(merged);
    } catch (err) {
        console.error('❌ Error fetching patient consultation history:', err);
        res.status(500).json({ message: 'Failed to fetch consultation history.', error: err.message });
    }
});

// 👨‍⚕️ Merged consultation history (payments + appointments)
app.get('/api/doctors/:doctorName/consultation-history', requireDoctorNameAccess('doctorName'), async (req, res) => {
    try {
        const { doctorName } = req.params;
        if (!doctorName) {
            return res.status(400).json({ message: 'Doctor name is required.' });
        }
        const history = await listConsultationHistoryForDoctor(doctorName);
        res.status(200).json(history);
    } catch (err) {
        console.error('❌ Error fetching consultation history:', err);
        res.status(500).json({ message: 'Failed to fetch consultation history.', error: err.message });
    }
});

app.get('/api/consultations/access-check', requireFirebaseAuth(), async (req, res) => {
    try {
        const doctorName = String(req.query.doctorName || '').trim();
        if (!doctorName) {
            return res.status(400).json({ message: 'doctorName is required.' });
        }
        const phone = req.query.phone || req.body?.phone || '';
        const access = await findActiveAccess({
            patientUid: req.firebaseUid,
            patientPhone: phone,
            doctorName
        });
        return res.json({
            covered: !!access,
            doctorName,
            daysRemaining: access?.daysRemaining || 0,
            expiresAt: access?.expiresAt || null,
            message: access
                ? `Free follow-up calls with ${doctorName} for ${access.daysRemaining} more day(s).`
                : 'Consultation fee applies for this doctor.'
        });
    } catch (err) {
        console.error('Access check error:', err);
        return res.status(500).json({ message: 'Could not check consultation access.' });
    }
});

app.get('/api/patient/consultation-access', requireFirebaseAuth(), async (req, res) => {
    try {
        const phone = req.query.phone || '';
        const list = await listAccessForPatient(req.firebaseUid, phone);
        return res.json(list.filter((row) => row.active));
    } catch (err) {
        console.error('List access error:', err);
        return res.status(500).json({ message: 'Could not load consultation access.' });
    }
});

app.post(
    '/api/consultations/start-followup',
    upload.fields([{ name: 'reports', maxCount: 5 }]),
    requireFirebaseAuth(),
    async (req, res) => {
        try {
            const { name, phone, address, selectedDoctorName, doctorAvailableTime, patientSymptoms } = req.body;
            if (!name || !phone || !address || !selectedDoctorName) {
                return res.status(400).json({ message: 'Patient details and doctor name are required.' });
            }
            const doctor = await findDoctorByName(selectedDoctorName);
            if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
            const fee = parseFloat(String(doctor.consultationFee ?? doctor.fee ?? '').replace(/[^\d.]/g, '')) || 0;
            const access = await findActiveAccess({
                patientUid: req.firebaseUid,
                patientPhone: phone,
                doctorName: selectedDoctorName
            });
            if (!access && fee > 0) {
                return res.status(402).json({
                    message: 'No active 15-day plan for this doctor. Please pay the consultation fee first.',
                    requiresPayment: true
                });
            }
            const result = await completeWebsiteConsultationCheckout({
                firebaseUid: req.firebaseUid,
                name,
                phone,
                address,
                selectedDoctorName,
                selectedDoctorFee: String(fee),
                amountNum: 0,
                doctorAvailableTime,
                patientSymptoms,
                reportFiles: req.files?.reports || []
            });
            return res.status(201).json({
                message: 'Free follow-up consultation started. Waiting for doctor to accept.',
                payment: result.savedPayment,
                consultation: result.consultation,
                videoRoomId: result.videoRoomId,
                roomId: result.videoRoomId,
                isFollowUp: true
            });
        } catch (err) {
            console.error('Start follow-up error:', err);
            return res.status(err.status || 500).json({ message: err.message || 'Could not start follow-up call.' });
        }
    }
);

app.get('/api/patient/orders/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
    try {
        const { phoneOrUid } = req.params;
        const identifiers = new Set([phoneOrUid]);
        if (req.firebaseUid) identifiers.add(req.firebaseUid);
        const customer = await findCustomerByPhone(phoneOrUid);
        if (customer?.uid) identifiers.add(String(customer.uid));
        const seen = new Set();
        const merged = [];
        for (const id of identifiers) {
            const batch = await listOrdersForPatient(id);
            for (const row of batch) {
                const key = String(row.id || row.orderId);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(row);
                }
            }
        }
        merged.sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime());
        return res.json(merged);
    } catch (err) {
        console.error('Patient orders error:', err);
        return res.status(500).json({ message: 'Failed to fetch orders.' });
    }
});

app.get('/api/patient/dashboard/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
    try {
        const { phoneOrUid } = req.params;
        const [consultations, prescriptions, orders, accessPlans] = await Promise.all([
            listConsultationHistoryForPatient(phoneOrUid),
            (async () => {
                const phone = normalizePhone(phoneOrUid) || phoneOrUid;
                const rx = await Prescription.find({}).sort({ createdAt: -1 });
                return rx.filter((r) => {
                    const d = r.toObject ? r.toObject() : r;
                    return normalizePhone(d.phone) === phone || String(d.phone) === String(phoneOrUid);
                });
            })(),
            listOrdersForPatient(phoneOrUid),
            listAccessForPatient(req.firebaseUid, phoneOrUid)
        ]);
        return res.json({
            consultations,
            prescriptions: prescriptions.map((r) => (r.toObject ? r.toObject() : r)),
            orders,
            accessPlans: accessPlans.filter((a) => a.active)
        });
    } catch (err) {
        console.error('Patient dashboard error:', err);
        return res.status(500).json({ message: 'Failed to load dashboard.' });
    }
});

// 📄 Get Patient Reports
app.get('/api/patient/reports/:phone', requirePatientPhoneAccess('phone'), async (req, res) => {
    try {
        const { phone } = req.params;

        const customer = await findCustomerByPhone(phone);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        const reports = await resolveReportEntries(customer.reports || [], customer.createdAt);

        res.json({
            reports,
            patientInfo: {
                phone: customer.phone,
                name: customer.name,
                email: customer.email,
                registrationDate: customer.createdAt
            }
        });
    } catch (err) {
        console.error('❌ Error fetching reports:', err);
        res.status(500).json({
            message: 'Failed to fetch reports',
            error: err.message
        });
    }
});

// Upload new report during call (multiple patient reports)
app.post('/api/upload-report', upload.array('reports', 5), async (req, res) => {
    try {
        const { room } = req.body;
        const files = req.files;
        if (!room || !files || !files.length) {
            return res.status(400).json({ message: 'Room and files are required' });
        }
        const payment = await Payment.findOne({ roomName: room });
        if (!payment) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const patientPhone = payment.phone || payment.patientPhone;
        const folder = `medical_reports/${patientPhone}/consultation`;
        const uploads = await Promise.all(files.map((file) => uploadToFirebase(file, folder)));
        const urls = uploads.map((u) => u.downloadUrl);

        for (const up of uploads) {
          await saveDocumentRecord({
            Document,
            fileName: up.fileName,
            downloadUrl: up.downloadUrl,
            patientId: patientPhone,
            userId: patientPhone,
            appointmentId: room,
            category: 'medical_report',
            uploadedByRole: 'patient'
          });
        }

        const customer = await findCustomerByPhone(patientPhone);
        if (customer) {
            const mergedReports = (customer.reports || []).concat(urls);
            await User.findByIdAndUpdate(customer._id || customer.id, { $set: { reports: mergedReports } });
        }

        await Payment.findByIdAndUpdate(payment._id || payment.id, {
            $set: { reports: (payment.reports || []).concat(urls) }
        });

        res.json({ success: true, message: 'Reports uploaded successfully', urls });
    } catch (err) {
        console.error('❌ Error uploading reports:', err);
        res.status(500).json({ message: 'Failed to upload reports', error: err.message });
    }
});

// 📝 Generate and Save Prescription/Invoice
app.post('/api/generate-prescription', async (req, res) => {
    try {
        const { room, medicines, totalAmount } = req.body;

        const payment = await Payment.findOne({ roomName: room });
        if (!payment) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Create new prescription
        const prescription = new Prescription({
            roomID: room,
            phone: payment.phone,
            items: Array.isArray(medicines) ? medicines.map((m) => ({
                name: m.name || m.medicineName || 'Medicine',
                quantity: m.quantity || 1,
                totalPrice: m.totalPrice || m.price || 0
            })) : [],
            total: Number(totalAmount) || 0,
            paymentProof: 'consultation-invoice'
        });

        await prescription.save();

        res.json({ 
            success: true, 
            message: 'Prescription generated successfully',
            prescription: prescription
        });
    } catch (err) {
        console.error('❌ Error generating prescription:', err);
        res.status(500).json({ message: 'Failed to generate prescription', error: err.message });
    }
});

// 📋 Get Patient's Prescriptions
app.get('/api/prescriptions/patient/:phone', requirePatientPhoneAccess('phone'), async (req, res) => {
    try {
        const phone = req.params.phone;
        const payments = await listPaymentsForPatient(phone);
        const roomIds = new Set(payments.map((p) => p.roomName || p.videoRoomId).filter(Boolean));
        const all = await Prescription.find({}).sort({ createdAt: -1 });
        const prescriptions = all.filter((rx) => {
            const rxPhone = normalizePhone(rx.phone || rx.patientPhone || '');
            if (rxPhone && rxPhone === normalizePhone(phone)) return true;
            const room = rx.roomID || rx.roomId || rx.videoRoomId;
            return room && roomIds.has(room);
        });
        res.json(prescriptions);
    } catch (err) {
        console.error('❌ Error fetching prescriptions:', err);
        res.status(500).json({ message: 'Failed to fetch prescriptions', error: err.message });
    }
});

// 👨‍⚕️ Get Doctor's Prescriptions
app.get('/api/prescriptions/doctor/:doctorName', requireDoctorNameAccess('doctorName'), async (req, res) => {
    try {
        const roomIds = await listRoomIdsForDoctor(req.params.doctorName);
        const all = await Prescription.find({}).sort({ createdAt: -1 });
        const prescriptions = all.filter((rx) => {
            const room = rx.roomID || rx.roomId || rx.videoRoomId;
            return room && roomIds.includes(room);
        });
        res.json(prescriptions);
    } catch (err) {
        console.error('❌ Error fetching prescriptions:', err);
        res.status(500).json({ message: 'Failed to fetch prescriptions', error: err.message });
    }
});

// 💊 Update Prescription Status
app.put('/api/prescriptions/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const prescription = await Prescription.findByIdAndUpdate(
            req.params.id,
            { status: status },
            { new: true }
        );

        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        res.json(prescription);
    } catch (err) {
        console.error('❌ Error updating prescription status:', err);
        res.status(500).json({ message: 'Failed to update status', error: err.message });
    }
});

// Admin alias — matches admin.js togglePrescriptionStatus
app.put('/api/admin/prescriptions/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const prescription = await Prescription.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        res.json(prescription);
    } catch (err) {
        console.error('❌ Error updating prescription status:', err);
        res.status(500).json({ message: 'Failed to update status', error: err.message });
    }
});

// Legacy route — redirect to secure token-based video call (no client-side secrets)
app.get('/videocall', (req, res) => {
    const qs = new URLSearchParams();
    if (req.query.roomID) qs.set('roomID', String(req.query.roomID));
    if (req.query.role) qs.set('role', String(req.query.role));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    res.redirect(302, `/video-call.html${suffix}`);
});

app.get('/api/getReports', async (req, res) => {
  try {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ error: 'roomId missing' });

    const payment = await Payment.findOne({ roomName: roomId }).sort({ createdAt: -1 });
    if (!payment) {
      return res.status(404).json({ error: 'No consultation found for this room' });
    }

    const reportPaths = (payment.reports?.length ? payment.reports : []).map((report) => {
      const reportStr = String(report || '');
      return /^https?:\/\//i.test(reportStr) ? reportStr : reportStr;
    });

    if (!reportPaths.length) {
      return res.status(404).json({ error: 'No reports uploaded for this consultation' });
    }

    res.json({
      reports: reportPaths,
      patientName: payment.name,
      doctorName: payment.selectedDoctorName
    });
  } catch (err) {
    console.error('Error in /api/getReports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Fully cleaned report fetching directly from Payments collection
app.get('/api/reports/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      console.log('🔍 Fetching reports for room:', roomId);

      const payment = await Payment.findOne({ roomName: roomId }).sort({ createdAt: -1 });
      let consultation = null;
      if (!payment) {
        consultation = await ConsultationRequest.findOne({
          $or: [{ roomId }, { videoRoomId: roomId }]
        }).sort({ createdAt: -1 });
        if (!consultation) {
          return res.status(404).json({ message: 'No consultation found for this room' });
        }
      }

      const patientPhone = payment?.phone || consultation?.patientPhone || '';
      const patientName = payment?.name || consultation?.patientName || '';
      const rawConsultationReports = Array.isArray(payment?.reports) ? payment.reports : [];
      const consultationReports = await resolveReportEntries(
        rawConsultationReports,
        payment?.createdAt || consultation?.createdAt
      );

      let previousReports = [];
      if (patientPhone) {
        const customer = await findCustomerByPhone(patientPhone);
        if (customer && Array.isArray(customer.reports) && customer.reports.length) {
          const currentSet = new Set(rawConsultationReports.map((r) => String(r || '').trim()));
          const previousRaw = customer.reports.filter((r) => !currentSet.has(String(r || '').trim()));
          previousReports = await resolveReportEntries(previousRaw, customer.createdAt);
        }
      }

      const reports = consultationReports.concat(previousReports);

      let prescribedItems = [];
      try {
        const prescribedCart = await PrescribedCart.findOne({ roomId }).sort({ prescribedAt: -1 });
        if (prescribedCart?.cartItems) {
          prescribedItems = prescribedCart.cartItems;
        }
      } catch (cartErr) {
        console.warn('Could not load prescribed cart for reports:', cartErr.message);
      }

      res.json({
        reports,
        consultationReports,
        previousReports,
        prescribedItems,
        patientInfo: {
          name: patientName,
          phone: patientPhone,
          address: payment?.address || '',
          doctor: payment?.selectedDoctorName || consultation?.doctorName || '',
          doctorFee: payment?.selectedDoctorFee,
          amountPaid: payment?.amount,
          registrationDate: payment?.createdAt || consultation?.createdAt
        },
        paymentInfo: payment ? {
          name: payment.name,
          phone: payment.phone,
          address: payment.address,
          total: payment.amount,
          createdAt: payment.createdAt
        } : null
      });

    } catch (err) {
      console.error('❌ Error fetching reports:', err);
      res.status(500).json({
        message: 'Failed to fetch reports',
        error: err.message
      });
    }
  });

app.get('/api/video-call/diagnosis-history/:roomId', requireDoctorSession(), async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required.' });
    }
    if (!(await prescriptionVideoRoomExists(roomId))) {
      return res.status(403).json({ message: 'Invalid or unknown video room.' });
    }

    const result = await getPatientDiagnosisHistoryForDoctor(roomId, req.doctor.name);
    if (result.error === 'not_found') {
      return res.status(404).json({ message: result.message });
    }
    if (result.error === 'forbidden') {
      return res.status(403).json({ message: result.message });
    }

    return res.json(result);
  } catch (err) {
    console.error('Diagnosis history error:', err);
    return res.status(500).json({ message: 'Failed to load diagnosis history.', error: err.message });
  }
});

app.post('/api/video-call/consultation-notes', requireDoctorSession(), async (req, res) => {
  try {
    const { roomId, patientSymptoms, doctorDiagnosis, consultationNotes } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required.' });
    }
    if (!(await prescriptionVideoRoomExists(roomId))) {
      return res.status(403).json({ message: 'Invalid or unknown video room.' });
    }

    const result = await saveConsultationClinicalNotes(roomId, req.doctor.name, {
      patientSymptoms,
      doctorDiagnosis,
      consultationNotes
    });

    if (result.error === 'not_found') {
      return res.status(404).json({ message: result.message });
    }
    if (result.error === 'forbidden') {
      return res.status(403).json({ message: result.message });
    }
    if (result.error === 'bad_request') {
      return res.status(400).json({ message: result.message });
    }

    return res.json({
      message: 'Clinical notes saved.',
      patientSymptoms: result.patientSymptoms,
      doctorDiagnosis: result.doctorDiagnosis,
      consultationNotes: result.consultationNotes
    });
  } catch (err) {
    console.error('Save consultation notes error:', err);
    return res.status(500).json({ message: 'Failed to save clinical notes.', error: err.message });
  }
});
  
  
/* -------------------------------------------------------------------
   🚀 Bootstrap: MongoDB → sync catalog → listen
--------------------------------------------------------------------*/
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Stop the other process or set PORT in .env`);
        process.exit(1);
    }
    throw err;
});

async function startNgrokIfConfigured() {
    const ngrokToken = process.env.NGROK_AUTHTOKEN;
    if (!ngrokToken || ngrokToken === 'your-default-token') {
        console.log('ℹ️ Ngrok skipped (set NGROK_AUTHTOKEN in .env to enable tunnel)');
        return;
    }
    try {
        const ngrok = require('@ngrok/ngrok');
        const listener = await ngrok.forward({ addr: PORT, authtoken: ngrokToken });
        console.log(`🌐 Ngrok Tunnel: ${listener.url()} --> http://localhost:${PORT}`);
        console.log(`📹 Open Video Call: ${listener.url()}/videocall`);
    } catch (err) {
        console.error('❌ Ngrok tunnel failed:', err.message);
    }
}

async function validateRazorpayOnStartup() {
    if (!isRazorpayConfigured()) {
        global.__razorpayAuth = false;
        global.__razorpayAuthError = 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set';
        console.warn('⚠️  Razorpay: env vars missing — store and consultation checkout disabled');
        return;
    }
    const result = await verifyCredentials();
    global.__razorpayAuth = result.ok;
    global.__razorpayAuthError = result.ok ? null : result.error;
    if (result.ok) {
        console.log(`✅ Razorpay API verified (${result.keyId})`);
    } else {
        console.error('❌ Razorpay API auth failed:', result.error);
        console.error('   Fix: regenerate Key ID + Secret as a pair at https://dashboard.razorpay.com/app/keys');
    }
}

async function bootstrap() {
    try {
        await connectDatabase();
        const mirroredDoctors = await syncAllDoctorMirrors();
        if (mirroredDoctors > 0) {
            console.log(`✅ Mirrored ${mirroredDoctors} website doctor profile(s) to doctors/{authUid}`);
        }
        const approvedDoctors = await listDoctors({ _webRegstatus: 'approved' });
        for (const doctor of approvedDoctors) {
            await ensureDoctorPublicId(doctor);
        }
        console.log('✅ Firebase catalog ready (medicines, doctors, users)');
        warmCatalogCache().catch(() => {});
        await validateRazorpayOnStartup();
    } catch (err) {
        const credentialHint =
            'Add GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json to .env ' +
            '(download from Firebase Console → Service accounts → Generate new private key).';
        console.error('⚠️ Firebase startup sync skipped:', err.message);
        console.error(`   ${credentialHint}`);
        console.warn('   Static website pages will still run; API/Firestore routes may return 503 until credentials are set.');
    }

    initRealtime(server);

    server.listen(PORT, HOST, async () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log(`📦 Store API: http://localhost:${PORT}/api/stores/summary`);
        console.log(`❤️  Health:    http://localhost:${PORT}/api/health`);
        await startNgrokIfConfigured();
    });
}

bootstrap();

function adminDbErrorResponse(res, label, error) {
    console.error(`Error fetching ${label}:`, error);
    const msg = error.message || String(error);
    const isCred =
        /ENOENT|GOOGLE_APPLICATION_CREDENTIALS|Could not load the default credentials|FIREBASE_SERVICE_ACCOUNT_JSON/i.test(
            msg
        );
    const status = isCred ? 503 : 500;
    res.status(status).json({
        message: isCred
            ? 'Firebase is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON in Render and remove GOOGLE_APPLICATION_CREDENTIALS.'
            : `Error fetching ${label}`,
        error: msg
    });
}

// Admin Routes
app.get('/api/admin/doctors', async (req, res) => {
    try {
        if (!isConnected()) {
            return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
        }
        const doctors = await listDoctors();
        res.json(await enrichDoctorRows(doctors));
    } catch (error) {
        adminDbErrorResponse(res, 'doctors', error);
    }
});

app.get('/api/admin/patients', async (req, res) => {
    try {
        if (!isConnected()) {
            return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
        }
        const customers = await listCustomers();
        res.json(customers);
    } catch (error) {
        adminDbErrorResponse(res, 'customers', error);
    }
});

app.get('/api/admin/payments', async (req, res) => {
    try {
        if (!isConnected()) {
            return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
        }
        const payments = await Payment.find({}).sort({ createdAt: -1 }).exec();
        res.json(payments);
    } catch (error) {
        adminDbErrorResponse(res, 'payments', error);
    }
});

app.get('/api/admin/settlements', async (req, res) => {
    try {
        if (!isConnected()) {
            return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
        }
        const {
            enrichSettlementRow,
            getPaymentGrossAmount
        } = require('./lib/doctorSettlement');
        const payments = await Payment.find({}).sort({ createdAt: -1 }).exec();
        const doctors = await listDoctors();
        const doctorById = new Map();
        const doctorByName = new Map();
        for (const doctor of doctors) {
            const id = String(doctor._id || doctor.id || doctor.uid || '').trim();
            const name = String(doctor.name || '').trim().toLowerCase();
            if (id) doctorById.set(id, doctor);
            if (name) doctorByName.set(name, doctor);
        }

        const rows = payments
            .filter((payment) => getPaymentGrossAmount(payment) > 0)
            .map((payment) => {
                const doctorId = String(payment.doctorId || payment.selectedDoctorId || '').trim();
                const doctorName = String(payment.doctorName || payment.selectedDoctorName || '').trim().toLowerCase();
                const doctor = doctorById.get(doctorId) || doctorByName.get(doctorName) || null;
                return enrichSettlementRow(payment, doctor);
            });

        res.json(rows);
    } catch (error) {
        adminDbErrorResponse(res, 'settlements', error);
    }
});

app.put('/api/admin/settlements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            buildSettlementPatch,
            calcSettlement,
            enrichSettlementRow,
            getPaymentGrossAmount
        } = require('./lib/doctorSettlement');

        const payment = await Payment.findById(id);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        const commissionPercent = req.body.commissionPercent ?? req.body.settlementCommissionPercent;
        if (commissionPercent == null && req.body.settlementStatus == null) {
            return res.status(400).json({ message: 'commissionPercent or settlementStatus is required.' });
        }

        const patch = buildSettlementPatch(req.body);
        if (patch.settlementStatus === 'settled' && commissionPercent == null) {
            const existingPct = payment.settlementCommissionPercent ?? payment.commissionPercent;
            if (existingPct == null) {
                return res.status(400).json({ message: 'Enter commission percentage before marking as settled.' });
            }
        }

        if (commissionPercent != null) {
            const gross = getPaymentGrossAmount(payment);
            const calc = calcSettlement(gross, commissionPercent);
            patch.commissionAmount = calc.commissionAmount;
            patch.doctorNetAmount = calc.doctorNetAmount;
        }

        const updated = await Payment.findByIdAndUpdate(id, { $set: patch }, { new: true });
        let doctor = null;
        const doctorId = String(updated.doctorId || updated.selectedDoctorId || '').trim();
        if (doctorId) doctor = await findDoctorById(doctorId);
        if (!doctor && updated.doctorName) {
            doctor = await findDoctorByName(updated.doctorName || updated.selectedDoctorName);
        }

        res.json({
            message: 'Settlement updated successfully',
            settlement: enrichSettlementRow(updated, doctor)
        });
    } catch (error) {
        console.error('Error updating settlement:', error);
        res.status(500).json({ message: 'Error updating settlement', error: error.message });
    }
});

app.get('/api/admin/prescriptions', async (req, res) => {
    try {
        if (!isConnected()) {
            return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
        }
        const prescriptions = await Prescription.find({}).sort({ createdAt: -1 }).exec();
        res.json(prescriptions);
    } catch (error) {
        adminDbErrorResponse(res, 'prescriptions', error);
    }
});

app.delete('/api/admin/doctors/:id', async (req, res) => {
    try {
        const doctor = await findDoctorById(req.params.id);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        await Doctor.findByIdAndDelete(doctor._id || doctor.uid);
        res.json({ message: 'Doctor deleted successfully' });
    } catch (error) {
        console.error('Error deleting doctor:', error);
        res.status(500).json({ message: 'Error deleting doctor', error: error.message });
    }
});

app.delete('/api/admin/patients/:id', async (req, res) => {
    try {
        const customer = await findCustomerByUid(req.params.id) || await findCustomerByPhone(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }
        await User.findByIdAndDelete(customer._id || customer.uid);
        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ message: 'Error deleting customer', error: error.message });
    }
});

app.delete('/api/admin/payments/:id', async (req, res) => {
    try {
        const payment = await Payment.findByIdAndDelete(req.params.id);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json({ message: 'Payment deleted successfully' });
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ message: 'Error deleting payment', error: error.message });
    }
});

app.delete('/api/admin/prescriptions/:id', async (req, res) => {
    try {
        const prescription = await Prescription.findByIdAndDelete(req.params.id);
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        res.json({ message: 'Prescription deleted successfully' });
    } catch (error) {
        console.error('Error deleting prescription:', error);
        res.status(500).json({ message: 'Error deleting prescription', error: error.message });
    }
});

// Add PUT route for updating prescriptions
app.put('/api/admin/prescriptions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Validate required fields - only phone and total are required now
        if (!updates.phone || updates.total === undefined) {
            return res.status(400).json({ message: 'Phone and total amount are required fields' });
        }

        const prescription = await Prescription.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        res.json({
            message: 'Prescription updated successfully',
            prescription
        });
    } catch (error) {
        console.error('Error updating prescription:', error);
        res.status(500).json({ message: 'Error updating prescription', error: error.message });
    }
});

// Add PUT route for updating doctors
app.put('/api/admin/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { parseAdminDoctorUpdates, validateApprovalTransition } = require('./lib/doctorFields');

        let doctor = await findDoctorById(id);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        const { profile, approval, working } = parseAdminDoctorUpdates(req.body, doctor);

        const paymentPatchResult = buildPaymentDetailsPatch(req.body, doctor);
        if (req.body.paymentMode || req.body.upiId || req.body.accountNumber || req.body.bankName) {
            if (!paymentPatchResult.ok) {
                return res.status(400).json({ message: paymentPatchResult.error });
            }
            Object.assign(profile, paymentPatchResult.patch);
        }

        if (!profile.name || !profile.specialization || !profile.license) {
            return res.status(400).json({ message: 'Name, specialization, and license are required fields' });
        }

        if (typeof profile.languages === 'string') {
            profile.languages = profile.languages
                .split(/[,|]+/)
                .map((s) => s.trim())
                .filter(Boolean);
        }

        doctor = await Doctor.findByIdAndUpdate(id, { $set: profile }, { new: true });

        if (approval && ['pending', 'approved', 'rejected'].includes(String(approval).toLowerCase())) {
            const check = validateApprovalTransition(doctor, approval);
            if (!check.ok) {
                return res.status(403).json({ message: check.error });
            }
            doctor = await Doctor.findByIdAndUpdate(
                id,
                { $set: buildApprovalUpdate(approval) },
                { new: true }
            );
            const doctorUid = doctor?.uid || doctor?._id;
            if (doctorUid) {
                await User.findByIdAndUpdate(
                    doctorUid,
                    { status: approval, approvalStatus: approval, updatedAt: new Date() },
                    { new: true }
                );
            }
        }

        if (working != null && String(working).trim() !== '') {
            doctor = await findDoctorById(id);
            await updateDoctorPresence(doctor, working);
            doctor = await findDoctorById(id);
            const payload = await buildStatusPayload(doctor);
            if (payload && doctor.name) emitDoctorStatus(doctor.name, payload);
        }

        res.json({
            message: 'Doctor updated successfully',
            doctor: enrichDoctorRow(doctor)
        });
    } catch (error) {
        console.error('Error updating doctor:', error);
        res.status(500).json({ message: 'Error updating doctor', error: error.message });
    }
});

// Add PUT route for approving doctors
app.put('/api/admin/doctors/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { Regstatus } = req.body;
        const { validateApprovalTransition } = require('./lib/doctorFields');

        if (!Regstatus || !['pending', 'approved', 'rejected'].includes(Regstatus)) {
            return res.status(400).json({ message: 'Valid Regstatus (pending, approved, rejected) is required' });
        }

        const existing = await findDoctorById(id);
        if (!existing) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        const check = validateApprovalTransition(existing, Regstatus);
        if (!check.ok) {
            return res.status(403).json({ message: check.error });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            id,
            buildApprovalUpdate(Regstatus),
            { new: true }
        );

        if (Regstatus === 'approved') {
            await ensureDoctorPublicId(doctor);
        }
        await mirrorDoctorToAuthUid(doctor);

        res.json({
            message: `Doctor ${Regstatus} successfully`,
            doctor
        });
    } catch (error) {
        console.error('Error updating doctor status:', error);
        res.status(500).json({ message: 'Error updating doctor status', error: error.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const username = (req.body.username || req.body.email || '').trim();
    const password = req.body.password || '';
    if (!validateAdminCredentials(username, password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = issueAdminToken();
    res.json({ message: 'Login successful', ok: true, token });
});

app.post('/api/admin/logout', (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    revokeAdminToken(token);
    res.json({ message: 'Logged out successfully' });
});

const CONSULTATION_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

function normalizeVideoRole(role) {
    const r = String(role || '').toLowerCase();
    return r === 'doctor' ? 'doctor' : 'patient';
}

function consultationStatusOf(consultation, payment) {
    return normalizeConsultationStatus(consultation, payment);
}

async function findLatestPaymentForRoom(room) {
    let payment = await Payment.findOne({ roomName: room }).sort({ createdAt: -1 });
    if (!payment) payment = await Payment.findOne({ videoRoomId: room }).sort({ createdAt: -1 });
    return payment;
}

async function findLatestConsultationForRoom(room) {
    let consultation = await ConsultationRequest.findOne({ roomId: room }).sort({ createdAt: -1 });
    if (!consultation) consultation = await ConsultationRequest.findOne({ videoRoomId: room }).sort({ createdAt: -1 });
    return consultation;
}

async function loadRoomContext(roomId) {
    const room = String(roomId || '').trim();
    if (!room) return null;
    const [payment, consultation] = await Promise.all([
        findLatestPaymentForRoom(room),
        findLatestConsultationForRoom(room)
    ]);
    if (!payment && !consultation) return null;
    return { room, payment, consultation, createdAt: payment?.createdAt || consultation?.createdAt };
}

function isWithinConsultationWindow(createdAt) {
    if (!createdAt) return true;
    const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
    if (Number.isNaN(t)) return true;
    return Date.now() - t <= CONSULTATION_WINDOW_MS;
}

async function validateVideoRoomAccess(roomId, role) {
    let ctx = await loadRoomContext(roomId);
    if (!ctx) return { ok: false, status: 403, message: 'Invalid or expired video room.' };

    ctx = await autoHealStaleRoomContext(ctx);

    const payment = ctx.payment;
    const consultation = ctx.consultation;
    const doctorName =
      consultation?.doctorName || payment?.selectedDoctorName || payment?.doctorName || '';
    const patientPhone = normalizePhone(payment?.phone || payment?.patientPhone || consultation?.patientPhone || '');
    const isFollowUp = !!(payment?.isFollowUp || consultation?.isFollowUp || payment?.accessPlanActive);
    const withinRoomWindow = isWithinConsultationWindow(ctx.createdAt);

    if (!withinRoomWindow) {
      let accessAllowed = false;
      if (isFollowUp && doctorName && patientPhone) {
        const access = await findActiveAccess({
          patientPhone,
          doctorName
        });
        accessAllowed = !!access;
      }
      if (!accessAllowed) {
        const msg = isFollowUp
          ? 'Your 15-day free follow-up plan has expired. Please book a new consultation from your dashboard.'
          : 'Consultation access has expired (15 days from booking). Please book a new consultation.';
        return { ok: false, status: 403, message: msg, payment, consultation };
      }
    }

    const normalizedRole = normalizeVideoRole(role);
    let status = consultationStatusOf(ctx.consultation, ctx.payment);

    if (normalizedRole === 'patient' && status === 'completed') {
      return {
        ok: false,
        status: 403,
        message: 'This consultation has ended. Start a new free follow-up from your dashboard if your 15-day plan is still active.',
        payment,
        consultation
      };
    }

    if (normalizedRole === 'patient' && !patientCanJoinVideo(status)) {
        const messages = {
            rejected: 'The doctor declined this consultation. Please book again.',
            timeout: 'The doctor did not respond in time. Please book again or start a new follow-up.',
            cancelled: 'This consultation was cancelled.',
            refunded: 'This consultation was refunded.',
            '': 'This consultation is not ready for video call yet.'
        };
        return {
            ok: false,
            status: 403,
            message: messages[status] || 'This consultation is not ready for video call yet.',
            payment,
            consultation
        };
    }

    if (normalizedRole === 'doctor' && doctorName) {
      await clearStaleDoctorConsultations(doctorName, { exceptRoomId: roomId });
    }

    return { ok: true, ...ctx, status };
}

async function markConsultationInCall(roomId) {
    const ctx = await loadRoomContext(roomId);
    if (!ctx) return;
    const current = consultationStatusOf(ctx.consultation, ctx.payment);
    if (!['accepted', 'in_call'].includes(current)) return;
    if (ctx.consultation) {
        const id = ctx.consultation._id || ctx.consultation.id;
        if (id) {
            await ConsultationRequest.findByIdAndUpdate(id, {
                $set: buildConsultationStatusFields('in_call', id)
            });
        }
    }
    if (ctx.payment) {
        const id = ctx.payment._id || ctx.payment.id;
        if (id) await Payment.findByIdAndUpdate(id, { consultationStatus: 'in_call' });
    }
}

async function markConsultationCompleted(roomId) {
    const ctx = await loadRoomContext(roomId);
    if (!ctx) return;
    const current = consultationStatusOf(ctx.consultation, ctx.payment);
    const canComplete = ['in_call', 'completed'];
    if (!canComplete.includes(current)) return;

    if (ctx.consultation) {
        const id = ctx.consultation._id || ctx.consultation.id;
        if (id) {
            await ConsultationRequest.findByIdAndUpdate(id, {
                $set: buildConsultationStatusFields('completed', id)
            });
        }
    }
    if (ctx.payment) {
        const id = ctx.payment._id || ctx.payment.id;
        if (id) await Payment.findByIdAndUpdate(id, { consultationStatus: 'completed' });
    }

    const doctorName = ctx.consultation?.doctorName || ctx.payment?.selectedDoctorName || ctx.payment?.doctorName;
    if (doctorName) {
        const doctor = await findDoctorByName(doctorName);
        if (doctor) {
            await updateDoctorPresence(doctor, 'Available');
            const payload = await buildStatusPayload(doctor);
            if (payload) emitDoctorStatus(doctor.name, payload);
        }
    }

    try {
        const appointmentId = String(ctx.consultation?._id || ctx.consultation?.id || '');
        if (appointmentId) {
            const { scheduledCallId } = require('./lib/appAppointmentSync');
            await getFirestore().collection('active_calls').doc(scheduledCallId(appointmentId)).delete();
        }
    } catch (activeErr) {
        console.warn('active_calls end cleanup:', activeErr.message);
    }
}

app.get('/api/video-room/:roomId/access', async (req, res) => {
    try {
        const role = req.query.role || 'patient';
        const access = await validateVideoRoomAccess(req.params.roomId, role);
        if (!access.ok) {
            const deniedStatus = access.payment || access.consultation
                ? consultationStatusOf(access.consultation, access.payment)
                : '';
            const payload = {
                canJoin: false,
                message: access.message,
                consultationStatus: deniedStatus
            };
            if (access.payment) {
                payload.refundStatus = access.payment.refundStatus || '';
                payload.refunded = access.payment.refundStatus === 'processed';
            }
            return res.status(access.status || 403).json(payload);
        }
        return res.json({
            canJoin: true,
            consultationStatus: access.status || '',
            roomId: access.room
        });
    } catch (err) {
        console.error('Video room access check error:', err);
        return res.status(500).json({ canJoin: false, message: 'Could not verify room access.' });
    }
});

app.post('/api/video-room/:roomId/call-ended', async (req, res) => {
    try {
        await markConsultationCompleted(req.params.roomId);
        return res.json({ ok: true });
    } catch (err) {
        console.error('Call ended error:', err);
        return res.status(500).json({ message: 'Could not update consultation status.' });
    }
});

app.post('/api/video-room/:roomId/refund', async (req, res) => {
    try {
        const reason = String(req.body?.reason || 'connection_failed').trim();
        const result = await refundConsultationForRoom(req.params.roomId, reason);
        if (!result.ok) {
            return res.status(result.status || 400).json({
                refunded: false,
                message: result.message
            });
        }
        return res.json({
            refunded: !!result.refunded,
            alreadyRefunded: !!result.alreadyRefunded,
            freeConsultation: !!result.freeConsultation,
            amount: result.amount || 0,
            refundId: result.refundId || null,
            message: result.message
        });
    } catch (err) {
        console.error('Video room refund error:', err);
        return res.status(500).json({
            refunded: false,
            message: 'Could not process refund. Please contact support.'
        });
    }
});

async function handleCreateAgoraRtcToken(req, res) {
    try {
        const appointmentId = String(req.body?.appointmentId || '').trim();
        const channelName = String(req.body?.channelName || '').trim();
        const uid = req.firebaseUid;

        if (!appointmentId) {
            return res.status(400).json({ success: false, error: 'appointmentId is required' });
        }
        if (!isValidAgoraChannelName(channelName)) {
            return res.status(400).json({ success: false, error: 'Invalid Agora channel name' });
        }

        const appointment = await ConsultationRequest.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        const participantIds = new Set(
            [
                appointment.patientId,
                appointment.userId,
                appointment.doctorId
            ]
                .filter(Boolean)
                .map(String)
        );
        if (!participantIds.has(String(uid))) {
            return res.status(403).json({
                success: false,
                error: 'Current user is not part of this appointment'
            });
        }

        const agoraUid = agoraUidForUserId(uid);
        const result = generateAgoraToken(channelName, uid, { uid: agoraUid });
        if (!result) {
            return res.status(503).json({
                success: false,
                error: 'Video calling is not configured on the server.'
            });
        }

        return res.json({
            success: true,
            appId: result.appId,
            channelName,
            uid: agoraUid,
            token: result.token,
            tokenRequired: true,
            expiresAt: result.expiresAt
        });
    } catch (err) {
        console.error('createAgoraRtcToken error:', err);
        const status = err.message?.includes('token') ? 401 : 500;
        return res.status(status).json({ success: false, error: err.message || 'Token error' });
    }
}

app.post('/createAgoraRtcToken', requireFirebaseAuth(), handleCreateAgoraRtcToken);
app.post('/api/createAgoraRtcToken', requireFirebaseAuth(), handleCreateAgoraRtcToken);

app.post('/api/agora/token', async (req, res) => {
    const { channel, userID, userName, role } = req.body || {};
    const roomID = channel || req.body?.roomID;
    if (!roomID || !userID) {
        return res.status(400).json({ message: 'channel (roomID) and userID are required' });
    }

    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const normalizedRole = normalizeVideoRole(role);

    if (bearer) {
        try {
            const decoded = await verifyIdToken(bearer);
            req.firebaseUid = decoded.uid;
        } catch (err) {
            return res.status(401).json({
                message: 'Invalid or expired Firebase token. Please log in again.',
                error: err.message
            });
        }
    } else if (normalizedRole === 'doctor') {
        return res.status(401).json({
            message: 'Firebase ID token required for doctor video calls. Log in at /doctor.html first.'
        });
    }

    try {
        const access = await validateVideoRoomAccess(roomID, role);
        if (!access.ok) {
            return res.status(access.status || 403).json({ message: access.message });
        }
        await markConsultationInCall(roomID);
    } catch (err) {
        console.error('Agora token room validation error:', err);
        return res.status(500).json({ message: 'Could not validate video room.' });
    }

    const result = generateAgoraToken(roomID, userID, { role: 'publisher' });
    if (!result) {
        return res.status(503).json({
            message: 'Video calling is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server.'
        });
    }
    res.json({
        appId: result.appId,
        token: result.token,
        uid: result.uid,
        channel: result.channel,
        userName: userName || userID
    });
});

app.post('/api/account/deletion-request', async (req, res) => {
    try {
        const { email, phone, reason } = req.body || {};
        if (!email || !String(email).includes('@')) {
            return res.status(400).json({ message: 'Valid email is required' });
        }
        const docId = String(req.body.userId || req.body.uid || '').trim() || undefined;
        await AccountDeletionRequest.create({
            _id: docId,
            email: String(email).trim(),
            phone: String(phone || '').trim(),
            reason: String(reason || '').trim(),
            status: 'pending',
            source: 'website',
            accountType: String(req.body.accountType || 'customer').toLowerCase(),
            requestedAt: new Date()
        });
        res.status(201).json({
            message: 'Deletion request received. We will process it within 7 business days.',
            ok: true
        });
    } catch (err) {
        console.error('Deletion request error:', err);
        res.status(500).json({ message: 'Could not submit request' });
    }
});
// Route: /api/doctors/roomId/:doctorName
app.get('/api/doctors/roomId/:doctorName', async (req, res) => {
  const doctorName = req.params.doctorName;

  try {
    const doctor = await findDoctorByName(doctorName);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const roomId = doctor.videoRoomId || generateVideoRoomId();
    return res.json({ videoRoomId: roomId, channel: roomId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});
// Get doctor status (effective + schedule-aware)
app.get('/api/doctors/status/:doctorName', async (req, res) => {
  const doctorName = req.params.doctorName;

  try {
    const doctor = await findDoctorByName(doctorName);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const payload = await buildStatusPayload(doctor);
    return res.json({
      working: payload.working,
      status: payload.dbStatus,
      effectiveStatus: payload.effectiveStatus,
      scheduleStatus: payload.scheduleStatus,
      bookable: payload.bookable,
      dbStatus: payload.dbStatus,
      lastSeenAt: payload.lastSeenAt
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Doctor heartbeat — keeps presence fresh while dashboard is open
app.post('/api/doctors/heartbeat', async (req, res) => {
  const { doctorName } = req.body;
  if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });
  try {
    const doctor = await Doctor.findOneAndUpdate(
      { name: doctorName },
      { lastSeenAt: new Date() },
      { new: true }
    );
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    const payload = await buildStatusPayload(doctor);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update doctor status (online / offline / busy toggle)
app.post('/api/doctors/updateStatus', requireDoctorNameAccess(), async (req, res) => {
  const { status } = req.body;
  const doctorName = String(req.body?.doctorName || req.doctor?.name || '').trim();

  if (!doctorName || !status) {
    return res.status(400).json({ message: 'doctorName and status are required' });
  }

  const normalized = normalizeDbStatus(status);
  if (!['Available', 'Busy', 'Offline'].includes(normalized)) {
    return res.status(400).json({ message: 'Invalid status value. Use Available, Busy, or Offline.' });
  }

  try {
    const doctor = req.doctor || (await findDoctorByName(doctorName));
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const currentPresence = getDoctorPresenceStatus(doctor);
    if (normalized === 'Offline' && currentPresence === 'Busy') {
        return res.status(409).json({
            message: 'Cannot go offline while in a consultation. End the video call first.'
        });
    }

    await updateDoctorPresence(doctor, normalized);

    const id = doctor._id || doctor.id;
    if (id) {
      await Doctor.findByIdAndUpdate(id, { lastSeenAt: new Date() });
    }

    const canonicalName = String(doctor.name || doctorName).trim();
    const refreshed = (await findDoctorByName(canonicalName)) || (id ? await Doctor.findById(id) : doctor);
    const payload = await buildStatusPayload(refreshed || doctor);
    emitDoctorStatus(canonicalName, payload);

    const working = normalized.toLowerCase();
    return res.json({
      message: 'Status updated',
      doctorName: canonicalName,
      working,
      presenceStatus: working,
      effectiveStatus: payload.effectiveStatus,
      scheduleStatus: payload.scheduleStatus,
      bookable: payload.bookable,
      dbStatus: payload.dbStatus
    });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// End all active video consultations for a doctor (clears stuck in_call / accepted sessions)
app.post('/api/doctors/:doctorName/end-active-calls', requireDoctorNameAccess('doctorName'), async (req, res) => {
  try {
    const doctorName = decodeURIComponent(req.params.doctorName || '').trim();
    if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });

    const exceptRoomId = String(req.body?.exceptRoomId || req.query?.exceptRoomId || '').trim();
    await clearStaleDoctorConsultations(doctorName, { exceptRoomId });

    const ACTIVE_STATUSES = ['accepted', 'in_call', 'ringing', 'waiting'];
    const all = await ConsultationRequest.find({ doctorName }).exec();
    const active = (Array.isArray(all) ? all : []).filter((c) => {
      if (!ACTIVE_STATUSES.includes(normalizeConsultationStatus(c, null))) return false;
      const room = c.roomId || c.videoRoomId;
      if (exceptRoomId && room && String(room) === exceptRoomId) return false;
      return true;
    });

    const roomIds = [];
    for (const c of active) {
      const room = c.roomId || c.videoRoomId;
      if (room) {
        await markConsultationCompleted(room);
        roomIds.push(String(room));
      } else {
        const id = c._id || c.id;
        if (id) {
          await ConsultationRequest.findByIdAndUpdate(id, {
            $set: buildConsultationStatusFields('completed', id)
          });
          if (c.paymentId) {
            await Payment.findByIdAndUpdate(c.paymentId, { consultationStatus: 'completed' }).catch(() => {});
          }
        }
      }
    }

    const doctor = await findDoctorByName(doctorName);

    try {
      const doctorUid = String(doctor?.uid || doctor?._id || doctor?.id || req.doctor?.uid || '');
      if (doctorUid) {
        const db = getFirestore();
        const activeCalls = await db.collection('active_calls').where('doctorId', '==', doctorUid).get();
        const batch = db.batch();
        activeCalls.forEach((doc) => {
          const data = doc.data() || {};
          const callRoom = String(data.callRoomId || '');
          if (!exceptRoomId || callRoom !== exceptRoomId) {
            batch.delete(doc.ref);
          }
        });
        await batch.commit();
      }
    } catch (activeErr) {
      console.warn('active_calls cleanup:', activeErr.message);
    }
    if (doctor) {
      await updateDoctorPresence(doctor, 'Available');
      const payload = await buildStatusPayload(doctor);
      if (payload) emitDoctorStatus(doctorName, payload);
    }

    return res.json({
      ok: true,
      ended: active.length,
      roomIds,
      message:
        active.length > 0
          ? `Ended ${active.length} active consultation(s). You can join a new call.`
          : 'No active video consultations were running.'
    });
  } catch (err) {
    console.error('end-active-calls error:', err);
    return res.status(500).json({ message: 'Could not end active calls.' });
  }
});

// Pending consultation rings for doctor dashboard (socket fallback)
app.get('/api/doctors/:doctorName/ringing-consultations', async (req, res) => {
  try {
    const doctorName = decodeURIComponent(req.params.doctorName || '').trim();
    if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });
    const all = await ConsultationRequest.find({ doctorName }).exec();
    const list = (Array.isArray(all) ? all : [])
      .filter((c) => RINGING_STATUSES.includes(normalizeConsultationStatus(c, null)))
      .map((c) => formatConsultationResponse(c));
    return res.json(list);
  } catch (err) {
    console.error('ringing-consultations error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Consultation request lifecycle ---
app.get('/api/consultations/:id', async (req, res) => {
  try {
    const consultation = await ConsultationRequest.findById(req.params.id);
    if (!consultation) return res.status(404).json({ message: 'Consultation not found' });
    return res.json(formatConsultationResponse(consultation));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/consultations/:id/accept', requireConsultationDoctor(), async (req, res) => {
  try {
    const existing = await ConsultationRequest.findById(req.params.id);
    if (existing?.doctorName) {
      const exceptRoom = existing.roomId || existing.videoRoomId || '';
      await clearStaleDoctorConsultations(existing.doctorName, { exceptRoomId: exceptRoom });
    }

    let consultation;
    try {
      consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, {
        ...buildConsultationStatusFields('accepted', req.params.id),
        acceptedAt: new Date()
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
      if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
      throw err;
    }

    await Payment.findByIdAndUpdate(consultation.paymentId, {
      consultationStatus: 'accepted',
      appointmentStatus: 'active'
    });

    const appointmentId = String(consultation._id || consultation.id || req.params.id);
    try {
      const activeCall = buildActiveCallRecord({
        appointmentId,
        appointment: consultation,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId || consultation.userId
      });
      await getFirestore().collection('active_calls').doc(activeCall._id).set(activeCall, { merge: true });
    } catch (activeErr) {
      console.warn('active_calls sync:', activeErr.message);
    }

    const doctor = await findDoctorByName(consultation.doctorName);
    if (doctor) {
      await updateDoctorPresence(doctor, 'Busy');
      const payload = await buildStatusPayload(doctor);
      if (payload) emitDoctorStatus(doctor.name, payload);
    }

    const payload = {
      consultationId: String(consultation._id),
      roomId: consultation.roomId,
      patientName: consultation.patientName,
      status: 'accepted'
    };
    notifyConsultationEvent(String(consultation._id), 'consultation:accepted', payload);

    return res.json({ message: 'Consultation accepted', consultation, ...payload });
  } catch (err) {
    console.error('Accept consultation error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/consultations/:id/reject', requireConsultationDoctor(), async (req, res) => {
  try {
    let consultation;
    try {
      consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, {
        ...buildConsultationStatusFields('rejected', req.params.id),
        rejectedAt: new Date()
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
      if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
      throw err;
    }

    await Payment.findByIdAndUpdate(consultation.paymentId, { consultationStatus: 'rejected' });

    const doctor = await findDoctorByName(consultation.doctorName);
    if (doctor && isDoctorBusy(doctor)) {
      await updateDoctorPresence(doctor, 'Available');
      const payload = await buildStatusPayload(doctor);
      if (payload) emitDoctorStatus(doctor.name, payload);
    }

    const roomId = consultation.roomId || consultation.videoRoomId || '';
    const rejectRefund = roomId
      ? await refundConsultationForRoom(roomId, 'doctor_rejected').catch((e) => ({
          ok: false,
          message: e.message
        }))
      : { ok: false };

    notifyConsultationEvent(String(consultation._id), 'consultation:rejected', {
      consultationId: String(consultation._id),
      message: rejectRefund.message || 'Doctor declined the consultation.',
      refunded: !!rejectRefund.refunded,
      amount: rejectRefund.amount || 0
    });

    return res.json({
      message: rejectRefund.message || 'Consultation rejected',
      consultation,
      refunded: !!rejectRefund.refunded,
      amount: rejectRefund.amount || 0
    });
  } catch (err) {
    console.error('Reject consultation error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/consultations/:id/cancel', async (req, res) => {
  try {
    let consultation;
    try {
      consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, buildConsultationStatusFields('cancelled'));
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
      if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
      throw err;
    }

    await Payment.findByIdAndUpdate(consultation.paymentId, { consultationStatus: 'cancelled' });

    const doctor = await findDoctorByName(consultation.doctorName);
    if (doctor && isDoctorBusy(doctor)) {
      await updateDoctorPresence(doctor, 'Available');
      const payload = await buildStatusPayload(doctor);
      if (payload) emitDoctorStatus(doctor.name, payload);
    }

    const cancelRoomId = consultation.roomId || consultation.videoRoomId || '';
    if (cancelRoomId) {
      await refundConsultationForRoom(cancelRoomId, 'consultation_cancelled').catch((e) => {
        console.error('Cancel consultation refund error:', e.message);
      });
    }

    notifyConsultationEvent(String(consultation._id || consultation.id), 'consultation:cancelled', {
      consultationId: String(consultation._id || consultation.id),
      message: 'Patient cancelled the consultation request.'
    });

    return res.json({ message: 'Consultation cancelled', consultation: formatConsultationResponse(consultation) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Alias — same handler as /api/submit-prescription (verified Razorpay + store order)
app.post('/api/prescriptions', handleSubmitPrescription);


app.get('/api/stores', async (req, res) => {
    try {
        const stores = await getStoresFromFirebase();
        if (stores.length) return res.json(stores);
        const legacy = await getStoresFromDatabase();
        if (legacy.length) return res.json(legacy);
        res.status(404).json({ message: 'No products found in Firebase medicines catalog.' });
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ message: 'Error fetching stores', error: error.message });
    }
});

// 👨‍⚕️ Get approved clinical doctors (homepage / marketing — no admin accounts)
app.get('/api/doctors/all-approved', async (req, res) => {
    try {
        const doctors = await listDoctors({ role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true });
        const enriched = await enrichDoctorRows(doctors);
        res.status(200).json(enriched);
    } catch (err) {
        console.error('❌ Error fetching all approved doctors:', err);
        res.status(500).json({ message: 'Failed to fetch doctors', error: err.message });
    }
});

// 👨‍⚕️ Get All Unique Locations from Doctors
app.get('/api/doctors/locations', async (req, res) => {
    console.log('📍 Location API called');
    try {
        const locations = await Doctor.distinct('location', { role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true });
        console.log('📍 Found locations:', locations);
        const filteredLocations = locations.filter(location => location && location.trim() !== '');
        console.log('📍 Filtered locations:', filteredLocations);
        res.status(200).json(filteredLocations);
    } catch (err) {
        console.error('❌ Error fetching locations:', err);
        res.status(500).json({ message: 'Failed to fetch locations', error: err.message });
    }
});

// 👨‍⚕️ Get All Unique Languages from Doctors
app.get('/api/doctors/languages', async (req, res) => {
    console.log('🗣️ Languages API called');
    try {
        const doctors = await listDoctors({ _webRegstatus: 'approved', _publicOnly: true });
        const allLanguages = doctors.reduce((acc, doctor) => {
            if (Array.isArray(doctor.languages)) {
                doctor.languages.forEach((lang) => {
                    if (lang && String(lang).trim()) acc.push(String(lang).trim());
                });
            }
            const legacy = doctor.language;
            if (Array.isArray(legacy)) {
                legacy.forEach((lang) => {
                    if (lang && String(lang).trim()) acc.push(String(lang).trim());
                });
            } else if (legacy && String(legacy).trim()) {
                String(legacy).split(/[,|/]+/).forEach((part) => {
                    const t = part.trim();
                    if (t) acc.push(t);
                });
            }
            return acc;
        }, []);

        const uniqueLanguages = [...new Set(allLanguages.map((l) => l.replace(/\s+/g, ' ')))].sort((a, b) =>
            a.localeCompare(b)
        );
        console.log('🗣️ Unique languages:', uniqueLanguages);
        res.status(200).json(uniqueLanguages);
    } catch (err) {
        console.error('❌ Error fetching languages:', err);
        res.status(500).json({ message: 'Failed to fetch languages', error: err.message });
    }
});

// 👨‍⚕️ Get Filtered Doctors (by location and languages)
app.get('/api/doctors/filtered', async (req, res) => {
    try {
        const { locations, languages } = req.query;

        console.log('🔍 Filter request received:');
        console.log('📍 Locations:', locations);
        console.log('🗣️ Languages:', languages);

        const parseFilterList = (value) => {
            if (!value || value === '') return [];
            const delimiter = String(value).includes('|') ? '|' : ',';
            return String(value)
                .split(delimiter)
                .map((item) => decodeURIComponent(item.trim()))
                .filter(Boolean);
        };

        const andConditions = [{ role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true }];

        const locationArray = parseFilterList(locations);
        if (locationArray.length) {
            const locationConditions = locationArray.map((loc) => {
                const normalized = loc.replace(/\s*,\s*/g, ', ').trim();
                const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return { location: { $regex: escaped, $options: 'i' } };
            });
            andConditions.push({ $or: locationConditions });
        }

        const languageArray = parseFilterList(languages);
        if (languageArray.length) {
            andConditions.push({
                $or: languageArray.map((lang) => {
                    const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp(escaped, 'i');
                    return {
                        $or: [
                            { languages: pattern },
                            { language: pattern }
                        ]
                    };
                })
            });
        }

        const filterQuery = andConditions.length === 1
            ? andConditions[0]
            : { $and: andConditions };

        console.log('🔍 Final filter query:', JSON.stringify(filterQuery, null, 2));

        const doctors = await listDoctors(filterQuery);
        console.log('👨‍⚕️ Found doctors:', doctors.length);

        const enrichedFiltered = await enrichDoctorRows(doctors);

        enrichedFiltered.sort((a, b) => {
            if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        console.log(`✅ Final result: ${enrichedFiltered.length} doctors`);
        res.status(200).json(enrichedFiltered);
    } catch (err) {
        console.error('❌ Error fetching filtered doctors:', err);
        res.status(500).json({ message: 'Failed to fetch filtered doctors', error: err.message });
    }
});

// 👨‍⚕️ Debug: Get All Doctors with Locations (for debugging)
app.get('/api/doctors/debug', async (req, res) => {
    try {
        const doctors = await listDoctors();
        const summary = doctors.map((d) => ({
            name: d.name,
            location: d.location,
            languages: d.languages,
            status: d.status,
            Regstatus: d.Regstatus,
            availableTime: d.availableTime
        }));
        console.log('🔍 All doctors in database:');
        summary.forEach(doctor => {
            console.log(`👨‍⚕️ ${doctor.name}: Location="${doctor.location}", Status="${doctor.status}", Regstatus="${doctor.Regstatus}"`);
        });
        res.status(200).json(summary);
    } catch (err) {
        console.error('❌ Error fetching debug doctors:', err);
        res.status(500).json({ message: 'Failed to fetch debug doctors', error: err.message });
    }
});

// 🛒 Create New Order (Razorpay only — guest or logged-in)
app.post('/api/orders', upload.single('paymentProof'), async (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            try {
                const decoded = await verifyIdToken(authHeader.slice(7).trim());
                req.firebaseUid = decoded.uid;
            } catch (_) {
                /* guest checkout — invalid token ignored */
            }
        }

        if (req.file || req.body?.paymentProof) {
            return res.status(410).json({
                success: false,
                message: 'Manual UPI / QR payment proof is no longer accepted. Pay with Razorpay checkout.'
            });
        }

        let orderData;
        let razorpayOrderId;
        let razorpayPaymentId;
        let razorpaySignature;

        if (req.is('application/json')) {
            orderData = req.body.orderData || req.body;
            razorpayOrderId = req.body.razorpay_order_id;
            razorpayPaymentId = req.body.razorpay_payment_id;
            razorpaySignature = req.body.razorpay_signature;
        } else if (req.body.orderData) {
            orderData = typeof req.body.orderData === 'string'
                ? JSON.parse(req.body.orderData)
                : req.body.orderData;
            razorpayOrderId = req.body.razorpay_order_id;
            razorpayPaymentId = req.body.razorpay_payment_id;
            razorpaySignature = req.body.razorpay_signature;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid order payload. Complete Razorpay payment first.'
            });
        }

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Razorpay payment verification is required (order_id, payment_id, signature).'
            });
        }

        await verifyAndFetchPayment({
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature
        });

        if (!orderData.customerName || !orderData.customerPhone || !orderData.deliveryAddress) {
            return res.status(400).json({
                message: 'Missing required fields: customerName, customerPhone, deliveryAddress'
            });
        }

        if (!orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ message: 'Order must contain at least one item' });
        }

        let validatedItems;
        try {
            validatedItems = await validateOrderItemsAgainstCatalog(orderData.items);
        } catch (catalogErr) {
            return res.status(catalogErr.status || 400).json({
                success: false,
                message: catalogErr.message || 'One or more products are unavailable'
            });
        }

        orderData.items = validatedItems.items;
        if (!orderData.subtotal || Number(orderData.subtotal) <= 0) {
            orderData.subtotal = validatedItems.subtotal;
        }
        const deliveryFee = Number(orderData.deliveryFee || 0);
        if (!orderData.totalAmount || Number(orderData.totalAmount) <= 0) {
            orderData.totalAmount = validatedItems.subtotal + deliveryFee;
        }

        if (orderData.appointmentId || orderData.prescriptionId) {
            orderData.source = orderData.source || 'prescription';
        }

        const orderId = buildSharedOrderId();
        orderData.paymentMethod = 'razorpay';
        orderData.paymentStatus = 'paid';
        if (req.firebaseUid) {
            orderData.userId = req.firebaseUid;
            orderData.patientId = req.firebaseUid;
        }

        const firestorePayload = buildFirestoreOrderPayload(orderData, orderId, {
            paymentProof: razorpayPaymentId,
            razorpayOrderId,
            razorpayPaymentId,
            transactionId: razorpayPaymentId
        });

        const savedOrder = await Order.create(firestorePayload);
        await MedicineOrder.create({ ...firestorePayload });

        res.status(201).json({
            success: true,
            message: 'Order placed successfully!',
            orderId: savedOrder._id,
            order: savedOrder
        });
    } catch (error) {
        console.error('❌ Error creating order:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Failed to create order'
        });
    }
});

// 🛒 Get All Orders (Admin)
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ orderDate: -1 });
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Error fetching orders', error: error.message });
    }
});

// 🛒 Get Order by ID
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ message: 'Error fetching order', error: error.message });
    }
});

// 🛒 Update Order Status (Admin)
app.put('/api/admin/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus, paymentStatus } = req.body;

        const updateData = {};
        if (orderStatus) updateData.orderStatus = orderStatus;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;

        const order = await Order.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json({
            message: 'Order status updated successfully',
            order: order
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
});

// 🛒 Delete Order (Admin)
app.delete('/api/admin/orders/:id', async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ message: 'Error deleting order', error: error.message });
    }
});

/* -------------------------------------------------------------------
   🔀 SEO: legacy homepage URLs → canonical site root
--------------------------------------------------------------------*/
const SITE_ORIGIN = (process.env.SITE_URL || 'https://dheergayush.net').replace(/\/$/, '');
const isProductionSite = process.env.NODE_ENV === 'production' || !!process.env.SITE_URL;
if (isProductionSite) {
  ['/index2.html', '/index2', '/index.html'].forEach((legacyPath) => {
    app.get(legacyPath, (req, res) => {
      res.redirect(301, SITE_ORIGIN);
    });
  });
}

/* -------------------------------------------------------------------
   📄 Legal pages — clean URLs (not modals)
--------------------------------------------------------------------*/
const LEGAL_PAGE_ROUTES = {
  '/about-us': 'about-us.html',
  '/privacy-policy': 'privacy-policy.html',
  '/terms-and-conditions': 'terms-and-conditions.html',
  '/refund-policy': 'refund-policy.html',
  '/account-deletion': 'account-deletion.html',
  '/contact-us': 'contact-us.html',
  '/support': 'support.html',
};

function serveLegalPage(req, res, fileName) {
  const filePath = path.join(__dirname, 'public', fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Page not found');
  }
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const out = injectPageSeo(html, { path: req.path });
    res.type('html').charset('utf-8').send(out);
  } catch (err) {
    console.warn('Legal page SEO inject failed for', fileName, err.message);
    res.sendFile(filePath);
  }
}

Object.entries(LEGAL_PAGE_ROUTES).forEach(([route, file]) => {
  app.get(route, (req, res) => serveLegalPage(req, res, file));
});

const LEGACY_LEGAL_REDIRECTS = {
  '/about-us.html': '/about-us',
  '/PrivacyPage.html': '/privacy-policy',
  '/terms.html': '/terms-and-conditions',
  '/delete-account.html': '/account-deletion',
  '/refund-policy.html': '/refund-policy',
  '/support.html': '/support'
};

Object.entries(LEGACY_LEGAL_REDIRECTS).forEach(([legacyPath, target]) => {
  app.get(legacyPath, (req, res) => res.redirect(301, target));
});

/* -------------------------------------------------------------------
   🌐 Static File Serving (placed after API routes)
--------------------------------------------------------------------*/
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  let rel = req.path;
  if (rel === '/') rel = '/index.html';
  if (!rel.endsWith('.html')) return next();
  const filePath = path.join(__dirname, 'public', rel.replace(/^\//, ''));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const out = injectPageSeo(html, { path: req.path === '/' ? '/' : rel });
    res.type('html').charset('utf-8').send(out);
  } catch (err) {
    console.warn('SEO inject failed for', rel, err.message);
    next();
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// 📋 Get Prescriptions by Room ID
app.get('/api/prescriptions/room/:roomID', async (req, res) => {
    try {
        const { roomID } = req.params;
        
        if (!roomID) {
            return res.status(400).json({ message: 'Room ID is required' });
        }

        const prescriptions = await Prescription.find({ roomID }).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            roomID,
            prescriptions,
            count: prescriptions.length
        });
    } catch (err) {
        console.error('❌ Error fetching prescriptions by room ID:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch prescriptions', 
            error: err.message 
        });
    }
});

// 📊 Get Prescription Statistics by Room ID
app.get('/api/prescriptions/stats/:roomID', async (req, res) => {
    try {
        const { roomID } = req.params;
        
        if (!roomID) {
            return res.status(400).json({ message: 'Room ID is required' });
        }

        const prescriptions = await Prescription.find({ roomID });
        
        // Calculate statistics
        const totalPrescriptions = prescriptions.length;
        const totalAmount = prescriptions.reduce((sum, prescription) => sum + prescription.total, 0);
        const deliveredCount = prescriptions.filter(p => p.status === 'delivered').length;
        const pendingCount = prescriptions.filter(p => p.status === 'not-delivered').length;
        
        // Get unique patients
        const uniquePatients = [...new Set(prescriptions.map(p => p.phone))];
        
        res.json({
            success: true,
            roomID,
            statistics: {
                totalPrescriptions,
                totalAmount,
                deliveredCount,
                pendingCount,
                uniquePatients: uniquePatients.length,
                averageAmount: totalPrescriptions > 0 ? (totalAmount / totalPrescriptions).toFixed(2) : 0
            },
            prescriptions: prescriptions.map(p => ({
                id: p._id,
                phone: p.phone,
                total: p.total,
                status: p.status,
                createdAt: p.createdAt,
                itemsCount: p.items.length
            }))
        });
    } catch (err) {
        console.error('❌ Error fetching prescription statistics:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch prescription statistics', 
            error: err.message 
        });
    }
});

// Upload or update written prescription
app.post('/api/written-presc', upload.single('writtenPresc'), async (req, res) => {
    try {
        const { roomId } = req.body;
        if (!roomId || !req.file) {
            return res.status(400).json({ message: 'roomId and file are required' });
        }
        // Upsert: update if exists, else create
        const writtenPresc = await WrittenPresc.findOneAndUpdate(
            { roomId },
            { filePath: req.file.filename, uploadedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true, writtenPresc });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get latest written prescription for a room
app.get('/api/written-presc/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const writtenPresc = await WrittenPresc.findOne({ roomId });
        if (!writtenPresc) {
            return res.status(404).json({ message: 'No written prescription found' });
        }
        res.json({ success: true, writtenPresc });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
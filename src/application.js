const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ROOT_DIR = path.join(__dirname, '..');
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
} = require('./core/data');
const { connectDatabase, requireDb, isConnected, getProvider } = require('./core/db');
const {
  syncStoreCatalogFromImages,
  getStoresFromDatabase
} = require('./modules/store/storeCatalog');
const {
  getEffectiveStatus,
  normalizeDbStatus,
  getScheduleStatus,
  getDoctorPresenceStatus
} = require('./modules/doctors/doctorAvailability');
const {
  updateDoctorPresence,
  syncDoctorRecordsUpdate,
  deleteAllDoctorRecords,
  findDoctorByName,
  buildPresenceUpdate,
  buildApprovalUpdate,
  isDoctorBusy,
  isDoctorAvailable,
  isDoctorApproved
} = require('./modules/doctors/doctorPresence');
const {
  verifyIdToken,
  syncUserFromToken,
  getUserProfile,
  requireFirebaseAuth
} = require('./core/firebase/auth');
const { generateVideoRoomId, resolveFileUrl, uploadFile } = require('./core/firebase/storage');
const { enrichDoctorPhotos, streamDoctorPhoto } = require('./modules/doctors/doctorPhotoUrl');
const { uploadToFirebase, saveDocumentRecord } = require('./core/uploads');
const {
  getPublicFirebaseConfig,
  signInWithPassword,
  refreshIdToken,
  sendEmailVerification,
  sendPasswordResetEmail,
  createAuthUser,
  getAuthUserByEmail,
  getAuthUserByUid,
  updateAuthUserPassword
} = require('./core/firebase/authRest');
const { initFirebase, getAdmin } = require('./core/firebase');
const {
  applySecurityMiddleware,
  applyFirebaseRouteGuards,
  applyWriteRateLimit,
  globalLimiter,
  authLimiter,
  writeLimiter,
  clientIp
} = require('./core/security');
const {
  getStoresFromFirebase,
  getStoresSummaryFromFirebase,
  getStoreTaxonomy,
  getMedicinesFromFirebase,
  getMedicinesPaginated,
  getMedicinesByIds,
  validateOrderItemsAgainstCatalog,
  getBannersFromFirebase,
  getProductCategoriesFromFirebase,
  warmCatalogCache
} = require('./core/firebase/catalog');
const {
  departmentFromSlug,
  subcategoryFromSlug,
  STORE_SUBCATEGORIES
} = require('./modules/store/storeCategories');
const { MOBILE_COLLECTIONS } = require('./core/mobileSchema');
const { getFirestore } = require('./core/firebase');
const {
  validateCredentials: validateAdminCredentials,
  issueAdminToken,
  revokeAdminToken,
  requireAdmin
} = require('./modules/admin/adminAuth');
const {
  createAdminOtpChallenge,
  verifyAdminOtp,
  regenerateAdminOtp,
  sendAdminOtp,
  dropAdminOtpChallenge
} = require('./modules/admin/adminOtp');
const { generateAgoraToken } = require('./modules/consultations/agoraToken');
const {
  listPaymentsForPatient,
  listPaymentsForDoctor,
  listConsultationHistoryForDoctor,
  listConsultationHistoryForPatient,
  listOrdersForPatient,
  listRoomIdsForDoctor,
  normalizePhone
} = require('./modules/payments/paymentLookup');
const {
  getPatientDiagnosisHistoryForDoctor,
  saveConsultationClinicalNotes
} = require('./modules/patients/patientDiagnosisHistory');
const { createPrescriptionStoreOrder } = require('./modules/prescriptions/prescriptionCheckout');
const {
  requirePatientPhoneAccess,
  requireDoctorNameAccess,
  requireConsultationDoctor,
  requireDoctorSession,
  resolveFirebaseSession
} = require('./core/workflowAuth');
const { applyDoctorStorePricing } = require('./modules/doctors/doctorStoreDiscount');
const {
  extractDoctorPaymentDetails,
  validatePaymentDetailsInput,
  buildPaymentDetailsPatch,
  parseConsultationFeeInput,
  parseDoctorSelfServiceProfile,
  mergePaymentBodyWithExisting
} = require('./modules/doctors/doctorPaymentDetails');
const {
  getActiveConsultationFee,
  buildPendingFeeRequestPatch,
  buildApprovedFeePatch,
  buildRejectedFeePatch,
  buildAdminApprovedFeePatch,
  enrichDoctorFeeFields,
  reconcileDoctorFeeAndPersist
} = require('./modules/doctors/doctorFeeApproval');
const { findCustomerByPhone, findCustomerByUid, listCustomers, findDoctorByUid, findDoctorById, findDoctorByEmail, listDoctors } = require('./core/userQueries');
const {
  getPublicKeyId,
  createOrder,
  verifyAndFetchPayment,
  verifyPaymentSignature,
  fetchPayment,
  isRazorpayConfigured,
  verifyCredentials
} = require('./modules/payments/razorpay');
const { getCheckoutDisplayConfig, isMobileUserAgent } = require('./modules/payments/razorpayCheckoutConfig');
const { injectPageSeo } = require('./core/seoMeta');
const { resolveReportEntries } = require('./core/reportUrls');
const {
  initRealtime,
  emitDoctorStatus,
  notifyConsultationRequest,
  notifyConsultationEvent,
  buildStatusPayload
} = require('./core/realtime');
const {
  RINGING_STATUSES,
  normalizeConsultationStatus,
  patientCanJoinVideo,
  buildConsultationStatusFields,
  transitionConsultation,
  formatConsultationResponse
} = require('./modules/consultations/consultationWorkflow');
const {
  clearStaleDoctorConsultations,
  hasLiveActiveConsultation,
  autoHealStaleRoomContext
} = require('./modules/consultations/consultationSessionCleanup');
const { refundConsultationForRoom, refundCapturedRazorpayPayment } = require('./modules/consultations/consultationRefund');
const {
  findActiveAccess,
  grantConsultationAccess,
  listAccessForPatient,
  consumeFreeFollowUpConsultation,
  canUseFreeFollowUp,
  FREE_FOLLOWUP_LIMIT
} = require('./modules/consultations/consultationAccess');
const {
  resolvePatientUid,
  buildWebPaidAppointmentFields,
  buildWebPaidPaymentFields,
  buildActiveCallRecord,
  canonicalVideoChannelForAppointment,
  videoRoomIdForAppointment,
  isValidAgoraChannelName,
  agoraUidForUserId
} = require('./modules/consultations/appAppointmentSync');
const {
  syncPaymentForConsultationStatus,
  syncActiveCallForStatus
} = require('./modules/consultations/consultationLifecycleSync');
const { updateActiveCallForAppointment } = require('./modules/consultations/activeCallSync');
const {
  DEFAULT_WORKING_DAYS,
  DEFAULT_WORKING_DAYS_INT,
  parseAvailableTimeToWorkingHours,
  workingDaysToAppFormat
} = require('./modules/doctors/doctorSchedule');
const { mirrorDoctorToAuthUid, syncAllDoctorMirrors } = require('./modules/doctors/doctorMirror');
const { ensureDoctorPublicId } = require('./modules/doctors/doctorPublicId');
const { mirrorPrescribedCartToAppPrescription } = require('./modules/prescriptions/mirrorToAppPrescription');
const { linkAppointmentsToAuthUid } = require('./modules/patients/patientLinking');
const {
  buildSharedOrderId,
  buildFirestoreOrderPayload,
  normalizeOrderContactFields
} = require('./modules/store/webOrderSync');

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

function createApp() {
  assertProductionSecurityConfig();
  const app = express();
  app.set('trust proxy', 1);
  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0';
  app.locals.PORT = PORT;
  app.locals.HOST = HOST;

// Brand assets — stable URLs for Google favicon / Organization logo crawlers
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
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
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'assetlinks.json'));
});

function serveReferralInvitePage(req, res) {
  const filePath = path.join(PUBLIC_DIR, 'invite.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Invite page not found');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html');
  return res.sendFile(filePath);
}

app.get('/invite', serveReferralInvitePage);
app.get('/invite/', serveReferralInvitePage);
app.get('/invite/:code', serveReferralInvitePage);
app.get('/r/:code', serveReferralInvitePage);

function serveStorePage(req, res) {
  const filePath = path.join(PUBLIC_DIR, 'stores.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Store page not found');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html');
  return res.sendFile(filePath);
}

function validateStorePath(req, res, next) {
  const categorySlug = String(req.params.category || '').trim();
  const subcategorySlug = String(req.params.subcategory || '').trim();
  if (!categorySlug) return next();
  const department = departmentFromSlug(categorySlug);
  if (!department) {
    return res.redirect(302, '/store');
  }
  if (subcategorySlug) {
    const allowed = STORE_SUBCATEGORIES[department];
    if (!allowed || !allowed.length) {
      return res.redirect(302, `/store/${categorySlug}`);
    }
    const sub = subcategoryFromSlug(subcategorySlug, department);
    if (!sub) {
      return res.redirect(302, `/store/${categorySlug}`);
    }
  }
  return next();
}

app.get('/store', serveStorePage);
app.get('/store/', serveStorePage);
app.get('/store/:category', validateStorePath, serveStorePage);
app.get('/store/:category/:subcategory', validateStorePath, serveStorePage);
app.get('/stores.html', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/store' + qs);
});

applySecurityMiddleware(app);
app.use(compression());
app.use(cors(getCorsOptions()));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(globalLimiter);
applyFirebaseRouteGuards(app);
applyWriteRateLimit(app);

/** Protect admin APIs and sensitive debug/order management */
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/api/admin/login' && req.method === 'POST') return next();
  if (p === '/api/admin/login/verify' && req.method === 'POST') return next();
  if (p === '/api/admin/login/resend' && req.method === 'POST') return next();
  if (p === '/api/admin/logout' && req.method === 'POST') return next();
  if (p.startsWith('/api/admin/')) return requireAdmin(req, res, next);
  if (p === '/api/doctors/debug') return requireAdmin(req, res, next);
  if ((p === '/api/orders' && req.method === 'GET') ||
      (p.startsWith('/api/orders/') && ['PUT', 'DELETE'].includes(req.method))) {
    return requireAdmin(req, res, next);
  }
  return next();
});
app.use('/uploads', express.static(path.join(ROOT_DIR, 'uploads')));
{
  const { createMedicineThumbHandler } = require('./modules/store/medicineAssetThumbs');
  const medicineSourceDir = path.resolve(ROOT_DIR, 'medicine', 'medicine');
  const medicineThumbCacheDir = path.resolve(ROOT_DIR, 'medicine', '.thumbs');
  app.get(
    '/medicine-thumbs/:width/:file',
    createMedicineThumbHandler({
      sourceDir: medicineSourceDir,
      cacheDir: medicineThumbCacheDir
    })
  );
}
app.use('/medicine-assets', express.static(path.resolve(ROOT_DIR, 'medicine', 'medicine'), {
  maxAge: '365d',
  immutable: true,
  etag: true
}));
app.use('/store-images', express.static(path.join(ROOT_DIR, 'ayurvedic_store_dataset', 'images'), {
  maxAge: '7d',
  etag: true
}));
app.use('/medicines', express.static(path.join(ROOT_DIR, 'public', 'medicines')));

/* E-Library PDF stream — registered early so it is always available */
function isAllowedElibPdfHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === 'archive.org' || h.endsWith('.archive.org')) return true;
  const extra = String(process.env.ELIBRARY_PDF_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((allowed) => h === allowed || h.endsWith('.' + allowed));
}





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

function getRequestOrigin(req) {
  const configured = String(process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

async function safeSendEmailVerification(auth, req, portal) {
  try {
    await sendEmailVerification(auth.idToken);
    return true;
  } catch (err) {
    console.warn('Email verification send failed:', err.message);
    return false;
  }
}

async function ensureAuthEmailVerified(auth, req, res, portal) {
  const authUser = await getAuthUserByUid(auth.localId);
  if (!authUser.email || authUser.emailVerified) return true;
  const sent = await safeSendEmailVerification(auth, req, portal);
  if (!sent) {
    console.warn('Allowing login for unverified email because verification email could not be sent.');
  }
  return true;
}

































/* DB-backed API routes use requireDb middleware after connection bootstrap */

// Ensure uploads folder exists and set up static serving
const uploadDir = path.join(ROOT_DIR, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer — memory storage, files go to Firebase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', 'admin.html'));
  });
/* -------------------------------------------------------------------
   📌 API Routes
--------------------------------------------------------------------*/

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


function enrichDoctorRow(d) {
    const { enrichDoctorApiFields } = require('./modules/doctors/doctorFields');
    const row = enrichDoctorApiFields(d);
    const payment = extractDoctorPaymentDetails(row);
    const feeFields = enrichDoctorFeeFields(row);
    return {
        ...row,
        ...feeFields,
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







async function enrichDoctorRows(doctors) {
    const rows = (Array.isArray(doctors) ? doctors : []).map(enrichDoctorRow);
    return enrichDoctorPhotos(rows);
}

async function enrichDoctorRowsWithAppSync(doctors) {
    const list = Array.isArray(doctors) ? doctors : [];
    const reconciled = [];
    for (const doctor of list) {
        reconciled.push((await reconcileDoctorFeeAndPersist(doctor)) || doctor);
    }
    return enrichDoctorRows(reconciled);
}

// 🖼️ Doctor profile photo — streams from Firebase Storage (avoids expired download URLs)


// 👨‍⚕️ Get All Doctors (appointment listing — approved clinical doctors only)


// 👨‍⚕️ Admin: Get All Doctors (including pending and rejected)


// 👨‍⚕️ Admin: one-time verify/reject at registration (locked after approved)


// 🧑‍⚕️ Get All Doctors (No changes needed here, it will automatically fetch new fields)
// REMOVED: Duplicate route - using the updated version above that filters by approved status

// Legacy alias — prefer POST /api/auth/login

async function assertDoctorBearerToken(req, res) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) {
    res.status(401).json({ message: 'Firebase ID token required. Log in at /doctor.html first.' });
    return false;
  }
  try {
    const decoded = await verifyIdToken(bearer);
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

function parseAppointmentIdFromRoom(roomId) {
  const room = normalizeVideoRoomId(roomId);
  const match = room.match(/^room_(.+)$/i);
  return match ? String(match[1]).trim() : '';
}

async function findConsultationByAppointmentRoom(room) {
  const normalized = normalizeVideoRoomId(room);
  if (!normalized) return null;

  let consultation = await findLatestConsultationForRoom(normalized);
  if (consultation) return consultation;

  const appointmentId = parseAppointmentIdFromRoom(normalized);
  if (appointmentId) {
    consultation = await ConsultationRequest.findById(appointmentId);
    if (consultation) return consultation;
  }

  const lower = normalized.toLowerCase();
  const recent = await ConsultationRequest.find({}).sort({ createdAt: -1 }).limit(150);
  return (
    recent.find((c) => {
      const row = c.toObject ? c.toObject() : c;
      const rid = normalizeVideoRoomId(row.roomId || row.videoRoomId || '');
      return rid === normalized || rid.toLowerCase() === lower;
    }) || null
  );
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
  if (await loadRoomContext(room)) return true;
  if (await findPrescriptionForRoom(room)) return true;
  const consultation = await findConsultationByAppointmentRoom(room);
  return !!consultation;
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



// 👨‍⚕️ Doctor Login — Firebase token only (passwordless ID login removed)


/** Public Razorpay key for Checkout.js */


/**
 * Razorpay Standard Checkout — Step 1: Create order
 * POST /api/create-order  { amount (paise), currency?, receipt? }
 */


/**
 * Razorpay Standard Checkout — Step 3: Verify payment signature
 * POST /api/verify-payment
 */




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
  if (razorpayPaymentId) {
    const priorPayment = await Payment.findOne({ razorpayPaymentId: String(razorpayPaymentId) });
    if (priorPayment) {
      const appointmentId = priorPayment.consultationId || priorPayment.appointmentId;
      let consultation = appointmentId ? await ConsultationRequest.findById(appointmentId) : null;
      if (!consultation) {
        consultation = await ConsultationRequest.findOne({ paymentId: priorPayment._id || priorPayment.id });
      }
      const videoRoomId =
        priorPayment.videoRoomId ||
        priorPayment.roomName ||
        consultation?.videoRoomId ||
        consultation?.roomId ||
        (appointmentId ? videoRoomIdForAppointment(appointmentId) : '');
      return { savedPayment: priorPayment, consultation, videoRoomId, duplicate: true };
    }
  }

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
    if (!canUseFreeFollowUp(activeAccess)) {
      throw Object.assign(
        new Error(
          `You have used all ${FREE_FOLLOWUP_LIMIT} free follow-up consultations for this 15-day plan. Please pay for a new consultation.`
        ),
        { status: 402, requiresPayment: true, freeConsultationsExhausted: true }
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

  if (isFollowUp && effectiveAmount <= 0) {
    const consumed = await consumeFreeFollowUpConsultation({
      patientUid,
      patientPhone: phone,
      doctorName: selectedDoctorName
    });
    if (!consumed.ok) {
      throw Object.assign(new Error(consumed.error), { status: 402, requiresPayment: true });
    }
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
        await syncPaymentForConsultationStatus(savedPayment._id, 'timeout', c._id || c.id);
        await syncActiveCallForStatus(c._id || c.id, 'timeout');
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

  const refreshedConsultation = await ConsultationRequest.findById(appointmentId);
  return {
    savedPayment,
    consultation: formatConsultationResponse(refreshedConsultation || consultation),
    videoRoomId
  };
}





// Legacy UPI proof upload — disabled; use Razorpay


// Legacy UPI payment handler removed — use Razorpay (completeWebsiteConsultationCheckout).

// 🧑‍🦰 Get Patient's Payments (Appointments)


// 👨‍⚕️ Get Doctor's Patient Appointments


// 🧑‍🦰 Merged consultation history for patient (payments + appointments)


// 👨‍⚕️ Merged consultation history (payments + appointments)












// 📄 Get Patient Reports


// Upload new report during call (multiple patient reports)


// 📝 Generate and Save Prescription/Invoice


// 📋 Get Patient's Prescriptions


// 👨‍⚕️ Get Doctor's Prescriptions


// 💊 Update Prescription Status


// Admin alias — matches admin.js togglePrescriptionStatus


// Legacy route — redirect to secure token-based video call (no client-side secrets)



// Fully cleaned report fetching directly from Payments collection





  
  
/* -------------------------------------------------------------------
   🚀 Bootstrap: MongoDB → sync catalog → listen
--------------------------------------------------------------------*/
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
        await warmCatalogCache();
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




















// Add PUT route for updating prescriptions


// Add PUT route for updating doctors






// Add PUT route for approving doctors










const CONSULTATION_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

function normalizeVideoRole(role) {
    const r = String(role || '').toLowerCase();
    return r === 'doctor' ? 'doctor' : 'patient';
}

function consultationStatusOf(consultation, payment) {
    return normalizeConsultationStatus(consultation, payment);
}

async function findLatestPaymentForRoom(room) {
    const normalized = normalizeVideoRoomId(room);
    if (!normalized) return null;
    let payment = await Payment.findOne({ roomName: normalized }).sort({ createdAt: -1 });
    if (!payment) payment = await Payment.findOne({ videoRoomId: normalized }).sort({ createdAt: -1 });
    if (!payment) {
        const lower = normalized.toLowerCase();
        const recent = await Payment.find({}).sort({ createdAt: -1 }).limit(100);
        payment = recent.find((p) => {
            const rn = normalizeVideoRoomId(p.roomName || p.videoRoomId || '');
            return rn === normalized || rn.toLowerCase() === lower;
        }) || null;
    }
    return payment;
}

async function findLatestConsultationForRoom(room) {
    const normalized = normalizeVideoRoomId(room);
    if (!normalized) return null;
    let consultation = await ConsultationRequest.findOne({ roomId: normalized }).sort({ createdAt: -1 });
    if (!consultation) consultation = await ConsultationRequest.findOne({ videoRoomId: normalized }).sort({ createdAt: -1 });
    if (!consultation) {
        const lower = normalized.toLowerCase();
        const recent = await ConsultationRequest.find({}).sort({ createdAt: -1 }).limit(100);
        consultation = recent.find((c) => {
            const rn = normalizeVideoRoomId(c.roomId || c.videoRoomId || '');
            return rn === normalized || rn.toLowerCase() === lower;
        }) || null;
    }
    return consultation;
}

async function loadRoomContext(roomId) {
    const room = normalizeVideoRoomId(roomId);
    if (!room) return null;
    let [payment, consultation] = await Promise.all([
        findLatestPaymentForRoom(room),
        findLatestConsultationForRoom(room)
    ]);

    if (!consultation) {
        consultation = await findConsultationByAppointmentRoom(room);
    }
    if (!payment && consultation?.paymentId) {
        payment = await Payment.findById(consultation.paymentId);
    }
    if (!payment && consultation) {
        payment = await findLatestPaymentForRoom(
            consultation.roomId || consultation.videoRoomId || room
        );
    }

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
      if (doctorName && (patientPhone || consultation?.patientId || consultation?.userId || payment?.patientId)) {
        const access = await findActiveAccess({
          patientUid: consultation?.patientId || consultation?.userId || payment?.patientId || '',
          patientPhone,
          doctorName
        });
        accessAllowed = !!access;
      }
      if (!accessAllowed) {
        const msg = isFollowUp
          ? 'Your 15-day free follow-up plan has expired. Please book a new consultation from your dashboard.'
          : 'Consultation access has expired (15 days from booking). Please book a new consultation or use your active 15-day plan.';
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
    if (!['accepted', 'in_call', 'ringing', 'waiting'].includes(current)) return;
    const now = new Date();
    if (ctx.consultation) {
        const id = ctx.consultation._id || ctx.consultation.id;
        if (id) {
            await ConsultationRequest.findByIdAndUpdate(id, {
                $set: {
                    ...buildConsultationStatusFields('in_call', id),
                    lastCallActivityAt: now,
                    callStartedAt: ctx.consultation.callStartedAt || now,
                    callDisconnectedAt: null,
                    callGraceUntil: null,
                    callReconnectPending: false,
                    callDisconnectedRole: null,
                    consultationCompletionAnswer: null,
                    reconnectRingActive: false,
                    reconnectRingUntil: null
                }
            });
        }
    }
    if (ctx.payment) {
        const id = ctx.payment._id || ctx.payment.id;
        if (id) {
            await syncPaymentForConsultationStatus(id, 'in_call', ctx.consultation?._id || ctx.consultation?.id);
        }
    }
    const appointmentId = ctx.consultation?._id || ctx.consultation?.id;
    if (appointmentId) {
        await syncActiveCallForStatus(appointmentId, 'in_call');
    }
}

async function touchCallActivity(roomId) {
    const ctx = await loadRoomContext(roomId);
    if (!ctx?.consultation) return false;
    const id = ctx.consultation._id || ctx.consultation.id;
    if (!id) return false;
    const now = new Date();
    await ConsultationRequest.findByIdAndUpdate(id, {
        $set: { lastCallActivityAt: now, updatedAt: now }
    });
    return true;
}

async function markCallDisconnected(roomId, options = {}) {
    const {
      buildDisconnectGracePatch,
      buildSessionState,
      DISCONNECT_GRACE_MS
    } = require('./modules/consultations/callDisconnectGrace');
    const ctx = await loadRoomContext(roomId);
    if (!ctx?.consultation) return null;
    const id = ctx.consultation._id || ctx.consultation.id;
    if (!id) return null;

    const accidental = options.accidental !== false;
    const role = options.role || '';
    const patch = accidental
      ? buildDisconnectGracePatch(role, true)
      : { callDisconnectedAt: new Date(), callReconnectPending: false, updatedAt: new Date() };

    await ConsultationRequest.findByIdAndUpdate(id, { $set: patch });
    const updated = await ConsultationRequest.findById(id);
    const row = updated?.toObject ? updated.toObject() : updated;
    return {
      ok: true,
      graceMs: DISCONNECT_GRACE_MS,
      session: buildSessionState(row, ctx.payment, role)
    };
}

async function clearCallDisconnectGrace(roomId) {
    const { buildClearGracePatch } = require('./modules/consultations/callDisconnectGrace');
    const ctx = await loadRoomContext(roomId);
    if (!ctx?.consultation) return false;
    const id = ctx.consultation._id || ctx.consultation.id;
    if (!id) return false;
    await ConsultationRequest.findByIdAndUpdate(id, { $set: buildClearGracePatch() });
    return true;
}

async function getCallSessionState(roomId, viewerRole) {
    const {
      buildSessionState,
      isWithinDisconnectGrace,
      RECONNECT_RING_MS
    } = require('./modules/consultations/callDisconnectGrace');
    const ctx = await loadRoomContext(roomId);
    if (!ctx) return null;
    let consultation = ctx.consultation;
    if (consultation?._id || consultation?.id) {
        const fresh = await ConsultationRequest.findById(consultation._id || consultation.id);
        if (fresh) consultation = fresh.toObject ? fresh.toObject() : fresh;
    }
    const id = consultation?._id || consultation?.id;
    if (
        id &&
        consultation?.callReconnectPending &&
        !isWithinDisconnectGrace(consultation) &&
        !consultation?.consultationCompletionAnswer
    ) {
        const now = new Date();
        await ConsultationRequest.findByIdAndUpdate(id, {
            $set: {
                consultationCompletionAnswer: 'no',
                reconnectRingActive: true,
                reconnectRingUntil: new Date(now.getTime() + RECONNECT_RING_MS),
                updatedAt: now
            }
        });
        const refreshed = await ConsultationRequest.findById(id);
        if (refreshed) consultation = refreshed.toObject ? refreshed.toObject() : refreshed;
    }
    return buildSessionState(consultation, ctx.payment, viewerRole);
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
                $set: {
                    ...buildConsultationStatusFields('completed', id),
                    callDisconnectedAt: null,
                    callGraceUntil: null,
                    callReconnectPending: false,
                    callDisconnectedRole: null,
                    consultationCompletionAnswer: 'yes',
                    reconnectRingActive: false,
                    reconnectRingUntil: null,
                    lastCallActivityAt: null
                }
            });
        }
    }
    if (ctx.payment) {
        const id = ctx.payment._id || ctx.payment.id;
        if (id) await syncPaymentForConsultationStatus(id, 'completed', ctx.consultation?._id || ctx.consultation?.id);
    }

    const appointmentId = ctx.consultation?._id || ctx.consultation?.id;
    if (appointmentId) {
        await syncActiveCallForStatus(appointmentId, 'completed');
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
            await syncActiveCallForStatus(appointmentId, 'completed');
        }
    } catch (activeErr) {
        console.warn('active_calls end cleanup:', activeErr.message);
    }
}

















async function handleCreateAgoraRtcToken(req, res) {
    try {
        const appointmentId = String(req.body?.appointmentId || '').trim();
        const requestedChannelName = String(req.body?.channelName || '').trim();
        const uid = req.firebaseUid;

        if (!appointmentId) {
            return res.status(400).json({ success: false, error: 'appointmentId is required' });
        }

        const appointment = await ConsultationRequest.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }
        const channelName = canonicalVideoChannelForAppointment(
            appointment.toObject ? appointment.toObject() : appointment,
            appointmentId,
            requestedChannelName
        );
        if (!isValidAgoraChannelName(channelName)) {
            return res.status(400).json({ success: false, error: 'Invalid Agora channel name' });
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
            channel: channelName,
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







// Route: /api/doctors/roomId/:doctorName

// Get doctor status (effective + schedule-aware)


// Doctor heartbeat — keeps presence fresh while dashboard is open


// Update doctor status (online / offline / busy toggle)



// End all active video consultations for a doctor (clears stuck in_call / accepted sessions)


// Pending consultation rings for doctor dashboard (socket fallback)


// --- Consultation request lifecycle ---








// Alias — same handler as /api/submit-prescription (verified Razorpay + store order)





// 👨‍⚕️ Get approved clinical doctors (homepage / marketing — no admin accounts)


// 👨‍⚕️ Get All Unique Locations from Doctors


// 👨‍⚕️ Get All Unique Languages from Doctors


// 👨‍⚕️ Get Filtered Doctors (by location and languages)


// 👨‍⚕️ Debug: Get All Doctors with Locations (for debugging)


// 🛒 Create New Order (Razorpay only — guest or logged-in)


// 🛒 Get All Orders (Admin)


// 🛒 Get Order by ID


// 🛒 Update Order Status (Admin)


// 🛒 Delete Order (Admin)


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
  const filePath = path.join(ROOT_DIR, 'public', fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Page not found');
  }
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const out = injectPageSeo(html, { path: req.path });
    res.set('Content-Type', 'text/html; charset=utf-8').send(out);
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
  const filePath = path.join(ROOT_DIR, 'public', rel.replace(/^\//, ''));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const out = injectPageSeo(html, { path: req.path === '/' ? '/' : rel });
    res.set('Content-Type', 'text/html; charset=utf-8').send(out);
  } catch (err) {
    console.warn('SEO inject failed for', rel, err.message);
    next();
  }
});

app.use(express.static(path.join(ROOT_DIR, 'public')));

// 📋 Get Prescriptions by Room ID


// 📊 Get Prescription Statistics by Room ID


// Upload or update written prescription


// Get latest written prescription for a room


  const deps = {
    ROOT_DIR, path, fs, express, uuidv4, upload,
    Doctor, Payment, Prescription, Store, Order, MedicineOrder, AccountDeletionRequest,
    ConsultationRequest, PrescribedCart, WrittenPresc, Document, User,
    requireDb, isConnected, getProvider,
    getEffectiveStatus, normalizeDbStatus, getScheduleStatus, getDoctorPresenceStatus,
    updateDoctorPresence, syncDoctorRecordsUpdate, deleteAllDoctorRecords, findDoctorByName,
    buildPresenceUpdate, buildApprovalUpdate, isDoctorBusy, isDoctorAvailable, isDoctorApproved,
    verifyIdToken, syncUserFromToken, getUserProfile, requireFirebaseAuth,
    generateVideoRoomId, resolveFileUrl, uploadFile,
    enrichDoctorPhotos, streamDoctorPhoto,
    uploadToFirebase, saveDocumentRecord,
    getPublicFirebaseConfig, signInWithPassword, refreshIdToken, sendEmailVerification,
    sendPasswordResetEmail, createAuthUser, getAuthUserByEmail, getAuthUserByUid, updateAuthUserPassword,
    initFirebase, getAdmin, getFirestore,
    authLimiter, writeLimiter, clientIp,
    getStoresFromFirebase, getStoresSummaryFromFirebase, getStoreTaxonomy, getMedicinesFromFirebase,
    getMedicinesPaginated, getMedicinesByIds, validateOrderItemsAgainstCatalog,
    getBannersFromFirebase, getProductCategoriesFromFirebase, warmCatalogCache,
    MOBILE_COLLECTIONS,
    validateAdminCredentials, issueAdminToken, revokeAdminToken, requireAdmin,
    createAdminOtpChallenge, verifyAdminOtp, regenerateAdminOtp, sendAdminOtp, dropAdminOtpChallenge,
    generateAgoraToken,
    listPaymentsForPatient, listPaymentsForDoctor, listConsultationHistoryForDoctor,
    listConsultationHistoryForPatient, listOrdersForPatient, listRoomIdsForDoctor, normalizePhone,
    getPatientDiagnosisHistoryForDoctor, saveConsultationClinicalNotes,
    createPrescriptionStoreOrder,
    requirePatientPhoneAccess, requireDoctorNameAccess, requireConsultationDoctor,
    requireDoctorSession, resolveFirebaseSession,
    applyDoctorStorePricing,
    extractDoctorPaymentDetails, validatePaymentDetailsInput, buildPaymentDetailsPatch,
    parseConsultationFeeInput, parseDoctorSelfServiceProfile, mergePaymentBodyWithExisting,
    getActiveConsultationFee, buildPendingFeeRequestPatch, buildApprovedFeePatch,
    buildRejectedFeePatch, buildAdminApprovedFeePatch, enrichDoctorFeeFields, reconcileDoctorFeeAndPersist,
    findCustomerByPhone, findCustomerByUid, listCustomers, findDoctorByUid, findDoctorById,
    findDoctorByEmail, listDoctors,
    getPublicKeyId, createOrder, verifyAndFetchPayment, verifyPaymentSignature, fetchPayment,
    isRazorpayConfigured, verifyCredentials,
    getCheckoutDisplayConfig, isMobileUserAgent,
    injectPageSeo, resolveReportEntries,
    emitDoctorStatus, notifyConsultationRequest, notifyConsultationEvent, buildStatusPayload,
    RINGING_STATUSES, normalizeConsultationStatus, patientCanJoinVideo, buildConsultationStatusFields,
    transitionConsultation, formatConsultationResponse,
    clearStaleDoctorConsultations, hasLiveActiveConsultation, autoHealStaleRoomContext,
    refundConsultationForRoom, refundCapturedRazorpayPayment,
    findActiveAccess, grantConsultationAccess, listAccessForPatient, consumeFreeFollowUpConsultation,
    canUseFreeFollowUp, FREE_FOLLOWUP_LIMIT,
    resolvePatientUid, buildWebPaidAppointmentFields, buildWebPaidPaymentFields, buildActiveCallRecord,
    canonicalVideoChannelForAppointment, videoRoomIdForAppointment, isValidAgoraChannelName, agoraUidForUserId,
    syncPaymentForConsultationStatus, syncActiveCallForStatus, updateActiveCallForAppointment,
    DEFAULT_WORKING_DAYS, DEFAULT_WORKING_DAYS_INT, parseAvailableTimeToWorkingHours, workingDaysToAppFormat,
    mirrorDoctorToAuthUid, syncAllDoctorMirrors, ensureDoctorPublicId, linkAppointmentsToAuthUid,
    buildSharedOrderId, buildFirestoreOrderPayload, normalizeOrderContactFields,
    getCorsOptions, assertProductionSecurityConfig,
    isAllowedElibPdfHost, resolveAuthPortal, getRequestOrigin, safeSendEmailVerification,
    ensureAuthEmailVerified, doctorRegHttpError, completeDoctorAuthForExistingEmail,
    ensureDoctorAuthAccount, upsertDoctorUserStub, enrichDoctorRow, serializeDoctorSession,
    enrichDoctorRows, enrichDoctorRowsWithAppSync, assertDoctorBearerToken,
    normalizeVideoRoomId, parseAppointmentIdFromRoom, findConsultationByAppointmentRoom,
    findPrescriptionForRoom, prescriptionVideoRoomExists, enrichPrescribedCartItems,
    mirrorPrescribedCartToAppPrescription,
    handleSubmitPrescription, completeWebsiteConsultationCheckout,
    adminDbErrorResponse, normalizeVideoRole, consultationStatusOf,
    findLatestPaymentForRoom, findLatestConsultationForRoom, loadRoomContext,
    isWithinConsultationWindow, validateVideoRoomAccess, markConsultationInCall,
    touchCallActivity, markCallDisconnected, clearCallDisconnectGrace, getCallSessionState,
    markConsultationCompleted, handleCreateAgoraRtcToken, serveLegalPage,
    LEGAL_PAGE_ROUTES, LEGACY_LEGAL_REDIRECTS, SITE_ORIGIN, isProductionSite,
    syncStoreCatalogFromImages, getStoresFromDatabase, PORT, HOST, PUBLIC_DIR
  };

  require('./modules/health/routes')(app, deps);
  require('./modules/elibrary/routes')(app, deps);
  require('./modules/auth/routes')(app, deps);
  require('./modules/store/routes')(app, deps);
  require('./modules/doctors/routes')(app, deps);
  require('./modules/patients/routes')(app, deps);
  require('./modules/payments/routes')(app, deps);
  require('./modules/prescriptions/routes')(app, deps);
  require('./modules/consultations/routes')(app, deps);
  require('./modules/admin/routes')(app, deps);
  require('./modules/account/routes')(app, deps);
  require('./modules/pages/routes')(app, deps);

  return app;
}



async function startNgrokIfConfigured(PORT) {
  const ngrokToken = process.env.NGROK_AUTHTOKEN;
  if (!ngrokToken || ngrokToken === 'your-default-token') return;
  try {
    const ngrok = require('@ngrok/ngrok');
    const listener = await ngrok.forward({ addr: PORT, authtoken: ngrokToken });
    console.log('Ngrok Tunnel: ' + listener.url());
  } catch (err) {
    console.error('Ngrok tunnel failed:', err.message);
  }
}

async function validateRazorpayOnStartup() {
  if (!isRazorpayConfigured()) {
    global.__razorpayAuth = false;
    global.__razorpayAuthError = 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set';
    return;
  }
  const result = await verifyCredentials();
  global.__razorpayAuth = result.ok;
  global.__razorpayAuthError = result.ok ? null : result.error;
}

async function warmBackendServices() {
  await connectDatabase();
  // Catalog first so /api/medicines is ready; doctor bookkeeping can wait.
  await warmCatalogCache();
  await validateRazorpayOnStartup();
  const mirroredDoctors = await syncAllDoctorMirrors();
  if (mirroredDoctors > 0) {
    console.log('Mirrored ' + mirroredDoctors + ' website doctor profile(s) to doctors/{authUid}');
  }
  const approvedDoctors = await listDoctors({ _webRegstatus: 'approved' });
  for (const doctor of approvedDoctors) {
    await ensureDoctorPublicId(doctor);
  }
  console.log('Firebase catalog ready (medicines, doctors, users)');
}

async function startServer(app) {
  const http = require('http');
  const server = http.createServer(app);
  const PORT = app.locals.PORT || process.env.PORT || 3000;
  const HOST = app.locals.HOST || '0.0.0.0';

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port ' + PORT + ' is already in use.');
      process.exit(1);
    }
    throw err;
  });

  initRealtime(server);

  // Listen immediately so Render health checks and /stores.html work while
  // Firebase + the 4k-product catalog warm in the background.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      console.log('Server running at http://localhost:' + PORT);
      console.log('Health: http://localhost:' + PORT + '/api/health');
      resolve();
    });
  });

  startNgrokIfConfigured(PORT).catch(() => {});

  setImmediate(() => {
    warmBackendServices().catch((err) => {
      console.error('Firebase startup sync skipped:', err.message);
      console.warn('Static website pages will still run; API/Firestore routes may return 503 until credentials are set.');
    });
  });

  return server;
}

module.exports = { createApp, startServer, ROOT_DIR };

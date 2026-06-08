/**
 * Production security middleware: headers, rate limits, API guards.
 */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireFirebaseAuth } = require('./firebaseAuth');

function applySecurityMiddleware(app) {
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '2000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '40', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_WRITE_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Slow down and retry.' }
});

const FIREBASE_PROTECTED = [
  { method: 'POST', path: '/api/account/deletion-request' },
  /* Video-call prescriptions: auth + room checks in route handlers */
  /* /api/agora/token — auth handled in route (room validation for patients) */
  { method: 'POST', path: '/api/createAgoraRtcToken' },
  { method: 'POST', path: '/createAgoraRtcToken' },
  { method: 'POST', path: '/api/upload-report' },
  { method: 'POST', path: '/api/generate-prescription' },
  { method: 'POST', path: '/api/prescriptions' },
  { method: 'POST', path: '/api/written-presc' },
  { method: 'POST', path: '/api/payment' },
  { method: 'POST', path: '/api/payments/razorpay/create-order' },
  { method: 'POST', path: '/api/payments/razorpay/confirm-consultation' },
  { method: 'POST', path: '/api/consultations/' },
  { method: 'POST', path: '/api/video-room/' },
  { method: 'POST', path: '/api/doctors/updateStatus' },
  { method: 'POST', path: '/api/doctors/' },
  { method: 'GET', path: '/api/payments/patient/' },
  { method: 'GET', path: '/api/payments/doctor/' },
  { method: 'GET', path: '/api/patient/reports/' },
  { method: 'GET', path: '/api/prescriptions/patient/' },
  { method: 'GET', path: '/api/prescriptions/doctor/' }
];

const WRITE_RATE_LIMIT_EXEMPT = [
  '/api/auth/',
  '/api/auth/refresh',
  '/api/admin/login',
  '/api/health',
  '/api/firebase/config',
  '/api/payments/razorpay/config',
  '/api/create-order',
  '/api/verify-payment',
  '/api/orders',
  '/api/banners',
  '/api/medicines',
  '/api/stores/',
  '/api/product-categories',
  '/api/elibrary/',
  '/api/doctors',
  '/api/login-patient',
  '/api/doctor-login',
  '/api/register-doctor'
];

function pathMatches(pattern, reqPath, method, reqMethod) {
  if (method && reqMethod !== method) return false;
  if (pattern === reqPath) return true;
  if (pattern.endsWith('*') && reqPath.startsWith(pattern.slice(0, -1))) return true;
  if (pattern.endsWith('/') && reqPath.startsWith(pattern)) return true;
  return false;
}

const FIREBASE_GUARD_EXEMPT = [
  { method: 'POST', path: '/api/doctors/heartbeat' }
];

function applyFirebaseRouteGuards(app) {
  const guard = requireFirebaseAuth();

  app.use((req, res, next) => {
    if (FIREBASE_GUARD_EXEMPT.some((rule) => pathMatches(rule.path, req.path, rule.method, req.method))) {
      return next();
    }
    const needsAuth = FIREBASE_PROTECTED.some((rule) =>
      pathMatches(rule.path, req.path, rule.method, req.method)
    );
    if (!needsAuth) return next();
    return guard(req, res, next);
  });
}

function applyWriteRateLimit(app) {
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (WRITE_RATE_LIMIT_EXEMPT.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }
    return writeLimiter(req, res, next);
  });
}

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

module.exports = {
  applySecurityMiddleware,
  applyFirebaseRouteGuards,
  applyWriteRateLimit,
  globalLimiter,
  authLimiter,
  writeLimiter,
  clientIp
};

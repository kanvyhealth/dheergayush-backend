# Security - DHEERGAYUSH Backend

## Authentication

- Patients/doctors: Firebase Bearer token
- Admin: session after POST /api/admin/login
- Register: POST /api/auth/register
- Login: POST /api/auth/login or POST /api/auth/login-doctor

Production requires FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, SITE_URL.

## Rate limits

See .env.example: RATE_LIMIT_GLOBAL_MAX, RATE_LIMIT_AUTH_MAX, RATE_LIMIT_WRITE_MAX.

## Protected routes

Listed in lib/security.js (FIREBASE_PROTECTED). Heartbeat POST /api/doctors/heartbeat is exempt.

## Verify

npm run check && npm start
VERIFY_BASE=http://localhost:3000 npm run test:auth

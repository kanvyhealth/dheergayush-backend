# DHEERGAYUSH — Production release checklist

## Website (Node backend + public/)

### Required environment (Render / `.env`)

| Variable | Purpose |
|----------|---------|
| `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Auth + Firestore |
| `SITE_URL` | CORS + production URL |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Store + consultation payments |
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | Cross-platform video calls |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_OTP_EMAIL`, `ADMIN_OTP_PHONE` | Admin dashboard password + OTP login |

Verify Razorpay keys:

```bash
node scripts/verify-razorpay-checkout.js
```

### Store checkout

- Catalog: `GET /api/medicines`, `/api/stores/summary`, `/api/banners`
- Payment: `POST /api/create-order` → Razorpay → `POST /api/verify-payment` → `POST /api/orders`
- Guest checkout supported (no login required for store orders)

### Consultation + video

- Pay: `POST /api/payments/razorpay/confirm-consultation` (requires patient login)
- Video room: `room_{appointmentId}`
- Tokens: `POST /api/createAgoraRtcToken` or `POST /api/agora/token`

---

## Mobile app (Flutter — external repo)

The Flutter patient/doctor app is **not** in this website/backend repository. Build it from the separate app project (same Firebase project as production), for example:

```bash
cd /path/to/dheergayush-flutter-app
flutter pub get
flutter build apk --release \
  --dart-define=FIREBASE_PROJECT_ID=hosp-test-app \
  --dart-define=WEBSITE_API_BASE_URL=https://dheergayush.net \
  --dart-define=RAZORPAY_KEY_ID=rzp_test_xxx \
  --dart-define=AGORA_APP_ID=your_agora_app_id
flutter install --release
```

Store catalog in the app loads from the **website API** first, then falls back to Firestore.

Cross-platform video: app tries Firebase `createAgoraRtcToken`, then website `/api/createAgoraRtcToken`.

Store pricing matches website: ₹150 delivery, free over ₹1000, **20%** doctor discount.

Native WebView store checkout: see `docs/WEBSITE_STORE_BRIDGE.md` (Firebase token injection + `DgNativePayment` signature contract).

Website auth note: email verification is **soft-fail** — login proceeds if the verification email cannot be sent (`ensureAuthEmailVerified` in `src/application.js`).

Admin OTP: set real email/SMS providers (Brevo, Fast2SMS/MSG91). In production, console OTP fallback is disabled unless `ALLOW_ADMIN_OTP_CONSOLE=1`. Never rely on `devOtp` in production responses.

`GET /api/banners` and consultation coupons (`consultation_coupons`) are **app/Firestore-backed**; there is no website admin CRUD UI — manage in Firebase / the mobile app.

Referral invites (`/invite`) are **app deep-link only** — website does not redeem codes.

Health: `GET /api/health` returns `storeReady` / `videoReady`; use `GET /api/health/store` when checking store-only readiness (Agora not required).

Admin medicines: use **Export JSON** on the Medicines tab (`POST /api/admin/medicines/export-json`) to sync the on-disk catalog with Firestore cache warm.

Admin account deletions: **Account deletions** tab lists `account_deletion_requests` for manual Firebase cleanup.

---

## Razorpay dashboard

1. Test/Live API keys — Key ID + Secret must match pair
2. Enable payment methods (UPI, cards)
3. KYC required for live mode only

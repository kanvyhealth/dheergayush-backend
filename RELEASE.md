# DHEERGAYUSH — Production release checklist

## Website (Node backend + public/)

### Required environment (Render / `.env`)

| Variable | Purpose |
|----------|---------|
| `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Auth + Firestore |
| `SITE_URL` | CORS + production URL |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Store + consultation payments |
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | Cross-platform video calls |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin dashboard |

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

## Mobile app (Flutter — `hosp_test/`)

Build release APK (same Firebase project):

```bash
cd "hosp_test (4)/hosp_test"
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

Store pricing matches website: ₹150 delivery, free over ₹1000, 10% doctor discount.

---

## Razorpay dashboard

1. Test/Live API keys — Key ID + Secret must match pair
2. Enable payment methods (UPI, cards)
3. KYC required for live mode only

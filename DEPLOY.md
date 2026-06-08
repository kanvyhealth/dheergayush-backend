# Deploy DHEERGAYUSH Backend (Render + Firebase)

## Render environment

| Variable | Your value (example) |
|----------|----------------------|
| `FIREBASE_PROJECT_ID` | `hosp-test-app` |
| `FIREBASE_API_KEY` | Web API key from Firebase Console |
| `FIREBASE_AUTH_DOMAIN` | `hosp-test-app.firebaseapp.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | `183359905302` |
| `FIREBASE_STORAGE_BUCKET` | `hosp-test-app.firebasestorage.app` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON (one line) |
| `SITE_URL` | `https://dheergayush.net` |
| `RAZORPAY_KEY_ID` | From Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | From Razorpay dashboard |
| `AGORA_APP_ID` | From Agora |
| `AGORA_APP_CERTIFICATE` | From Agora |
| `ADMIN_USERNAME` | Your admin login |
| `ADMIN_PASSWORD` | Strong password |

**Remove / do not add:**

- `AUTH_OTP_SECRET`, `OTP_DEV_EXPOSE`, `SMTP_*`, `AUTH_EMAIL_MODE`

## Firebase Console

1. **Authentication → Authorized domains:** `dheergayush.net`
2. **Google Cloud → APIs:** enable **Identity Toolkit API**
3. **API key:** for Render, use a key **without** “HTTP referrers only” restriction (or a separate server key)

## Build

- Build: `npm install`
- Start: `npm start`
- Health: `/api/health` — check `razorpayAuth: true` before going live

## Verify after deploy

```bash
node scripts/verify-production.js
node scripts/verify-razorpay-checkout.js   # local .env
VERIFY_BASE=https://dheergayush.net node scripts/verify-workflow.js
```

## Razorpay troubleshooting

Checkout fails with **Authentication failed** when `RAZORPAY_KEY_SECRET` does not match `RAZORPAY_KEY_ID`.

1. [Razorpay Dashboard → API Keys](https://dashboard.razorpay.com/app/keys)
2. **Generate Test Key** (or Live after KYC) — copy **both** Key ID and Secret in one step
3. Render → Environment → set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (no quotes, no spaces)
4. **Manual Deploy** on Render
5. Confirm: `GET /api/health` shows `"razorpayAuth": true`
6. Confirm: `POST /api/create-order` with `{"amount":10000}` returns `order_id`

Test card: `4111 1111 1111 1111`, any future expiry, any CVV.

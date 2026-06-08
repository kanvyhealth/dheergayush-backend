# Firebase Setup Guide (DHEERGAYUSH Backend)

This backend uses **Firebase Firestore** — the same database as the mobile app.

## What you need to provide

Add these to your `.env` file (copy from `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Your Firebase project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes (local) | Path to service account JSON file |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes (Render/cloud) | Minified service account JSON as one line |
| `FIREBASE_STORAGE_BUCKET` | Optional | For future upload migration to Firebase Storage |

---

## Where to find each value in Firebase Console

Open [Firebase Console](https://console.firebase.google.com) and select **the same project your mobile app uses**.

### 1. Project ID → `FIREBASE_PROJECT_ID`

1. Click the **gear icon** (Project settings) next to "Project Overview"
2. On the **General** tab, find **Project ID**
3. Copy it — e.g. `dheergayush-app` or similar

### 2. Service account JSON → `GOOGLE_APPLICATION_CREDENTIALS` (local)

The backend needs a **service account** to read/write Firestore with admin privileges.

1. Project settings → **Service accounts** tab
2. Click **Generate new private key**
3. Download the JSON file
4. Save it in the project root as `firebase-service-account.json` (already in `.gitignore`)
5. In `.env`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
   ```

> **Never commit this JSON file to Git.** It grants full admin access to your Firebase project.

### 3. Inline JSON → `FIREBASE_SERVICE_ACCOUNT_JSON` (Render / production)

On cloud hosts where you can't upload a file:

1. Open the downloaded JSON in a text editor
2. Minify it to a single line (remove newlines), or run locally:
   ```bash
   node scripts/minify-firebase-credentials.cjs ./your-service-account.json
   ```
3. Paste as the env var value in **Render → Environment**:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
   ```
4. **Remove** `GOOGLE_APPLICATION_CREDENTIALS` from Render if it points to a local path like `./hosp-test-app-firebase-adminsdk-....json` — that file is not deployed and causes admin API **500** errors.

### Render troubleshooting (admin 500 / "not connected")

| Symptom | Cause | Fix |
|---------|--------|-----|
| Admin login works but tabs show HTTP 500 | `GOOGLE_APPLICATION_CREDENTIALS` set to a file path that does not exist on Render | Set `FIREBASE_SERVICE_ACCOUNT_JSON` and delete `GOOGLE_APPLICATION_CREDENTIALS` on Render |
| `/api/health` shows `db: connected` but admin fails | Old health check did not test Firestore reads | Redeploy; health should show `credentials: service_account` and `firestore: true` |

### 4. Storage bucket → `FIREBASE_STORAGE_BUCKET` (optional)

1. Project settings → **General** tab
2. Scroll to **Your apps** → find **Storage bucket**
3. Usually: `your-project-id.appspot.com` or `your-project-id.firebasestorage.app`

Only needed if you later migrate file uploads from local disk to Firebase Storage.

### 5. Enable Firestore (if not already)

1. In the left sidebar: **Build → Firestore Database**
2. If not created yet, click **Create database**
3. Choose **Production mode**
4. Pick a region close to your users (e.g. `asia-south1` for India)

Your mobile app data should already be here if the app is live.

---

## Firestore collections used by this backend

| Collection | Purpose |
|------------|---------|
| `doctors` | Doctor profiles (see **Doctor field contract** below) |

### Doctor field contract (app + website must match)

| Field | Meaning | Values |
|-------|---------|--------|
| `status`, `approvalStatus`, `Regstatus` | **One-time** admin verification at registration (login gate) | `pending`, `approved`, `rejected` |
| `working`, `presenceStatus` | Doctor self-service online toggle after verified | `available`, `offline`, `busy`, `in_consultation` |

**Verification lifecycle:** Doctor signs up as `pending` → admin **Verify** or **Reject** once → if `approved`, status is **locked** (no further admin approval changes). Day-to-day availability is only `working` / `presenceStatus` (doctor app toggle).

Never store online/offline in `status`. Never store `approved` in `working`.  
Backend: `lib/doctorFields.js`. Flutter: `lib/utils/doctor_profile_utils.dart`.

| `users` | Patient accounts (`role: Customer`) |
| `payments` | Payment records |
| `appointments` | Consultation booking requests (same as mobile app; not `consultationRequests`) |
| `orders` | Medicine orders |
| `stores` | Ayurvedic store catalog |
| `prescriptions` | Prescriptions |
| `account_deletion_requests` | GDPR account deletion requests (app + website) |
| `writtenPrescs` | Written prescriptions |
| `prescribedCarts` | Prescribed medicine carts |

These must match the collection names in your mobile app's Firebase project.

---

## Setup steps

```bash
# 1. Copy env template
cp .env.example .env

# 2. Fill in FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS

# 3. Install dependencies
npm install

# 4. Start server
npm start

# 5. Verify
curl http://localhost:3000/api/health
# → { "ok": true, "provider": "firebase", "db": "connected" }
```

---

## Migrating old MongoDB data (one-time, optional)

If you have data in MongoDB that isn't yet in Firebase:

```bash
MONGOURI=mongodb+srv://... npm run db:migrate-firebase
```

This requires `mongoose` (installed as devDependency). Skip this step if your app already has all data in Firestore.

---

## Notes

- **Uploads** (`uploads/` folder) still use local disk. Firebase Storage migration can be a follow-up.
- Use the **same Firebase project** as the mobile app so web and app share one database.
- Patient passwords are stored as plain text — plan password hashing separately.

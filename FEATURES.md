# Dheergayush — Platform Features (Market Guide)

**Operator:** DHEERGAYUSH INDIA PRIVATE LIMITED  
**Stack:** Node.js + Express + MongoDB + static web app  
**Live URL:** https://dheergayush.net (configure on Render)

---

## User journeys

| Role | Flow |
|------|------|
| **Visitor** | Home → learn services → legal modals → book or shop |
| **Patient** | Landing → register/login → pick doctor → pay → video call → Rx / reports |
| **Doctor** | License login → go online → view appointments → video call → prescribe |
| **Admin** | `/admin` → secure login → approve doctors, manage data |
| **Shopper** | Stores → cart → checkout → order |

---

## 1. Home & marketing (`index.html`)

- Hero, services, about, medical disclaimer
- Footer: company address, support, **legal modals** (not separate pages)
- Store preview, doctor/review sections
- Side ads (desktop only)

---

## 2. Telemedicine booking (`landingpage.html` → `telemedicine_platform.html`)

- Patient registration/login (**password + phone verified**)
- Doctor registration (pending admin approval)
- Doctor list with **combined status**: schedule + DB (Available / Busy / Offline)
- Filters: location, language
- Select doctor → `payment.html`

**APIs:** `/api/login-patient`, `/api/register-doctor`, `/api/doctors`, `/api/doctors/all-approved`, `/api/doctors/filtered`

---

## 3. Payment (`payment.html`)

- Patient details, UPI payment proof upload, optional medical reports
- Creates consultation record + **video room ID**

**API:** `POST /api/payment`

---

## 4. Video consultation (`video-call.html`)

- HD video via Agora Web SDK
- **Token from server** (`POST /api/agora/token`) — secrets in `.env` only
- Doctor: prescriptions, view reports, written Rx upload
- Patient: join call, receive prescriptions
- Doctor status: Busy on start, Available on leave

**APIs:** `/api/prescribe-cart`, `/api/get-prescription/:roomId`, `/api/upload-report`, `/api/reports/:roomId`, `/api/written-prescription/*`

---

## 5. Doctor dashboard (`doctor.html` → `doctor1.html`)

- Login by **license** (approved doctors only)
- **Go Online / Go Offline** toggles
- View paid appointments
- Start consulting → video room

**APIs:** `/api/doctor-login`, `/api/doctors/status`, `/api/doctors/updateStatus`, `/api/payments/doctor/:name`

---

## 6. Patient portal (`patient.html`)

- Login with patient ID + password + phone
- View appointments, start video call when doctor **Available**

**APIs:** `/api/login-patient`, `/api/payments/patient/:phone`

---

## 7. Admin (`/admin`)

- **Bearer token** after login (24h)
- Tabs: doctors, patients, payments, prescriptions, orders
- Approve/reject doctors, edit/delete records

**Env:** `ADMIN_USERNAME`, `ADMIN_PASSWORD` (change in production!)

**APIs:** `/api/admin/login`, `/api/admin/*` (protected)

---

## 8. Ayurvedic store (`stores.html`)

- Catalog from MongoDB (`medicine/medicine/` images synced on boot)
- Cart, checkout, payment proof

**APIs:** `GET /api/stores`, `POST /api/orders`

---

## 9. E-Library (`Library.html`)

- Manuscript list, PDF viewer
- Stream via `/api/elibrary/stream` (Archive.org only)

---

## 10. CMEs (`CMEs.html`)

- Educational / webinar content (static UI)

---

## 11. Legal & compliance (in-app modals)

- Privacy, Terms, Refund, Support, Contact, About, **Delete Account**
- Delete account: `POST /api/account/deletion-request` + email fallback

---

## Production checklist

| Item | Action |
|------|--------|
| MongoDB | `MONGOURI` on Render, Atlas `0.0.0.0/0` |
| Admin password | Set strong `ADMIN_PASSWORD` in Render env |
| Agora | Set `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` in Render env |
| Domain | Point `dheergayush.net` to Render |
| Health | Monitor `GET /api/health` |
| HTTPS | Use Render SSL |

---

## Environment variables

See `.env.example` for full list including `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`.

---

## Support

- Email: shaikmasthanjavidvali@gmail.com  
- Phone: +91 9908797474

# Website Store Bridge Contract (`stores.html` / `/store`)

This document defines the JavaScript bridge between the Flutter app WebView and the DHEERGAYUSH website store. The Flutter side injects context after each page load; the website implements the handlers below.

## Detection

Flutter sets:

```javascript
window.__DG_FLUTTER_APP__ = true;
```

When this flag is present, the store prefers app-provided user/address/auth context over anonymous guest defaults.

## Bridge object

```javascript
window.DgStoreCartBridge = {
  setAppUserContext(payload) { /* implemented in stores-app.js */ },
  setFirebaseIdToken(token) { /* in-memory Firebase ID token */ },
  setAuthToken(token) { /* alias of setFirebaseIdToken */ },
  getFirebaseIdToken() { /* returns in-memory token or '' */ },
  setConsultationContext(payload) { /* appointmentId / prescriptionId */ },
  addPrescriptionItems(items) { /* ... */ },
  openCart() { /* ... */ },
};
```

## Auth token lifecycle (SSO)

1. After every WebView `onPageFinished`, Flutter obtains a **fresh** Firebase ID token via `FirebaseAuth.currentUser.getIdToken(true)`.
2. Flutter calls `DgStoreCartBridge.setFirebaseIdToken(token)` through `runJavaScript` — the token is passed as a JSON-encoded string and **never** placed in the URL, query string, or console logs.
3. The website holds the token in a page-scoped variable only (`firebaseAuthToken`). It must **not** be written to `localStorage` or `sessionStorage` by the Flutter bridge path.
4. `DgStorePayment` attaches `Authorization: Bearer <token>` on `POST /api/orders`, preferring the in-memory bridge token and falling back to `localStorage.firebaseIdToken` only for browser doctor/dashboard sessions.
5. On page reload / WebView navigation finish, Flutter reinjects a refreshed token.

## `setAppUserContext(payload)`

Called on every store page finish (with retries until the bridge is ready). Delivery address context is separate from the auth token.

### Payload shape

```json
{
  "uid": "firebase-auth-uid",
  "email": "user@example.com",
  "name": "Patient Name",
  "phone": "9876543210",
  "addresses": [
    {
      "id": "1700000000_123456",
      "label": "Home",
      "line1": "12 MG Road",
      "line2": "",
      "city": "Bengaluru",
      "state": "Karnataka",
      "pincode": "560001",
      "phone": "9876543210"
    }
  ],
  "defaultAddressId": "1700000000_123456",
  "selectedAddressId": "1700000000_123456",
  "source": "flutter_app"
}
```

### Website responsibilities (implemented)

1. Persist `uid` on the checkout session UI (display / address picker only).
2. Pre-fill checkout name, email, phone from the payload.
3. Show an address picker populated from `addresses[]`.
4. Initialize checkout with `selectedAddressId` (fallback: `defaultAddressId`).
5. When the user picks a different address, update `selectedAddressId` locally before payment.
6. Include `deliveryAddressId` and a snapshot of the chosen address on the order POST body.

## Prescription cart payload

Flutter opens `/store` with optional `appointmentId` / `prescriptionId` query params and then calls:

- `setConsultationContext({ appointmentId, prescriptionId })`
- `addPrescriptionItems([{ medicineId, productId, name, price, quantity, ... }])`
- `openCart()` when reordering from a prescription

Checkout includes those IDs on `orderData` with `source: "prescription"`.

## Identity ownership (`POST /api/orders`)

| Order type | Auth required | `userId` / `patientId` |
|---|---|---|
| Guest website order (no Rx linkage) | No | Derived as guest; client `uid` ignored |
| Signed-in Flutter / website order | Bearer verified | Taken **only** from verified Firebase token |
| Prescription-linked (`appointmentId`, `prescriptionId`, or `source=prescription`) | **Yes** | Token uid; server rejects missing token, forged uid, or another patient’s prescription/appointment |

Server also persists `deliveryAddressId` + `deliveryAddressSnapshot` when provided, and continues catalog/price validation.

## Verification checklist

- [x] `setAppUserContext` implemented with address picker
- [x] In-memory `setFirebaseIdToken` / `getFirebaseIdToken` bridge
- [x] `DgStorePayment` prefers bridge Bearer token
- [x] Prescription-linked orders require verified Firebase auth + ownership checks
- [x] Paid orders store `userId`/`patientId` from token + `deliveryAddressId` snapshot
- [x] Prescription items / consultation context bridge methods present
- [ ] Deploy website + Flutter builds and verify WebView end-to-end

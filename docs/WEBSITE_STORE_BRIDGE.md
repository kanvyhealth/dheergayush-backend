# Website Store Bridge Contract (`stores.html`)

This document defines the JavaScript bridge between the Flutter app WebView and the DHEERGAYUSH website store (`/stores.html`). The Flutter side injects context after each page load; the website implements the handlers below.

## Detection

Flutter sets:

```javascript
window.__DG_FLUTTER_APP__ = true;
```

When this flag is present, the store prefers app-provided user/address context over anonymous guest defaults.

## Bridge object

```javascript
window.DgStoreCartBridge = {
  setAppUserContext(payload) { /* implemented in stores-app.js */ },
  setConsultationContext(payload) { /* ... */ },
  addPrescriptionItems(items) { /* ... */ },
  openCart() { /* ... */ },
};
```

## `setAppUserContext(payload)`

Called on every store page finish (with retries until the bridge is ready).

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

1. Persist `uid` on the checkout session / order payload.
2. Pre-fill checkout name, email, phone from the payload.
3. Show an address picker populated from `addresses[]`.
4. Initialize checkout with `selectedAddressId` (fallback: `defaultAddressId`).
5. When the user picks a different address, update `selectedAddressId` locally before payment.
6. Include `deliveryAddressId` and a snapshot of the chosen address on the order POST body.

## Verification checklist

- [x] `setAppUserContext` implemented with address picker
- [x] Paid orders store `uid` + `deliveryAddressId` for app users
- [x] Prescription items / consultation context bridge methods present
- [ ] Deploy to production and verify Flutter WebView end-to-end
- [ ] Signed-in native payment uses auth create-order endpoint (Flutter side)

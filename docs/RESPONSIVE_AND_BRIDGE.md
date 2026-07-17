# Local website changes (responsive + Flutter bridge)

Work in this extracted folder: `dheergayush-backend-main`.

## Changed files

- `public/stores.html` — responsive CSS links, mobile filters toggle, saved-address checkout fields
- `public/css/dg-store-responsive.css` — new store mobile/desktop polish
- `public/index.html` — includes `css/dg-responsive.css`
- `public/js/stores-app.js` — `DgStoreCartBridge.setAppUserContext`, address picker, `uid` / `deliveryAddressId` on orders
- `docs/WEBSITE_STORE_BRIDGE.md` — Flutter ↔ website contract

## Deploy

Copy/sync these files to your live host (or push to `kanvyhealth/dheergayush-backend` and redeploy Render). Flutter app UI is unchanged; it only loads `/stores.html`.

## Verify

1. Phone + desktop browser: store grid, filters, cart, checkout.
2. Flutter WebView: after page load, bridge receives `setAppUserContext`; checkout shows saved addresses.

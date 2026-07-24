# Legacy MongoDB stack (unused)

This folder holds the **pre-Firebase** Express + Mongoose code. It is **not** started by `npm start`.

| Path | Notes |
|------|--------|
| `app.mongo.js` | Old entry that connected to MongoDB and mounted `/api/admin` |
| `models/` | Mongoose schemas |
| `routes/admin.js` | Admin CRUD against Mongoose |
| `server.monolith.js` | Snapshot of the pre-refactor single-file server |

The live application uses **Firebase Firestore** under `src/` (`src/server.js` → `src/application.js` → `src/modules/*`).

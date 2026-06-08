#!/usr/bin/env node
/**
 * One-time migration: MongoDB (Mongoose) → Firebase Firestore
 *
 * Requires mongoose as a dev dependency: npm install
 *
 * Usage:
 *   MONGOURI=mongodb+srv://... FIREBASE_PROJECT_ID=... GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json npm run db:migrate-firebase
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { initFirebase, getFirestore } = require('../lib/firebase');

const COLLECTION_MAP = [
  [require('../models/Doctor'), 'doctors'],
  [require('../models/Patient'), 'patients'],
  [require('../models/Payment'), 'payments'],
  [require('../models/ConsultationRequest'), 'consultationRequests'],
  [require('../models/Order'), 'orders'],
  [require('../models/Store'), 'stores'],
  [require('../models/Prescription'), 'prescriptions'],
  [require('../models/AccountDeletionRequest'), 'account_deletion_requests'],
  [require('../models/writtenpresc'), 'writtenPrescs'],
  [require('../models/prescribedCart.model'), 'prescribedCarts']
];

function serializeDoc(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const out = { ...obj };
  delete out.__v;
  delete out.toObject;
  delete out.save;
  return out;
}

async function migrateCollection(Model, collectionName) {
  const docs = await Model.find({});
  const firestore = getFirestore();
  let count = 0;

  for (const doc of docs) {
    const data = serializeDoc(doc);
    const id = String(data._id || doc._id);
    delete data._id;
    await firestore.collection(collectionName).doc(id).set(data, { merge: true });
    count += 1;
  }

  console.log(`  ✓ ${collectionName}: ${count} documents`);
  return count;
}

async function main() {
  if (!process.env.MONGOURI) {
    throw new Error('MONGOURI is required to read from MongoDB');
  }
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID is required to write to Firestore');
  }

  console.log('🔗 Connecting to MongoDB…');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGOURI, { serverSelectionTimeoutMS: 12000 });

  console.log('🔗 Connecting to Firebase…');
  await initFirebase();

  console.log('📤 Migrating collections…');
  let total = 0;
  for (const [Model, collectionName] of COLLECTION_MAP) {
    total += await migrateCollection(Model, collectionName);
  }

  console.log(`\n✅ Migration complete — ${total} documents copied.`);
  console.log('Restart the server and verify GET /api/health → provider: firebase');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

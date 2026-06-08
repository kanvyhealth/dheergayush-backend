const { User } = require('./data');
const { getFirestore } = require('./firebase');
const { normalizePhone } = require('./userQueries');

function phonePatientUid(phone) {
  const needle = normalizePhone(phone);
  if (!needle) return '';
  return `web_phone_${needle}`;
}

async function ensurePatientUid({ phone, name, email, firebaseUid }) {
  if (firebaseUid) {
    return String(firebaseUid);
  }

  const needle = normalizePhone(phone);
  if (!needle) {
    return '';
  }

  const { findCustomerByPhone } = require('./userQueries');
  const existingCustomer = await findCustomerByPhone(phone);
  if (existingCustomer) {
    return String(
      existingCustomer.uid || existingCustomer._id || existingCustomer.id || ''
    );
  }

  const guestUid = phonePatientUid(phone);
  const guest =
    (await User.findById(guestUid)) || (await User.findOne({ phone: needle }));

  if (guest) {
    return String(guest.uid || guest._id || guest.id || guestUid);
  }

  await User.create({
    _id: guestUid,
    uid: guestUid,
    phone: needle,
    name: String(name || 'Guest').trim() || 'Guest',
    email: String(email || '').trim(),
    role: 'Customer',
    status: 'active',
    isGuest: true,
    source: 'website',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return guestUid;
}

async function linkAppointmentsToAuthUid({ authUid, phone }) {
  const needle = normalizePhone(phone);
  if (!authUid || !needle) {
    return 0;
  }

  const guestUid = phonePatientUid(phone);
  const db = getFirestore();
  const idsToReplace = new Set([guestUid, needle, `web_${needle}`].filter(Boolean));
  let updated = 0;

  for (const oldId of idsToReplace) {
    const appointments = await db
      .collection('appointments')
      .where('patientId', '==', oldId)
      .get();
    for (const doc of appointments.docs) {
      await doc.ref.set(
        {
          patientId: authUid,
          userId: authUid,
          user_id: authUid,
          customerId: authUid,
          updatedAt: new Date()
        },
        { merge: true }
      );
      updated += 1;
    }

    const payments = await db
      .collection('payments')
      .where('patientId', '==', oldId)
      .get();
    for (const doc of payments.docs) {
      await doc.ref.set(
        {
          patientId: authUid,
          userId: authUid,
          updatedAt: new Date()
        },
        { merge: true }
      );
      updated += 1;
    }
  }

  const byPhone = await db
    .collection('appointments')
    .where('patientPhone', '==', needle)
    .get();
  for (const doc of byPhone.docs) {
    const data = doc.data() || {};
    const currentPatientId = String(data.patientId || '').trim();
    if (currentPatientId && currentPatientId === authUid) {
      continue;
    }
    if (!currentPatientId || idsToReplace.has(currentPatientId)) {
      await doc.ref.set(
        {
          patientId: authUid,
          userId: authUid,
          user_id: authUid,
          customerId: authUid,
          updatedAt: new Date()
        },
        { merge: true }
      );
      updated += 1;
    }
  }

  return updated;
}

module.exports = {
  phonePatientUid,
  ensurePatientUid,
  linkAppointmentsToAuthUid
};

const { Payment, Doctor, User } = require('./data');
const { normalizePaymentForWeb } = require('./mobileSchema');
const { normalizePhone, listCustomers, listDoctors } = require('./userQueries');

let cache = { at: 0, doctors: [], customers: [], users: [], doctorByKey: new Map(), customerByKey: new Map(), userByKey: new Map() };
const CACHE_MS = 60000;

async function loadLookupCache() {
  if (cache.doctors.length && Date.now() - cache.at < CACHE_MS) return cache;
  const [doctors, customers, users] = await Promise.all([listDoctors(), listCustomers(), User.find({})]);
  const doctorByKey = new Map();
  const customerByKey = new Map();
  const userByKey = new Map();
  for (const d of doctors) {
    const n = d.toObject ? d.toObject() : { ...d };
    [n._id, n.id, n.uid, n.name, n.doctorId, n.license].filter(Boolean).forEach((k) => doctorByKey.set(String(k), n));
  }
  for (const c of customers) {
    const n = c.toObject ? c.toObject() : { ...c };
    [n._id, n.id, n.uid, n.patientId, n.name, n.userId].filter(Boolean).forEach((k) => customerByKey.set(String(k), n));
    if (n.phone) customerByKey.set(normalizePhone(n.phone), n);
  }
  for (const u of users) {
    const n = u.toObject ? u.toObject() : { ...u };
    [n._id, n.id, n.uid].filter(Boolean).forEach((k) => userByKey.set(String(k), n));
  }
  cache = { at: Date.now(), doctors, customers, users, doctorByKey, customerByKey, userByKey };
  return cache;
}

function enrichPayment(raw, lookup) {
  const d = normalizePaymentForWeb(raw);
  const rawObj = raw.toObject ? raw.toObject() : raw;
  const customer =
    lookup.customerByKey.get(String(d.patientId || '')) ||
    lookup.customerByKey.get(String(d.uid || '')) ||
    lookup.customerByKey.get(String(d.userId || '')) ||
    (d.phone ? lookup.customerByKey.get(normalizePhone(d.phone)) : null);
  const user =
    lookup.userByKey.get(String(rawObj.patientId || '')) ||
    lookup.userByKey.get(String(rawObj.uid || '')) ||
    lookup.userByKey.get(String(d.patientId || ''));
  if (user) {
    if (!d.name) d.name = user.name || '';
    if (!d.phone && user.phone) d.phone = user.phone;
    if (!d.patientName) d.patientName = d.name;
  }
  if (customer) {
    if (!d.phone && customer.phone) d.phone = customer.phone;
    if (!d.name) d.name = customer.name || customer.patientId || '';
    if (!d.patientName) d.patientName = d.name;
  }
  const doc =
    lookup.doctorByKey.get(String(d.doctorId || '')) ||
    lookup.doctors.find((x) => x.name === d.selectedDoctorName || x.name === d.doctorName);
  if (doc && !d.selectedDoctorName) {
    d.selectedDoctorName = doc.name;
    d.doctorName = doc.name;
  }
  d.paymentStatus = rawObj.status || d.paymentStatus || '';
  d.consultationStatus = rawObj.consultationStatus || rawObj.ringingStatus || d.consultationStatus || '';
  if (!d.amount && rawObj.originalAmount != null) d.amount = rawObj.originalAmount;
  if (!d.name && rawObj.patientName) d.name = rawObj.patientName;
  if (!d.selectedDoctorFee && rawObj.amount != null) d.selectedDoctorFee = rawObj.amount;
  return d;
}

function paymentMatchesPatient(raw, phoneOrUid, lookup) {
  const needlePhone = normalizePhone(phoneOrUid);
  const customer =
    lookup.customerByKey.get(String(phoneOrUid)) ||
    lookup.customerByKey.get(needlePhone) ||
    lookup.customers.find((c) => normalizePhone(c.phone) === needlePhone);
  const uid = customer?.uid || customer?._id;
  const keys = [raw.phone, raw.patientPhone, raw.patientId, raw.uid, raw.userId].filter(Boolean).map(String);
  if (needlePhone && [raw.phone, raw.patientPhone].some((x) => normalizePhone(x) === needlePhone)) return true;
  if (uid && keys.includes(String(uid))) return true;
  if (String(phoneOrUid).length > 10 && keys.includes(String(phoneOrUid))) return true;
  if (customer?.patientId && raw.patientId === customer.patientId) return true;
  if (customer?.name && raw.patientId === customer.name) return true;
  return false;
}

function paymentMatchesDoctor(raw, doctorName, lookup) {
  const decodedName = decodeURIComponent(String(doctorName || ''));
  const n = normalizePaymentForWeb(raw);
  if (n.selectedDoctorName === decodedName || n.doctorName === decodedName) return true;
  const doctor = lookup.doctorByKey.get(decodedName) || lookup.doctors.find((d) => d.name === decodedName);
  if (doctor && raw.doctorId) {
    const id = String(raw.doctorId);
    return id === String(doctor._id) || id === String(doctor.uid) || id === String(doctor.id);
  }
  return false;
}

async function listPaymentsForPatient(phoneOrUid) {
  const lookup = await loadLookupCache();
  const all = await Payment.find({}).sort({ createdAt: -1 });
  return all.filter((p) => paymentMatchesPatient(p, phoneOrUid, lookup)).map((p) => enrichPayment(p, lookup));
}

async function listPaymentsForDoctor(doctorName) {
  const lookup = await loadLookupCache();
  const all = await Payment.find({}).sort({ createdAt: -1 });
  return all.filter((p) => paymentMatchesDoctor(p, doctorName, lookup)).map((p) => enrichPayment(p, lookup));
}

async function listRoomIdsForDoctor(doctorName) {
  const payments = await listPaymentsForDoctor(doctorName);
  return [...new Set(payments.map((p) => p.roomName || p.videoRoomId).filter(Boolean))];
}

module.exports = {
  normalizePhone,
  loadLookupCache,
  enrichPayment,
  listPaymentsForPatient,
  listPaymentsForDoctor,
  listRoomIdsForDoctor,
  paymentMatchesPatient,
  paymentMatchesDoctor
};

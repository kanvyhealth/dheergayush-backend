/**
 * Daily website visit counters (IST calendar days).
 * Firestore: site_daily_stats/{yyyy-mm-dd} + visitors subcollection for uniques.
 * Falls back to process memory when Firebase is not connected.
 */
const crypto = require('crypto');
const { getFirestore, getAdmin, isFirebaseReady } = require('../../core/firebase');
const { listCustomers, listDoctors } = require('../../core/userQueries');
const { isDoctorApproved } = require('../doctors/doctorAvailability');

const COLLECTION = 'site_daily_stats';
const memoryDays = new Map();

function dateKeyIST(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDaysToKey(key, days) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function lastDateKeys(n) {
  const today = dateKeyIST();
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addDaysToKey(today, -i));
  return keys;
}

function sanitizePath(raw) {
  let path = String(raw || '/').split('?')[0].split('#')[0].trim() || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 80) path = path.slice(0, 80);
  return path;
}

function visitorHash(visitorId, day) {
  return crypto
    .createHash('sha256')
    .update(`${String(visitorId || '').trim()}|${day}`)
    .digest('hex')
    .slice(0, 32);
}

function isValidVisitorId(id) {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(String(id || ''));
}

function recordInMemory(day, hash, path) {
  let row = memoryDays.get(day);
  if (!row) {
    row = { date: day, pageViews: 0, uniqueVisitors: 0, visitors: new Set(), paths: Object.create(null) };
    memoryDays.set(day, row);
  }
  row.pageViews += 1;
  if (!row.visitors.has(hash)) {
    row.visitors.add(hash);
    row.uniqueVisitors += 1;
  }
  row.paths[path] = (row.paths[path] || 0) + 1;
  return { ok: true, stored: 'memory' };
}

function memoryRow(day) {
  const row = memoryDays.get(day);
  if (!row) return { date: day, pageViews: 0, uniqueVisitors: 0 };
  return { date: day, pageViews: row.pageViews, uniqueVisitors: row.uniqueVisitors };
}

async function recordSiteVisit({ visitorId, path } = {}) {
  if (!isValidVisitorId(visitorId)) return { ok: false, error: 'invalid visitor' };
  const day = dateKeyIST();
  const hash = visitorHash(visitorId, day);
  const page = sanitizePath(path);

  if (!isFirebaseReady()) {
    return recordInMemory(day, hash, page);
  }

  try {
    const db = getFirestore();
    const admin = getAdmin();
    const FieldValue = admin.firestore.FieldValue;
    const dayRef = db.collection(COLLECTION).doc(day);
    const visitorRef = dayRef.collection('visitors').doc(hash);

    await db.runTransaction(async (tx) => {
      const visitorSnap = await tx.get(visitorRef);
      const isNew = !visitorSnap.exists;
      tx.set(dayRef, {
        date: day,
        pageViews: FieldValue.increment(1),
        uniqueVisitors: FieldValue.increment(isNew ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      if (isNew) {
        tx.set(visitorRef, { firstSeenAt: FieldValue.serverTimestamp() });
      }
    });
    return { ok: true, stored: 'firestore' };
  } catch (err) {
    console.warn('Site visit Firestore write skipped:', err.message);
    return recordInMemory(day, hash, page);
  }
}

function mergeDay(fsRow, memRow) {
  return {
    date: fsRow.date || memRow.date,
    pageViews: Number(fsRow.pageViews || 0) + Number(memRow.pageViews || 0),
    uniqueVisitors: Number(fsRow.uniqueVisitors || 0) + Number(memRow.uniqueVisitors || 0)
  };
}

async function loadFirestoreDays(keys) {
  if (!isFirebaseReady()) {
    return keys.map((date) => ({ date, pageViews: 0, uniqueVisitors: 0 }));
  }
  try {
    const col = getFirestore().collection(COLLECTION);
    const snaps = await Promise.all(keys.map((key) => col.doc(key).get()));
    return snaps.map((snap, i) => {
      const data = snap.exists ? snap.data() || {} : {};
      return {
        date: keys[i],
        pageViews: Number(data.pageViews || 0),
        uniqueVisitors: Number(data.uniqueVisitors || 0)
      };
    });
  } catch (err) {
    console.warn('Site stats Firestore read skipped:', err.message);
    return keys.map((date) => ({ date, pageViews: 0, uniqueVisitors: 0 }));
  }
}

async function getMemberCounts() {
  const empty = { patients: 0, doctors: 0, approvedDoctors: 0 };
  if (!isFirebaseReady()) return empty;
  try {
    const [customers, doctors] = await Promise.all([
      listCustomers(),
      listDoctors()
    ]);
    const patientList = Array.isArray(customers) ? customers : [];
    const doctorList = Array.isArray(doctors) ? doctors : [];
    return {
      patients: patientList.length,
      doctors: doctorList.length,
      approvedDoctors: doctorList.filter((d) => isDoctorApproved(d)).length
    };
  } catch (err) {
    console.warn('Member counts skipped:', err.message);
    return empty;
  }
}

async function getSiteStats({ days = 14 } = {}) {
  const n = Math.min(31, Math.max(1, parseInt(days, 10) || 14));
  const keys = lastDateKeys(n);
  const fsDays = await loadFirestoreDays(keys);
  const dayRows = fsDays.map((row) => mergeDay(row, memoryRow(row.date)));
  const today = dayRows[dayRows.length - 1] || { date: dateKeyIST(), pageViews: 0, uniqueVisitors: 0 };
  const members = await getMemberCounts();
  return {
    timezone: 'Asia/Kolkata',
    today,
    days: dayRows,
    members
  };
}

module.exports = {
  recordSiteVisit,
  getSiteStats,
  dateKeyIST,
  isValidVisitorId
};

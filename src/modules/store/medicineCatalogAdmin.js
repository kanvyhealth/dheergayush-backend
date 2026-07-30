/**
 * Admin read/write for public/data/medicine-catalog.json (authoritative catalog).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CATALOG_PATH } = require('./medicineCatalogJson');

function readStoresRaw() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

function writeStoresRaw(stores) {
  const dir = path.dirname(CATALOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(stores, null, 2), 'utf8');
}

function flattenMedicines(stores) {
  const out = [];
  stores.forEach((store) => {
    const storeBrand = String(store.name || '').trim();
    (store.medicines || []).forEach((med, index) => {
      out.push({
        ...med,
        _id: String(med._id || med.id || ''),
        storeId: store._id,
        storeName: storeBrand,
        brand: String(med.brand || med.company || storeBrand || '').trim(),
        company: String(med.company || med.brand || storeBrand || '').trim(),
        _storeIndex: stores.indexOf(store),
        _medicineIndex: index
      });
    });
  });
  return out;
}

function listMedicinesAdmin({ q = '', brand = '', category = '', page = 1, limit = 50 } = {}) {
  const stores = readStoresRaw();
  let items = flattenMedicines(stores);
  const query = String(q || '').trim().toLowerCase();
  const brandQ = String(brand || '').trim().toLowerCase();
  const catQ = String(category || '').trim().toLowerCase();
  if (query) {
    items = items.filter((m) =>
      String(m.name || '').toLowerCase().includes(query) ||
      String(m.description || '').toLowerCase().includes(query) ||
      String(m._id || '').toLowerCase().includes(query)
    );
  }
  if (brandQ) {
    items = items.filter((m) =>
      String(m.brand || m.company || m.storeName || '').toLowerCase().includes(brandQ)
    );
  }
  if (catQ) {
    items = items.filter((m) => String(m.category || '').toLowerCase().includes(catQ));
  }
  const total = items.length;
  const pageNum = Math.max(1, Number(page) || 1);
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const start = (pageNum - 1) * lim;
  return {
    total,
    page: pageNum,
    limit: lim,
    items: items.slice(start, start + lim).map((m) => {
      const { _storeIndex, _medicineIndex, ...rest } = m;
      return rest;
    })
  };
}

function findMedicineLocation(stores, id) {
  const target = String(id || '').trim();
  if (!target) return null;
  for (let si = 0; si < stores.length; si++) {
    const meds = stores[si].medicines || [];
    for (let mi = 0; mi < meds.length; mi++) {
      const mid = String(meds[mi]._id || meds[mi].id || '');
      if (mid === target) return { storeIndex: si, medicineIndex: mi, store: stores[si], medicine: meds[mi] };
    }
  }
  return null;
}

function getMedicineAdmin(id) {
  const stores = readStoresRaw();
  const loc = findMedicineLocation(stores, id);
  if (!loc) return null;
  return {
    ...loc.medicine,
    storeId: loc.store._id,
    storeName: loc.store.name,
    brand: loc.medicine.brand || loc.medicine.company || loc.store.name
  };
}

function newMedicineId() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeMedicinePayload(body = {}, existing = {}) {
  const name = String(body.name || existing.name || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const weights = Array.isArray(body.weights) ? body.weights : (existing.weights || []);
  return {
    ...existing,
    _id: String(body._id || existing._id || newMedicineId()),
    name,
    description: body.description != null ? String(body.description) : (existing.description || ''),
    category: body.category != null ? String(body.category) : (existing.category || ''),
    subCategory: body.subCategory != null
      ? String(body.subCategory)
      : (body.subcategory != null ? String(body.subcategory) : (existing.subCategory || '')),
    brand: body.brand != null ? String(body.brand) : (existing.brand || existing.company || ''),
    company: body.company != null ? String(body.company) : (body.brand || existing.company || existing.brand || ''),
    imageFile: body.imageFile != null ? String(body.imageFile) : (existing.imageFile || ''),
    imageUrl: body.imageUrl != null ? String(body.imageUrl) : (existing.imageUrl || ''),
    storeVisible: body.storeVisible === false ? false : (existing.storeVisible === false ? false : true),
    weights
  };
}

function upsertMedicineAdmin(body = {}) {
  const stores = readStoresRaw();
  const id = String(body._id || body.id || '').trim();
  let loc = id ? findMedicineLocation(stores, id) : null;

  const brandName = String(body.brand || body.company || body.storeName || '').trim();
  if (!loc) {
    let store =
      stores.find((s) => String(s._id) === String(body.storeId || '')) ||
      stores.find((s) => String(s.name || '').toLowerCase() === brandName.toLowerCase());
    if (!store) {
      store = {
        _id: newMedicineId(),
        name: brandName || 'General',
        logo: '/logos/logo-horizontal.png',
        description: `${brandName || 'General'} — Ayurvedic medicines.`,
        medicines: []
      };
      stores.push(store);
    }
    if (!Array.isArray(store.medicines)) store.medicines = [];
    const med = normalizeMedicinePayload(body, {});
    store.medicines.push(med);
    writeStoresRaw(stores);
    return { medicine: med, created: true, storeId: store._id, storeName: store.name };
  }

  const med = normalizeMedicinePayload(body, loc.medicine);
  stores[loc.storeIndex].medicines[loc.medicineIndex] = med;
  writeStoresRaw(stores);
  return {
    medicine: med,
    created: false,
    storeId: loc.store._id,
    storeName: loc.store.name
  };
}

function hideMedicineAdmin(id) {
  const stores = readStoresRaw();
  const loc = findMedicineLocation(stores, id);
  if (!loc) return null;
  const med = { ...loc.medicine, storeVisible: false };
  stores[loc.storeIndex].medicines[loc.medicineIndex] = med;
  writeStoresRaw(stores);
  return med;
}

async function upsertFirebaseMedicine(medicine) {
  try {
    const { Medicine } = require('../../core/data');
    const id = String(medicine._id || medicine.id || '');
    if (!id) return;
    const payload = {
      ...medicine,
      name: medicine.name,
      brand: medicine.brand || medicine.company,
      company: medicine.company || medicine.brand,
      storeVisible: medicine.storeVisible !== false,
      updatedAt: new Date()
    };
    const existing = await Medicine.findById(id);
    if (existing) {
      await Medicine.findByIdAndUpdate(id, { $set: payload });
    } else {
      await Medicine.create({ _id: id, ...payload, createdAt: new Date() });
    }
  } catch (err) {
    console.warn('Firebase medicine upsert skipped:', err.message);
  }
}

module.exports = {
  CATALOG_PATH,
  readStoresRaw,
  writeStoresRaw,
  listMedicinesAdmin,
  getMedicineAdmin,
  upsertMedicineAdmin,
  hideMedicineAdmin,
  upsertFirebaseMedicine
};

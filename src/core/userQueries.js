const { User, Doctor } = require('./data');

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function findCustomerByUid(uid) {
  if (!uid) return null;
  const user = (await User.findById(uid)) || (await User.findOne({ uid }));
  if (!user || user.role !== 'Customer') return null;
  return user;
}

async function findCustomerByPhone(phone) {
  if (!phone) return null;
  const needle = normalizePhone(phone);
  const exact = await User.findOne({ phone, role: 'Customer' });
  if (exact) return exact;
  const customers = await User.find({ role: 'Customer' });
  return customers.find((u) => normalizePhone(u.phone) === needle) || null;
}

function listCustomers() {
  return User.find({ role: 'Customer' });
}

async function findDoctorByUid(uid) {
  if (!uid) return null;
  return (await Doctor.findOne({ uid })) || (await Doctor.findById(uid));
}

async function findDoctorById(id) {
  if (!id) return null;
  const doctor = await Doctor.findById(id);
  if (!doctor) return null;
  return doctor;
}

async function findDoctorByName(doctorName) {
  const want = String(doctorName || '').trim();
  if (!want) return null;

  let doc = await Doctor.findOne({ name: want });
  if (doc) return doc;

  const lower = want.toLowerCase();
  const all = await Doctor.find({});
  const list = Array.isArray(all) ? all : [];
  return (
    list.find((d) => {
      const n = String(d.name || d.displayName || '').trim().toLowerCase();
      return n && n === lower;
    }) || null
  );
}

async function findDoctorByEmail(email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return null;

  const direct = await Doctor.findOne({ email: want });
  if (direct) return direct;

  const all = await Doctor.find({});
  const list = Array.isArray(all) ? all : [];
  return (
    list.find((d) => String(d.email || '').trim().toLowerCase() === want) || null
  );
}

function listDoctors(extraFilter = {}) {
  return Doctor.find({ ...extraFilter });
}

module.exports = {
  normalizePhone,
  findCustomerByUid,
  findCustomerByPhone,
  listCustomers,
  findDoctorByUid,
  findDoctorById,
  findDoctorByName,
  findDoctorByEmail,
  listDoctors
};

const { createModel } = require('../firestoreModel');
const {
  normalizeDoctorForWeb,
  normalizeUserForWeb,
  normalizeAppointmentForWeb,
  normalizePaymentForWeb,
  normalizeDocumentForWeb,
  transformDoctorQuery,
  postFilterDoctor,
  transformAppointmentQuery,
  postFilterAppointment,
  transformPaymentQuery,
  postFilterPayment
} = require('../mobileSchema');

const userOpts = {
  transformDoc: normalizeUserForWeb,
  postFilter(doc, filter = {}) {
    if (!filter.role) return true;
    const d = doc.toObject ? doc.toObject() : doc;
    return d.role === filter.role;
  }
};

const doctorOpts = {
  transformQuery: transformDoctorQuery,
  postFilter: postFilterDoctor,
  transformDoc: normalizeDoctorForWeb
};

const appointmentOpts = {
  transformQuery: transformAppointmentQuery,
  postFilter: postFilterAppointment,
  transformDoc: normalizeAppointmentForWeb
};

const paymentOpts = {
  transformQuery: transformPaymentQuery,
  postFilter: postFilterPayment,
  transformDoc: normalizePaymentForWeb
};

const { sanitizeDoctorFeeUpdate } = require('../../modules/doctors/doctorFeeApproval');
const Doctor = createModel('doctors', doctorOpts);
const baseFindByIdAndUpdate = Doctor.findByIdAndUpdate.bind(Doctor);
const baseFindOneAndUpdate = Doctor.findOneAndUpdate.bind(Doctor);

Doctor.findByIdAndUpdate = async function findByIdAndUpdate(id, update, options = {}) {
  const current = await Doctor.findById(id);
  if (!current) return null;
  const sanitized = sanitizeDoctorFeeUpdate(current, update);
  return baseFindByIdAndUpdate(id, sanitized, options);
};

Doctor.findOneAndUpdate = async function findOneAndUpdate(filter, update, options = {}) {
  const current = await Doctor.findOne(filter);
  if (!current) {
    return baseFindOneAndUpdate(filter, update, options);
  }
  const sanitized = sanitizeDoctorFeeUpdate(current, update);
  return baseFindByIdAndUpdate(current._id, sanitized, options);
};

module.exports = {
  User: createModel('users', userOpts),
  Doctor,
  Payment: createModel('payments', paymentOpts),
  Appointment: createModel('appointments', appointmentOpts),
  ConsultationRequest: createModel('appointments', appointmentOpts),
  Order: createModel('orders'),
  MedicineOrder: createModel('medicine_orders'),
  Store: createModel('stores'),
  Prescription: createModel('prescriptions'),
  Document: createModel('documents', { transformDoc: normalizeDocumentForWeb }),
  WrittenPresc: createModel('documents', { transformDoc: normalizeDocumentForWeb }),

  Banner: createModel('banners'),
  ConsultationAccess: createModel('consultation_access'),
  ConsultationCoupon: createModel('consultation_coupons'),
  ConsultationQueue: createModel('consultation_queue'),
  ConsultationSession: createModel('consultation_sessions'),
  DoctorAvailability: createModel('doctor_availability'),
  InventoryProduct: createModel('inventory_products'),
  Medicine: createModel('medicines'),
  Metadata: createModel('metadata'),
  Notification: createModel('notifications'),
  ProductCategory: createModel('product_categories'),

  AccountDeletionRequest: createModel('account_deletion_requests'),
  PrescribedCart: createModel('prescribedCarts')
};

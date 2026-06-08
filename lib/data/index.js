const { isFirebaseReady } = require('../firebase');

let cached = null;

function loadModels() {
  if (cached) return cached;
  cached = require('./firebase');
  return cached;
}

function getProvider() {
  return 'firebase';
}

module.exports = {
  getProvider,
  loadModels,
  get User() { return loadModels().User; },
  get Doctor() { return loadModels().Doctor; },
  get Payment() { return loadModels().Payment; },
  get Appointment() { return loadModels().Appointment; },
  get ConsultationRequest() { return loadModels().ConsultationRequest; },
  get Order() { return loadModels().Order; },
  get MedicineOrder() { return loadModels().MedicineOrder; },
  get Store() { return loadModels().Store; },
  get Prescription() { return loadModels().Prescription; },
  get Document() { return loadModels().Document; },
  get AccountDeletionRequest() { return loadModels().AccountDeletionRequest; },
  get WrittenPresc() { return loadModels().WrittenPresc; },
  get PrescribedCart() { return loadModels().PrescribedCart; },
  get Banner() { return loadModels().Banner; },
  get ConsultationAccess() { return loadModels().ConsultationAccess; },
  get ConsultationCoupon() { return loadModels().ConsultationCoupon; },
  get ConsultationQueue() { return loadModels().ConsultationQueue; },
  get ConsultationSession() { return loadModels().ConsultationSession; },
  get DoctorAvailability() { return loadModels().DoctorAvailability; },
  get InventoryProduct() { return loadModels().InventoryProduct; },
  get Medicine() { return loadModels().Medicine; },
  get Metadata() { return loadModels().Metadata; },
  get Notification() { return loadModels().Notification; },
  get ProductCategory() { return loadModels().ProductCategory; },
  isDbReady: () => isFirebaseReady()
};

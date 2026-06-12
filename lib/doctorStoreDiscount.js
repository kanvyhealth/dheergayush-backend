/** Doctor-only discount on Ayurvedic store product purchases (not consultations). */
const DOCTOR_STORE_DISCOUNT_RATE = 0.2;
const DOCTOR_STORE_DISCOUNT_PERCENT = 20;

function isTestOnlyCartItems(items = []) {
  return items.length === 1 &&
    String(items[0].medicineId || items[0].storeProductId || items[0].id || '').trim() === 'dheergayush_test_1rupee';
}

function computeStoreDeliveryFee(afterDiscount, items = []) {
  if (isTestOnlyCartItems(items)) return 0;
  return afterDiscount > 1000 ? 0 : 150;
}

function computeDoctorStoreTotals(subtotal, items = [], isDoctor = false) {
  const base = Math.round(Number(subtotal) * 100) / 100;
  const discount = isDoctor ? Math.round(base * DOCTOR_STORE_DISCOUNT_RATE) : 0;
  const afterDiscount = base - discount;
  const deliveryFee = computeStoreDeliveryFee(afterDiscount, items);
  const totalAmount = afterDiscount + deliveryFee;
  return {
    subtotal: base,
    discount,
    deliveryFee,
    totalAmount,
    isDoctorOrder: !!isDoctor
  };
}

function applyDoctorStorePricing(orderData, isDoctor = false) {
  const subtotal = Number(orderData.subtotal) || 0;
  const totals = computeDoctorStoreTotals(subtotal, orderData.items || [], isDoctor);
  orderData.subtotal = totals.subtotal;
  orderData.discount = totals.discount;
  orderData.deliveryFee = totals.deliveryFee;
  orderData.totalAmount = totals.totalAmount;
  if (isDoctor) {
    orderData.doctorDiscountApplied = true;
    orderData.doctorDiscountRate = DOCTOR_STORE_DISCOUNT_RATE;
    orderData.orderSourceRole = 'doctor';
  } else {
    orderData.doctorDiscountApplied = false;
    orderData.doctorDiscountRate = 0;
  }
  return orderData;
}

module.exports = {
  DOCTOR_STORE_DISCOUNT_RATE,
  DOCTOR_STORE_DISCOUNT_PERCENT,
  isTestOnlyCartItems,
  computeStoreDeliveryFee,
  computeDoctorStoreTotals,
  applyDoctorStorePricing
};

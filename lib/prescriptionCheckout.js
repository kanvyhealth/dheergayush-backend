const { Order, MedicineOrder } = require('./data');
const { validateOrderItemsAgainstCatalog } = require('./firebaseCatalog');
const { buildSharedOrderId, buildFirestoreOrderPayload } = require('./webOrderSync');

function mapPrescribedItemsForOrder(items = []) {
  return (items || []).map((item) => ({
    medicineId: item.medicineId || item.id,
    id: item.medicineId || item.id,
    storeId: item.storeId || '',
    storeName: item.storeName || '',
    name: item.name || item.productName || 'Medicine',
    productName: item.name || item.productName || 'Medicine',
    selectedWeight: item.selectedWeight || item.weight || '',
    pricePerUnit: Number(item.pricePerUnit || item.price || 0),
    quantity: Number(item.quantity || 1),
    totalPrice: Number(item.totalPrice || 0)
  }));
}

async function createPrescriptionStoreOrder({
  customerName,
  customerPhone,
  deliveryAddress,
  items,
  total,
  roomID,
  prescriptionId,
  razorpayPaymentId,
  razorpayOrderId,
  userId
}) {
  const orderItems = mapPrescribedItemsForOrder(items);
  let validatedItems;
  try {
    validatedItems = await validateOrderItemsAgainstCatalog(orderItems);
  } catch (err) {
    const fallbackSubtotal = orderItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    if (!fallbackSubtotal) throw err;
    validatedItems = { items: orderItems, subtotal: fallbackSubtotal };
  }

  const orderId = buildSharedOrderId();
  const subtotal = validatedItems.subtotal;
  const totalAmount = Number(total) > 0 ? Number(total) : subtotal;

  const orderData = {
    customerName: customerName || 'Patient',
    customerPhone: customerPhone || '',
    deliveryAddress: deliveryAddress || '',
    items: validatedItems.items,
    subtotal,
    deliveryFee: 0,
    totalAmount,
    orderStatus: 'pending',
    source: 'prescription',
    notes: `Video consultation prescription — room ${roomID || ''}`.trim(),
    prescriptionId: prescriptionId || null,
    appointmentId: roomID || null,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    userId: userId || null,
    patientId: userId || null
  };

  const firestorePayload = buildFirestoreOrderPayload(orderData, orderId, {
    paymentProof: razorpayPaymentId,
    razorpayOrderId,
    razorpayPaymentId
  });

  const savedOrder = await Order.create(firestorePayload);
  await MedicineOrder.create({ ...firestorePayload });

  return { orderId: savedOrder._id, order: savedOrder };
}

module.exports = {
  mapPrescribedItemsForOrder,
  createPrescriptionStoreOrder
};

const { v4: uuidv4 } = require('uuid');

function buildSharedOrderId() {
  return uuidv4().replace(/-/g, '').slice(0, 20);
}

function mapWebItemsToAppItems(items) {
  return (items || []).map((item) => ({
    medicineId: item.medicineId || item.id || '',
    storeId: item.storeId || '',
    storeName: item.storeName || '',
    productName: item.name || item.productName || 'Medicine',
    name: item.name || item.productName || 'Medicine',
    selectedWeight: item.selectedWeight || '',
    pricePerUnit: Number(item.pricePerUnit || 0),
    quantity: Number(item.quantity || 1),
    totalPrice: Number(item.totalPrice || 0),
    productType: item.productType || 'medicine',
    productTypeName: item.productTypeName || 'Medicine'
  }));
}

function buildFirestoreOrderPayload(orderData, orderId, options = {}) {
  const items = mapWebItemsToAppItems(orderData.items);
  const totalAmount = Number(orderData.totalAmount || 0);
  const subtotal = Number(orderData.subtotal || totalAmount);
  const deliveryFee = Number(orderData.deliveryFee || 0);
  const customerId =
    orderData.userId ||
    orderData.patientId ||
    `web_guest_${String(orderData.customerPhone || '').replace(/\D/g, '') || Date.now()}`;
  const isGuest = !orderData.userId && !orderData.patientId;
  const productName =
    items.length === 1 ? items[0].productName : `${items.length} items`;
  const now = new Date();

  return {
    _id: orderId,
    user_id: customerId,
    userId: customerId,
    patientId: customerId,
    isGuest,
    isGuestOrder: isGuest,
    userName: orderData.customerName || 'Customer',
    userEmail: orderData.customerEmail || '',
    phone: orderData.customerPhone || '',
    guestName: isGuest ? orderData.customerName : null,
    guestPhone: isGuest ? orderData.customerPhone : null,
    guestEmail: isGuest ? orderData.customerEmail : null,
    items,
    itemCount: items.length,
    quantity: items.reduce((n, i) => n + Number(i.quantity || 0), 0),
    productName,
    productType: items.length === 1 ? items[0].productType : 'mixed',
    productTypeName: items.length === 1 ? items[0].productTypeName : 'Mixed Order',
    subtotal,
    deliveryCharge: deliveryFee,
    deliveryFee,
    amountBeforeTax: subtotal,
    totalPrice: totalAmount,
    total_amount: totalAmount,
    totalAmount,
    deliveryAddress: orderData.deliveryAddress || '',
    deliveryMode: 'home_delivery',
    deliveryStatus: 'pending',
    notes: orderData.notes || '',
    paymentMethod: orderData.paymentMethod || 'UPI',
    paymentStatus: orderData.paymentStatus || 'pending',
    paymentProof: options.paymentProof || orderData.paymentProof || '',
    orderStatus: orderData.orderStatus || 'pending',
    status: orderData.orderStatus || 'pending',
    source: orderData.source || 'website',
    sourceCollection: 'orders',
    appointmentId: orderData.appointmentId || null,
    prescriptionId: orderData.prescriptionId || null,
    customerName: orderData.customerName,
    customerPhone: orderData.customerPhone,
    customerEmail: orderData.customerEmail || '',
    orderDate: now,
    timestamp: now,
    updatedAt: now,
    createdAt: now
  };
}

module.exports = {
  buildSharedOrderId,
  buildFirestoreOrderPayload,
  mapWebItemsToAppItems
};
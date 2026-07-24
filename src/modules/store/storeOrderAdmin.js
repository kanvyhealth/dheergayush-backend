/**
 * Admin store-order shipment, cancel, and Razorpay refund helpers.
 */
const { Order, MedicineOrder } = require('../../core/data');
const { createRefund, isRazorpayConfigured } = require('../payments/razorpay');

const PATIENT_CANCELABLE = new Set(['pending', 'confirmed']);

function orderIdOf(order) {
  return order?._id || order?.id || null;
}

function normalizeShipment(input = {}) {
  const shipment = {
    courier: String(input.courier || '').trim(),
    trackingNumber: String(input.trackingNumber || '').trim(),
    trackingUrl: String(input.trackingUrl || '').trim(),
    notes: String(input.notes || '').trim()
  };
  if (input.shippedAt) shipment.shippedAt = new Date(input.shippedAt);
  if (input.deliveredAt) shipment.deliveredAt = new Date(input.deliveredAt);
  return shipment;
}

async function findStoreOrder(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  let order = await Order.findById(key);
  let collection = 'orders';
  if (!order) {
    order = await MedicineOrder.findById(key);
    collection = 'medicine_orders';
  }
  if (!order) return null;
  return { order, collection, id: orderIdOf(order) || key };
}

async function persistOrder(collection, id, patch) {
  const Model = collection === 'medicine_orders' ? MedicineOrder : Order;
  const updated = await Model.findByIdAndUpdate(id, patch, { new: true });
  // Keep dual collections in sync when both exist
  const other = collection === 'medicine_orders' ? Order : MedicineOrder;
  await other.findByIdAndUpdate(id, patch, { new: true }).catch(() => null);
  return updated;
}

function timestampsForStatus(orderStatus, existing = {}) {
  const now = new Date();
  const patch = {
    orderStatus,
    status: orderStatus,
    deliveryStatus: orderStatus,
    updatedAt: now
  };
  const shipment = { ...(existing.shipment || {}) };
  if (orderStatus === 'shipped' && !shipment.shippedAt) {
    shipment.shippedAt = now;
    patch.shipment = shipment;
  }
  if (orderStatus === 'delivered') {
    if (!shipment.shippedAt) shipment.shippedAt = now;
    shipment.deliveredAt = now;
    patch.shipment = shipment;
  }
  return patch;
}

async function updateOrderStatus(id, { orderStatus, paymentStatus } = {}) {
  const found = await findStoreOrder(id);
  if (!found) return { ok: false, status: 404, message: 'Order not found' };

  const patch = { updatedAt: new Date() };
  if (orderStatus) Object.assign(patch, timestampsForStatus(orderStatus, found.order));
  if (paymentStatus) patch.paymentStatus = paymentStatus;

  const order = await persistOrder(found.collection, found.id, patch);
  return { ok: true, order };
}

async function updateOrderShipment(id, body = {}) {
  const found = await findStoreOrder(id);
  if (!found) return { ok: false, status: 404, message: 'Order not found' };

  const existingShipment = found.order.shipment || {};
  const next = {
    ...existingShipment,
    ...normalizeShipment({ ...existingShipment, ...body })
  };
  const markShipped = body.markShipped !== false && (body.forceStatus === 'shipped' || body.trackingNumber || body.courier);
  const patch = {
    shipment: next,
    updatedAt: new Date()
  };
  if (markShipped || body.forceStatus === 'shipped') {
    Object.assign(patch, timestampsForStatus('shipped', { shipment: next }));
    patch.shipment = { ...next, shippedAt: next.shippedAt || new Date() };
  }
  if (body.forceStatus === 'delivered') {
    Object.assign(patch, timestampsForStatus('delivered', { shipment: next }));
    patch.shipment = {
      ...next,
      shippedAt: next.shippedAt || new Date(),
      deliveredAt: next.deliveredAt || new Date()
    };
  }

  const order = await persistOrder(found.collection, found.id, patch);
  return { ok: true, order };
}

function extractRazorpayPaymentId(order) {
  return (
    order.razorpayPaymentId ||
    order.paymentProof ||
    order.transactionId ||
    ''
  );
}

async function refundStoreOrder(id, { reason = 'admin_refund', force = false } = {}) {
  const found = await findStoreOrder(id);
  if (!found) return { ok: false, status: 404, message: 'Order not found' };
  const order = found.order;

  if (order.refundStatus === 'processed' || order.paymentStatus === 'refunded') {
    return {
      ok: true,
      alreadyRefunded: true,
      refunded: false,
      amount: Number(order.totalAmount || order.total_amount || 0),
      refundId: order.refundId || null,
      message: 'Refund has already been processed.',
      order
    };
  }

  const amount = Number(order.totalAmount || order.total_amount || 0);
  const method = String(order.paymentMethod || '').toLowerCase();
  const razorpayPaymentId = String(extractRazorpayPaymentId(order) || '').trim();
  const looksRazorpay =
    method.includes('razorpay') ||
    method === 'upi' ||
    /^pay_/i.test(razorpayPaymentId);

  if (!looksRazorpay || !razorpayPaymentId || /^upi_/i.test(razorpayPaymentId) || razorpayPaymentId.includes('/')) {
    if (!force) {
      return {
        ok: false,
        status: 400,
        message: 'No Razorpay payment id on this order. Mark payment refunded manually or pass force=true.',
        order
      };
    }
    const orderUpdated = await persistOrder(found.collection, found.id, {
      paymentStatus: 'refunded',
      refundStatus: 'processed',
      refundReason: reason,
      refundedAt: new Date(),
      updatedAt: new Date()
    });
    return {
      ok: true,
      refunded: false,
      manual: true,
      amount,
      message: 'Marked as refunded without Razorpay API call.',
      order: orderUpdated
    };
  }

  if (!isRazorpayConfigured()) {
    return { ok: false, status: 503, message: 'Refund service is not configured.' };
  }

  const amountInPaise = Math.round(amount * 100);
  await persistOrder(found.collection, found.id, {
    refundStatus: 'processing',
    refundReason: reason,
    updatedAt: new Date()
  });

  try {
    const refund = await createRefund(razorpayPaymentId, amountInPaise > 0 ? amountInPaise : undefined, {
      orderId: found.id,
      reason
    });
    const orderUpdated = await persistOrder(found.collection, found.id, {
      paymentStatus: 'refunded',
      refundStatus: 'processed',
      refundId: refund.id,
      refundReason: reason,
      refundedAt: new Date(),
      razorpayPaymentId,
      updatedAt: new Date()
    });
    return {
      ok: true,
      refunded: true,
      amount,
      refundId: refund.id,
      message: `Refund of ₹${amount} initiated.`,
      order: orderUpdated
    };
  } catch (err) {
    await persistOrder(found.collection, found.id, {
      refundStatus: 'failed',
      refundError: err.message,
      refundReason: reason,
      updatedAt: new Date()
    }).catch(() => null);
    return { ok: false, status: err.status || 500, message: err.message || 'Refund failed' };
  }
}

async function cancelStoreOrder(id, { reason = '', refund = true, admin = false, userId = null } = {}) {
  const found = await findStoreOrder(id);
  if (!found) return { ok: false, status: 404, message: 'Order not found' };
  const order = found.order;
  const status = String(order.orderStatus || order.status || 'pending').toLowerCase();

  if (status === 'cancelled') {
    return { ok: true, alreadyCancelled: true, order, message: 'Order is already cancelled.' };
  }

  if (!admin) {
    if (!PATIENT_CANCELABLE.has(status)) {
      return {
        ok: false,
        status: 409,
        message: `Orders in status "${status}" cannot be cancelled by the customer.`
      };
    }
    if (userId) {
      const owners = [order.userId, order.user_id, order.patientId].map((v) => String(v || ''));
      if (!owners.includes(String(userId))) {
        return { ok: false, status: 403, message: 'Not allowed to cancel this order.' };
      }
    }
  }

  const patch = {
    ...timestampsForStatus('cancelled', order),
    cancelReason: String(reason || '').trim(),
    cancelledAt: new Date(),
    cancelledBy: admin ? 'admin' : 'patient'
  };
  let orderUpdated = await persistOrder(found.collection, found.id, patch);

  let refundResult = null;
  if (refund && String(order.paymentStatus || '').toLowerCase() === 'paid') {
    refundResult = await refundStoreOrder(found.id, { reason: reason || 'order_cancelled', force: !!admin });
    if (refundResult.ok && refundResult.order) orderUpdated = refundResult.order;
  }

  return {
    ok: true,
    order: orderUpdated,
    refund: refundResult,
    message: 'Order cancelled.'
  };
}

module.exports = {
  findStoreOrder,
  updateOrderStatus,
  updateOrderShipment,
  cancelStoreOrder,
  refundStoreOrder,
  PATIENT_CANCELABLE
};

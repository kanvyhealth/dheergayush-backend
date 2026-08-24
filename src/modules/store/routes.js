/**
 * Domain routes: store
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/banners', async (req, res) => {
      // App / Firestore banners — no website admin CRUD. Returns [] when none configured.
      try {
        const banners = await getBannersFromFirebase();
        res.json(Array.isArray(banners) ? banners : []);
      } catch (err) {
        res.status(500).json({ message: 'Failed to load banners', error: err.message });
      }
    });
    
    app.get('/api/medicines/batch', async (req, res) => {
      try {
        const rawIds = req.query.ids;
        if (!rawIds) {
          return res.status(400).json({ message: 'ids query parameter is required' });
        }
        res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
        const result = await getMedicinesByIds(rawIds);
        return res.json(result);
      } catch (err) {
        res.status(500).json({ message: 'Failed to load medicines', error: err.message });
      }
    });
    
    app.get('/api/medicines', async (req, res) => {
      try {
        const { page, limit, company, category, subcategory, q, all } = req.query;
        const filtered = (company && company !== 'all')
          || (category && category !== 'all')
          || (subcategory && subcategory !== 'all')
          || q;
        res.setHeader(
          'Cache-Control',
          filtered
            ? 'private, no-store'
            : 'public, max-age=300, stale-while-revalidate=600'
        );
        if (String(all || '') === '1') {
          const medicines = await getMedicinesFromFirebase();
          return res.json(medicines);
        }
        const result = await getMedicinesPaginated({ page, limit, company, category, subcategory, q });
        return res.json(result);
      } catch (err) {
        res.status(500).json({ message: 'Failed to load medicines', error: err.message });
      }
    });
    
    app.get('/api/stores/summary', async (req, res) => {
      try {
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        const summary = await getStoresSummaryFromFirebase();
        res.json(summary);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching store summary', error: error.message });
      }
    });

    app.get('/api/store/taxonomy', async (req, res) => {
      try {
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        const taxonomy = await getStoreTaxonomy();
        res.json(taxonomy);
      } catch (err) {
        res.status(500).json({ message: 'Failed to load store taxonomy', error: err.message });
      }
    });
    
    app.get('/api/product-categories', async (req, res) => {
      try {
        const categories = await getProductCategoriesFromFirebase();
        res.json(categories);
      } catch (err) {
        res.status(500).json({ message: 'Failed to load categories', error: err.message });
      }
    });
    
    app.get('/api/stores', async (req, res) => {
        try {
            const stores = await getStoresFromFirebase();
            if (stores.length) return res.json(stores);
            const legacy = await getStoresFromDatabase();
            if (legacy.length) return res.json(legacy);
            res.status(404).json({ message: 'No products found in Firebase medicines catalog.' });
        } catch (error) {
            console.error('Error fetching stores:', error);
            res.status(500).json({ message: 'Error fetching stores', error: error.message });
        }
    });
    
    app.post('/api/orders', upload.single('paymentProof'), async (req, res) => {
        try {
            const authHeader = req.headers.authorization || '';
            if (authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = await verifyIdToken(authHeader.slice(7).trim());
                    req.firebaseUid = decoded.uid;
                } catch (_) {
                    /* guest checkout — invalid token ignored */
                }
            }
    
            if (req.file || req.body?.paymentProof) {
                return res.status(410).json({
                    success: false,
                    message: 'Manual UPI / QR payment proof is no longer accepted. Pay with Razorpay checkout.'
                });
            }
    
            let orderData;
            let razorpayOrderId;
            let razorpayPaymentId;
            let razorpaySignature;
    
            if (req.is('application/json')) {
                orderData = req.body.orderData || req.body;
                razorpayOrderId = req.body.razorpay_order_id;
                razorpayPaymentId = req.body.razorpay_payment_id;
                razorpaySignature = req.body.razorpay_signature;
            } else if (req.body.orderData) {
                orderData = typeof req.body.orderData === 'string'
                    ? JSON.parse(req.body.orderData)
                    : req.body.orderData;
                razorpayOrderId = req.body.razorpay_order_id;
                razorpayPaymentId = req.body.razorpay_payment_id;
                razorpaySignature = req.body.razorpay_signature;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order payload. Complete Razorpay payment first.'
                });
            }
    
            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                return res.status(400).json({
                    success: false,
                    message: 'Razorpay payment verification is required (order_id, payment_id, signature).'
                });
            }
    
            const payment = await verifyAndFetchPayment({
                orderId: razorpayOrderId,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature
            });

            orderData = normalizeOrderContactFields(orderData || {});
    
            if (!orderData.customerName || !orderData.customerPhone || !orderData.deliveryAddress) {
                return res.status(400).json({
                    message: 'Missing required fields: customerName, customerPhone, deliveryAddress'
                });
            }
    
            if (!orderData.items || orderData.items.length === 0) {
                return res.status(400).json({ message: 'Order must contain at least one item' });
            }
    
            let validatedItems;
            try {
                validatedItems = await validateOrderItemsAgainstCatalog(orderData.items);
            } catch (catalogErr) {
                return res.status(catalogErr.status || 400).json({
                    success: false,
                    message: catalogErr.message || 'One or more products are unavailable'
                });
            }
    
            orderData.items = validatedItems.items;
            orderData.subtotal = validatedItems.subtotal;
    
            const session = await resolveFirebaseSession(req);
            const isDoctorOrder = !!session?.doctor;
            applyDoctorStorePricing(orderData, isDoctorOrder);
    
            const expectedPaise = Math.max(100, Math.round(Number(orderData.totalAmount) * 100));
            if (Math.abs(Number(payment.amount) - expectedPaise) > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment amount does not match order total. Refresh and try checkout again.'
                });
            }
    
            if (orderData.appointmentId || orderData.prescriptionId) {
                orderData.source = orderData.source || 'prescription';
            }

            const {
                isPrescriptionLinkedOrder,
                evaluatePrescriptionOrderAuth,
                bindOrderIdentity
            } = require('./prescriptionOrderAuth');

            const isPrescriptionLinked = isPrescriptionLinkedOrder(orderData);

            let prescriptionDoc = null;
            let appointmentDoc = null;
            if (isPrescriptionLinked) {
                const prescriptionId = String(
                    orderData.prescriptionId || orderData.appointmentId || ''
                ).trim();
                const appointmentId = String(orderData.appointmentId || '').trim();

                if (prescriptionId) {
                    prescriptionDoc = await Prescription.findById(prescriptionId);
                    if (
                        prescriptionDoc &&
                        !appointmentId &&
                        prescriptionDoc.appointmentId
                    ) {
                        orderData.appointmentId = String(
                            prescriptionDoc.appointmentId
                        ).trim();
                    }
                }

                const resolvedAppointmentId = String(
                    orderData.appointmentId || ''
                ).trim();
                if (resolvedAppointmentId) {
                    appointmentDoc = await ConsultationRequest.findById(
                        resolvedAppointmentId
                    );
                }

                const ownership = evaluatePrescriptionOrderAuth({
                    firebaseUid: req.firebaseUid,
                    orderData,
                    prescription: prescriptionDoc,
                    appointment: appointmentDoc
                });
                if (!ownership.ok) {
                    return res.status(ownership.status || 403).json({
                        success: false,
                        message: ownership.message
                    });
                }
            }

            orderData = bindOrderIdentity(orderData, req.firebaseUid || '');

            const orderId = buildSharedOrderId();
            orderData.paymentMethod = 'razorpay';
            orderData.paymentStatus = 'paid';

            const firestorePayload = buildFirestoreOrderPayload(orderData, orderId, {
                paymentProof: razorpayPaymentId,
                razorpayOrderId,
                razorpayPaymentId,
                transactionId: razorpayPaymentId
            });

            const savedOrder = await Order.create(firestorePayload);
            await MedicineOrder.create({ ...firestorePayload });

            res.status(201).json({
                success: true,
                message: 'Order placed successfully!',
                orderId: savedOrder._id,
                order: savedOrder
            });
        } catch (error) {
            console.error('❌ Error creating order:', error);
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Failed to create order'
            });
        }
    });
    
    app.get('/api/admin/orders', async (req, res) => {
        try {
            const orders = await Order.find().sort({ orderDate: -1 });
            res.json(orders);
        } catch (error) {
            console.error('Error fetching orders:', error);
            res.status(500).json({ message: 'Error fetching orders', error: error.message });
        }
    });
    
    app.get('/api/orders/:id', async (req, res) => {
        try {
            let order = await Order.findById(req.params.id);
            if (!order) order = await MedicineOrder.findById(req.params.id);
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }
            res.json(order);
        } catch (error) {
            console.error('Error fetching order:', error);
            res.status(500).json({ message: 'Error fetching order', error: error.message });
        }
    });
    
    app.put('/api/admin/orders/:id/status', async (req, res) => {
        try {
            const {
                updateOrderStatus
            } = require('./storeOrderAdmin');
            const result = await updateOrderStatus(req.params.id, {
                orderStatus: req.body.orderStatus,
                paymentStatus: req.body.paymentStatus
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }
            res.json({
                message: 'Order status updated successfully',
                order: result.order
            });
        } catch (error) {
            console.error('Error updating order status:', error);
            res.status(500).json({ message: 'Error updating order status', error: error.message });
        }
    });

    app.put('/api/admin/orders/:id/shipment', async (req, res) => {
        try {
            const { updateOrderShipment } = require('./storeOrderAdmin');
            const result = await updateOrderShipment(req.params.id, req.body || {});
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }
            res.json({ message: 'Shipment updated', order: result.order });
        } catch (error) {
            console.error('Error updating shipment:', error);
            res.status(500).json({ message: 'Error updating shipment', error: error.message });
        }
    });

    app.post('/api/admin/orders/:id/cancel', async (req, res) => {
        try {
            const { cancelStoreOrder } = require('./storeOrderAdmin');
            const result = await cancelStoreOrder(req.params.id, {
                reason: req.body?.reason || '',
                refund: req.body?.refund !== false,
                admin: true
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }
            res.json(result);
        } catch (error) {
            console.error('Error cancelling order:', error);
            res.status(500).json({ message: 'Error cancelling order', error: error.message });
        }
    });

    app.post('/api/admin/orders/:id/refund', async (req, res) => {
        try {
            const { refundStoreOrder } = require('./storeOrderAdmin');
            const result = await refundStoreOrder(req.params.id, {
                reason: req.body?.reason || 'admin_refund',
                force: !!req.body?.force
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message, order: result.order });
            }
            res.json(result);
        } catch (error) {
            console.error('Error refunding order:', error);
            res.status(500).json({ message: 'Error refunding order', error: error.message });
        }
    });

    app.post('/api/orders/:id/cancel', requireFirebaseAuth(), async (req, res) => {
        try {
            const { cancelStoreOrder } = require('./storeOrderAdmin');
            const result = await cancelStoreOrder(req.params.id, {
                reason: req.body?.reason || 'customer_cancelled',
                refund: req.body?.refund !== false,
                admin: false,
                userId: req.firebaseUid
            });
            if (!result.ok) {
                return res.status(result.status || 400).json({ message: result.message });
            }
            res.json(result);
        } catch (error) {
            console.error('Error cancelling order (patient):', error);
            res.status(500).json({ message: 'Error cancelling order', error: error.message });
        }
    });
    
    app.delete('/api/admin/orders/:id', async (req, res) => {
        try {
            const order = await Order.findByIdAndDelete(req.params.id);
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }
            await MedicineOrder.findByIdAndDelete(req.params.id).catch(() => null);
            res.json({ message: 'Order deleted successfully' });
        } catch (error) {
            console.error('Error deleting order:', error);
            res.status(500).json({ message: 'Error deleting order', error: error.message });
        }
    });
  }
};

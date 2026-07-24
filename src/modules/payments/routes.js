/**
 * Domain routes: payments
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/payments/razorpay/config', (req, res) => {
      const keyId = getPublicKeyId();
      if (!keyId) {
        return res.status(503).json({ message: 'Razorpay is not configured on the server.' });
      }
      res.json({ keyId, key_id: keyId, currency: 'INR' });
    });
    
    app.post('/api/create-order', authLimiter, async (req, res) => {
      try {
        const amount = parseInt(req.body?.amount ?? req.body?.amountInPaise, 10);
        const currency = String(req.body?.currency || 'INR').toUpperCase();
        const receipt = String(req.body?.receipt || `rcpt_${Date.now()}`).slice(0, 40);
    
        if (!Number.isFinite(amount) || amount < 100) {
          return res.status(400).json({
            message: 'Invalid amount. Minimum is 100 paise (INR 1.00).'
          });
        }
    
        const order = await createOrder({
          amountInPaise: amount,
          currency,
          receipt,
          notes: req.body?.notes || {}
        });
    
        res.json({
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          key_id: order.keyId,
          checkout_config: getCheckoutDisplayConfig({
            isMobile: isMobileUserAgent(req.headers['user-agent'])
          })
        });
      } catch (err) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        console.error('create-order error:', err.message);
        res.status(status).json({
          message: err.message || 'Unable to create Razorpay order'
        });
      }
    });
    
    app.post('/api/verify-payment', authLimiter, async (req, res) => {
      try {
        const orderId = req.body?.razorpay_order_id || req.body?.order_id;
        const paymentId = req.body?.razorpay_payment_id || req.body?.payment_id;
        const signature = req.body?.razorpay_signature || req.body?.signature;
    
        if (!orderId || !paymentId || !signature) {
          return res.status(400).json({
            success: false,
            message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.'
          });
        }
    
        verifyPaymentSignature({ orderId, paymentId, signature });
    
        let paymentMethod = 'razorpay';
        let paymentDetails = {};
        try {
          const payment = await fetchPayment(paymentId);
          if (payment && payment.order_id === orderId) {
            paymentMethod = payment.method || paymentMethod;
            paymentDetails = {
              method: payment.method || null,
              vpa: payment.vpa || null,
              wallet: payment.wallet || null,
              bank: payment.bank || null,
              card_id: payment.card_id || null
            };
          }
        } catch (fetchErr) {
          console.warn('verify-payment: could not fetch payment method:', fetchErr.message);
        }
    
        res.json({
          success: true,
          message: 'Payment signature verified',
          order_id: orderId,
          payment_id: paymentId,
          payment_method: paymentMethod,
          payment_details: paymentDetails
        });
      } catch (err) {
        res.status(err.status || 400).json({
          success: false,
          message: err.message || 'Signature verification failed'
        });
      }
    });
    
    app.post('/api/payments/razorpay/create-order', authLimiter, requireFirebaseAuth(), async (req, res) => {
      try {
        const amountInPaise = parseInt(req.body?.amountInPaise, 10);
        if (!amountInPaise || amountInPaise < 100) {
          return res.status(400).json({ message: 'Invalid payment amount.' });
        }
        const order = await createOrder({
          amountInPaise,
          receipt: req.body?.receipt || `web_${Date.now()}`,
          notes: {
            serviceType: 'consultation',
            uid: req.firebaseUid,
            doctorName: String(req.body?.doctorName || '').slice(0, 64)
          }
        });
        res.json({
          success: true,
          order_id: order.orderId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          key_id: order.keyId,
          keyId: order.keyId,
          checkout_config: getCheckoutDisplayConfig({
            isMobile: isMobileUserAgent(req.headers['user-agent'])
          })
        });
      } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Could not create order' });
      }
    });
    
    app.post(
      '/api/payments/razorpay/confirm-consultation',
      upload.fields([{ name: 'reports', maxCount: 5 }]),
      requireFirebaseAuth(),
      async (req, res) => {
        try {
          const {
            name,
            phone,
            address,
            selectedDoctorName,
            selectedDoctorFee,
            amount,
            doctorAvailableTime,
            patientSymptoms,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
          } = req.body;
    
          const amountNum = parseFloat(String(amount ?? '').replace(/[^\d.]/g, ''));
          const reportFiles = req.files?.reports || [];
    
          if (!name || !phone || !address || !selectedDoctorName) {
            return res.status(400).json({ message: 'Patient details and doctor name are required.' });
          }
          if (amountNum > 0 && (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)) {
            return res.status(400).json({ message: 'Razorpay payment verification data is required.' });
          }
          if (Number.isNaN(amountNum) || amountNum < 0) {
            return res.status(400).json({ message: 'Invalid consultation amount.' });
          }
    
          const result = await completeWebsiteConsultationCheckout({
            firebaseUid: req.firebaseUid,
            name,
            phone,
            address,
            selectedDoctorName,
            selectedDoctorFee,
            amountNum,
            doctorAvailableTime,
            patientSymptoms,
            reportFiles,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature
          });
    
          res.status(201).json({
            message: 'Payment successful. Waiting for doctor to accept.',
            payment: result.savedPayment,
            consultation: result.consultation,
            roomId: result.videoRoomId,
            videoRoomId: result.videoRoomId
          });
        } catch (err) {
          console.error('Razorpay confirm error:', err.message);
          const amountNum = parseFloat(String(req.body?.amount ?? '').replace(/[^\d.]/g, ''));
          let refundResult = null;
          if (
            amountNum > 0 &&
            req.body?.razorpay_payment_id &&
            req.body?.razorpay_order_id &&
            req.body?.razorpay_signature
          ) {
            try {
              refundResult = await refundCapturedRazorpayPayment({
                razorpayPaymentId: req.body.razorpay_payment_id,
                razorpayOrderId: req.body.razorpay_order_id,
                razorpaySignature: req.body.razorpay_signature,
                reason: 'booking_failed'
              });
            } catch (refundErr) {
              console.error('Post-booking refund error:', refundErr.message);
            }
          }
          const message = refundResult?.refunded
            ? refundResult.message
            : (err.message || 'Payment confirmation failed');
          res.status(err.status || 500).json({
            message,
            refunded: !!refundResult?.refunded,
            refundError: refundResult && !refundResult.ok ? refundResult.message : undefined
          });
        }
      }
    );
    
    app.post('/api/payments/razorpay/refund-failed-booking', requireFirebaseAuth(), async (req, res) => {
      try {
        const razorpayPaymentId = req.body?.razorpay_payment_id || req.body?.razorpayPaymentId;
        const razorpayOrderId = req.body?.razorpay_order_id || req.body?.razorpayOrderId;
        const razorpaySignature = req.body?.razorpay_signature || req.body?.razorpaySignature;
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
          return res.status(400).json({ message: 'Razorpay payment verification data is required.' });
        }
        const result = await refundCapturedRazorpayPayment({
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          reason: 'booking_failed'
        });
        if (!result.ok) {
          return res.status(result.status || 500).json({ message: result.message || 'Refund failed' });
        }
        return res.json(result);
      } catch (err) {
        console.error('refund-failed-booking error:', err.message);
        return res.status(err.status || 500).json({ message: err.message || 'Refund failed' });
      }
    });
    
    app.post('/api/payment', upload.fields([
        { name: 'paymentProof', maxCount: 1 },
        { name: 'reports', maxCount: 5 }
    ]), async (req, res) => {
        res.status(410).json({
            message:
              'Manual UPI payment proof is no longer accepted. Please pay with Razorpay on the payment page.'
        });
    });
    
    app.get('/api/payments/patient/:phoneNumber', requirePatientPhoneAccess('phoneNumber'), async (req, res) => {
        try {
            const { phoneNumber } = req.params;
            if (!phoneNumber) {
                return res.status(400).json({ message: 'Phone number is required.' });
            }
    
            const identifiers = new Set([phoneNumber]);
            if (req.firebaseUid) identifiers.add(req.firebaseUid);
    
            const customer = await findCustomerByPhone(phoneNumber);
            if (customer?.uid) identifiers.add(String(customer.uid));
            if (customer?._id) identifiers.add(String(customer._id));
    
            const seen = new Set();
            const merged = [];
            for (const id of identifiers) {
                const batch = await listPaymentsForPatient(id);
                for (const p of batch) {
                    const key = String(p._id || p.id);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(p);
                    }
                }
            }
    
            merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            res.status(200).json(merged);
        } catch (err) {
            console.error('❌ Error fetching patient payments:', err);
            res.status(500).json({ message: 'Failed to fetch appointments.', error: err.message });
        }
    });
    
    app.get('/api/payments/doctor/:doctorName', requireDoctorNameAccess('doctorName'), async (req, res) => {
        try {
            const { doctorName } = req.params;
            if (!doctorName) {
                return res.status(400).json({ message: 'Doctor name is required.' });
            }
            const payments = await listPaymentsForDoctor(doctorName);
            res.status(200).json(payments);
        } catch (err) {
            console.error('❌ Error fetching doctor payments:', err);
            res.status(500).json({ message: 'Failed to fetch appointments.', error: err.message });
        }
    });
  }
};

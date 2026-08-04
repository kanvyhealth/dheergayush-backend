(function (global) {
  var PENDING_KEY = 'dgStorePendingPaidOrder';

  function resolveFirebaseIdToken() {
    try {
      if (global.DgStoreCartBridge && typeof global.DgStoreCartBridge.getFirebaseIdToken === 'function') {
        var bridgeToken = global.DgStoreCartBridge.getFirebaseIdToken();
        if (bridgeToken) return String(bridgeToken);
      }
    } catch (_) { /* ignore */ }
    try {
      return localStorage.getItem('firebaseIdToken') || '';
    } catch (_) {
      return '';
    }
  }

  function orderRequestHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var token = resolveFirebaseIdToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function savePendingPaidOrder(payload) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch (_) { /* ignore */ }
  }

  function clearPendingPaidOrder() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (_) { /* ignore */ }
  }

  function hasPendingPaidOrder() {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY) || '';
      if (!raw) return false;
      var pending = JSON.parse(raw);
      return !!(pending && pending.razorpay_payment_id && pending.razorpay_signature);
    } catch (_) {
      return false;
    }
  }

  async function placePaidOrder(opts) {
    var doFetch = opts.fetchFn || fetch;
    var paymentMethod = 'razorpay';
    if (opts.verification && opts.verification.payment_method) {
      paymentMethod = String(opts.verification.payment_method);
    }
    var pendingPayload = {
      savedAt: Date.now(),
      orderData: Object.assign({}, opts.orderData, {
        paymentMethod: paymentMethod,
        paymentStatus: 'paid',
        razorpayPaymentId: opts.paymentResponse.razorpay_payment_id,
        razorpayOrderId: opts.paymentResponse.razorpay_order_id
      }),
      razorpay_order_id: opts.paymentResponse.razorpay_order_id,
      razorpay_payment_id: opts.paymentResponse.razorpay_payment_id,
      razorpay_signature: opts.paymentResponse.razorpay_signature
    };
    savePendingPaidOrder(pendingPayload);

    var res = await doFetch('/api/orders', {
      method: 'POST',
      headers: orderRequestHeaders(),
      body: JSON.stringify({
        orderData: pendingPayload.orderData,
        razorpay_order_id: pendingPayload.razorpay_order_id,
        razorpay_payment_id: pendingPayload.razorpay_payment_id,
        razorpay_signature: pendingPayload.razorpay_signature
      })
    });
    var data = await res.json();
    if (!res.ok) {
      var err = new Error(data.message || 'Order failed after payment. Use Retry order to recover.');
      err.code = 'ORDER_PLACE_FAILED';
      throw err;
    }
    clearPendingPaidOrder();
    return Object.assign({}, data, {
      paymentResponse: opts.paymentResponse,
      razorpay_payment_id: opts.paymentResponse && opts.paymentResponse.razorpay_payment_id,
      razorpay_order_id: opts.paymentResponse && opts.paymentResponse.razorpay_order_id,
      razorpayPaymentId: opts.paymentResponse && opts.paymentResponse.razorpay_payment_id,
      razorpayOrderId: opts.paymentResponse && opts.paymentResponse.razorpay_order_id
    });
  }

  async function retryPendingPaidOrder(opts) {
    var doFetch = (opts && opts.fetchFn) || fetch;
    var raw = '';
    try { raw = sessionStorage.getItem(PENDING_KEY) || ''; } catch (_) { raw = ''; }
    if (!raw) throw new Error('No pending paid order to recover.');
    var pending = JSON.parse(raw);
    if (!pending || !pending.razorpay_payment_id || !pending.razorpay_signature) {
      throw new Error('Pending paid order is incomplete.');
    }
    var res = await doFetch('/api/orders', {
      method: 'POST',
      headers: orderRequestHeaders(),
      body: JSON.stringify({
        orderData: pending.orderData,
        razorpay_order_id: pending.razorpay_order_id,
        razorpay_payment_id: pending.razorpay_payment_id,
        razorpay_signature: pending.razorpay_signature
      })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Order recovery failed');
    clearPendingPaidOrder();
    return data;
  }

  async function checkoutCartOrder(opts) {
    var total = Number(opts.orderData.totalAmount) || 0;
    if (total <= 0) throw new Error('Cart total must be greater than zero');
    var amountPaise = Math.max(100, Math.round(total * 100));

    if (window.DgFlutterNativeCheckout && DgFlutterNativeCheckout.isAvailable()) {
      var nativePayment = await DgFlutterNativeCheckout.pay({
        amountPaise: amountPaise,
        description: opts.description || 'DHEERGAYUSH Store Order',
        prefill: opts.prefill || {},
        receipt: 'store_native_' + Date.now()
      });
      if (!nativePayment || !nativePayment.razorpay_signature) {
        throw new Error('Native payment did not return a Razorpay signature.');
      }
      return placePaidOrder({
        orderData: Object.assign({}, opts.orderData, { totalAmount: Math.round(total * 100) / 100 }),
        paymentResponse: nativePayment,
        fetchFn: opts.fetchFn
      });
    }

    var paid = await DgRazorpayCheckout.payWithRazorpay({
      amountPaise: amountPaise,
      description: opts.description || 'DHEERGAYUSH Store Order',
      prefill: opts.prefill || {},
      receipt: 'store_' + Date.now(),
      fetchFn: opts.fetchFn
    });
    return placePaidOrder({
      orderData: Object.assign({}, opts.orderData, { totalAmount: Math.round(total * 100) / 100 }),
      paymentResponse: paid.paymentResponse,
      verification: paid.verification,
      fetchFn: opts.fetchFn
    });
  }

  global.DgStorePayment = {
    checkoutCartOrder: checkoutCartOrder,
    placePaidOrder: placePaidOrder,
    retryPendingPaidOrder: retryPendingPaidOrder,
    hasPendingPaidOrder: hasPendingPaidOrder
  };
})(typeof window !== 'undefined' ? window : global);

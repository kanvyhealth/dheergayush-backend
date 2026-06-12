(function (global) {
  function orderRequestHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var token = '';
    try {
      token = localStorage.getItem('firebaseIdToken') || '';
    } catch (_) { /* ignore */ }
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function placePaidOrder(opts) {
    var doFetch = opts.fetchFn || fetch;
    var paymentMethod = 'razorpay';
    if (opts.verification && opts.verification.payment_method) {
      paymentMethod = String(opts.verification.payment_method);
    }
    var res = await doFetch('/api/orders', {
      method: 'POST',
      headers: orderRequestHeaders(),
      body: JSON.stringify({
        orderData: Object.assign({}, opts.orderData, {
          paymentMethod: paymentMethod,
          paymentStatus: 'paid',
          razorpayPaymentId: opts.paymentResponse.razorpay_payment_id,
          razorpayOrderId: opts.paymentResponse.razorpay_order_id
        }),
        razorpay_order_id: opts.paymentResponse.razorpay_order_id,
        razorpay_payment_id: opts.paymentResponse.razorpay_payment_id,
        razorpay_signature: opts.paymentResponse.razorpay_signature
      })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Order failed');
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
        prefill: opts.prefill || {}
      });
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

  global.DgStorePayment = { checkoutCartOrder: checkoutCartOrder, placePaidOrder: placePaidOrder };
})(typeof window !== 'undefined' ? window : global);

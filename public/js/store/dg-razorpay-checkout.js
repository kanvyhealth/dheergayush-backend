/**
 * Razorpay Standard Web Checkout helper (KEY_ID from server only; secret stays on backend).
 */
(function (global) {
  var CARD_BLOCK = {
    name: 'Debit / Credit Card',
    instruments: [{ method: 'card' }]
  };
  var NETBANKING_BLOCK = {
    name: 'Net Banking',
    instruments: [{ method: 'netbanking' }]
  };
  var WALLET_BLOCK = {
    name: 'Wallets',
    instruments: [{ method: 'wallet' }]
  };
  var BLOCK_SEQUENCE = [
    'block.upi',
    'block.card',
    'block.netbanking',
    'block.wallet'
  ];

  var MOBILE_CHECKOUT_CONFIG = {
    display: {
      blocks: {
        upi: {
          name: 'Pay via UPI',
          instruments: [
            { method: 'upi', flows: ['collect'] },
            {
              method: 'upi',
              flows: ['intent'],
              apps: ['google_pay', 'phonepe', 'paytm', 'bhim']
            }
          ]
        },
        card: CARD_BLOCK,
        netbanking: NETBANKING_BLOCK,
        wallet: WALLET_BLOCK
      },
      sequence: BLOCK_SEQUENCE,
      preferences: { show_default_blocks: false }
    }
  };

  var DESKTOP_CHECKOUT_CONFIG = {
    display: {
      blocks: {
        upi: {
          name: 'Pay with QR',
          instruments: [{ method: 'upi', flows: ['qr'] }]
        },
        card: CARD_BLOCK,
        netbanking: NETBANKING_BLOCK,
        wallet: WALLET_BLOCK
      },
      sequence: BLOCK_SEQUENCE,
      preferences: { show_default_blocks: false }
    }
  };

  /** Mobile widths / touch devices keep UPI intent apps; desktop gets QR. */
  function isMobileCheckoutViewport() {
    if (typeof window === 'undefined') return false;
    try {
      var narrow = window.matchMedia('(max-width: 768px)').matches;
      var coarse = window.matchMedia('(pointer: coarse)').matches;
      return narrow || (coarse && window.innerWidth < 900);
    } catch (e) {
      return window.innerWidth <= 768;
    }
  }

  function resolveCheckoutConfig(serverConfig) {
    void serverConfig;
    return isMobileCheckoutViewport()
      ? MOBILE_CHECKOUT_CONFIG
      : DESKTOP_CHECKOUT_CONFIG;
  }

  var DEFAULT_CHECKOUT_CONFIG = DESKTOP_CHECKOUT_CONFIG;

  async function parseJson(res) {
    const text = await res.text();
    try {
      return { data: JSON.parse(text), text };
    } catch (e) {
      if (text.trim().indexOf('<') === 0) {
        throw new Error('Server returned HTML instead of JSON. Check API URL and env keys.');
      }
      throw new Error(text.slice(0, 160) || 'Invalid server response');
    }
  }

  async function createOrder({ amount, currency, receipt, fetchFn }) {
    const doFetch = fetchFn || fetch;
    const res = await doFetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency: currency || 'INR',
        receipt: receipt || 'order_' + Date.now()
      })
    });
    const { data } = await parseJson(res);
    if (!res.ok) throw new Error(data.message || 'Could not create order');
    if (!data.order_id) throw new Error('order_id missing from server');
    return data;
  }

  async function verifyPayment(paymentResponse, fetchFn) {
    const doFetch = fetchFn || fetch;
    const res = await doFetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature
      })
    });
    const { data } = await parseJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Payment verification failed');
    }
    return data;
  }

  function cleanPrefill(prefill, opts) {
    var p = {};
    if (!prefill) return p;
    if (prefill.name) p.name = String(prefill.name).slice(0, 120);
    if (prefill.email) p.email = String(prefill.email).slice(0, 120);
    // Phone prefill triggers Razorpay customer/status API — skip unless explicitly requested.
    if (!opts || !opts.skipContact) {
      if (prefill.contact) {
        var digits = String(prefill.contact).replace(/\D/g, '');
        if (digits.length >= 10) p.contact = digits.slice(-10);
      }
    }
    return p;
  }

  function formatCheckoutError(resp) {
    var err = (resp && resp.error) || resp || {};
    var reason = String(err.reason || err.code || '');
    var desc = String(err.description || '');
    if (/international_transaction_not_allowed/i.test(reason + desc)) {
      return 'International cards are not enabled. Test mode: card 4718 6091 0820 4366 or UPI ID success@razorpay (QR scan does not work in test mode).';
    }
    if (/401|unauthorized|authentication/i.test(reason + desc)) {
      return 'Razorpay checkout session failed (401). Complete KYC in Razorpay Dashboard, add website https://dheergayush.net, use Incognito without extensions, then pay via UPI ID success@razorpay or card 4718 6091 0820 4366.';
    }
    var parts = [desc, reason, err.code, err.field].filter(Boolean);
    var msg = parts.join(' — ') || 'Payment failed';
    if (/bad request|400/i.test(msg) || err.code === 'BAD_REQUEST_ERROR') {
      msg += '';
    }
    return msg;
  }

  function openCheckout(options) {
    if (typeof Razorpay === 'undefined') {
      return Promise.reject(new Error('Razorpay checkout.js is not loaded'));
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        fn(value);
      }

      var checkoutConfig = resolveCheckoutConfig(options.checkoutConfig);

      var checkoutOpts = {
        key: options.keyId,
        currency: options.currency || 'INR',
        name: options.name || 'DHEERGAYUSH',
        description: options.description || 'Payment',
        order_id: options.orderId,
        prefill: cleanPrefill(options.prefill, { skipContact: true }),
        theme: options.theme || { color: '#F67227' },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          emi: false
        },
        config: checkoutConfig,
        handler: function (response) {
          done(resolve, response);
        },
        modal: {
          confirm_close: true,
          ondismiss: function () {
            done(reject, new Error('Payment cancelled by user'));
          }
        },
        retry: { enabled: true, max_count: 3 }
      };

      // Amount comes from the server order — do not pass a separate amount (avoids mismatch 400s).
      if (!options.orderId) {
        checkoutOpts.amount = parseInt(String(options.amount || 0), 10);
      }

      var rzp = new Razorpay(checkoutOpts);

      rzp.on('payment.failed', function (resp) {
        done(reject, new Error(formatCheckoutError(resp)));
      });

      var watchdog = setTimeout(function () {
        done(
          reject,
          new Error(
            'Payment is taking too long. QR codes do not work in Razorpay test mode — use UPI ID success@razorpay or card 4718 6091 0820 4366 in Incognito.'
          )
        );
      }, 180000);

      try {
        rzp.open();
      } catch (e) {
        done(reject, e);
      }
    });
  }

  /**
   * Full flow: create order → open checkout → verify signature.
   */
  async function payWithRazorpay({ amountPaise, description, prefill, receipt, fetchFn }) {
    const orderData = await createOrder({
      amount: amountPaise,
      receipt,
      fetchFn
    });
    const paymentResponse = await openCheckout({
      keyId: orderData.key_id,
      orderId: orderData.order_id,
      amount: orderData.amount,
      currency: orderData.currency,
      description,
      prefill,
      checkoutConfig: resolveCheckoutConfig(orderData.checkout_config)
    });
    const verification = await verifyPayment(paymentResponse, fetchFn);
    return { orderData, paymentResponse, verification };
  }

  global.DgRazorpayCheckout = {
    createOrder,
    verifyPayment,
    openCheckout,
    payWithRazorpay,
    isMobileCheckoutViewport,
    resolveCheckoutConfig,
    MOBILE_CHECKOUT_CONFIG: MOBILE_CHECKOUT_CONFIG,
    DESKTOP_CHECKOUT_CONFIG: DESKTOP_CHECKOUT_CONFIG,
    DEFAULT_CHECKOUT_CONFIG: DEFAULT_CHECKOUT_CONFIG
  };
})(typeof window !== 'undefined' ? window : global);

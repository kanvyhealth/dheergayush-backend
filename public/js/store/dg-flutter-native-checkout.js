/**
 * Flutter WebView ↔ native Razorpay bridge (UPI intent apps on Android/iOS).
 *
 * Contract:
 * - Web posts { amountPaise, description, prefill, receipt?, createOrder: true }
 * - Flutter should create/open Razorpay and return the same shape as web verify:
 *   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * - On failure call window.__dgFailNativePayment(message)
 */
(function (global) {
  'use strict';

  var NATIVE_PAY_TIMEOUT_MS = 180000;

  function isAvailable() {
    return global.__DG_FLUTTER_APP__ === true &&
      global.DgNativePayment &&
      typeof global.DgNativePayment.postMessage === 'function';
  }

  function pay(payload) {
    return new Promise(function (resolve, reject) {
      if (!isAvailable()) {
        reject(new Error('Native payment bridge unavailable'));
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        global.__dgNativePaymentResolve = null;
        global.__dgNativePaymentReject = null;
        reject(new Error('Native payment timed out. Please try again.'));
      }, NATIVE_PAY_TIMEOUT_MS);

      function clear() {
        clearTimeout(timer);
        global.__dgNativePaymentResolve = null;
        global.__dgNativePaymentReject = null;
      }

      global.__dgNativePaymentResolve = function (result) {
        if (settled) return;
        settled = true;
        clear();
        var payment = result && typeof result === 'object' ? result : {};
        if (!payment.razorpay_payment_id || !payment.razorpay_order_id || !payment.razorpay_signature) {
          reject(new Error('Native payment incomplete: missing Razorpay order, payment, or signature.'));
          return;
        }
        resolve(payment);
      };
      global.__dgNativePaymentReject = function (err) {
        if (settled) return;
        settled = true;
        clear();
        reject(err instanceof Error ? err : new Error(String(err || 'Payment failed')));
      };

      var message = Object.assign({ createOrder: true }, payload || {});
      global.DgNativePayment.postMessage(JSON.stringify(message));
    });
  }

  global.__dgCompleteNativePayment = function (resultJson) {
    var resolve = global.__dgNativePaymentResolve;
    if (!resolve) return;
    try {
      resolve(typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson);
    } catch (e) {
      resolve(resultJson);
    }
  };

  global.__dgFailNativePayment = function (message) {
    var reject = global.__dgNativePaymentReject;
    if (reject) reject(new Error(message || 'Payment failed'));
  };

  global.DgFlutterNativeCheckout = {
    isAvailable: isAvailable,
    pay: pay
  };
})(typeof window !== 'undefined' ? window : global);

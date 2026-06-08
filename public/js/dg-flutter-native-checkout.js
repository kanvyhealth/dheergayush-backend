/**
 * Flutter WebView ↔ native Razorpay bridge (UPI intent apps on Android/iOS).
 */
(function (global) {
  'use strict';

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
      global.__dgNativePaymentResolve = resolve;
      global.__dgNativePaymentReject = reject;
      global.DgNativePayment.postMessage(JSON.stringify(payload || {}));
    });
  }

  global.__dgCompleteNativePayment = function (resultJson) {
    var resolve = global.__dgNativePaymentResolve;
    global.__dgNativePaymentResolve = null;
    global.__dgNativePaymentReject = null;
    if (!resolve) return;
    try {
      resolve(typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson);
    } catch (e) {
      resolve(resultJson);
    }
  };

  global.__dgFailNativePayment = function (message) {
    var reject = global.__dgNativePaymentReject;
    global.__dgNativePaymentResolve = null;
    global.__dgNativePaymentReject = null;
    if (reject) reject(new Error(message || 'Payment failed'));
  };

  global.DgFlutterNativeCheckout = {
    isAvailable: isAvailable,
    pay: pay
  };
})(typeof window !== 'undefined' ? window : global);

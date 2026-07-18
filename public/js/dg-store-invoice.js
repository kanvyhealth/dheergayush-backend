/**
 * Store order PDF invoice (html2pdf) — used after successful checkout.
 */
(function (global) {
  'use strict';

  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return '₹' + v.toFixed(2);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function buildItemsRows(items) {
    if (!Array.isArray(items) || !items.length) {
      return '<tr><td colspan="4">No items</td></tr>';
    }
    return items.map(function (item) {
      var name = item.name || item.productName || item.medicineName || 'Item';
      var qty = Number(item.quantity || item.qty || 1);
      var rate = Number(
        item.pricePerUnit != null
          ? item.pricePerUnit
          : item.unitPrice != null
            ? item.unitPrice
            : item.price
      );
      if (!isFinite(rate)) rate = 0;
      if (!isFinite(qty) || qty <= 0) qty = 1;
      var line = Number(item.lineTotal != null ? item.lineTotal : rate * qty);
      if (!isFinite(line)) line = rate * qty;
      return (
        '<tr>' +
        '<td>' + escapeHtml(name) + '</td>' +
        '<td class="num">' + escapeHtml(String(qty)) + '</td>' +
        '<td class="num">' + money(rate) + '</td>' +
        '<td class="num">' + money(line) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function fillTemplate(html, data) {
    var root = document.createElement('div');
    root.innerHTML = html;
    var set = function (id, value) {
      var el = root.querySelector('#' + id);
      if (el) el.textContent = value == null || value === '' ? '—' : String(value);
    };
    set('invOrderId', data.orderId);
    set('invDate', data.date);
    set('invPaymentId', data.paymentId);
    set('invRazorpayOrderId', data.razorpayOrderId);
    set('invCustomerName', data.customerName);
    set('invCustomerPhone', data.customerPhone);
    set('invCustomerEmail', data.customerEmail || '—');
    set('invDeliveryAddress', data.deliveryAddress);
    set('invSubtotal', money(data.subtotal));
    set('invDiscount', money(data.discount));
    set('invDelivery', money(data.deliveryFee));
    set('invTotal', money(data.totalAmount));
    var body = root.querySelector('#invItemsBody');
    if (body) body.innerHTML = buildItemsRows(data.items);
    var container = root.querySelector('.invoice-container') || root;
    return container;
  }

  async function download(payload) {
    if (!global.html2pdf) {
      throw new Error('PDF library failed to load');
    }
    var orderData = (payload && payload.orderData) || {};
    var paymentResponse = (payload && payload.paymentResponse) || {};
    var order = (payload && payload.order) || {};
    var orderId =
      order.orderId ||
      order.id ||
      order._id ||
      orderData.orderId ||
      paymentResponse.razorpay_order_id ||
      ('ORD_' + Date.now());

    var data = {
      orderId: orderId,
      date: new Date().toLocaleString('en-IN'),
      paymentId: paymentResponse.razorpay_payment_id || order.razorpayPaymentId || '',
      razorpayOrderId: paymentResponse.razorpay_order_id || order.razorpayOrderId || '',
      customerName: orderData.customerName || '',
      customerPhone: orderData.customerPhone || '',
      customerEmail: orderData.customerEmail || '',
      deliveryAddress: orderData.deliveryAddress || '',
      items: orderData.items || [],
      subtotal: orderData.subtotal,
      discount: orderData.discount,
      deliveryFee: orderData.deliveryFee,
      totalAmount: orderData.totalAmount
    };

    var res = await fetch('store-invoice.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load invoice template');
    var template = await res.text();
    var element = fillTemplate(template, data);

    var filename = 'dheergayush_invoice_' + String(orderId).replace(/[^\w.-]+/g, '_') + '.pdf';
    await global.html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .from(element)
      .save();

    return { orderId: orderId, filename: filename };
  }

  global.DgStoreInvoice = { download: download };
})(typeof window !== 'undefined' ? window : global);

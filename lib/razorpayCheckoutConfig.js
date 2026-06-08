/**
 * Shared Razorpay Standard Checkout display config.
 *
 * Desktop web: UPI QR (scan with any UPI app).
 * Mobile web: UPI intent apps (GPay, PhonePe, etc.) — unchanged from prior setup.
 */

const CARD_BLOCK = {
  name: 'Debit / Credit Card',
  instruments: [{ method: 'card' }]
};

const NETBANKING_BLOCK = {
  name: 'Net Banking',
  instruments: [{ method: 'netbanking' }]
};

const WALLET_BLOCK = {
  name: 'Wallets',
  instruments: [{ method: 'wallet' }]
};

const BLOCK_SEQUENCE = [
  'block.upi',
  'block.card',
  'block.netbanking',
  'block.wallet'
];

/** Mobile: UPI collect + intent apps (PhonePe, GPay, …). */
function getMobileCheckoutDisplayConfig() {
  return {
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
}

/** Desktop web: UPI QR code (Razorpay does not support intent on desktop). */
function getDesktopCheckoutDisplayConfig() {
  return {
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
}

/**
 * @param {{ isMobile?: boolean }} [opts]
 * Defaults to desktop (QR) when unknown — safer for website browsers.
 */
function getCheckoutDisplayConfig(opts) {
  const isMobile = opts && opts.isMobile === true;
  return isMobile
    ? getMobileCheckoutDisplayConfig()
    : getDesktopCheckoutDisplayConfig();
}

function isMobileUserAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  return /android|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile/.test(ua);
}

function getEnabledPaymentMethods() {
  return {
    upi: true,
    card: true,
    netbanking: true,
    wallet: true,
    emi: false
  };
}

module.exports = {
  getCheckoutDisplayConfig,
  getMobileCheckoutDisplayConfig,
  getDesktopCheckoutDisplayConfig,
  getEnabledPaymentMethods,
  isMobileUserAgent
};

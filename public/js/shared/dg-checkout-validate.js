(function (global) {
  function collapseSpaces(value) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function formatAddressParts(address) {
    if (!address) return '';
    if (typeof address === 'string') return collapseSpaces(address);
    if (typeof address !== 'object') return '';
    var parts = [
      address.line1 || address.addressLine1 || address.street || address.fullAddress || address.address,
      address.line2 || address.addressLine2 || address.landmark,
      address.city,
      address.state,
      address.pincode || address.pin || address.zip
    ].map(function (part) { return collapseSpaces(part); }).filter(Boolean);
    return parts.join(', ');
  }

  function normalizeCustomerName(value) {
    return collapseSpaces(value);
  }

  function normalizeDeliveryAddress(value) {
    return formatAddressParts(value);
  }

  function validateCustomerName(value) {
    var name = normalizeCustomerName(value);
    if (name.length < 2) {
      return { ok: false, message: 'Enter your full name.' };
    }
    if (name.length > 80) {
      return { ok: false, message: 'Name is too long.' };
    }
    if (!/^[A-Za-z][A-Za-z .'\-]*$/.test(name)) {
      return { ok: false, message: 'Name can include letters, spaces, dots, apostrophes, and hyphens.' };
    }
    return { ok: true, value: name };
  }

  function validateDeliveryAddress(value) {
    var address = normalizeDeliveryAddress(value);
    if (address.length < 10) {
      return { ok: false, message: 'Enter a complete delivery address (at least 10 characters).' };
    }
    if (address.length > 500) {
      return { ok: false, message: 'Address is too long.' };
    }
    if (/[<>]/.test(address)) {
      return { ok: false, message: 'Address contains invalid characters.' };
    }
    return { ok: true, value: address };
  }

  function validatePhone(value) {
    var phone = String(value || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(phone)) {
      return { ok: false, message: 'Phone number must be exactly 10 digits.' };
    }
    return { ok: true, value: phone };
  }

  global.DgCheckoutValidate = {
    collapseSpaces: collapseSpaces,
    formatAddressParts: formatAddressParts,
    normalizeCustomerName: normalizeCustomerName,
    normalizeDeliveryAddress: normalizeDeliveryAddress,
    validateCustomerName: validateCustomerName,
    validateDeliveryAddress: validateDeliveryAddress,
    validatePhone: validatePhone
  };
})(typeof window !== 'undefined' ? window : global);

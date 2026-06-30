/**
 * Site-wide support contact - single source of truth for phone and email.
 */
(function (global) {
  var supportContact = {
    email: 'support@dheergayush.net',
    phoneDisplay: '7842736777',
    phoneTel: '+917842736777',
    phoneFormatted: '+91 7842736777',
    website: 'https://dheergayush.net',
    companyName: 'DHEERGAYUSH INDIA PRIVATE LIMITED',
    addressLines: [
      '21-8-89, Revenue Ward 46,',
      'Satyanarayanapuram,',
      'Vijayawada Urban,',
      'Krishna District - 520011,',
      'Andhra Pradesh, India'
    ]
  };

  global.DgSiteContact = Object.freeze ? Object.freeze(supportContact) : supportContact;
})(typeof window !== 'undefined' ? window : this);

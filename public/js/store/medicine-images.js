/**
 * Maps medicine names to images in /medicine-assets/ (medicine/medicine folder).
 */
const MEDICINE_IMAGE_FILES = [
  'Abhyarishta.jpg',
  'amritarishta.jpg',
  'Arvindasava.jpg',
  'Ashokarishta-Main.webp',
  'Ashwagandharishta.jpg',
  'Babularishta.jpg',
  'Balarishta.jpg',
  'Bhringrajasava.jpg',
  'Chandanasava.jpg',
  'Chavikasava.jpg',
  'Dashmoola Jirakam.jpg',
  'Dashmularishta.jpg',
  'Draksharishta.jpg',
  'Drakshasava.jpg',
  'Hridayasava.jpg',
  'Jirkadyarishta.jpg',
  'Kutjarishta.jpg',
  'Saunf-Ka-Ark.jpg'
];

const MEDICINE_IMAGE_ALIASES = {
  'abhyarishta': 'Abhyarishta.jpg',
  'amritarishta': 'amritarishta.jpg',
  'arvindasava': 'Arvindasava.jpg',
  'ashokarishta': 'Ashokarishta-Main.webp',
  'ashwagandharishta': 'Ashwagandharishta.jpg',
  'ashwagandha arishta': 'Ashwagandharishta.jpg',
  'babularishta': 'Babularishta.jpg',
  'balarishta': 'Balarishta.jpg',
  'bhringrajasava': 'Bhringrajasava.jpg',
  'chandanasava': 'Chandanasava.jpg',
  'chavikasava': 'Chavikasava.jpg',
  'dashmoola': 'Dashmoola Jirakam.jpg',
  'dashmularishta': 'Dashmularishta.jpg',
  'draksharishta': 'Draksharishta.jpg',
  'drakshasava': 'Drakshasava.jpg',
  'hridayasava': 'Hridayasava.jpg',
  'jeerakadyarishta': 'Jirkadyarishta.jpg',
  'jirkadyarishta': 'Jirkadyarishta.jpg',
  'kutjarishta': 'Kutjarishta.jpg',
  'saunf': 'Saunf-Ka-Ark.jpg',
  'fennel ark': 'Saunf-Ka-Ark.jpg'
};

function normalizeMedicineKey(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStaticRating(name) {
  var key = normalizeMedicineKey(name);
  var hash = 0;
  for (var i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  var n = Math.abs(hash % 10);
  return (4.0 + n / 10).toFixed(1);
}

function getReviewCount(name) {
  var key = normalizeMedicineKey(name);
  var hash = 0;
  for (var i = 0; i < key.length; i++) hash = ((hash << 3) - hash) + key.charCodeAt(i);
  return 120 + (Math.abs(hash) % 2800);
}

function resolveMedicineImageFile(name) {
  var key = normalizeMedicineKey(name);
  if (!key) return null;

  if (MEDICINE_IMAGE_ALIASES[key]) return MEDICINE_IMAGE_ALIASES[key];

  for (var alias in MEDICINE_IMAGE_ALIASES) {
    if (key.indexOf(alias) >= 0 || alias.indexOf(key) >= 0) {
      return MEDICINE_IMAGE_ALIASES[alias];
    }
  }

  for (var i = 0; i < MEDICINE_IMAGE_FILES.length; i++) {
    var base = normalizeMedicineKey(MEDICINE_IMAGE_FILES[i].replace(/\.[^.]+$/, ''));
    if (key.indexOf(base) >= 0 || base.indexOf(key) >= 0) return MEDICINE_IMAGE_FILES[i];
    var keyParts = key.split(' ');
    var matchParts = 0;
    keyParts.forEach(function (p) {
      if (p.length > 3 && base.indexOf(p) >= 0) matchParts++;
    });
    if (matchParts >= 2) return MEDICINE_IMAGE_FILES[i];
  }
  return null;
}

function getMedicineImageUrl(nameOrProduct) {
  if (nameOrProduct && typeof nameOrProduct === 'object') {
    if (nameOrProduct.imageUrl) {
      return nameOrProduct.imageUrl;
    }
    if (nameOrProduct.imageFile) {
      return '/medicine-assets/' + encodeURIComponent(nameOrProduct.imageFile);
    }
    return getMedicineImageUrl(nameOrProduct.name);
  }
  var file = resolveMedicineImageFile(nameOrProduct);
  if (file) return '/medicine-assets/' + encodeURIComponent(file);
  return null;
}

function renderStarsHtml(rating) {
  var r = parseFloat(rating) || 4.5;
  var full = Math.floor(r);
  var half = r - full >= 0.5;
  var html = '';
  for (var i = 0; i < 5; i++) {
    if (i < full) html += '<i class="fas fa-star"></i>';
    else if (i === full && half) html += '<i class="fas fa-star-half-alt"></i>';
    else html += '<i class="far fa-star"></i>';
  }
  return html;
}

function medicineImageFallbackHtml(category) {
  var icons = {
    'Ayurvedic Medicines': 'fa-mortar-pestle',
    'Organic Food': 'fa-leaf',
    'Beauty Care': 'fa-spa',
    'Fitness Care': 'fa-dumbbell',
    'Organic Groceries': 'fa-basket-shopping',
    'Others': 'fa-pills'
  };
  var icon = icons[category] || 'fa-pills';
  return '<div class="product-img-fallback"><i class="fas ' + icon + '"></i></div>';
}

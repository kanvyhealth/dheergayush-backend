/**
 * Ayurvedic-only store seed — brands + classical/patent products for catalog enrichment.
 */
const crypto = require('crypto');
const { buildMedicinesFromFolder, listMedicineImageFiles } = require('./medicineCatalog');

const BRAND_PRODUCTS = {
  Himalaya: [
    'Ashwagandha', 'Brahmi', 'Triphala', 'Liv.52', 'Confido', 'Speman', 'Septilin',
    'Rumalaya Forte', 'Geriforte', 'Tentex Forte', 'Cystone', 'Neem', 'Haridra',
    'Shatavari', 'Amalaki', 'Tulasi', 'Abana', 'Menosan'
  ],
  Dabur: [
    'Chyawanprash', 'Honitus', 'Giloy Ghanvati', 'Triphala Churna', 'Ashwagandha Churna',
    'Shilajit Gold', 'Swarna Guggulu', 'Abhyarishta', 'Kumaryasava', 'Pudin Hara',
    'Hajmola', 'Meswak', 'Red Tooth Powder', 'Vatika Hair Oil'
  ],
  Patanjali: [
    'Divya Chyawanprash', 'Ashwagandha Capsule', 'Giloy Ghan Vati', 'Triphala Churna',
    'Aloe Vera Juice', 'Amla Juice', 'Karela Amla Juice', 'Arjun Amla Juice',
    'Divya Medha Vati', 'Divya Shankh Bhasma', 'Divya Shilajit Capsule', 'Neem Ghan Vati'
  ],
  Baidyanath: [
    'Chyawanprash Special', 'Ashokarishta', 'Abhyarishta', 'Kumaryasava', 'Dashmularishta',
    'Lohasava', 'Punarnavarishta', 'Syp. Livokam', 'Makardhwaj Vati', 'Swarna Bhasma',
    'Triphala Churna', 'Shilajit Capsule', 'Rheumartho Gold'
  ],
  Zandu: [
    'Zandu Pancharishta', 'Zandu Balm', 'Rhumasyl Oil', 'Triphala Churna', 'Chyawanprash',
    'Zandu Kesari Jivan', 'Sona Chandi Chyawanprash', 'Bruhat Vata Chintamani Rasa',
    'Maha Yograj Guggulu', 'Ashwagandha Churna', 'Shilajit Capsule'
  ],
  'Kerala Ayurveda': [
    'Imugest Tablet', 'Brahmi Capsule', 'Aswagandha Arishtam', 'Dasamoolarishtam',
    'Kumaryasavam', 'Arjunarishtam', 'Lekshmi Vilas Rasa', 'Sahacharadi Kuzhambu',
    'Thriphala Tablet', 'Chyavanaprasam', 'Neelibhringadi Oil'
  ],
  'Charak Pharma': [
    'Cypon Syrup', 'M2 Tone Syrup', 'Livomyn Tablet', 'Pigmento Ointment',
    'Extrammune Tablet', 'Hyponidd Tablet', 'Sumenta Tablet', 'Becosules Ayurveda',
    'Triphala Tablet', 'Ashwagandha Capsule', 'Shilajit Capsule'
  ],
  'Sri Sri Tattva': [
    'Chyawanprash', 'Triphala Churna', 'Ashwagandha Tablet', 'Brahmi Tablet',
    'Amruth Tablet', 'Tulasi Arka', 'Sudanta Toothpaste', 'Shakti Drops',
    'Shilajit Capsule', 'Neem Tablet', 'Haridra Capsule'
  ],
  Kapiva: [
    'Aloe Vera Juice', 'Karela Jamun Juice', 'Wheatgrass Juice', 'Ayush Kwath',
    'Shilajit Resin', 'Ashwagandha Capsule', 'Triphala Juice', 'Gulkand',
    'Apple Cider Vinegar', 'Masala Tea', 'Herbal Tea'
  ],
  'Jiva Ayurveda': [
    'Jiva Triphala Tablet', 'Ashwagandha Tablet', 'Brahmi Tablet', 'Arjuna Tablet',
    'Giloy Tablet', 'Chyawanprash', 'Panch Tulsi Drops', 'Alka 5 Syrup',
    'Shilajit Capsule', 'Neem Tablet', 'Haritaki Churna'
  ],
  Vicco: [
    'Vicco Vajradanti Paste', 'Vicco Turmeric Cream', 'Vicco Narayani Cream',
    'Vicco Turmeric WSO', 'Vicco Vajradanti Powder', 'Vicco Aloe Vera Gel'
  ],
  Nagarjuna: [
    'Arjunarishta', 'Dasamoolarishta', 'Ashokarishta', 'Abhyarishta', 'Kumaryasava',
    'Chyawanprash', 'Triphala Churna', 'Brahmi Ghrita', 'Shatavari Granules'
  ],
  'Kottakkal Arya Vaidya Sala': [
    'Dasamoolarishtam', 'Drakshadi Kashayam', 'Indukantham Kashayam', 'Kutajarishtam',
    'Lohasavam', 'Asokarishtam', 'Brahmi Ghritam', 'Chyavanaprasam', 'Thriphala Churnam'
  ],
  'Dhootapapeshwar': [
    'Chyawanprash', 'Arogyavardhini Vati', 'Mahayograj Guggul', 'Sutshekhar Rasa',
    'Kumari Asava', 'Abhayarishta', 'Lohasava', 'Punarnavadi Mandur', 'Triphala Churna'
  ],
  Hamdard: [
    'Joshina Syrup', 'Sualin Tablet', 'Cinkara Syrup', 'Masturin', 'Roghan Badam Shirin',
    'Habbe Ambar Momyai', 'Jawarish Shahi', 'Khameera Abresham'
  ],
  'Maharishi Ayurveda': [
    'Amrit Kalash', 'Digest Tone', 'Cardio Support', 'Glucostat', 'Allergy Relief',
    'Triphala Churna', 'Ashwagandha', 'Brahmi', 'Pirant Oil'
  ]
};

const TABLET_WEIGHTS = [
  { value: 60, unit: 'tablets', price: 149 },
  { value: 120, unit: 'tablets', price: 269 }
];

const LIQUID_WEIGHTS = [
  { value: 200, unit: 'ml', price: 185 },
  { value: 450, unit: 'ml', price: 345 },
  { value: 680, unit: 'ml', price: 495 }
];

const CHURNA_WEIGHTS = [
  { value: 100, unit: 'g', price: 120 },
  { value: 250, unit: 'g', price: 245 },
  { value: 500, unit: 'g', price: 420 }
];

function stableId(brand, name, suffix) {
  return crypto.createHash('md5').update(`${brand}|${name}|${suffix || ''}`).digest('hex').slice(0, 24);
}

function pickWeights(name) {
  const lower = name.toLowerCase();
  if (lower.includes('churna') || lower.includes('prash') || lower.includes('powder') || lower.includes('bhasma')) {
    return CHURNA_WEIGHTS;
  }
  if (lower.includes('arishta') || lower.includes('asava') || lower.includes('asav') || lower.includes('syrup') || lower.includes('juice') || lower.includes('arka') || lower.includes('oil') || lower.includes('kashayam') || lower.includes('kashayam')) {
    return LIQUID_WEIGHTS;
  }
  if (lower.includes('tablet') || lower.includes('capsule') || lower.includes('vati') || lower.includes('rasa') || lower.includes('guggul')) {
    return TABLET_WEIGHTS;
  }
  if (lower.includes('paste') || lower.includes('cream') || lower.includes('gel') || lower.includes('ointment')) {
    return [{ value: 50, unit: 'g', price: 95 }, { value: 100, unit: 'g', price: 165 }];
  }
  return TABLET_WEIGHTS;
}

function seedProduct(brand, name) {
  const weights = pickWeights(name).map((w, i) => ({
    ...w,
    price: w.price + (stableId(brand, name, i).charCodeAt(0) % 40)
  }));
  return {
    _id: stableId(brand, name, 'product'),
    name,
    description: `${brand} — authentic Ayurvedic ${name}. Physician-trusted formulation.`,
    category: 'Ayurvedic Medicines',
    company: brand,
    brand,
    weights
  };
}

function buildAyurvedicSeedMedicines() {
  const medicines = [];

  if (listMedicineImageFiles().length) {
    try {
      buildMedicinesFromFolder().forEach((med) => {
        const name = med.name || '';
        const inferred = Object.keys(BRAND_PRODUCTS).find((b) =>
          name.toLowerCase().includes(b.split(' ')[0].toLowerCase())
        );
        medicines.push({
          ...med,
          company: inferred || name.split(' ')[0],
          brand: inferred || name.split(' ')[0],
          category: med.category || 'Ayurvedic Medicines'
        });
      });
    } catch (_) { /* no images */ }
  }

  Object.entries(BRAND_PRODUCTS).forEach(([brand, products]) => {
    if (!products) return;
    products.forEach((name) => medicines.push(seedProduct(brand, name)));
  });

  return medicines;
}

module.exports = {
  buildAyurvedicSeedMedicines,
  BRAND_PRODUCTS
};

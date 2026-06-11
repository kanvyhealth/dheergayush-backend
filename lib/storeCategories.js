/**
 * Store department taxonomy — five departments for the shop sidebar.
 */
const STORE_DEPARTMENTS = [
  'Ayurvedic Medicines',
  'Personal and Beauty Care',
  'Organic Foods',
  'Yoga and Meditation Accessories',
  'Medical Devices'
];

const DEPARTMENT_KEYS = {
  'ayurvedic medicines': 'Ayurvedic Medicines',
  'personal and beauty care': 'Personal and Beauty Care',
  'organic foods': 'Organic Foods',
  'yoga and meditation accessories': 'Yoga and Meditation Accessories',
  'medical devices': 'Medical Devices',
  // Legacy labels
  'ayurvedic beauty': 'Personal and Beauty Care',
  'ayurvedic wellness': 'Organic Foods',
  'beauty care': 'Personal and Beauty Care',
  'organic food': 'Organic Foods',
  'personal care': 'Personal and Beauty Care'
};

const CLASSICAL_MEDICINE_CATEGORIES = [
  'asava',
  'arishta',
  'kadha',
  'bhasma',
  'choorna',
  'churna',
  'guggul',
  'rasakalpa',
  'suvarna',
  'vati',
  'guti',
  'avaleha',
  'patent',
  'proprietary',
  'bheshajamrut',
  'parpati',
  'pishti',
  'mandoor',
  'pottali',
  'pravahi',
  'kupipakwa',
  'rasayan',
  'loha',
  'super speciality',
  'primary herb'
];

const MEDICAL_DEVICE_KEYWORDS = [
  'medical device',
  'glucometer',
  'glucose meter',
  'blood pressure monitor',
  'bp monitor',
  'thermometer',
  'nebulizer',
  'nebuliser',
  'oximeter',
  'pulse oximeter',
  'stethoscope',
  'spirometer',
  'peak flow meter',
  'heating pad',
  'hot water bag',
  'vaporizer',
  'vapourizer',
  'weighing scale',
  'weighing machine',
  'surgical glove',
  'surgical mask',
  'face mask n95',
  'infrared thermometer',
  'digital thermometer',
  'blood sugar monitor',
  'sugar monitor',
  'tonometer',
  'catheter',
  'cannula',
  'syringe',
  'walker',
  'crutches',
  'wheelchair',
  'compression stocking',
  'cpap',
  'bipap'
];

const YOGA_ACCESSORY_KEYWORDS = [
  'yoga mat',
  'yoga block',
  'yoga strap',
  'yoga bolster',
  'yoga wheel',
  'yoga belt',
  'yoga bag',
  'yoga accessories',
  'meditation cushion',
  'meditation mat',
  'meditation stool',
  'meditation accessories',
  'meditation bowl',
  'singing bowl',
  'tibetan bowl',
  'incense holder',
  'japamala',
  'mala beads',
  'prayer beads',
  'zafu',
  'pranayama',
  'mudra band'
];

const BEAUTY_CARE_KEYWORDS = [
  'beauty',
  'cosmetic',
  'personal care',
  'skin care',
  'skincare',
  'hair care',
  'shampoo',
  'conditioner',
  'face wash',
  'face cream',
  'face pack',
  'face mask',
  'face gel',
  'moisturizer',
  'moisturiser',
  'lotion',
  'sunscreen',
  'spf',
  'toothpaste',
  'tooth powder',
  'deodorant',
  'deo ',
  'body wash',
  'shower gel',
  'shower',
  'soap',
  'lip balm',
  'kajal',
  'eyeliner',
  'makeup',
  'toner',
  'serum',
  'scrub',
  'ubtan',
  'anti acne',
  'anti-acne',
  'anti hair fall',
  'anti-hair fall',
  'under eye',
  'body moisturizer',
  'castile soap',
  'hair fall control',
  'dandruff',
  'cleanser',
  'exfoliat',
  'night cream',
  'day cream',
  'facial',
  'hair colour',
  'hair color',
  'hair serum',
  'beard oil',
  'body lotion',
  'hand cream',
  'foot cream',
  'nail',
  'lipstick',
  'mascara',
  'foundation',
  'concealer',
  'blush',
  'perfume',
  'fragrance',
  'roll on',
  'roll-on'
];

const ORGANIC_FOOD_KEYWORDS = [
  'organic food',
  'health food',
  'green tea',
  'herbal tea',
  'tea bag',
  'matcha',
  'masala chai',
  'chai tea',
  'spiced tea',
  'juice',
  'honey',
  'chyawanprash',
  'chyawanprasha',
  'jam ',
  'pickle',
  'muesli',
  'granola',
  'snack',
  'cookies',
  'biscuit',
  'dry fruit',
  'dry fruits',
  'nuts mix',
  'edible',
  'culinary',
  'beverage',
  'drink',
  'health drink',
  'nutrition powder',
  'protein powder',
  'food supplement',
  'breakfast cereal',
  'malt drink',
  'squash',
  'sharbat',
  'sherbet',
  'ghee',
  'jaggery',
  'organic spice',
  'spice mix'
];

const MEDICINE_SIGNAL_KEYWORDS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'ointment',
  'granule',
  'drops',
  'injection',
  'bhasma',
  'choorna',
  'churna',
  'vati',
  'guti',
  'guggul',
  'arishta',
  'asava',
  'asav',
  'kadha',
  'kashayam',
  'kashaya',
  'rasakalpa',
  'avaleha',
  'lehyam',
  'leha',
  'taila',
  ' oil ',
  'medicine',
  'medicinal',
  'ayurvedic medicine',
  'proprietary',
  'patent',
  'tonic',
  'performance booster',
  'granules',
  'men performance',
  'women tonic',
  'health tonic'
];

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsKeyword(text, keywords) {
  const norm = ` ${normalizeText(text)} `;
  return keywords.some((kw) => norm.includes(` ${normalizeText(kw)} `));
}

function isClassicalMedicineCategory(category) {
  const cat = normalizeText(category);
  return CLASSICAL_MEDICINE_CATEGORIES.some((hint) => cat.includes(hint));
}

function resolveDepartmentKey(raw) {
  const key = normalizeText(raw);
  if (!key) return 'Ayurvedic Medicines';
  if (DEPARTMENT_KEYS[key]) return DEPARTMENT_KEYS[key];
  for (const [alias, label] of Object.entries(DEPARTMENT_KEYS)) {
    if (key.includes(alias)) return label;
  }
  return null;
}

function normalizeStoreCategory(raw) {
  const resolved = resolveDepartmentKey(raw);
  if (resolved) return resolved;
  const key = normalizeText(raw);
  if (isClassicalMedicineCategory(key)) return 'Ayurvedic Medicines';
  return 'Ayurvedic Medicines';
}

function normalizeStoreCategoryKey(raw) {
  return normalizeText(normalizeStoreCategory(raw));
}

function classifyStoreProduct(med) {
  const category = String(med?.category || '').trim();
  const name = String(med?.name || '').trim();
  const description = String(med?.description || '').trim();
  const combined = `${category} ${name} ${description}`;
  const catNorm = normalizeText(category);

  if (isClassicalMedicineCategory(category)) return 'Ayurvedic Medicines';

  const direct = resolveDepartmentKey(category);
  if (direct && STORE_DEPARTMENTS.includes(direct)) {
    const hasMedicineSignal = containsKeyword(combined, MEDICINE_SIGNAL_KEYWORDS);
    const hasBeautySignal = containsKeyword(combined, BEAUTY_CARE_KEYWORDS);
    const hasFoodSignal = containsKeyword(combined, ORGANIC_FOOD_KEYWORDS);
    if (direct === 'Organic Foods' && hasMedicineSignal && !hasFoodSignal) return 'Ayurvedic Medicines';
    if (direct === 'Personal and Beauty Care' && hasMedicineSignal && !hasBeautySignal) {
      return 'Ayurvedic Medicines';
    }
    if (direct === 'Organic Foods' || direct === 'Personal and Beauty Care') return direct;
    return direct;
  }

  if (containsKeyword(combined, MEDICAL_DEVICE_KEYWORDS)) return 'Medical Devices';
  if (containsKeyword(combined, YOGA_ACCESSORY_KEYWORDS)) return 'Yoga and Meditation Accessories';

  const hasMedicineSignal = containsKeyword(combined, MEDICINE_SIGNAL_KEYWORDS);
  const hasBeautySignal = containsKeyword(combined, BEAUTY_CARE_KEYWORDS)
    || catNorm.includes('beauty')
    || catNorm.includes('cosmetic')
    || catNorm.includes('personal care');
  const hasFoodSignal = containsKeyword(combined, ORGANIC_FOOD_KEYWORDS)
    || catNorm.includes('wellness')
    || catNorm.includes('organic food')
    || catNorm.includes('health food');

  if (hasBeautySignal && !hasMedicineSignal) return 'Personal and Beauty Care';
  if (hasFoodSignal && !hasMedicineSignal && !hasBeautySignal) return 'Organic Foods';
  if (hasBeautySignal) return 'Personal and Beauty Care';
  if (hasFoodSignal && containsKeyword(combined, ['tea', 'juice', 'honey', 'chyawanprash', 'snack', 'food'])) {
    return 'Organic Foods';
  }

  if (catNorm.includes('beauty') || catNorm.includes('cosmetic')) return 'Personal and Beauty Care';
  if (catNorm.includes('wellness') || catNorm.includes('organic food')) return 'Organic Foods';

  return 'Ayurvedic Medicines';
}

function productMatchesDepartment(med, department) {
  if (!department || department === 'all') return true;
  return normalizeStoreCategoryKey(classifyStoreProduct(med)) === normalizeStoreCategoryKey(department);
}

function isAllowedStoreDepartment(category) {
  const key = normalizeStoreCategoryKey(category);
  return STORE_DEPARTMENTS.some((dept) => normalizeText(dept) === key)
    || isClassicalMedicineCategory(category)
    || containsKeyword(category, [
      ...BEAUTY_CARE_KEYWORDS.slice(0, 12),
      ...ORGANIC_FOOD_KEYWORDS.slice(0, 10),
      ...YOGA_ACCESSORY_KEYWORDS.slice(0, 8),
      ...MEDICAL_DEVICE_KEYWORDS.slice(0, 8),
      'ayurved',
      'medicine',
      'wellness',
      'consumer'
    ]);
}

function departmentIconClass(category) {
  const key = normalizeStoreCategoryKey(classifyStoreProduct({ category }));
  if (key === 'personal and beauty care') return 'fa-spa';
  if (key === 'organic foods') return 'fa-leaf';
  if (key === 'yoga and meditation accessories') return 'fa-om';
  if (key === 'medical devices') return 'fa-stethoscope';
  return 'fa-mortar-pestle';
}

module.exports = {
  STORE_DEPARTMENTS,
  normalizeStoreCategory,
  normalizeStoreCategoryKey,
  classifyStoreProduct,
  productMatchesDepartment,
  isAllowedStoreDepartment,
  departmentIconClass
};

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
  'personal care': 'Personal and Beauty Care',
  'cooking essentials': 'Organic Foods',
  'organic groceries': 'Organic Foods',
  'eatables': 'Organic Foods',
  'healthy food': 'Organic Foods',
  'healthy foods': 'Organic Foods',
  'seeds and nuts': 'Organic Foods',
  'millets': 'Organic Foods',
  'dals pulses': 'Organic Foods',
  'dals and pulses': 'Organic Foods',
  'nuts dry fruits': 'Organic Foods',
  'nuts and dry fruits': 'Organic Foods',
  'flours': 'Organic Foods',
  'flours and ravva': 'Organic Foods'
};

const ORGANIC_FOOD_SUBCATEGORIES = [
  'Honey',
  'Ghees and Oils',
  'Rice',
  'Pulses',
  'Millets',
  'Pickles (Veg)',
  'Pickles (Non-Veg)',
  'Spices and Masalas',
  'Salts and Sugars',
  'Flours and Ravva',
  'Nuts and Dry Fruits',
  'Packaged Foods',
  'Beverages and Drinks',
  'Sweets'
];

const STORE_SUBCATEGORIES = {
  'Organic Foods': ORGANIC_FOOD_SUBCATEGORIES
};

const SUBCATEGORY_ALIASES = {
  honey: 'Honey',
  'ghees and oils': 'Ghees and Oils',
  'ghee and oils': 'Ghees and Oils',
  ghee: 'Ghees and Oils',
  oils: 'Ghees and Oils',
  rice: 'Rice',
  poha: 'Rice',
  pulses: 'Pulses',
  'dals pulses': 'Pulses',
  'dals and pulses': 'Pulses',
  dal: 'Pulses',
  millets: 'Millets',
  millet: 'Millets',
  'pickles veg': 'Pickles (Veg)',
  'pickle veg': 'Pickles (Veg)',
  'pickles non veg': 'Pickles (Non-Veg)',
  'pickle non veg': 'Pickles (Non-Veg)',
  pickles: 'Pickles (Veg)',
  pickle: 'Pickles (Veg)',
  'spices and masalas': 'Spices and Masalas',
  spices: 'Spices and Masalas',
  masalas: 'Spices and Masalas',
  'cooking essentials': 'Spices and Masalas',
  'salts and sugars': 'Salts and Sugars',
  salt: 'Salts and Sugars',
  sugar: 'Salts and Sugars',
  jaggery: 'Salts and Sugars',
  'flours and ravva': 'Flours and Ravva',
  flours: 'Flours and Ravva',
  flour: 'Flours and Ravva',
  ravva: 'Flours and Ravva',
  rava: 'Flours and Ravva',
  'nuts and dry fruits': 'Nuts and Dry Fruits',
  'nuts dry fruits': 'Nuts and Dry Fruits',
  nuts: 'Nuts and Dry Fruits',
  'dry fruits': 'Nuts and Dry Fruits',
  seeds: 'Nuts and Dry Fruits',
  'seeds and nuts': 'Nuts and Dry Fruits',
  'packaged foods': 'Packaged Foods',
  'packaged food': 'Packaged Foods',
  'beverages and drinks': 'Beverages and Drinks',
  beverages: 'Beverages and Drinks',
  drinks: 'Beverages and Drinks',
  sweets: 'Sweets',
  sweet: 'Sweets'
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
  'spice mix',
  'cooking essentials',
  'eatables',
  'seeds',
  'seed mix',
  'beans',
  'quinoa',
  'barley',
  'rice',
  'poha',
  'dal',
  'pulse',
  'pulses',
  'millet',
  'millets',
  'salt',
  'flour',
  'flours',
  'ravva',
  'rava',
  'almond',
  'cashew',
  'raisin',
  'coriander',
  'dhaniya',
  'chilli powder',
  'turmeric',
  'mustard',
  'basmati'
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
    || catNorm.includes('health food')
    || catNorm.includes('cooking essentials');

  if (hasBeautySignal && !hasMedicineSignal) return 'Personal and Beauty Care';
  if (hasFoodSignal && !hasMedicineSignal && !hasBeautySignal) return 'Organic Foods';
  if (hasBeautySignal) return 'Personal and Beauty Care';
  if (hasFoodSignal && containsKeyword(combined, ['tea', 'juice', 'honey', 'chyawanprash', 'snack', 'food', 'rice', 'dal', 'millet', 'poha', 'salt', 'flour'])) {
    return 'Organic Foods';
  }

  if (catNorm.includes('beauty') || catNorm.includes('cosmetic')) return 'Personal and Beauty Care';
  if (catNorm.includes('wellness') || catNorm.includes('organic food') || catNorm.includes('cooking essentials')) {
    return 'Organic Foods';
  }

  return 'Ayurvedic Medicines';
}

function toStoreSlug(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function departmentFromSlug(slug) {
  const key = toStoreSlug(slug);
  if (!key) return null;
  for (let i = 0; i < STORE_DEPARTMENTS.length; i++) {
    if (toStoreSlug(STORE_DEPARTMENTS[i]) === key) return STORE_DEPARTMENTS[i];
  }
  return null;
}

function normalizeSubcategoryLabel(raw) {
  const key = normalizeText(raw);
  if (!key) return null;
  if (SUBCATEGORY_ALIASES[key]) return SUBCATEGORY_ALIASES[key];
  for (let i = 0; i < ORGANIC_FOOD_SUBCATEGORIES.length; i++) {
    if (normalizeText(ORGANIC_FOOD_SUBCATEGORIES[i]) === key) return ORGANIC_FOOD_SUBCATEGORIES[i];
  }
  for (const [alias, label] of Object.entries(SUBCATEGORY_ALIASES)) {
    if (key.includes(alias)) return label;
  }
  return null;
}

function subcategoryFromSlug(slug, department) {
  const key = toStoreSlug(slug);
  if (!key) return null;
  const dept = department || 'Organic Foods';
  const list = STORE_SUBCATEGORIES[dept] || ORGANIC_FOOD_SUBCATEGORIES;
  for (let i = 0; i < list.length; i++) {
    if (toStoreSlug(list[i]) === key) return list[i];
  }
  return normalizeSubcategoryLabel(String(slug || '').replace(/-/g, ' '));
}

function normalizeSubcategoryKey(raw) {
  const label = normalizeSubcategoryLabel(raw) || String(raw || '').trim();
  return normalizeText(label);
}

function classifyStoreSubcategory(med) {
  const explicit = normalizeSubcategoryLabel(med?.subCategory || med?.subcategory || '');
  if (explicit) return explicit;

  const category = String(med?.category || '').trim();
  const fromCategory = normalizeSubcategoryLabel(category);
  if (fromCategory && category !== 'Organic Foods' && category !== 'Cooking Essentials') {
    return fromCategory;
  }

  const name = String(med?.name || '').trim();
  const description = String(med?.description || '').trim();
  const nameCat = `${category} ${name}`;
  const combined = `${category} ${name} ${description}`;

  // Prefer product name/category signals so ingredient mentions (e.g. "add honey")
  // do not steal the subcategory.
  if (containsKeyword(nameCat, ['honey'])) return 'Honey';
  if (containsKeyword(nameCat, ['ghee', 'cooking oil', 'mustard oil', 'coconut oil', 'sesame oil', 'groundnut oil'])) {
    return 'Ghees and Oils';
  }
  if (containsKeyword(nameCat, ['pickle', 'pickles', 'achaar', 'achar'])) {
    if (/\b(chicken|mutton|prawn|fish|non[\s-]?veg|meat)\b/i.test(combined)) {
      return 'Pickles (Non-Veg)';
    }
    return 'Pickles (Veg)';
  }
  if (containsKeyword(nameCat, ['millet', 'millets', 'foxtail', 'kodo', 'barnyard', 'proso', 'sorghum', 'bajra', 'ragi', 'jowar', 'brown top'])) {
    return 'Millets';
  }
  if (containsKeyword(nameCat, ['dal', 'dals', 'pulse', 'pulses', 'gram', 'toor', 'moong', 'chana dal', 'green gram', 'red gram', 'bean', 'beans', 'rajma'])) {
    return 'Pulses';
  }
  if (containsKeyword(nameCat, ['poha', 'rice', 'basmati', 'sona masoori'])) return 'Rice';
  if (containsKeyword(nameCat, [
    'almond', 'cashew', 'raisin', 'raisins', 'dry fruit', 'dry fruits', 'walnut', 'pista', 'pistachio', 'nuts',
    'seed', 'seeds', 'flax', 'chia', 'pumpkin', 'sunflower', 'sesame', 'melon'
  ])) {
    return 'Nuts and Dry Fruits';
  }
  if (containsKeyword(nameCat, ['atta', 'flour', 'flours', 'ravva', 'rava', 'sooji', 'semolina', 'broken wheat'])) {
    return 'Flours and Ravva';
  }
  if (containsKeyword(nameCat, ['salt', 'sugar', 'jaggery', 'brown sugar'])) return 'Salts and Sugars';
  if (containsKeyword(nameCat, [
    'masala', 'spice', 'spices', 'dhaniya', 'coriander', 'chilli', 'chili', 'turmeric',
    'haldi', 'jeera', 'cumin', 'mustard', 'amchur', 'pepper', 'chintakupodi', 'kitchen king',
    'garam masala', 'chat masala', 'chana masala'
  ])) {
    return 'Spices and Masalas';
  }
  if (containsKeyword(nameCat, [
    'tea', 'juice', 'drink', 'beverage', 'squash', 'sharbat', 'sherbet', 'chai', 'health drink', 'malt'
  ])) {
    return 'Beverages and Drinks';
  }
  if (containsKeyword(nameCat, [
    'sweet', 'sweets', 'candy', 'candies', 'halwa', 'laddu', 'ladoo', 'mithai', 'chocolate', 'jaggery cube'
  ])) {
    return 'Sweets';
  }
  if (containsKeyword(nameCat, ['chyawanprash', 'chyawanprasha', 'snack', 'cookies', 'biscuit', 'muesli', 'granola', 'vinegar', 'jam', 'protein bar'])) {
    return 'Packaged Foods';
  }

  // Description-only fallback (still avoid bare "honey" in ingredients)
  if (containsKeyword(combined, ['pickle', 'pickles'])) {
    if (/\b(chicken|mutton|prawn|fish|non[\s-]?veg|meat)\b/i.test(combined)) return 'Pickles (Non-Veg)';
    return 'Pickles (Veg)';
  }
  if (containsKeyword(combined, ['millet', 'millets'])) return 'Millets';
  if (containsKeyword(combined, ['dal', 'pulse', 'pulses'])) return 'Pulses';
  if (containsKeyword(combined, ['tea', 'juice', 'beverage', 'drink', 'squash'])) return 'Beverages and Drinks';
  if (containsKeyword(combined, ['chyawanprash', 'chyawanprasha', 'snack', 'cookies', 'biscuit', 'muesli', 'granola', 'vinegar'])) {
    return 'Packaged Foods';
  }
  if (normalizeText(category) === 'cooking essentials') return 'Spices and Masalas';
  return 'Packaged Foods';
}

function productMatchesDepartment(med, department) {
  if (!department || department === 'all') return true;
  return normalizeStoreCategoryKey(classifyStoreProduct(med)) === normalizeStoreCategoryKey(department);
}

function productMatchesSubcategory(med, subcategory) {
  if (!subcategory || subcategory === 'all') return true;
  const want = normalizeSubcategoryKey(subcategory);
  if (!want) return true;
  return normalizeSubcategoryKey(classifyStoreSubcategory(med)) === want;
}

function isAllowedStoreDepartment(category) {
  const key = normalizeStoreCategoryKey(category);
  const catNorm = normalizeText(category);
  if (STORE_DEPARTMENTS.some((dept) => normalizeText(dept) === key)) return true;
  if (isClassicalMedicineCategory(category)) return true;
  if (normalizeSubcategoryLabel(category)) return true;
  if (catNorm.includes('cooking essentials') || catNorm.includes('millets')
    || catNorm.includes('pulses') || catNorm.includes('flours')
    || catNorm.includes('nuts') || catNorm.includes('dry fruits')) {
    return true;
  }
  return containsKeyword(category, [
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

function storePathFor(department, subcategory) {
  if (!department || department === 'all') return '/store';
  const deptSlug = toStoreSlug(department);
  if (!deptSlug) return '/store';
  if (!subcategory || subcategory === 'all') return `/store/${deptSlug}`;
  const subSlug = toStoreSlug(subcategory);
  return subSlug ? `/store/${deptSlug}/${subSlug}` : `/store/${deptSlug}`;
}

module.exports = {
  STORE_DEPARTMENTS,
  ORGANIC_FOOD_SUBCATEGORIES,
  STORE_SUBCATEGORIES,
  normalizeStoreCategory,
  normalizeStoreCategoryKey,
  classifyStoreProduct,
  classifyStoreSubcategory,
  normalizeSubcategoryLabel,
  normalizeSubcategoryKey,
  productMatchesDepartment,
  productMatchesSubcategory,
  isAllowedStoreDepartment,
  departmentIconClass,
  toStoreSlug,
  departmentFromSlug,
  subcategoryFromSlug,
  storePathFor
};

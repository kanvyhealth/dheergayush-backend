const { normalizeBrand } = require('./medicineImageResolver');

const EXCLUDED_BRAND_LABELS = [
  'plum',
  'deep ayurveda',
  'nutriorg',
  'neutriog',
  'organic india',
  'soultree',
  'soul tree',
  'the ayurveda experience',
  'ayurveda experience'
];

const EXCLUDED_BRAND_KEYS = new Set(
  EXCLUDED_BRAND_LABELS.flatMap((label) => {
    const lower = label.toLowerCase();
    const stripped = lower.replace(/[^a-z0-9]/g, '');
    const normalized = normalizeBrand(lower);
    return [lower, stripped, normalized].filter(Boolean);
  })
);

function isExcludedBrand(raw) {
  const label = String(raw || '').trim().toLowerCase();
  if (!label) return false;
  if (EXCLUDED_BRAND_KEYS.has(label)) return true;
  const stripped = label.replace(/[^a-z0-9]/g, '');
  if (EXCLUDED_BRAND_KEYS.has(stripped)) return true;
  const normalized = normalizeBrand(label);
  return EXCLUDED_BRAND_KEYS.has(normalized);
}

function isExcludedMedicine(med) {
  if (!med) return false;
  return (
    isExcludedBrand(med.brand)
    || isExcludedBrand(med.company)
    || isExcludedBrand(med.manufacturer)
    || isExcludedBrand(med.storeName)
  );
}

function filterExcludedMedicines(medicines) {
  return (medicines || []).filter((med) => !isExcludedMedicine(med));
}

function filterExcludedStores(stores) {
  return (stores || []).filter((store) => !isExcludedBrand(store && store.name));
}

module.exports = {
  EXCLUDED_BRAND_LABELS,
  isExcludedBrand,
  isExcludedMedicine,
  filterExcludedMedicines,
  filterExcludedStores
};

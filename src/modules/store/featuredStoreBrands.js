/**
 * Featured store brands — pinned first in the shop brand menu.
 */
const FEATURED_STORE_BRANDS = [
  {
    key: 'vaidyaratnam',
    menuLabel: 'Vaidyaratnam',
    catalogNames: ['Vaidyaratnam', 'Vidhyaratnam', 'Vidhya Ratnam']
  },
  {
    key: 'impcops',
    menuLabel: 'IMPCOPS',
    catalogNames: ['IMPCOPS', 'Incops']
  },
  {
    key: 'drrao',
    menuLabel: "Dr Rao's Ayurvedic",
    catalogNames: ["Dr Rao's Herbal Pharma", "Dr Rao's Ayurvedic"]
  }
];

function normalizeBrandKey(name) {
  const { normalizeBrand } = require('./medicineImageResolver');
  return normalizeBrand(name);
}

function featuredBrandEntry(name) {
  const key = normalizeBrandKey(name);
  return FEATURED_STORE_BRANDS.find((entry) => {
    if (entry.key === key) return true;
    return entry.catalogNames.some((label) => normalizeBrandKey(label) === key);
  }) || null;
}

function getStoreMenuLabel(name) {
  const entry = featuredBrandEntry(name);
  return entry ? entry.menuLabel : String(name || '').trim();
}

function sortStoresWithFeatured(stores) {
  const list = (stores || []).slice();
  const rank = (store) => {
    const entry = featuredBrandEntry(store.name || store._id);
    if (!entry) return FEATURED_STORE_BRANDS.length + 1;
    return FEATURED_STORE_BRANDS.findIndex((item) => item.key === entry.key);
  };
  return list.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

module.exports = {
  FEATURED_STORE_BRANDS,
  featuredBrandEntry,
  getStoreMenuLabel,
  sortStoresWithFeatured,
  normalizeBrandKey
};

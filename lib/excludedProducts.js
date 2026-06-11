/**
 * Exclude non-ayurvedic products mistakenly scraped into the store catalog
 * (garments, pet food, household/office items, etc.).
 */

const GARMENT_KEYWORDS = [
  'secret loom',
  'innerwear',
  'inner wear',
  'underwear',
  'under wear',
  'lingerie',
  'garment',
  'clothing',
  'apparel',
  'fashion wear',
  'modal trunk',
  'modal brief',
  'modal vest',
  'modal cotton',
  'elastane',
  'lycra jersey',
  'polyester double cool',
  'combed cotton vest',
  'round neck vest',
  'round - neck',
  'mini trunk',
  "men's brief",
  'mens brief',
  't-shirt',
  't shirt',
  'boxer',
  'panty',
  ' bra ',
  'vest - single jersey',
  'inner elastic',
  'outer elastic',
  'hidden elastic',
  'yarn dyed',
  'bamboo brief',
  'luxury flex modal'
];

const HOUSEHOLD_KEYWORDS = [
  'ring binder',
  'ball pen',
  'metal pen',
  'detergent',
  'liquid detergent',
  'stationery',
  'notebook',
  'pencil',
  'eraser',
  'gift pack 0.7mm',
  'crayon',
  'crayons set',
  'ball crayon',
  'pebble crayon',
  'plastic tray for storage'
];

const PET_KEYWORDS = [
  'pet food',
  'dog food',
  'cat food',
  'healthy pet',
  'healthy cat',
  'puppy food',
  'kitten food',
  'dog treat',
  'cat treat',
  'healthy treats puppy',
  'erina puppy',
  'for dogs',
  'for cats',
  'for puppies',
  'for kittens',
  'feline wellness',
  'canine wellness',
  'kibble',
  'pet care food',
  'pet shampoo'
];

const ALLOWED_CATEGORY_HINTS = [
  'ayurved',
  'medicine',
  'beauty',
  'wellness',
  'cosmetic',
  'skin',
  'hair',
  'asava',
  'arishta',
  'kadha',
  'bhasma',
  'choorna',
  'churna',
  'guggul',
  'vati',
  'guti',
  'tablet',
  'rasakalpa',
  'suvarna',
  'avaleha',
  'proprietary',
  'patent',
  'herb',
  'oil',
  'tail',
  'juice',
  'tea',
  'supplement',
  'personal care',
  'health food',
  'ras ',
  'kalpa',
  'parpati',
  'pishti',
  'mandoor',
  'pottali',
  'pravahi',
  'kupipakwa',
  'rasayan',
  'loha',
  'bheshajamrut',
  'consumer'
];

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPetPackaging(text) {
  const t = String(text || '');
  return (
    /\b\d+\s*(?:ml|l|gm|g|kg)\s+pet\b/i.test(t)
    || /\(\s*pet\s*\)/i.test(t)
    || /\bpet\s*(?:bottle|jar|container)\b/i.test(t)
    || /\b(?:ds|syrup|oil|juice|tablet|capsule)\s+pet\b/i.test(t)
    || /\bpet\s*$/i.test(t.trim())
  );
}

function containsKeyword(text, keywords) {
  const norm = ` ${normalizeText(text)} `;
  return keywords.some((kw) => norm.includes(` ${normalizeText(kw)} `));
}

function isExcludedProduct(med) {
  if (!med) return true;
  const name = String(med.name || '');
  const desc = String(med.description || '');
  const combined = `${name} ${desc}`;

  if (containsKeyword(combined, GARMENT_KEYWORDS)) return true;
  if (containsKeyword(combined, HOUSEHOLD_KEYWORDS)) return true;

  if (containsKeyword(combined, PET_KEYWORDS)) return true;
  if (/\bpet\b/i.test(combined) && !isPetPackaging(combined)) {
    if (/\b(?:dog|cat|puppy|kitten|canine|feline|kibble)\b/i.test(combined)) {
      return true;
    }
  }

  return false;
}

function isAllowedStoreCategory(category) {
  const cat = normalizeText(category);
  if (!cat) return true;
  return ALLOWED_CATEGORY_HINTS.some((hint) => cat.includes(hint));
}

function isValidAyurvedicProduct(med) {
  if (isExcludedProduct(med)) return false;
  if (!isAllowedStoreCategory(med.category)) return false;
  return true;
}

function filterValidProducts(medicines) {
  return (medicines || []).filter((med) => isValidAyurvedicProduct(med));
}

module.exports = {
  GARMENT_KEYWORDS,
  HOUSEHOLD_KEYWORDS,
  PET_KEYWORDS,
  isExcludedProduct,
  isAllowedStoreCategory,
  isValidAyurvedicProduct,
  filterValidProducts
};

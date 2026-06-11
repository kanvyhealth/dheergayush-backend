/**
 * Resolve medicine images from local assets and scraped product dataset.
 */
const fs = require('fs');
const path = require('path');

const MEDICINE_DIR = path.join(__dirname, '..', 'medicine', 'medicine');
const DATASET_DIR = path.join(__dirname, '..', 'ayurvedic_store_dataset', 'images');
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

const BRAND_ALIASES = {
  dabur: 'dabur',
  baidyanath: 'baidyanath',
  himalaya: 'himalaya',
  zandu: 'zandu',
  patanjali: 'patanjali',
  'charak pharma': 'charak',
  'kerala ayurveda': 'kerala',
  imis: 'imis',
  manphar: 'manphar',
  nagarjuna: 'nagarjuna',
  boroplus: 'boroplus',
  navaratna: 'navaratna',
  dermicool: 'dermicool',
  'shree dhootapapeshwar limited': 'sdpl',
  dhootapapeshwar: 'sdpl',
  'dr rao': 'drrao',
  "dr rao's herbal pharma": 'drrao',
  "dr rao's ayurvedic": 'drrao',
  vaidyaratnam: 'vaidyaratnam',
  'vidhya ratnam': 'vaidyaratnam',
  vidhyaratnam: 'vaidyaratnam',
  impcops: 'impcops',
  incops: 'impcops',
  ayurphala: 'ayurphala',
  'vasu labs': 'vasu',
  vasu: 'vasu',
  aimil: 'aimil',
  gufic: 'gufic',
  'himalaya drugs and pharmaceuticals': 'himalayadrugs',
  'dabur classical division': 'daburclassical',
  'revinto ayurvedic': 'revinto',
  revinto: 'revinto',
  'imc ayurvedic': 'imc',
  imc: 'imc',
  hamdard: 'hamdard',
  kapiva: 'kapiva',
  'maharishi ayurveda': 'maharishi',
  'organic india': 'organicindia',
  'sri sri tattva': 'srisritattva',
  'jiva ayurveda': 'jiva',
  'kottakkal arya vaidya sala': 'kottakkal',
  vicco: 'vicco',
  'ban labs': 'banlabs',
  banlabs: 'banlabs',
  soultree: 'soultree',
  'soul tree': 'soultree',
  'the ayurveda experience': 'ayurvedaexperience',
  'inlife pharma': 'inlife',
  inlife: 'inlife',
  medimix: 'medimix',
  nutriorg: 'nutriorg',
  'sandu pharmaceuticals': 'sandu',
  sandu: 'sandu',
  'sri sri tattva': 'srisritattva'
};

let indexCache = null;

const ID_FILENAME = /^([a-f0-9]{24})\.(jpe?g|png|webp|gif)$/i;

function imageUrlFromFile(imageFile) {
  if (!imageFile) return null;
  const file = path.basename(String(imageFile).replace(/^\/+/, ''));
  if (!file || file.includes('..') || !IMAGE_EXT.test(file)) return null;
  return '/medicine-assets/' + encodeURIComponent(file);
}

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\s*-\s*(south|pet|north|east|west|madhu).*$/i, '')
    .replace(/\s+madhu\s+\d+g\s+cp/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBrand(str) {
  const key = String(str || '').toLowerCase().trim();
  if (!key) return '';
  if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];
  const stripped = key.replace(/[^a-z0-9]/g, '');
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    const aliasNorm = alias.replace(/[^a-z0-9]/g, '');
    if (stripped === aliasNorm || (aliasNorm.length >= 4 && stripped.startsWith(aliasNorm))) {
      return canonical;
    }
  }
  const first = key.split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  if (first && BRAND_ALIASES[first]) return BRAND_ALIASES[first];
  return stripped;
}

function inferBrandFromName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return '';
  const aliases = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (n === alias || n.startsWith(`${alias} `)) {
      return BRAND_ALIASES[alias];
    }
  }
  return '';
}

function stripMarketingSuffix(base) {
  return base
    .replace(/_Pack_Of_\d+.*$/i, '')
    .replace(/_Pack_of_\d+.*$/i, '')
    .replace(/_\(\d+[^)]*\).*$/i, '')
    .replace(/_-_.*$/i, '')
    .replace(/_\d+ml.*$/i, '')
    .replace(/_\d+g.*$/i, '')
    .replace(/_\d+_Tablets.*$/i, '')
    .replace(/_Effective_.*$/i, '')
    .replace(/_Useful_.*$/i, '')
    .replace(/_Improves_.*$/i, '')
    .replace(/_Controls_.*$/i, '')
    .replace(/_Helps_.*$/i, '')
    .replace(/_\d+$/i, '');
}

function filenameToNormName(filename) {
  let base = path.basename(filename).replace(/\.[^.]+$/, '');
  base = base.replace(/^(Baidyanath|Dabur|Himalaya|Zandu|Patanjali|Charak_Pharma|Kerala_Ayurveda|TruSoul_By_Baidyanath)_/i, '');
  base = stripMarketingSuffix(base);
  base = base.replace(/_/g, ' ');
  return normalizeName(base);
}

function filenameToBrand(filename) {
  const base = path.basename(filename);
  if (/^Baidyanath/i.test(base) || /^TruSoul_By_Baidyanath/i.test(base)) return 'baidyanath';
  if (/^Dabur/i.test(base)) return 'dabur';
  if (/^Himalaya/i.test(base)) return 'himalaya';
  if (/^Zandu/i.test(base)) return 'zandu';
  if (/^Patanjali/i.test(base)) return 'patanjali';
  if (/^Charak/i.test(base)) return 'charak';
  if (/^Kerala/i.test(base)) return 'kerala';
  return '';
}

function addToIndex(index, normName, url, brand) {
  if (!normName) return;
  if (!index.byName[normName]) index.byName[normName] = url;
  if (brand) {
    const key = brand + '|' + normName;
    if (!index.byBrandName[key]) index.byBrandName[key] = url;
  }
}

function walkImages(dir, urlPrefix, index) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(full, urlPrefix + '/' + encodeURIComponent(entry.name), index);
    } else if (IMAGE_EXT.test(entry.name)) {
      const url = urlPrefix + '/' + encodeURIComponent(entry.name);
      const norm = filenameToNormName(entry.name);
      const brand = filenameToBrand(entry.name);
      addToIndex(index, norm, url, brand);
      const simple = normalizeName(entry.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '));
      if (simple !== norm) addToIndex(index, simple, url, brand);
    }
  }
}

function buildImageIndex() {
  if (indexCache) return indexCache;

  const index = { byName: {}, byBrandName: {}, byId: {}, count: 0 };

  if (fs.existsSync(MEDICINE_DIR)) {
    for (const file of fs.readdirSync(MEDICINE_DIR)) {
      if (!IMAGE_EXT.test(file)) continue;
      const url = '/medicine-assets/' + encodeURIComponent(file);
      const idMatch = file.match(ID_FILENAME);
      if (idMatch) index.byId[idMatch[1].toLowerCase()] = url;
      const norm = normalizeName(file.replace(/\.[^.]+$/, '').replace(/-Main$/i, ''));
      addToIndex(index, norm, url, '');
      index.count++;
    }
  }

  walkImages(DATASET_DIR, '/store-images', index);
  index.count += Object.keys(index.byName).length;

  indexCache = index;
  return indexCache;
}

function tokenOverlap(a, b) {
  const ta = a.split(' ').filter((t) => t.length > 2);
  const tb = b.split(' ').filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  ta.forEach((t) => { if (tb.includes(t)) hits++; });
  return hits / Math.max(ta.length, tb.length);
}

function resolveMedicineImageUrl(med, firebaseImageMap = {}) {
  if (med.imageUrl) return med.imageUrl;

  const fromFile = imageUrlFromFile(med.imageFile);
  if (fromFile) return fromFile;

  const id = String(med._id || med.id || '').toLowerCase();
  if (firebaseImageMap[id]) return firebaseImageMap[id];

  const index = buildImageIndex();
  if (id && index.byId[id]) return index.byId[id];
  const brand = normalizeBrand(med.company || med.manufacturer);
  const name = normalizeName(med.name);
  if (!name) return null;

  if (brand) {
    const brandHit = index.byBrandName[brand + '|' + name];
    if (brandHit) return brandHit;
  }

  if (index.byName[name]) return index.byName[name];

  let bestUrl = null;
  let bestScore = 0.55;
  for (const [key, url] of Object.entries(index.byName)) {
    if (name.includes(key) || key.includes(name)) {
      const score = tokenOverlap(name, key) + (name.includes(key) || key.includes(name) ? 0.2 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
  }

  return bestUrl;
}

function warmImageIndex() {
  buildImageIndex();
}

module.exports = {
  buildImageIndex,
  resolveMedicineImageUrl,
  imageUrlFromFile,
  normalizeName,
  normalizeBrand,
  inferBrandFromName,
  warmImageIndex
};

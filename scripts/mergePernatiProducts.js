/**
 * Merge Pernati Naturals scrape (flat products.json) into medicine-catalog.json.
 *
 * Usage:
 *   node scripts/mergePernatiProducts.js --source "path/to/products.json"
 *   node scripts/mergePernatiProducts.js --source "path/to/products.json" --download-images
 *   node scripts/mergePernatiProducts.js --source "path/to/products.json" --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'medicine');
const REPORT_PATH = path.join(ROOT, 'public', 'data', 'pernati-merge-report.json');

const DRY_RUN = process.argv.includes('--dry-run');
const DOWNLOAD_IMAGES = process.argv.includes('--download-images');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const SOURCE_PATH = argValue('--source');
if (!SOURCE_PATH) {
  console.error('Missing --source path to products.json');
  process.exit(1);
}

const CATEGORY_TO_SUB = {
  'cooking-essentials': 'Spices and Masalas',
  'dals-pulses': 'Pulses',
  'nuts-dry-fruits': 'Nuts and Dry Fruits',
  flours: 'Flours and Ravva',
  spices: 'Spices and Masalas',
  rices: 'Rice',
  millets: 'Millets',
  honey: 'Honey',
  pickles: 'Pickles (Veg)'
};

function subCategoryFor(raw) {
  const fromCat = CATEGORY_TO_SUB[raw.category] || 'Packaged Foods';
  const name = String(raw.name || '');
  if (/salt|sugar|jaggery/i.test(name)) return 'Salts and Sugars';
  if (/poha|rice/i.test(name) && raw.category === 'cooking-essentials') return 'Rice';
  if (/turmeric|chilli|chintaku|dhaniya|mustard|amchur|tamarind|vadiyam/i.test(name)
    && raw.category === 'cooking-essentials') {
    return 'Spices and Masalas';
  }
  return fromCat;
}

const NAME_ALIASES = {
  himalayampinkpowder: 'himalayanpinkpowder',
  himalayanpinkcrystalsalt1kg: 'himalayanpinkcrystalsalt',
  jaggerycubes500gm: 'jaggerycubes',
  jaggerypowder500gm: 'jaggerypowder',
  chikpeablack: 'chickpeablack',
  chikpeawhitekaboli: 'chickpeawhitekaboli',
  chaiseeds: 'chiaseeds',
  kismiss250gm: 'kismis',
  chinamonpowder200gm: 'cinnamonpowder',
  chinnamon: 'cinnamon',
  muatardhoney: 'mustardhoney',
  coriaderpickle: 'corianderpickle',
  almonds500gm: 'almonds',
  blackraisins250gm: 'blackraisins',
  cashew500gm: 'cashewnuts',
  organictoordal: 'toordal',
  foxtailmillet: 'korralu',
  littlemillet: 'saamalu',
  pearmillet: 'sajjalu',
  sorghummillet: 'jonnalu'
};

function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/himalayam/g, 'himalayan')
    .replace(/chikpea/g, 'chickpea')
    .replace(/chinamon|chinnamon/g, 'cinnamon')
    .replace(/chai seeds/g, 'chia seeds')
    .replace(/kismiss/g, 'kismis')
    .replace(/muatard/g, 'mustard')
    .replace(/coriader/g, 'coriander')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function displayName(raw) {
  let name = String(raw || '').trim();
  name = name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Title-case-ish while keeping known tokens
  name = name.replace(/\b\w+/g, (w) => {
    if (/^(dal|gm|kg|pcs)$/i.test(w)) return w.toLowerCase() === 'dal' ? 'Dal' : w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  // Fix common typos in display names
  const fixes = {
    'Himalayam Pink Powder': 'Himalayan Pink Powder',
    'Chikpea Black': 'Chickpea Black',
    'Chikpea White': 'Chickpea White (Kaboli)',
    'Chai Seeds': 'Chia Seeds',
    'Kismiss': 'Kismis',
    'Chinamon Powder': 'Cinnamon Powder',
    'Chinnamon': 'Cinnamon',
    'Muatard Honey': 'Mustard Honey',
    'Coriader Pickle': 'Coriander Pickle',
    'Bare Honey': 'Bare Honey',
    'Bay Leave': 'Bay Leaves',
    'Nut Meg': 'Nutmeg',
    'Basmathi Rice': 'Basmati Rice',
    'Soona Masoori': 'Sona Masoori',
    'Water Melon Seeds': 'Watermelon Seeds'
  };
  return fixes[name] || name;
}

function parsePrice(raw) {
  const n = Number(String(raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function parsePack(name, productUrl) {
  const text = `${name} ${productUrl || ''}`;
  const kg = text.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kg) {
    return {
      value: Number(kg[1]),
      unit: 'kg',
      pack_label: `${kg[1]}kg Pack`
    };
  }
  const gm = text.match(/(\d+(?:\.\d+)?)\s*(?:gm|g)\b/i);
  if (gm) {
    return {
      value: Number(gm[1]),
      unit: 'gm',
      pack_label: `${gm[1]}gm Pack`
    };
  }
  const pcs = text.match(/(\d+)\s*pcs/i);
  if (pcs) {
    return {
      value: Number(pcs[1]),
      unit: 'pcs',
      pack_label: `${pcs[1]} pcs`
    };
  }
  // Defaults by category cues
  if (/honey/i.test(text)) {
    return { value: 500, unit: 'gm', pack_label: '500gm Pack' };
  }
  if (/pickle|avakaya|tokku/i.test(text)) {
    return { value: 250, unit: 'gm', pack_label: '250gm Pack' };
  }
  if (/rice|atta|flour|ravva|millet|dal|pulse|quinoa|poha|salt|jaggery|mustard|turmeric|cumin|pepper|ajwain|clove|elachi|fenugreek|anise|cinnamon|bay|nutmeg|peanut|rajma|sesame|soyabean|ulavalu|chickpea|channa|masoor|moong|urad|toor/i.test(text)) {
    return { value: 1, unit: 'kg', pack_label: '1kg Pack' };
  }
  if (/seed|almond|cashew|raisin|pista|walnut|fig|kismis/i.test(text)) {
    return { value: 250, unit: 'gm', pack_label: '250gm Pack' };
  }
  return { value: 1, unit: 'unit', pack_label: '1 unit' };
}

function slugId(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `pn-${base || crypto.randomBytes(4).toString('hex')}`;
}

function variantId(name, pack) {
  const code = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return `PN-${code}-${pack.value}${String(pack.unit).toUpperCase()}`;
}

function cleanImageUrl(url) {
  if (!url) return '';
  const u = String(url);
  if (/woocommerce-placeholder/i.test(u)) return '';
  // Prefer original from al_opt_content wrappers
  const m = u.match(/IMAGE\/[^/]+\/wp-content\/uploads\/([^?]+)/i);
  if (m) return `https://pernatinaturals.com/wp-content/uploads/${m[1]}`;
  // Strip size suffixes like -100x100 / -150x150 when possible
  return u
    .replace(/-\d{2,4}x\d{2,4}(?=\.(?:png|jpe?g|webp))/i, '')
    .replace(/\?.*$/, '');
}

function imageExt(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.png') || clean.endsWith('.png.webp')) return '.png';
  if (clean.endsWith('.webp')) return '.webp';
  if (clean.endsWith('.jpeg') || clean.endsWith('.jpg')) return '.jpg';
  return '.jpg';
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'dheergayush-catalog-merge/1.0' },
      timeout: 30000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 800) return reject(new Error('image too small'));
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function findExisting(medicines, incomingName) {
  const key = normKey(incomingName);
  const aliased = NAME_ALIASES[key] || key;
  return medicines.find((m) => {
    const e = normKey(m.name);
    const id = normKey(String(m._id || '').replace(/^pn-/, ''));
    if (e === key || e === aliased || id === key || id === aliased) return true;
    // Avoid weak substring matches like "mustard" ↔ "mustard honey"
    if (key.length >= 8 && e.length >= 8 && (e === key.slice(0, e.length) || key === e.slice(0, key.length))) {
      return Math.abs(e.length - key.length) <= 3;
    }
    return false;
  });
}

async function main() {
  const source = JSON.parse(fs.readFileSync(path.resolve(SOURCE_PATH), 'utf8'));
  if (!Array.isArray(source)) {
    throw new Error('Source must be a JSON array');
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const storeIdx = catalog.findIndex((s) => /pernati/i.test(s.name || ''));
  if (storeIdx < 0) throw new Error('Pernati Naturals store not found in catalog');

  const store = catalog[storeIdx];
  const medicines = Array.isArray(store.medicines) ? store.medicines.slice() : [];
  const usedIds = new Set(medicines.map((m) => String(m._id)));

  const report = {
    sourceCount: source.length,
    existingBefore: medicines.length,
    added: [],
    updated: [],
    skippedDuplicateWildHoney: false,
    imageDownloads: [],
    imageFailures: []
  };

  // Deduplicate Wild Honey entries in source (same name twice)
  const seenSourceKeys = new Set();

  for (const raw of source) {
    const name = displayName(raw.name);
    const key = normKey(name);
    if (seenSourceKeys.has(key)) {
      if (/wild honey/i.test(name)) report.skippedDuplicateWildHoney = true;
      continue;
    }
    seenSourceKeys.add(key);

    const price = parsePrice(raw.price);
    if (!price) continue;

    const pack = parsePack(raw.name, raw.product_url);
    const subCategory = subCategoryFor(raw);
    const imageUrl = cleanImageUrl(raw.image);
    const existing = findExisting(medicines, raw.name);

    if (existing) {
      let changed = false;
      // Fill missing imageFile when empty and we can download/map
      if ((!existing.imageFile || !String(existing.imageFile).trim()) && imageUrl && DOWNLOAD_IMAGES) {
        const id = existing._id || slugId(name);
        const destName = `${id}${imageExt(imageUrl)}`;
        const dest = path.join(IMAGE_DIR, destName);
        try {
          if (!DRY_RUN) {
            await download(imageUrl, dest);
            existing.imageFile = destName;
          }
          report.imageDownloads.push({ id, file: destName, for: 'existing' });
          changed = true;
        } catch (err) {
          report.imageFailures.push({ id, url: imageUrl, error: err.message });
        }
      }
      // Keep catalog price if present; optionally sync when pack matches single weight
      if (Array.isArray(existing.weights) && existing.weights.length === 1) {
        const w = existing.weights[0];
        const nextPack = parsePack(raw.name, raw.product_url);
        if (Number(w.price) !== price) {
          w.price = price;
          changed = true;
        }
        // Sync pack when source name encodes size (500gm / 1kg / etc.)
        if (/\d+\s*(?:kg|gm|g|pcs)\b/i.test(`${raw.name} ${raw.product_url || ''}`)) {
          if (Number(w.value) !== Number(nextPack.value) || String(w.unit) !== String(nextPack.unit)) {
            w.value = nextPack.value;
            w.unit = nextPack.unit;
            w.pack_label = nextPack.pack_label;
            w.variant_id = variantId(existing.name || name, nextPack);
            changed = true;
          }
        }
      }
      if (!existing.subCategory) {
        existing.subCategory = subCategory;
        changed = true;
      }
      if (changed) report.updated.push(existing.name);
      continue;
    }

    let id = slugId(name);
    while (usedIds.has(id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
    usedIds.add(id);

    let imageFile = '';
    if (imageUrl && DOWNLOAD_IMAGES) {
      const destName = `${id}${imageExt(imageUrl)}`;
      const dest = path.join(IMAGE_DIR, destName);
      try {
        if (!DRY_RUN) {
          await download(imageUrl, dest);
          imageFile = destName;
        } else {
          imageFile = destName;
        }
        report.imageDownloads.push({ id, file: destName, for: 'new' });
      } catch (err) {
        report.imageFailures.push({ id, url: imageUrl, error: err.message });
      }
    }

    const med = {
      _id: id,
      name,
      imageFile,
      description: `${name} from Pernati Naturals.`,
      category: 'Organic Foods',
      brand: 'Pernati Naturals',
      company: 'Pernati Naturals',
      weights: [{
        value: pack.value,
        unit: pack.unit,
        price,
        pack_label: pack.pack_label,
        variant_id: variantId(name, pack)
      }],
      subCategory
    };

    medicines.push(med);
    report.added.push({ name, id, price, subCategory, imageFile });
  }

  store.medicines = medicines;
  store.description = store.description || 'Pernati naturals — Ayurvedic medicines, beauty & wellness products.';
  report.existingAfter = medicines.length;

  if (!DRY_RUN) {
    fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    try {
      require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'exportStoreBootstrap.js')], {
        stdio: 'inherit',
        cwd: ROOT
      });
    } catch (err) {
      console.warn('store-bootstrap refresh skipped:', err.message);
    }
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Pernati merge ${DRY_RUN ? '(dry-run) ' : ''}complete`);
  console.log(`  before: ${report.existingBefore}`);
  console.log(`  added:  ${report.added.length}`);
  console.log(`  updated:${report.updated.length}`);
  console.log(`  after:  ${report.existingAfter}`);
  console.log(`  images: ${report.imageDownloads.length} ok, ${report.imageFailures.length} failed`);
  console.log(`  report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

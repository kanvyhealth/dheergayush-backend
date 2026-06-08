/**
 * Replace Shree Dhootapapeshwar store in medicine-catalog.json from the official
 * April 2024 price list PDF. Reuses / downloads product images into medicine/medicine.
 *
 * Usage:
 *   node scripts/extractSdplPdf.js          # once, if sdpl-price-list.txt missing
 *   node scripts/syncSdplFromPriceList.js
 *   node scripts/syncSdplFromPriceList.js --dry-run
 *   node scripts/syncSdplFromPriceList.js --skip-images
 */
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const BRAND = 'Shree Dhootapapeshwar';
const STORE_ID = '12313a3fb584b7ca7a16eeca';
const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const TEXT_PATH = path.join(__dirname, 'sdpl-price-list.txt');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'medicine');

const CATEGORY_HEADERS = new Set([
  'patent & proprietary',
  'pravahi',
  'ayurvedic super speciality products',
  'guggulkalpa',
  'suvarnakalpa - premium quality',
  'suvarnakalpa - standard quality',
  'vaidya seva',
  'bhasma',
  'guti - vati',
  'kupipakwa rasayan',
  'loha mandoor',
  'parpati',
  'pishti',
  'rasakalpa',
  'avaleha - pak',
  'consumer ayurved',
  'choorna - choorna vati',
  'asava',
  'arishta',
  'kadha',
  'primary herb',
  'bheshajamrut',
  'indexing',
]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_IMAGES = args.includes('--skip-images');

function stableId(name) {
  return crypto.createHash('md5').update(`sdpl|${name}`).digest('hex').slice(0, 24);
}

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGarbled(line) {
  if (/[°ÕÅÁ»§]/.test(line)) return true;
  if (/\b(jme|emeJe|iegiiegue|eefj°|eepie°|Yemce)\b/i.test(line)) return true;
  if (/[üâêôûùòšÛÇÙ¶=®$#]/.test(line) && !parsePackPrice(line)) return true;
  const latin = (line.match(/[A-Za-z]/g) || []).length;
  const other = line.replace(/[A-Za-z0-9\s\-().,'/+&]/g, '').length;
  if (other > 2 && latin < 8) return true;
  for (const word of line.split(/\s+/)) {
    if (word.length > 8 && /[a-z][A-Z]/.test(word)) return true;
    if (word.length > 10 && (word.match(/[A-Z]/g) || []).length >= 4) return true;
  }
  return false;
}

function isValidProductName(line) {
  const t = line.trim();
  if (t.length < 3) return false;
  if (!/^[A-Z0-9(]/.test(t)) return false;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (latin < 3) return false;
  if (isGarbled(t)) return false;
  if (/^(PRICE|Packing|Tel|Terms)/i.test(t)) return false;
  return true;
}

function parsePackPrice(line) {
  const tabMatch = line.match(
    /(\d+(?:\.\d+)?\s*(?:ml|gm|g|mg|kg|T|tab(?:let)?s?))\s+(\d{1,6}(?:\.\d{2})?)\s*$/i,
  );
  if (tabMatch) {
    return { pack: tabMatch[1].replace(/\s+/g, ' ').trim(), price: parseFloat(tabMatch[2]) };
  }
  const endPrice = line.match(/(\d{1,6}\.\d{2})\s*$/);
  if (!endPrice) return null;
  const before = line.slice(0, line.length - endPrice[0].length).trim();
  const packMatch = before.match(/(\d+(?:\.\d+)?\s*(?:ml|gm|g|mg|kg|T|tab(?:let)?s?))\s*$/i);
  if (packMatch) {
    return { pack: packMatch[1].replace(/\s+/g, ' ').trim(), price: parseFloat(endPrice[1]) };
  }
  return null;
}

function shouldSkipLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(t)) return true;
  if (/^PRICE LIST/i.test(t)) return true;
  if (/^Packing M\.R\.P\./i.test(t)) return true;
  if (/^\(Incl\. GST\)$/i.test(t)) return true;
  if (/^135, Nanubhai/i.test(t)) return true;
  if (/^Tel\./i.test(t)) return true;
  if (/^Manufacturers of$/i.test(t)) return true;
  if (/^Authentic, Standardised/i.test(t)) return true;
  if (/^Safe & Efficacious/i.test(t)) return true;
  if (/^Ayurved Formulations/i.test(t)) return true;
  if (/^Terms and Conditions/i.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  if (/^Price ListEffective/i.test(t)) return true;
  if (/^Effective 9th April/i.test(t)) return true;
  if (/^\d+$/.test(t) && t.length <= 2) return true;
  if (/\.{4,}/.test(t) && CATEGORY_HEADERS.has(t.replace(/\s*\.+.*$/, '').trim().toLowerCase())) {
    return true;
  }
  if (CATEGORY_HEADERS.has(t.toLowerCase())) return true;
  return false;
}

function normalizeCategory(header) {
  const key = header.toLowerCase();
  if (key.includes('guggul')) return 'Guggulkalpa';
  if (key.includes('suvarna')) return 'Suvarnakalpa';
  if (key.includes('bhasma')) return 'Bhasma';
  if (key.includes('choorna')) return 'Choorna';
  if (key.includes('arishta') || key.includes('asava') || key.includes('kadha')) {
    return 'Asava / Arishta / Kadha';
  }
  if (key.includes('primary herb')) return 'Primary Herb Tablets';
  if (key.includes('bheshajamrut')) return 'Bheshajamrut';
  if (key.includes('patent')) return 'Patent & Proprietary';
  if (key.includes('super speciality')) return 'Ayurvedic Super Speciality';
  if (key.includes('consumer')) return 'Consumer Ayurved';
  if (key.includes('avaleha')) return 'Avaleha';
  if (key.includes('guti') || key.includes('vati')) return 'Guti / Vati';
  if (key.includes('rasakalpa')) return 'Rasakalpa';
  return 'Ayurvedic Medicines';
}

function parseWeight(pack) {
  const m = pack.match(/^(\d+(?:\.\d+)?)\s*(ml|gm|g|mg|kg|T|tab(?:let)?s?)$/i);
  if (!m) {
    return { value: 1, unit: pack || 'unit', pack_label: pack };
  }
  let unit = m[2].toLowerCase();
  if (unit === 't' || unit.startsWith('tab')) unit = 'tablets';
  if (unit === 'gm') unit = 'g';
  return {
    value: parseFloat(m[1]),
    unit,
    pack_label: pack,
  };
}

function parseProductsFromText(text) {
  const lines = text.split(/\r?\n/);
  let category = 'Ayurvedic Medicines';
  let current = null;
  const products = [];
  const byName = new Map();

  function flush() {
    if (!current || !current.weights.length) return;
    const key = normalizeName(current.name);
    const existing = byName.get(key);
    if (existing) {
      for (const w of current.weights) {
        const dup = existing.weights.find((x) => x.pack_label === w.pack_label);
        if (!dup) existing.weights.push(w);
      }
      return;
    }
    byName.set(key, current);
    products.push(current);
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (shouldSkipLine(line)) {
      const catKey = line.replace(/\s*\.+.*$/, '').trim().toLowerCase();
      if (CATEGORY_HEADERS.has(catKey) || CATEGORY_HEADERS.has(line.toLowerCase())) {
        flush();
        current = null;
        category = normalizeCategory(line);
      }
      continue;
    }

    const packPrice = parsePackPrice(line);
    if (packPrice) {
      if (!current) continue;
      const parsed = parseWeight(packPrice.pack);
      current.weights.push({
        ...parsed,
        price: packPrice.price,
        variant_id: `${packPrice.price}`,
      });
      continue;
    }

    if (isGarbled(line)) continue;

    if (!isValidProductName(line)) continue;

    flush();
    current = {
      name: line.replace(/\s+/g, ' ').trim(),
      category,
      weights: [],
    };
  }
  flush();
  return products;
}

function buildMedicineRecord(product, imageFile, description) {
  const id = stableId(product.name);
  const weights = product.weights
    .sort((a, b) => a.price - b.price)
    .map((w) => ({
      value: w.value,
      unit: w.unit,
      price: w.price,
      pack_label: w.pack_label,
      variant_id: w.variant_id,
    }));

  return {
    _id: id,
    name: product.name,
    imageFile,
    description: description || `${product.name} — authentic Shree Dhootapapeshwar Ayurvedic formulation.`,
    category: product.category || 'Ayurvedic Medicines',
    brand: BRAND,
    company: BRAND,
    weights,
  };
}

function tokenOverlap(a, b) {
  const ta = normalizeName(a).split(' ').filter((t) => t.length > 2);
  const tb = normalizeName(b).split(' ').filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  ta.forEach((t) => {
    if (tb.includes(t)) hits++;
  });
  return hits / Math.max(ta.length, tb.length);
}

function findBestImageMatch(name, imageIndex) {
  const norm = normalizeName(name);
  if (imageIndex.byName[norm]) return imageIndex.byName[norm];

  let best = null;
  let bestScore = 0.72;
  for (const [key, file] of Object.entries(imageIndex.byName)) {
    const score = tokenOverlap(norm, key);
    if (score > bestScore) {
      bestScore = score;
      best = file;
    }
  }
  return best;
}

function buildImageIndexFromCatalog(oldMedicines) {
  const byName = {};
  for (const med of oldMedicines) {
    if (med.imageFile) {
      byName[normalizeName(med.name)] = med.imageFile;
    }
  }
  return { byName };
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        },
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(fetchUrl(next, redirects + 1));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

async function searchImageOnline(productName) {
  const query = encodeURIComponent(`Dhootapapeshwar ${productName}`);
  const searchUrl = `https://www.1mg.com/search/all?name=${query}`;
  try {
    const res = await fetchUrl(searchUrl);
    if (res.status !== 200) return null;
    const html = res.body.toString('utf8');
    const og = html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (og && og[1] && !/1mg-wordmark|placeholder|logo/i.test(og[1])) {
      return og[1].replace(/&amp;/g, '&');
    }
    const img = html.match(/https:\/\/[^"'\s]+onemg[^"'\s]+\.(?:jpg|jpeg|png|webp)/i);
    return img ? img[0] : null;
  } catch {
    return null;
  }
}

async function downloadImage(url, destPath) {
  const res = await fetchUrl(url);
  if (res.status !== 200 || !res.body.length) {
    throw new Error(`HTTP ${res.status}`);
  }
  const type = String(res.headers['content-type'] || '');
  if (!type.includes('image') && res.body.length < 500) {
    throw new Error('Not an image response');
  }
  fs.writeFileSync(destPath, res.body);
}

function copyIfExists(srcFile, destFile) {
  const src = path.join(IMAGE_DIR, srcFile);
  const dest = path.join(IMAGE_DIR, destFile);
  if (!fs.existsSync(src) || srcFile === destFile) return false;
  fs.copyFileSync(src, dest);
  return true;
}

async function main() {
  if (!fs.existsSync(TEXT_PATH)) {
    console.error('Missing', TEXT_PATH, '— run: node scripts/extractSdplPdf.js');
    process.exit(1);
  }
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }

  const text = fs.readFileSync(TEXT_PATH, 'utf8');
  const parsed = parseProductsFromText(text);
  console.log('Parsed', parsed.length, 'products from price list');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const storeIdx = catalog.findIndex((s) => s._id === STORE_ID || /dhootapapeshwar/i.test(s.name || ''));
  if (storeIdx < 0) {
    console.error('Shree Dhootapapeshwar store not found in catalog');
    process.exit(1);
  }

  const oldStore = catalog[storeIdx];
  const oldMedicines = oldStore.medicines || [];
  const oldImageFiles = new Set(oldMedicines.map((m) => m.imageFile).filter(Boolean));
  const imageIndex = buildImageIndexFromCatalog(oldMedicines);

  const newMedicines = [];
  const usedImageFiles = new Set();
  let reused = 0;
  let downloaded = 0;
  let missing = 0;

  for (let i = 0; i < parsed.length; i++) {
    const product = parsed[i];
    const id = stableId(product.name);
    let imageFile = `${id}.jpg`;

    if (!SKIP_IMAGES && !DRY_RUN) {
      const reusedFile = findBestImageMatch(product.name, imageIndex);
      if (reusedFile && fs.existsSync(path.join(IMAGE_DIR, reusedFile))) {
        imageFile = reusedFile === `${id}.jpg` ? reusedFile : `${id}${path.extname(reusedFile) || '.jpg'}`;
        if (reusedFile !== imageFile) {
          copyIfExists(reusedFile, imageFile);
        }
        reused++;
      } else {
        const dest = path.join(IMAGE_DIR, imageFile);
        if (!fs.existsSync(dest)) {
          const online = await searchImageOnline(product.name);
          if (online) {
            try {
              await downloadImage(online, dest);
              downloaded++;
              await new Promise((r) => setTimeout(r, 350));
            } catch (err) {
              console.warn('  image download failed:', product.name, err.message);
            }
          }
        }
        if (!fs.existsSync(dest)) {
          missing++;
        }
      }
    }

    usedImageFiles.add(imageFile);
    newMedicines.push(buildMedicineRecord(product, imageFile, null));
    if ((i + 1) % 25 === 0) {
      console.log(`  processed ${i + 1}/${parsed.length}...`);
    }
  }

  newMedicines.sort((a, b) => a.name.localeCompare(b.name));

  const newStore = {
    ...oldStore,
    _id: STORE_ID,
    name: BRAND,
    logo: oldStore.logo || '/logos/logo-horizontal.png',
    description: `${BRAND} — Ayurvedic medicines from the official April 2024 price list.`,
    medicines: newMedicines,
  };

  catalog[storeIdx] = newStore;

  if (!DRY_RUN) {
    if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

    // Remove orphaned SDPL images from the previous catalog entry
    for (const file of oldImageFiles) {
      if (!usedImageFiles.has(file)) {
        const full = path.join(IMAGE_DIR, file);
        if (fs.existsSync(full)) {
          try {
            fs.unlinkSync(full);
          } catch (_) {
            /* ignore */
          }
        }
      }
    }

    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  }

  console.log('\nSummary');
  console.log('  Products:', newMedicines.length, '(was', oldMedicines.length, ')');
  console.log('  Images reused:', reused);
  console.log('  Images downloaded:', downloaded);
  console.log('  Images missing:', missing);
  console.log(DRY_RUN ? '  DRY RUN — catalog not written' : `  Updated ${CATALOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

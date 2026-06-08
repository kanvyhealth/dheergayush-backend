const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'medicine');

function stableId(brand, name) {
  return crypto.createHash('md5').update(`${brand}|${name}`).digest('hex').slice(0, 24);
}

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name) {
  return normalizeName(name).replace(/\s+/g, '-');
}

function parseWeight(pack) {
  const m = String(pack || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(ml|gm|g|mg|kg|tab(?:let)?s?|caps?(?:ule)?s?|unit|nos?)$/i);
  if (!m) {
    return { value: 1, unit: pack || 'unit', pack_label: pack || '1 unit' };
  }
  let unit = m[2].toLowerCase();
  if (unit === 'gm') unit = 'g';
  if (unit.startsWith('tab')) unit = 'tablets';
  if (unit.startsWith('cap')) unit = 'capsules';
  if (unit === 'no' || unit === 'nos') unit = 'unit';
  return {
    value: parseFloat(m[1]),
    unit,
    pack_label: `${m[1]} ${unit}`,
  };
}

function normalizeCategory(raw) {
  const key = String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!key) return 'Ayurvedic Medicines';
  if (key.includes('asav') || key.includes('arishta') || key.includes('kadha')) {
    return 'Asava / Arishta / Kadha';
  }
  if (key.includes('bhasma')) return 'Bhasma';
  if (key.includes('choorna') || key.includes('churna')) return 'Choorna';
  if (key.includes('guggul')) return 'Guggulkalpa';
  if (key.includes('ras') && key.includes('kalpa')) return 'Rasakalpa';
  if (key.includes('suvarna')) return 'Suvarnakalpa';
  if (key.includes('vati') || key.includes('guti') || key.includes('tablet')) return 'Guti / Vati';
  if (key.includes('avaleha') || key.includes('pak')) return 'Avaleha';
  if (key.includes('amrit')) return 'Ayurvedic Medicines';
  if (key.includes('ark')) return 'Ayurvedic Medicines';
  if (key.includes('oil') || key.includes('tail')) return 'Ayurvedic Medicines';
  if (key.includes('patent') || key.includes('proprietary')) return 'Patent & Proprietary';
  return 'Ayurvedic Medicines';
}

function cleanProductName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\((?:south|pet|north)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length <= 3 && /^[a-z]+$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .replace(/\bMl\b/g, 'ml')
    .replace(/\bGm\b/g, 'g');
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

function buildImageIndexFromCatalog(oldMedicines) {
  const byName = {};
  for (const med of oldMedicines) {
    if (med.imageFile) byName[normalizeName(med.name)] = med.imageFile;
  }
  return { byName };
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

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
          res.resume();
          resolve(fetchUrl(new URL(res.headers.location, url).toString(), redirects + 1));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('timeout')));
  });
}

function pickBestImage(html) {
  const candidates = [];
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) candidates.push(og[1]);
  const all = html.match(/https:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi) || [];
  all.forEach((u) => candidates.push(u));
  return candidates.find(
    (u) =>
      u &&
      !/logo|favicon|icon|banner|sprite|placeholder|wordmark|avatar|profile|social/i.test(u) &&
      !/250x250.*Social/i.test(u),
  );
}

async function search1mg(brand, name) {
  const q = encodeURIComponent(`${brand} ${name}`);
  const res = await fetchUrl(`https://www.1mg.com/search/all?name=${q}`);
  if (res.status !== 200) return null;
  const html = res.body.toString('utf8');
  const link = html.match(/href="(\/drugs\/[^"?]+)"/i) || html.match(/href="(\/otc\/[^"?]+)"/i);
  if (link) {
    const page = await fetchUrl(`https://www.1mg.com${link[1]}`);
    if (page.status === 200) {
      const img = pickBestImage(page.body.toString('utf8'));
      if (img) return img.replace(/&amp;/g, '&');
    }
  }
  return pickBestImage(html);
}

async function searchTruemeds(brand, name) {
  const res = await fetchUrl(`https://www.truemeds.in/search/${encodeURIComponent(`${brand} ${name}`)}`);
  if (res.status !== 200) return null;
  const html = res.body.toString('utf8');
  const link = html.match(/href="(\/medicine\/[^"?]+)"/i);
  if (link) {
    const page = await fetchUrl(`https://www.truemeds.in${link[1]}`);
    if (page.status === 200) {
      const img = pickBestImage(page.body.toString('utf8'));
      if (img) return img;
    }
  }
  return pickBestImage(html);
}

async function resolveImageOnline(brand, name) {
  for (const fn of [search1mg, searchTruemeds]) {
    try {
      const url = await fn(brand, name);
      if (url) return url;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

async function downloadImage(url, destPath) {
  const res = await fetchUrl(url);
  if (res.status !== 200 || res.body.length < 800) throw new Error(`bad response ${res.status}`);
  fs.writeFileSync(destPath, res.body);
}

function copyIfExists(srcFile, destFile) {
  const src = path.join(IMAGE_DIR, srcFile);
  const dest = path.join(IMAGE_DIR, destFile);
  if (!fs.existsSync(src) || srcFile === destFile) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function buildMedicineRecord({ brand, product, imageFile, storeId }) {
  const id = stableId(brand, product.name);
  const weights = product.weights
    .sort((a, b) => a.price - b.price)
    .map((w) => ({
      value: w.value,
      unit: w.unit,
      price: w.price,
      pack_label: w.pack_label,
      variant_id: w.variant_id || `${w.price}`,
      material_code: w.material_code || undefined,
    }));

  return {
    _id: id,
    name: product.name,
    imageFile,
    description: product.description || `${product.name} — authentic ${brand} Ayurvedic formulation.`,
    category: product.category || 'Ayurvedic Medicines',
    brand,
    company: brand,
    weights,
    storeId,
  };
}

function replaceStoreInCatalog(catalog, { storeId, brandName, brandMatch, newMedicines, description }) {
  const storeIdx = catalog.findIndex(
    (s) => s._id === storeId || (brandMatch && brandMatch.test(s.name || '')),
  );
  if (storeIdx < 0) throw new Error(`${brandName} store not found in catalog`);

  const oldStore = catalog[storeIdx];
  const newStore = {
    ...oldStore,
    _id: storeId || oldStore._id,
    name: brandName,
    logo: oldStore.logo || '/logos/logo-horizontal.png',
    description: description || `${brandName} — Ayurvedic medicines.`,
    medicines: newMedicines.sort((a, b) => a.name.localeCompare(b.name)),
  };
  catalog[storeIdx] = newStore;
  return { oldStore, newStore };
}

function removeOrphanImages(oldMedicines, usedImageFiles) {
  const oldImageFiles = new Set(oldMedicines.map((m) => m.imageFile).filter(Boolean));
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
}

async function attachImages({
  brand,
  products,
  oldMedicines,
  dryRun,
  skipImages,
  onProgress,
}) {
  const imageIndex = buildImageIndexFromCatalog(oldMedicines);
  const records = [];
  const usedImageFiles = new Set();
  let reused = 0;
  let downloaded = 0;
  let missing = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const id = stableId(brand, product.name);
    let imageFile = `${id}.jpg`;

    if (!skipImages && !dryRun) {
      const reusedFile = findBestImageMatch(product.name, imageIndex);
      if (reusedFile && fs.existsSync(path.join(IMAGE_DIR, reusedFile))) {
        imageFile =
          reusedFile === `${id}.jpg` ? reusedFile : `${id}${path.extname(reusedFile) || '.jpg'}`;
        if (reusedFile !== imageFile) copyIfExists(reusedFile, imageFile);
        reused++;
      } else {
        const dest = path.join(IMAGE_DIR, imageFile);
        if (!fs.existsSync(dest)) {
          const online = await resolveImageOnline(brand, product.name);
          if (online) {
            try {
              await downloadImage(online, dest);
              downloaded++;
              await new Promise((r) => setTimeout(r, 400));
            } catch (err) {
              console.warn('  image download failed:', product.name, err.message);
            }
          }
        }
        if (!fs.existsSync(dest)) missing++;
      }
    }

    usedImageFiles.add(imageFile);
    records.push(buildMedicineRecord({ brand, product, imageFile }));
    if (onProgress) onProgress(i + 1, products.length, product.name);
  }

  return { records, usedImageFiles, reused, downloaded, missing };
}

module.exports = {
  ROOT,
  CATALOG_PATH,
  IMAGE_DIR,
  stableId,
  normalizeName,
  slugify,
  parseWeight,
  normalizeCategory,
  cleanProductName,
  buildMedicineRecord,
  replaceStoreInCatalog,
  removeOrphanImages,
  attachImages,
  resolveImageOnline,
  downloadImage,
  fetchUrl,
};

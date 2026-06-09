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

const BRAND_IMAGE_CONFIG = {
  'Shree Dhootapapeshwar': {
    searchBrands: ['Dhootapapeshwar', 'Shree Dhootapapeshwar'],
    slugPrefixes: ['dhootapapeshwar', 'sdpl'],
    manufacturers: ['DHOOTAPAPESHWAR', 'SHREE DHOOTAPAPESHWAR', 'SDL'],
  },
  Baidyanath: {
    searchBrands: ['Baidyanath', 'Shree Baidyanath'],
    slugPrefixes: ['baidyanath'],
    manufacturers: ['BAIDYANATH', 'SHREE BAIDYANATH'],
  },
  Dabur: {
    searchBrands: ['Dabur'],
    slugPrefixes: ['dabur'],
    manufacturers: ['DABUR'],
  },
};

function getBrandImageConfig(brand) {
  for (const [key, cfg] of Object.entries(BRAND_IMAGE_CONFIG)) {
    if (new RegExp(key, 'i').test(brand || '')) return cfg;
  }
  return {
    searchBrands: [brand],
    slugPrefixes: [slugify(brand)],
    manufacturers: [String(brand || '').toUpperCase()],
  };
}

function isBadImageUrl(url) {
  const u = String(url || '').toLowerCase();
  return (
    !u ||
    /logo|favicon|icon|banner|sprite|placeholder|wordmark|avatar|profile|social|footer|trust|certified|badge|payment|wallet|app-store|play-store|navv|map-pin|phone\.png|mail\.png/i.test(
      u,
    )
  );
}

function pickBestImage(html) {
  const candidates = [];
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) candidates.push(og[1]);
  const pharmeasy =
    html.match(/https:\/\/cdn\d+\.pharmeasy\.in\/dam\/products_[^"'\s>]+\.(?:jpg|jpeg|png|webp)[^"'\s>]*/gi) ||
    [];
  pharmeasy.forEach((u) => candidates.push(u));
  const all = html.match(/https:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi) || [];
  all.forEach((u) => candidates.push(u));
  return candidates
    .map((u) => u.replace(/&amp;/g, '&').split('?')[0])
    .find((u) => u && !isBadImageUrl(u));
}

function productMatchesBrand(product, brandCfg) {
  const slug = String(product.slug || '').toLowerCase();
  const mfr = String(product.manufacturer || '').toUpperCase();
  const slugHit = brandCfg.slugPrefixes.some((p) => slug.includes(p));
  const mfrHit = brandCfg.manufacturers.some((m) => mfr.includes(m));
  return slugHit || mfrHit;
}

function scorePharmeasyProduct(product, brandCfg, productName) {
  if (!productMatchesBrand(product, brandCfg)) return 0;
  const name = String(product.name || '');
  const slug = String(product.slug || '').toLowerCase();
  let score = tokenOverlap(productName, name);
  if (tokenOverlap(productName, slug.replace(/-/g, ' ')) > score) {
    score = tokenOverlap(productName, slug.replace(/-/g, ' '));
  }
  const prodNorm = normalizeName(productName);
  const nameNorm = normalizeName(name);
  if (prodNorm && nameNorm.includes(prodNorm)) score += 0.25;
  if (brandCfg.slugPrefixes.some((p) => slug.includes(p))) score += 0.15;
  return score;
}

function pickPharmeasyImage(product) {
  const dam = product.damImages || [];
  const front = dam.find((d) => d.face === 'front') || dam[0];
  const url = (front && front.url) || product.image;
  if (!url || isBadImageUrl(url)) return null;
  return String(url).replace(/&amp;/g, '&').split('?')[0];
}

async function searchPharmeasyProducts(query) {
  const res = await fetchUrl(`https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`);
  if (res.status !== 200) return [];
  const html = res.body.toString('utf8');
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!next) return [];
  try {
    const data = JSON.parse(next[1]);
    return data?.props?.pageProps?.productList || [];
  } catch (_) {
    return [];
  }
}

let daburShopCache = null;
const pharmeasyBrandCache = new Map();

const PHARMEASY_CATEGORY_TERMS = [
  'arishta',
  'asava',
  'bhasma',
  'guggul',
  'vati',
  'tablet',
  'ras',
  'churna',
  'kadha',
  'avaleha',
  'syrup',
  'tail',
  'oil',
];

async function loadPharmeasyBrandCatalog(brandCfg) {
  const cacheKey = brandCfg.searchBrands.join('|');
  if (pharmeasyBrandCache.has(cacheKey)) return pharmeasyBrandCache.get(cacheKey);

  const bySlug = new Map();
  const queries = new Set(brandCfg.searchBrands);
  for (const brandQuery of brandCfg.searchBrands) {
    for (const suffix of PHARMEASY_CATEGORY_TERMS) {
      queries.add(`${brandQuery} ${suffix}`);
    }
  }

  for (const query of queries) {
    const products = await searchPharmeasyProducts(query);
    for (const product of products) {
      if (productMatchesBrand(product, brandCfg) && product.slug) {
        bySlug.set(product.slug, product);
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const list = [...bySlug.values()];
  pharmeasyBrandCache.set(cacheKey, list);
  return list;
}

async function searchPharmeasyCatalog(brand, name) {
  const brandCfg = getBrandImageConfig(brand);
  const catalog = await loadPharmeasyBrandCatalog(brandCfg);
  let best = null;
  let bestScore = 0.42;
  for (const product of catalog) {
    const score = scorePharmeasyProduct(product, brandCfg, name);
    if (score > bestScore) {
      const imageUrl = pickPharmeasyImage(product);
      if (imageUrl) {
        bestScore = score;
        best = imageUrl;
      }
    }
  }
  return best;
}

async function searchPharmeasy(brand, name) {
  const brandCfg = getBrandImageConfig(brand);
  const queries = [
    ...brandCfg.searchBrands.map((b) => `${b} ${name}`),
    name,
  ];
  let best = null;
  let bestScore = 0.42;

  for (const query of queries) {
    const products = await searchPharmeasyProducts(query);
    for (const product of products) {
      const score = scorePharmeasyProduct(product, brandCfg, name);
      if (score > bestScore) {
        const imageUrl = pickPharmeasyImage(product);
        if (imageUrl) {
          bestScore = score;
          best = imageUrl;
        }
      }
    }
    if (best && bestScore >= 0.65) break;
  }

  if (best) return best;
  return searchPharmeasyCatalog(brand, name);
}

async function loadDaburShopProducts() {
  if (daburShopCache) return daburShopCache;
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetchUrl(`https://www.daburshop.com/products.json?limit=250&page=${page}`);
    if (res.status !== 200) break;
    const data = JSON.parse(res.body.toString('utf8'));
    const batch = data.products || [];
    if (!batch.length) break;
    products.push(...batch);
    if (batch.length < 250) break;
  }
  daburShopCache = products;
  return products;
}

async function searchDaburShop(name) {
  const products = await loadDaburShopProducts();
  let best = null;
  let bestScore = 0.5;
  for (const product of products) {
    const title = String(product.title || '');
    const score = tokenOverlap(name, title);
    if (score > bestScore) {
      const image =
        product.images?.[0]?.src ||
        product.image?.src ||
        product.featured_image ||
        product.variants?.[0]?.featured_image?.src;
      if (image && !isBadImageUrl(image)) {
        bestScore = score;
        best = String(image).split('?')[0];
      }
    }
  }
  return best;
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
  const sources = [searchPharmeasy];
  if (/dabur/i.test(brand)) sources.push(searchDaburShop);
  sources.push(search1mg, searchTruemeds);

  for (const fn of sources) {
    try {
      const url = await fn(brand, name);
      if (url && !isBadImageUrl(url)) return url;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

async function downloadImage(url, destPath) {
  const res = await fetchUrl(url);
  if (res.status !== 200 || res.body.length < 2500) {
    throw new Error(`bad response ${res.status}`);
  }
  const type = String(res.headers['content-type'] || '');
  if (type && !type.includes('image')) {
    throw new Error('not an image');
  }
  fs.writeFileSync(destPath, res.body);
  return res.body.length;
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
  getBrandImageConfig,
  searchPharmeasyProducts,
  scorePharmeasyProduct,
  pickPharmeasyImage,
};

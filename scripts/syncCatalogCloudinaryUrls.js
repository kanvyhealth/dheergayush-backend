/**
 * Sync Cloudinary imageUrl onto medicine-catalog.json (or --target).
 *
 * Fast mode (default): parallel CDN HEAD checks — no Admin API per product.
 * Upload mode: --upload-only for Pernati / local file uploads.
 *
 * Usage:
 *   node scripts/syncCatalogCloudinaryUrls.js --fast
 *   node scripts/syncCatalogCloudinaryUrls.js --upload-only
 *   node scripts/syncCatalogCloudinaryUrls.js --dry-run
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const TARGET_PATH = path.resolve(ROOT, argValue('--target') || 'public/data/medicine-catalog.json');
const SOURCE_MAP_PATH = path.resolve(ROOT, argValue('--source-map') || 'public/data/medicine-catalog.json');
const PERNATI_SOURCE_PATH = path.resolve(ROOT, argValue('--pernati-source') || 'public/data/imports/pernati-products.json');
const IMAGE_DIR = path.resolve(ROOT, argValue('--image-dir') || 'medicine/medicine');
const targetBase = path.basename(TARGET_PATH, '.json');
const REPORT_PATH = path.join(path.dirname(TARGET_PATH), `${targetBase}-cloudinary-report.json`);

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload');
const UPLOAD_ONLY = process.argv.includes('--upload-only');
const USE_ADMIN = process.argv.includes('--use-admin-lookup');
const FAST = process.argv.includes('--fast') || (!UPLOAD_ONLY && !USE_ADMIN);
const LIMIT = parseInt(argValue('--limit') || '0', 10) || 0;
const CONCURRENCY = Math.max(1, parseInt(argValue('--concurrency') || '25', 10) || 25);

const CLOUD_FOLDER = 'dheergayush/medicines';
const UPLOAD_DELAY_MS = 300;

function cloudinaryHttpCode(err) {
  return err?.error?.http_code ?? err?.http_code;
}

function cloudinaryMessage(err) {
  return err?.error?.message ?? err?.message ?? String(err);
}

function isRateLimitError(err) {
  const code = cloudinaryHttpCode(err);
  return code === 420 || code === 429;
}

function isNotFoundError(err) {
  const code = cloudinaryHttpCode(err);
  const msg = cloudinaryMessage(err);
  return code === 404 || /not found/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCloudinaryUrl(url) {
  return /res\.cloudinary\.com/i.test(String(url || ''));
}

function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readCatalog(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw) ? raw : raw.stores || [];
}

function writeCatalogAtomic(filePath, stores) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(stores, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function buildSourceMaps(sourceStores) {
  const imageById = new Map();
  const logoByStoreName = new Map();
  for (const store of sourceStores) {
    const storeName = String(store.name || '').trim();
    if (store.logo && isCloudinaryUrl(store.logo)) {
      logoByStoreName.set(storeName.toLowerCase(), store.logo);
    }
    for (const med of store.medicines || []) {
      if (med._id && med.imageUrl && isCloudinaryUrl(med.imageUrl)) {
        imageById.set(String(med._id), med.imageUrl);
      }
    }
  }
  return { imageById, logoByStoreName };
}

function buildPernatiImageMap(pernatiPath) {
  const map = new Map();
  if (!fs.existsSync(pernatiPath)) return map;
  const rows = JSON.parse(fs.readFileSync(pernatiPath, 'utf8'));
  for (const row of rows) {
    const key = normalizeNameKey(row.name);
    const url = String(row.image || '').trim();
    if (key && url) map.set(key, url);
  }
  return map;
}

function publicIdForImageFile(imageFile) {
  const base = path.basename(String(imageFile || '').replace(/^\/+/, ''));
  if (!base) return null;
  return `${CLOUD_FOLDER}/${base}`;
}

function deliveryUrlForImageFile(imageFile) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || 'hra1hmsw';
  const base = path.basename(String(imageFile || '').replace(/^\/+/, ''));
  if (!base) return null;
  return `https://res.cloudinary.com/${cloud}/image/upload/${CLOUD_FOLDER}/${base}`;
}

function headCheckUrl(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function initCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}

async function lookupCloudinaryAsset(cloudinary, publicId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await cloudinary.api.resource(publicId, { resource_type: 'image' });
      if (res && res.secure_url) return res.secure_url;
      return null;
    } catch (err) {
      if (isNotFoundError(err)) return null;
      if (isRateLimitError(err) && i < retries - 1) {
        await sleep(5000 * (i + 1));
        continue;
      }
      throw new Error(cloudinaryMessage(err));
    }
  }
  return null;
}

async function uploadToCloudinary(cloudinary, { filePath, remoteUrl, publicId }) {
  const opts = { public_id: publicId, overwrite: false, resource_type: 'image' };
  if (filePath) return cloudinary.uploader.upload(filePath, opts);
  if (remoteUrl) return cloudinary.uploader.upload(remoteUrl, opts);
  throw new Error('No upload source');
}

async function uploadWithRetry(cloudinary, payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await uploadToCloudinary(cloudinary, payload);
    } catch (err) {
      const msg = cloudinaryMessage(err);
      if (/already exists|Resource with the same public ID/i.test(msg)) {
        const deliveryUrl = deliveryUrlForImageFile(path.basename(payload.publicId));
        if (deliveryUrl && (await headCheckUrl(deliveryUrl))) {
          return { secure_url: deliveryUrl };
        }
      }
      if (isRateLimitError(err) && i < retries - 1) {
        await sleep(5000 * (i + 1));
        continue;
      }
      throw new Error(msg);
    }
  }
}

function resolveRemoteUrl(med, pernatiMap) {
  const brand = String(med.company || med.brand || '').toLowerCase();
  if (brand.includes('pernati')) {
    const key = normalizeNameKey(med.name);
    if (pernatiMap.has(key)) return pernatiMap.get(key);
    for (const [k, url] of pernatiMap.entries()) {
      if (key.includes(k) || k.includes(key)) return url;
    }
  }
  return null;
}

function collectPendingMeds(targetStores) {
  const pending = [];
  for (const store of targetStores) {
    for (const med of store.medicines || []) {
      pending.push({ store, med });
    }
  }
  return pending;
}

async function verifyViaDelivery(pending, report) {
  const toCheck = pending.filter(({ med }) => {
    const imageFile = med.imageFile ? path.basename(String(med.imageFile)) : '';
    return imageFile && !isCloudinaryUrl(med.imageUrl);
  });

  if (!toCheck.length) return;

  console.log(`CDN verify: checking ${toCheck.length} products (concurrency ${CONCURRENCY})...`);

  let done = 0;
  await runPool(toCheck, CONCURRENCY, async ({ med }) => {
    const imageFile = path.basename(String(med.imageFile));
    const localPath = path.join(IMAGE_DIR, imageFile);
    const deliveryUrl = deliveryUrlForImageFile(imageFile);
    const ok = deliveryUrl ? await headCheckUrl(deliveryUrl) : false;

    done++;
    if (done % 50 === 0 || done === toCheck.length) {
      console.log(`  CDN verify: ${done}/${toCheck.length} checked, ${report.counts.foundViaDelivery} found`);
    }

    if (!ok) return false;

    if (!DRY_RUN) {
      med.imageUrl = deliveryUrl;
      if (!fs.existsSync(localPath)) med.cloudinaryOnly = true;
    }
    report.counts.foundViaDelivery++;
    return true;
  });
}

async function uploadPending(pending, pernatiMap, cloudinary, report) {
  const toUpload = pending.filter(({ med }) => {
    if (isCloudinaryUrl(med.imageUrl)) return false;
    const imageFile = med.imageFile ? path.basename(String(med.imageFile)) : '';
    if (!imageFile) return false;
    const localPath = path.join(IMAGE_DIR, imageFile);
    const remoteUrl = resolveRemoteUrl(med, pernatiMap);
    return fs.existsSync(localPath) || !!remoteUrl;
  });

  if (!toUpload.length) return;

  console.log(`Upload: ${toUpload.length} products with local/remote source...`);

  for (const { med } of toUpload) {
    if (LIMIT && report.counts.uploadedLocal + report.counts.uploadedRemote + report.counts.failed >= LIMIT) {
      report.counts.skippedLimit++;
      continue;
    }

    const id = String(med._id || '');
    const imageFile = path.basename(String(med.imageFile));
    const publicId = publicIdForImageFile(imageFile);
    const localPath = path.join(IMAGE_DIR, imageFile);
    const remoteUrl = resolveRemoteUrl(med, pernatiMap);

    try {
      let result = null;
      if (fs.existsSync(localPath)) {
        result = await uploadWithRetry(cloudinary, { filePath: localPath, publicId });
        report.counts.uploadedLocal++;
      } else if (remoteUrl) {
        result = await uploadWithRetry(cloudinary, { remoteUrl, publicId });
        if (!DRY_RUN) med.cloudinaryOnly = true;
        report.counts.uploadedRemote++;
      }

      if (!DRY_RUN && result?.secure_url) {
        med.imageUrl = result.secure_url;
      }
      await sleep(UPLOAD_DELAY_MS);
    } catch (err) {
      report.counts.failed++;
      if (report.failures.length < 500) {
        report.failures.push({
          _id: id,
          name: med.name,
          brand: med.company || med.brand,
          imageFile,
          reason: err.message || String(err)
        });
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(TARGET_PATH)) {
    console.error('Target catalog not found:', TARGET_PATH);
    process.exit(1);
  }

  const targetStores = readCatalog(TARGET_PATH);
  const sourceStores = fs.existsSync(SOURCE_MAP_PATH) ? readCatalog(SOURCE_MAP_PATH) : [];
  const { imageById, logoByStoreName } = buildSourceMaps(sourceStores);
  const pernatiMap = buildPernatiImageMap(PERNATI_SOURCE_PATH);
  const pending = collectPendingMeds(targetStores);

  const cloudinary = initCloudinary();
  const needsUpload = !DRY_RUN && !SKIP_UPLOAD && (UPLOAD_ONLY || !FAST);
  if (needsUpload && !cloudinary) {
    console.error('Missing Cloudinary credentials for upload. Set CLOUDINARY_* in .env');
    process.exit(1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    target: path.relative(ROOT, TARGET_PATH),
    mode: UPLOAD_ONLY ? 'upload-only' : FAST ? 'fast' : 'full',
    dryRun: DRY_RUN,
    counts: {
      alreadyHad: 0,
      copied: 0,
      foundInCloudinary: 0,
      foundViaDelivery: 0,
      uploadedLocal: 0,
      uploadedRemote: 0,
      logosCopied: 0,
      failed: 0,
      noSource: 0,
      skippedLimit: 0
    },
    failures: [],
    samples: {}
  };

  if (!UPLOAD_ONLY) {
    for (const store of targetStores) {
      const storeKey = String(store.name || '').trim().toLowerCase();
      if (logoByStoreName.has(storeKey) && !isCloudinaryUrl(store.logo)) {
        if (!DRY_RUN) store.logo = logoByStoreName.get(storeKey);
        report.counts.logosCopied++;
      }
    }

    for (const { med } of pending) {
      if (isCloudinaryUrl(med.imageUrl)) {
        report.counts.alreadyHad++;
        continue;
      }

      const id = String(med._id || '');
      if (id && imageById.has(id)) {
        if (!DRY_RUN) med.imageUrl = imageById.get(id);
        report.counts.copied++;
      }
    }

    for (const { med } of pending) {
      if (isCloudinaryUrl(med.imageUrl)) continue;
      if (!med.imageFile) {
        report.counts.noSource++;
        if (report.failures.length < 500) {
          report.failures.push({
            _id: med._id,
            name: med.name,
            brand: med.company || med.brand,
            imageFile: '',
            reason: 'no_imageFile'
          });
        }
      }
    }

    if (FAST && !SKIP_UPLOAD) {
      await verifyViaDelivery(pending, report);
    } else if (USE_ADMIN && cloudinary && !SKIP_UPLOAD) {
      const toLookup = pending.filter(({ med }) => med.imageFile && !isCloudinaryUrl(med.imageUrl));
      console.log(`Admin lookup: ${toLookup.length} products...`);
      for (const { med } of toLookup) {
        const imageFile = path.basename(String(med.imageFile));
        const publicId = publicIdForImageFile(imageFile);
        try {
          const existing = await lookupCloudinaryAsset(cloudinary, publicId);
          if (existing) {
            if (!DRY_RUN) {
              med.imageUrl = existing;
              if (!fs.existsSync(path.join(IMAGE_DIR, imageFile))) med.cloudinaryOnly = true;
            }
            report.counts.foundInCloudinary++;
          }
          await sleep(UPLOAD_DELAY_MS);
        } catch (err) {
          report.counts.failed++;
        }
      }
    }
  }

  if (!DRY_RUN && !SKIP_UPLOAD && cloudinary) {
    await uploadPending(pending, pernatiMap, cloudinary, report);
  }

  for (const { med } of pending) {
    if (isCloudinaryUrl(med.imageUrl)) continue;
    const imageFile = med.imageFile ? path.basename(String(med.imageFile)) : '';
    if (!imageFile) continue;
    const localPath = path.join(IMAGE_DIR, imageFile);
    const remoteUrl = resolveRemoteUrl(med, pernatiMap);
    if (!fs.existsSync(localPath) && !remoteUrl) {
      const already = report.failures.some((f) => f._id === med._id && f.reason === 'no_local_or_remote_source');
      if (!already && report.failures.length < 500) {
        report.failures.push({
          _id: med._id,
          name: med.name,
          brand: med.company || med.brand,
          imageFile,
          reason: 'no_local_or_remote_source'
        });
      }
    }
  }

  const totals = pending.map(({ med }) => med);
  report.summary = {
    totalProducts: totals.length,
    withCloudinary: totals.filter((m) => isCloudinaryUrl(m.imageUrl)).length,
    withoutCloudinary: totals.filter((m) => !isCloudinaryUrl(m.imageUrl)).length
  };

  if (DRY_RUN) {
    console.log(JSON.stringify(report.counts, null, 2));
    console.log('Summary:', report.summary);
    console.log('Dry run — no files written');
    return;
  }

  writeCatalogAtomic(TARGET_PATH, targetStores);
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report.counts, null, 2));
  console.log('Summary:', report.summary);
  console.log('Wrote', TARGET_PATH);
  console.log('Report', REPORT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

'use strict';

/**
 * Add/update Araku Coffee store in medicine-catalog.json.
 * Downloads pack photos, uploads them to Cloudinary, then writes the catalog.
 *
 * Usage: node scripts/syncArakuCoffee.js
 *        node scripts/syncArakuCoffee.js --dry-run
 */
try {
  require('dotenv').config();
} catch (_) {
  /* optional when node_modules is not installed */
}

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'araku-coffee');
const STORE_ID = 'araku-coffee';
const BRAND = 'Araku Coffee';
const CLOUD_FOLDER = 'dheergayush/medicines';
const DRY_RUN = process.argv.includes('--dry-run');

const PRODUCTS = [
  {
    id: 'ac-0001',
    name: 'Filter Coffee 60% Arabica 40% Chicory',
    description: 'Araku filter coffee — 60% Arabica coffee blended with 40% chicory.',
    weights: [{ value: 200, unit: 'g', price: 300, pack_label: '200 g' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/products/image_ce1477d0-0c12-43a3-be49-24c4653129c6.jpg'
  },
  {
    id: 'ac-0002',
    name: 'Filter Coffee 80% Arabica 20% Chicory',
    description: 'Araku filter coffee — 80% Arabica coffee blended with 20% chicory.',
    weights: [{ value: 200, unit: 'g', price: 400, pack_label: '200 g' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/products/image_84d5e743-de57-4baf-beaf-7b3a79510955.jpg'
  },
  {
    id: 'ac-0003',
    name: 'Filter Coffee 100% Arabica Pure Coffee',
    description: 'Araku filter coffee — 100% pure Arabica, no chicory.',
    weights: [{ value: 200, unit: 'g', price: 600, pack_label: '200 g' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/products/image_f42e8250-93df-4afe-ad1b-ba830adff148.jpg'
  },
  {
    id: 'ac-0004',
    name: 'Instant Coffee 70% Coffee 30% Chicory',
    description: 'Araku instant coffee — 70% coffee blended with 30% chicory.',
    weights: [{ value: 50, unit: 'g', price: 160, pack_label: '50 g' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/files/FullSizeRender_e6700fa3-c815-4172-a05e-156a868dfbe0.jpg'
  },
  {
    id: 'ac-0005',
    name: 'Super Strong Instant Coffee 53% Coffee 47% Chicory',
    description: 'Araku super strong instant coffee — 53% coffee blended with 47% chicory. Pack of 5 × 200g.',
    weights: [{ value: 1000, unit: 'g', price: 950, pack_label: '1 kg (5 × 200 g)' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/files/FullSizeRender_48a202f5-470d-495e-a1ed-0bfc3eaef34e.jpg'
  },
  {
    id: 'ac-0006',
    name: 'Instant Coffee 2 Rupees Sachet 70% Coffee 30% Chicory',
    description: 'Araku instant coffee sachet — 70% coffee blended with 30% chicory.',
    weights: [{ value: 1, unit: 'sachet', price: 2, pack_label: '1 sachet' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/products/image_ae122275-f5b9-4b73-a303-a54c6493fb7d.jpg'
  },
  {
    id: 'ac-0007',
    name: 'Filter Coffee Decoction 80% Coffee 20% Chicory',
    description: 'Araku filter coffee decoction — 80% coffee blended with 20% chicory.',
    weights: [{ value: 1, unit: 'pack', price: 10, pack_label: '1 decoction pack' }],
    imageUrl:
      'https://cdn.shopify.com/s/files/1/0251/6942/8589/files/B1A9B21C-6667-42AA-AF55-5FDEABDDE488.jpg'
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        }
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          downloadFile(new URL(res.headers.location, url).toString(), destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (body.length < 2500) {
            reject(new Error(`image too small (${body.length} bytes)`));
            return;
          }
          fs.writeFileSync(destPath, body);
          resolve(body.length);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('timeout'));
    });
  });
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

async function uploadImage(cloudinary, localPath, publicId) {
  for (let i = 0; i < 3; i++) {
    try {
      return await cloudinary.uploader.upload(localPath, {
        public_id: publicId,
        overwrite: true,
        resource_type: 'image'
      });
    } catch (err) {
      const code = err?.error?.http_code ?? err?.http_code;
      const msg = err?.error?.message ?? err?.message ?? String(err);
      if ((code === 420 || code === 429) && i < 2) {
        await sleep(5000 * (i + 1));
        continue;
      }
      throw new Error(msg);
    }
  }
}

function cloudinaryFetchUrl(remoteUrl) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || 'hra1hmsw';
  return `https://res.cloudinary.com/${cloud}/image/fetch/f_auto,q_auto/${remoteUrl}`;
}

function buildMedicine(product, uploaded) {
  const hasLocal = fs.existsSync(path.join(IMAGE_DIR, `${product.id}.jpg`));
  const imageFile = uploaded || hasLocal ? `${product.id}.jpg` : '';
  const med = {
    _id: product.id,
    name: product.name,
    imageFile,
    description: product.description,
    category: 'Organic Foods',
    brand: BRAND,
    company: BRAND,
    weights: product.weights.map((weight) => ({
      value: weight.value,
      unit: weight.unit,
      price: weight.price,
      pack_label: weight.pack_label,
      variant_id: ''
    })),
    subCategory: 'Beverages and Drinks'
  };
  if (uploaded?.secure_url) {
    med.imageUrl = uploaded.secure_url;
    med.cloudinaryOnly = true;
  } else if (product.imageUrl) {
    med.imageUrl = cloudinaryFetchUrl(product.imageUrl);
    med.cloudinaryOnly = true;
  }
  return med;
}

function upsertStore(catalog, store) {
  const existingIndex = catalog.findIndex(
    (entry) => entry && (entry._id === STORE_ID || String(entry.name || '').toLowerCase() === BRAND.toLowerCase())
  );
  if (existingIndex >= 0) {
    catalog[existingIndex] = store;
    return 'Updated';
  }
  const insertAt = catalog.findIndex(
    (entry) => entry && Array.isArray(entry.medicines)
      && String(entry.name || '').localeCompare(store.name, 'en', { sensitivity: 'base' }) > 0
  );
  if (insertAt === -1) catalog.push(store);
  else catalog.splice(insertAt, 0, store);
  return 'Added';
}

async function main() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const cloudinary = initCloudinary();
  if (!cloudinary && !DRY_RUN) {
    console.warn('Missing CLOUDINARY_* in .env — using Cloudinary fetch URLs instead of uploaded assets');
  }

  const uploadResults = new Map();

  for (const product of PRODUCTS) {
    const localPath = path.join(IMAGE_DIR, `${product.id}.jpg`);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).size < 2500) {
      if (DRY_RUN) {
        console.log(`  would download ${product.name}`);
      } else {
        try {
          const bytes = await downloadFile(product.imageUrl, localPath);
          console.log(`  downloaded ${product.name} (${bytes} bytes)`);
        } catch (err) {
          console.warn(`  download failed ${product.name}: ${err.message}`);
        }
      }
    } else {
      console.log(`  reuse local ${product.id}.jpg`);
    }

    if (DRY_RUN || !cloudinary || !fs.existsSync(localPath)) continue;

    try {
      const result = await uploadImage(cloudinary, localPath, `${CLOUD_FOLDER}/${product.id}`);
      uploadResults.set(product.id, result);
      console.log(`  uploaded ${product.name} -> ${result.secure_url}`);
      await sleep(300);
    } catch (err) {
      console.error(`  upload failed ${product.name}: ${err.message}`);
    }
  }

  const medicines = PRODUCTS.map((product) => buildMedicine(product, uploadResults.get(product.id)));
  const store = {
    _id: STORE_ID,
    name: BRAND,
    logo: '/logos/logo-horizontal.png',
    description: 'Araku Coffee — filter, instant, and decoction coffee from the Araku Valley.',
    medicines
  };

  if (DRY_RUN) {
    console.log('Dry run — catalog not written');
    console.log(JSON.stringify(medicines, null, 2));
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  if (!Array.isArray(catalog)) throw new Error('Catalog root is not an array');
  const action = upsertStore(catalog, store);

  const tmp = `${CATALOG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CATALOG_PATH);

  const withImages = medicines.filter((med) => med.imageUrl).length;
  console.log(`${action} ${BRAND}: ${medicines.length} products, ${withImages} with Cloudinary images`);
  console.log('Wrote', CATALOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

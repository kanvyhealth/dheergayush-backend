'use strict';

/**
 * Add/update Dr. JRK's store in medicine-catalog.json from the Pioneer
 * chemist price list (May 2026) and official jrkresearch.com pack photos.
 *
 * Usage: node scripts/syncDrJrksFromPriceList.js
 *        node scripts/syncDrJrksFromPriceList.js --dry-run
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

const { classifyStoreProduct } = require('../src/modules/store/storeCategories');
const { stableId } = require('./catalogBrandUtils');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'dr-jrks');
const STORE_ID = 'dr-jrks';
const BRAND = "Dr. JRK's";
const CLOUD_FOLDER = 'dheergayush/medicines';
const DRY_RUN = process.argv.includes('--dry-run');
const SHOP_CDN = 'https://cdn.shopify.com/s/files/1/0794/9864/1693/files';

const PRODUCTS = [
  {
    name: 'JRKs 1-3-2 Psoriasis Kit',
    description: 'JRKs 1-3-2 psoriasis sales kit — Dr. JRK\'s proprietary Siddha formulation.',
    weights: [{ value: 1, unit: 'kit', price: 990, pack_label: '1 kit', variant_id: 'JRK-001' }],
    sourceImage: `${SHOP_CDN}/132_kit__JRK.png`
  },
  {
    name: 'JRKS Aipro Tablets',
    description: 'JRKS Aipro tablets — phyto-active support for inflammation and psoriasis.',
    weights: [{ value: 60, unit: 'tablets', price: 696, pack_label: '60 tablets', variant_id: 'JRK-002' }],
    sourceImage: `${SHOP_CDN}/AiProtablets1.png`
  },
  {
    name: 'Astocalm Plus Tablets',
    description: 'Astocalm Plus tablets — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 60, unit: 'tablets', price: 414, pack_label: '60 tablets', variant_id: 'JRK-003' }],
    sourceImage: `${SHOP_CDN}/Astocalm_tablets_1000_X_1000_White_bg.png`
  },
  {
    name: 'Akshun Lotion For Pain Relief',
    description: 'Akshun lotion for pain relief — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 100, unit: 'ml', price: 210, pack_label: '100 ml', variant_id: 'JRK-004' }],
    sourceImage: `${SHOP_CDN}/AKshun_Banners_1.jpg`
  },
  {
    name: 'Anagen Grow',
    description: 'Anagen Grow — Dr. JRK\'s hair vitalizer formulation.',
    weights: [{ value: 100, unit: 'ml', price: 255, pack_label: '100 ml', variant_id: 'JRK-005' }],
    sourceImage: `${SHOP_CDN}/Anagen_grow_JRK_Images_1.png`
  },
  {
    name: 'Bekay Tablets',
    description: 'Bekay tablets — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 60, unit: 'tablets', price: 504, pack_label: '60 tablets', variant_id: 'JRK-006' }],
    sourceImage: `${SHOP_CDN}/Bekaytablets1.png`
  },
  {
    name: 'Caratol E Tablets',
    description: 'Caratol E tablets — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 60, unit: 'tablets', price: 696, pack_label: '60 tablets', variant_id: 'JRK-007' }],
    sourceImage: `${SHOP_CDN}/Caratol-etablets1.png`
  },
  {
    name: 'JRKS Dano Active AD Oil',
    description: 'JRKS Dano Active AD oil — anti-dandruff hair oil.',
    weights: [{ value: 100, unit: 'ml', price: 280, pack_label: '100 ml', variant_id: 'JRK-008' }],
    sourceImage: `${SHOP_CDN}/DanoActiveADoil1.png`
  },
  {
    name: 'JRKS D-Co-D Tablets',
    description: 'JRKS D-Co-D tablets — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 60, unit: 'tablets', price: 444, pack_label: '60 tablets', variant_id: 'JRK-009' }],
    sourceImage: `${SHOP_CDN}/D-CO-DTablets.jpg`
  },
  {
    name: 'Dolowhite Emulsion',
    description: 'Dolowhite emulsion — Dr. JRK\'s proprietary formulation.',
    weights: [
      { value: 50, unit: 'ml', price: 180, pack_label: '50 ml', variant_id: 'JRK-011' },
      { value: 100, unit: 'ml', price: 300, pack_label: '100 ml', variant_id: 'JRK-010' }
    ],
    sourceImage: `${SHOP_CDN}/DoloWhite_Banner_1.png`
  },
  {
    name: 'Dr. JRKS 777 Oil',
    description: 'Dr. JRKS 777 oil — Wrightia tinctoria oil for psoriasis care.',
    weights: [
      { value: 100, unit: 'ml', price: 300, pack_label: '100 ml', variant_id: 'JRK-012' },
      { value: 200, unit: 'ml', price: 525, pack_label: '200 ml', variant_id: 'JRK-014' },
      { value: 500, unit: 'ml', price: 1285, pack_label: '500 ml', variant_id: 'JRK-015' },
      { value: 1000, unit: 'ml', price: 2490, pack_label: '1000 ml', variant_id: 'JRK-013' }
    ],
    sourceImage: `${SHOP_CDN}/777_oil_1_17c65674-1253-410a-ae3d-042f6ae305b3.png`
  },
  {
    name: 'JRKS Evefresh Skinbrite Cream',
    description: 'JRKS Evefresh Skinbrite cream — Dr. JRK\'s skin-care cream.',
    weights: [{ value: 25, unit: 'g', price: 175, pack_label: '25 g', variant_id: 'JRK-016' }],
    sourceImage: `${SHOP_CDN}/EvefreshSkinbrite1.png`
  },
  {
    name: 'Hista Block Tablets',
    description: 'Hista Block tablets — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 60, unit: 'tablets', price: 696, pack_label: '60 tablets', variant_id: 'JRK-017' }],
    sourceImage: `${SHOP_CDN}/HistablockTabletBanner_1.png`
  },
  {
    name: 'JRKS Acnefite',
    description: 'JRKS Acnefite — Dr. JRK\'s acne-care cream.',
    weights: [{ value: 25, unit: 'g', price: 180, pack_label: '25 g', variant_id: 'JRK-018' }],
    sourceImage: `${SHOP_CDN}/acnefite.jpg`
  },
  {
    name: 'JRKS AF Anti Fungal Cream',
    description: 'JRKS AF anti-fungal cream — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 25, unit: 'g', price: 165, pack_label: '25 g', variant_id: 'JRK-019' }],
    sourceImage: `${SHOP_CDN}/JRK_sAF-Antifungalcream_Banners_1.png`
  },
  {
    name: 'JRKS Anti Coff',
    description: 'JRKS Anti Coff — herbal cough syrup.',
    weights: [{ value: 100, unit: 'ml', price: 135, pack_label: '100 ml', variant_id: 'JRK-020' }],
    sourceImage: `${SHOP_CDN}/Anicoff_Banner_1.png`
  },
  {
    name: 'JRKS Heal Fast Gel',
    description: 'JRKS Heal Fast gel — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 25, unit: 'g', price: 160, pack_label: '25 g', variant_id: 'JRK-021' }],
    sourceImage: `${SHOP_CDN}/8Artboard4.png`
  },
  {
    name: 'JRKS Immuno BS Herbal Tonic',
    description: 'JRKS Immuno BS herbal tonic — Dr. JRK\'s immunity tonic.',
    weights: [
      { value: 100, unit: 'ml', price: 140, pack_label: '100 ml', variant_id: 'JRK-022' },
      { value: 200, unit: 'ml', price: 240, pack_label: '200 ml', variant_id: 'JRK-023' }
    ],
    sourceImage: `${SHOP_CDN}/ImminoBs_Banner_1.png`
  },
  {
    name: 'JRKS Kesh Raksha Hair Vitalizer Oil',
    description: 'JRKS Kesh Raksha hair vitalizer oil — Dr. JRK\'s hair-care oil.',
    weights: [{ value: 100, unit: 'ml', price: 270, pack_label: '100 ml', variant_id: 'JRK-024' }],
    sourceImage: `${SHOP_CDN}/KeshRakshaHVoil1.png`
  },
  {
    name: 'Lippu Oil',
    description: 'Lippu oil — herbal oil for dry skin and itching.',
    weights: [
      { value: 50, unit: 'ml', price: 155, pack_label: '50 ml', variant_id: 'JRK-026' },
      { value: 100, unit: 'ml', price: 285, pack_label: '100 ml', variant_id: 'JRK-025' }
    ],
    sourceImage: `${SHOP_CDN}/Banner_1.png`
  },
  {
    name: 'Lippu Ointment',
    description: 'Lippu ointment — herbal ointment for dry skin and itching.',
    weights: [
      { value: 35, unit: 'g', price: 160, pack_label: '35 g', variant_id: 'JRK-027' },
      { value: 75, unit: 'g', price: 275, pack_label: '75 g', variant_id: 'JRK-028' }
    ],
    sourceImage: `${SHOP_CDN}/Banner_1_e1143413-0ec0-4cae-9a7f-f40eddb55522.png`
  },
  {
    name: 'JRKS Lumina AD Herbal Shampoo',
    description: 'JRKS Lumina AD herbal shampoo — scalp-care shampoo.',
    weights: [{ value: 100, unit: 'ml', price: 265, pack_label: '100 ml', variant_id: 'JRK-029' }],
    sourceImage: `${SHOP_CDN}/Artboard1.png`
  },
  {
    name: 'Psorolin B Ointment',
    description: 'Psorolin B ointment — for inflammation associated with psoriasis.',
    weights: [
      { value: 35, unit: 'g', price: 180, pack_label: '35 g', variant_id: 'JRK-030' },
      { value: 75, unit: 'g', price: 325, pack_label: '75 g', variant_id: 'JRK-031' }
    ],
    sourceImage: `${SHOP_CDN}/PsorolinBointment1.png`
  },
  {
    name: 'JRKS Psorolin Derma Skin Care Soap',
    description: 'JRKS Psorolin Derma skin-care soap — psoriasis-care bathing bar.',
    weights: [{ value: 75, unit: 'g', price: 120, pack_label: '75 g', variant_id: 'JRK-032' }],
    sourceImage: `${SHOP_CDN}/PDSS1.png`
  },
  {
    name: 'Psorolin Oil',
    description: 'Psorolin oil — Wrightia tinctoria blend for psoriasis scaling.',
    weights: [
      { value: 100, unit: 'ml', price: 235, pack_label: '100 ml', variant_id: 'JRK-033' },
      { value: 200, unit: 'ml', price: 420, pack_label: '200 ml', variant_id: 'JRK-034' }
    ],
    sourceImage: `${SHOP_CDN}/Psorolinoil1.png`
  },
  {
    name: 'JRKS Immdis Immunity Drops',
    description: 'JRKS Immdis immunity drops — Dr. JRK\'s proprietary formulation.',
    weights: [{ value: 30, unit: 'ml', price: 285, pack_label: '30 ml', variant_id: 'JRK-035' }],
    sourceImage: `${SHOP_CDN}/ImmDis1.png`
  },
  {
    name: 'Tolenorm Oil',
    description: 'Tolenorm oil — herbal oil for hypopigmentation care.',
    weights: [
      { value: 50, unit: 'ml', price: 230, pack_label: '50 ml', variant_id: 'JRK-037' },
      { value: 100, unit: 'ml', price: 350, pack_label: '100 ml', variant_id: 'JRK-036' }
    ],
    sourceImage: `${SHOP_CDN}/Tolenormoil1.png`
  },
  {
    name: 'Tolenorm Ointment',
    description: 'Tolenorm ointment — herbal ointment for hypopigmentation care.',
    weights: [
      { value: 35, unit: 'g', price: 240, pack_label: '35 g', variant_id: 'JRK-038' },
      { value: 75, unit: 'g', price: 350, pack_label: '75 g', variant_id: 'JRK-039' }
    ],
    sourceImage: `${SHOP_CDN}/Toleormointment1.png`
  },
  {
    name: 'JRKS Ferro Bekay Tonic',
    description: 'JRKS Ferro Bekay tonic — Dr. JRK\'s proprietary herbal tonic.',
    weights: [{ value: 200, unit: 'ml', price: 170, pack_label: '200 ml', variant_id: 'JRK-040' }],
    sourceImage: `${SHOP_CDN}/Ferro_beaky_tonic_website_images_1.png`
  },
  {
    name: 'Akshun Ultra Gel',
    description: 'Akshun Ultra gel — Dr. JRK\'s pain-relief gel.',
    weights: [{ value: 25, unit: 'g', price: 130, pack_label: '25 g', variant_id: 'JRK-041' }],
    sourceImage: `${SHOP_CDN}/Akshunultragel2.png`
  },
  {
    name: 'JRKS Psorolin Derma Skin Care Soap 2 In 1 Pack',
    description: 'JRKS Psorolin Derma skin-care soap 2-in-1 kit pack.',
    weights: [{ value: 1, unit: 'kit', price: 200, pack_label: '2 in 1 kit', variant_id: 'JRK-042' }],
    sourceImage: `${SHOP_CDN}/PDSS1.png`
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
            reject(new Error(`too small (${body.length} bytes)`));
            return;
          }
          fs.writeFileSync(destPath, body);
          resolve(body.length);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('timeout')));
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
  const id = stableId(BRAND, product.name);
  const hasLocal = fs.existsSync(path.join(IMAGE_DIR, `${id}.jpg`));
  const imageFile = uploaded || hasLocal ? `${id}.jpg` : '';
  const category = classifyStoreProduct({
    name: product.name,
    description: product.description,
    category: 'Ayurvedic Medicines'
  });
  const med = {
    _id: id,
    name: product.name,
    imageFile,
    description: product.description,
    category,
    brand: BRAND,
    company: BRAND,
    weights: product.weights.map((weight) => ({
      value: weight.value,
      unit: weight.unit,
      price: weight.price,
      pack_label: weight.pack_label,
      variant_id: weight.variant_id
    }))
  };
  if (uploaded?.secure_url) {
    med.imageUrl = uploaded.secure_url;
    med.cloudinaryOnly = true;
  } else if (product.sourceImage) {
    med.imageUrl = cloudinaryFetchUrl(product.sourceImage);
    med.cloudinaryOnly = true;
  }
  return med;
}

function upsertStore(catalog, store) {
  const existingIndex = catalog.findIndex(
    (entry) =>
      entry &&
      (entry._id === STORE_ID ||
        /dr\.?\s*jrk/i.test(String(entry.name || '')) ||
        String(entry.name || '').toLowerCase() === BRAND.toLowerCase())
  );
  if (existingIndex >= 0) {
    catalog[existingIndex] = store;
    return 'Updated';
  }
  const insertAt = catalog.findIndex(
    (entry) =>
      entry &&
      Array.isArray(entry.medicines) &&
      String(entry.name || '').localeCompare(store.name, 'en', { sensitivity: 'base' }) > 0
  );
  if (insertAt === -1) catalog.push(store);
  else catalog.splice(insertAt, 0, store);
  return 'Added';
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Missing catalog at', CATALOG_PATH);
    process.exit(1);
  }

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const cloudinary = initCloudinary();
  if (!cloudinary && !DRY_RUN) {
    console.warn('Missing CLOUDINARY_* in .env — using Cloudinary fetch URLs instead of uploaded assets');
  }

  const uploadResults = new Map();

  for (const product of PRODUCTS) {
    const id = stableId(BRAND, product.name);
    const localPath = path.join(IMAGE_DIR, `${id}.jpg`);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).size < 2500) {
      if (DRY_RUN) {
        console.log(`  would download ${product.name}`);
      } else {
        try {
          const bytes = await downloadFile(product.sourceImage, localPath);
          console.log(`  downloaded ${product.name} (${bytes} bytes)`);
        } catch (err) {
          console.warn(`  download failed ${product.name}: ${err.message}`);
        }
      }
    } else {
      console.log(`  reuse local ${id}.jpg`);
    }

    if (DRY_RUN || !cloudinary || !fs.existsSync(localPath)) continue;

    try {
      const result = await uploadImage(cloudinary, localPath, `${CLOUD_FOLDER}/${id}`);
      uploadResults.set(product.name, result);
      console.log(`  uploaded ${product.name} -> ${result.secure_url}`);
      await sleep(300);
    } catch (err) {
      console.error(`  upload failed ${product.name}: ${err.message}`);
    }
  }

  const medicines = PRODUCTS.map((product) =>
    buildMedicine(product, uploadResults.get(product.name))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const store = {
    _id: STORE_ID,
    name: BRAND,
    logo: 'https://res.cloudinary.com/hra1hmsw/image/upload/v1785755638/dheergayush/logos/logo-horizontal.png',
    description:
      "Dr. JRK's Research and Pharmaceuticals — proprietary Siddha and Ayurvedic formulations (Pioneer chemist price list, May 2026).",
    medicines
  };

  if (DRY_RUN) {
    console.log('Dry run — catalog not written');
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  if (!Array.isArray(catalog)) throw new Error('Catalog root is not an array');
  const action = upsertStore(catalog, store);

  const tmp = `${CATALOG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CATALOG_PATH);

  const packs = medicines.reduce((sum, med) => sum + med.weights.length, 0);
  const withImages = medicines.filter((med) => med.imageUrl).length;
  console.log(`${action} ${BRAND}: ${medicines.length} products, ${packs} packs, ${withImages} with Cloudinary images`);
  console.log('Wrote', CATALOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

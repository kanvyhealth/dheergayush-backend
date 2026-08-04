'use strict';

/**
 * Sync Soorya Naturals store: merge product packs, map local images,
 * upload to Cloudinary, update medicine-catalog.json.
 *
 * Usage: node scripts/syncSooryaNaturals.js
 *        node scripts/syncSooryaNaturals.js --dry-run
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'sooryaherbals');
const STORE_ID = 'soorya-naturals';
const BRAND = 'Soorya Naturals';
const CLOUD_FOLDER = 'dheergayush/medicines';
const DRY_RUN = process.argv.includes('--dry-run');

/** Product name -> local image filename in medicine/sooryaherbals */
const IMAGE_BY_NAME = {
  'Dasadinusulu': 'nallajeelakarramixedchoornam.jpg',
  'Triple Seeds': 'tripleseeds.jpg',
  '5 Mix Seeds': '5mixseeds.jpg',
  'Double Seeds': 'doubleseeds.jpg',
  'Flax Seeds': 'flaxseeds.jpg',
  'Pro Beans': 'beans.jpg',
  'Nutri Nuts': 'nutrinuts.jpg',
  'Mexican Bites': 'mexicanbites.jpg',
  'Millet Mixture (Puff)': 'milletmixture.jpg',
  'Bajra Mix': 'roastedbajra.jpg',
  'Quinoa Flakes Mix': 'quinoaflakesmix.jpg',
  'Barley Seeds': 'barleyseeds.jpg',
  'Chia Seeds': 'chiaseeds.jpg',
  'Fennel': 'fennel.jpg',
  'Basil Seeds': 'basilseeds.jpg',
  'Palm Sugar': 'plamsugar.jpg',
  'Bitter Cumin Seeds': 'kalonji.jpg',
  'Katora': 'katora.jpg',
  'Alfalfa Seeds': 'alfalfaseeds.jpg',
  'Black Cumin Seeds': 'blackcuminseeds.jpg',
  'Amla Candy': 'amlacandy.jpg',
  'Amla Salted': 'amlasalted.jpg',
  'Nirmali Seeds': 'nirmaliseeds.jpg'
};

const SUBCATEGORY_BY_NAME = {
  'Dasadinusulu': 'Nuts and Dry Fruits',
  'Triple Seeds': 'Nuts and Dry Fruits',
  '5 Mix Seeds': 'Nuts and Dry Fruits',
  'Double Seeds': 'Nuts and Dry Fruits',
  'Flax Seeds': 'Nuts and Dry Fruits',
  'Pumpkin Seeds': 'Nuts and Dry Fruits',
  'Pro Beans': 'Pulses',
  'Nutri Nuts': 'Nuts and Dry Fruits',
  'Mexican Bites': 'Packaged Foods',
  'Millet Mixture (Puff)': 'Millets',
  'Bajra Mix': 'Millets',
  'Quinoa Flakes Mix': 'Packaged Foods',
  'Barley Seeds': 'Nuts and Dry Fruits',
  'Mahaabeera Seeds': 'Nuts and Dry Fruits',
  'Chia Seeds': 'Nuts and Dry Fruits',
  'Fennel': 'Spices',
  'Basil Seeds': 'Nuts and Dry Fruits',
  'Palm Sugar': 'Sweeteners',
  'Seema Karakaya': 'Nuts and Dry Fruits',
  'Bitter Cumin Seeds': 'Spices',
  'Katora': 'Nuts and Dry Fruits',
  'Sky Fruite': 'Nuts and Dry Fruits',
  'Alfalfa Seeds': 'Nuts and Dry Fruits',
  'Niranjan Phal': 'Nuts and Dry Fruits',
  'Palm Jaggery': 'Sweeteners',
  'Hemp Seeds': 'Nuts and Dry Fruits',
  'Rosemary Leaves': 'Herbs',
  'Shilajit': 'Supplements',
  'Black Cumin Seeds': 'Spices',
  'Amla Candy': 'Packaged Foods',
  'Amla Salted': 'Packaged Foods',
  'Nirmali Seeds': 'Nuts and Dry Fruits'
};

/** Merged products from brand price list (pack sizes grouped by name). */
const PRODUCTS = [
  { name: 'Dasadinusulu', weights: [[200, 'g', 120], [1000, 'g', 468]] },
  { name: 'Triple Seeds', weights: [[250, 'g', 189]] },
  { name: '5 Mix Seeds', weights: [[250, 'g', 175]] },
  { name: 'Double Seeds', weights: [[250, 'g', 105]] },
  { name: 'Flax Seeds', weights: [[250, 'g', 85]] },
  { name: 'Pumpkin Seeds', weights: [[250, 'g', 190]] },
  { name: 'Pro Beans', weights: [[250, 'g', 150]] },
  { name: 'Nutri Nuts', weights: [[250, 'g', 150]] },
  { name: 'Mexican Bites', weights: [[250, 'g', 150]] },
  { name: 'Millet Mixture (Puff)', weights: [[250, 'g', 100]] },
  { name: 'Bajra Mix', weights: [[200, 'g', 84]] },
  { name: 'Quinoa Flakes Mix', weights: [[200, 'g', 150]] },
  { name: 'Barley Seeds', weights: [[200, 'g', 20]] },
  { name: 'Mahaabeera Seeds', weights: [[100, 'g', 40], [250, 'g', 90]] },
  { name: 'Chia Seeds', weights: [[100, 'g', 60], [300, 'g', 126]] },
  { name: 'Fennel', weights: [[100, 'g', 35]] },
  { name: 'Basil Seeds', weights: [[100, 'g', 42]] },
  { name: 'Palm Sugar', weights: [[100, 'g', 28]] },
  { name: 'Seema Karakaya', weights: [[100, 'g', 60]] },
  { name: 'Bitter Cumin Seeds', weights: [[50, 'g', 35]] },
  { name: 'Katora', weights: [[100, 'g', 60]] },
  { name: 'Sky Fruite', weights: [[60, 'Seeds', 80]] },
  { name: 'Alfalfa Seeds', weights: [[100, 'g', 84]] },
  { name: 'Niranjan Phal', weights: [[60, 'g', 180]] },
  { name: 'Palm Jaggery', weights: [[1000, 'g', 390]] },
  { name: 'Hemp Seeds', weights: [[100, 'g', 72]] },
  { name: 'Rosemary Leaves', weights: [[100, 'g', 90]] },
  { name: 'Shilajit', weights: [[20, 'g', 630]] },
  { name: 'Black Cumin Seeds', weights: [[50, 'g', 28], [100, 'g', 49]] },
  { name: 'Amla Candy', weights: [[100, 'g', 56]] },
  { name: 'Amla Salted', weights: [[100, 'g', 65]] },
  { name: 'Nirmali Seeds', weights: [[100, 'g', 49]] }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugId(name, index) {
  return `sn-${String(index + 1).padStart(4, '0')}`;
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

function buildMedicines(cloudinary, uploadResults) {
  return PRODUCTS.map((product, index) => {
    const id = slugId(product.name, index);
    const imageName = IMAGE_BY_NAME[product.name];
    const localImage = imageName ? path.join(IMAGE_DIR, imageName) : null;
    const hasLocal = localImage && fs.existsSync(localImage);
    const imageFile = hasLocal ? `${id}.jpg` : '';
    const uploaded = uploadResults.get(id);

    const med = {
      _id: id,
      name: product.name,
      imageFile,
      description: `${product.name} - Ayurvedic Medicine Formulae`,
      category: 'Organic Foods',
      brand: BRAND,
      company: BRAND,
      weights: product.weights.map(([value, unit, price]) => ({
        value,
        unit,
        price,
        pack_label: unit === 'Seeds' ? `${value} ${unit}` : `${value}${unit}`,
        variant_id: ''
      })),
      subCategory: SUBCATEGORY_BY_NAME[product.name] || 'Packaged Foods'
    };

    if (uploaded?.secure_url) {
      med.imageUrl = uploaded.secure_url;
      med.cloudinaryOnly = true;
    }

    return med;
  });
}

async function main() {
  const cloudinary = initCloudinary();
  if (!cloudinary && !DRY_RUN) {
    console.error('Missing CLOUDINARY_* in .env');
    process.exit(1);
  }

  const uploadResults = new Map();
  const toUpload = PRODUCTS.map((product, index) => ({
    id: slugId(product.name, index),
    name: product.name,
    imageName: IMAGE_BY_NAME[product.name]
  })).filter((p) => p.imageName && fs.existsSync(path.join(IMAGE_DIR, p.imageName)));

  console.log(`Soorya: ${PRODUCTS.length} products, ${toUpload.length} images to upload`);

  for (const item of toUpload) {
    const localPath = path.join(IMAGE_DIR, item.imageName);
    const imageFile = `${item.id}.jpg`;
    const publicId = `${CLOUD_FOLDER}/${item.id}`;

    if (DRY_RUN) {
      console.log(`  would upload ${item.name} <- ${item.imageName} -> ${publicId}`);
      continue;
    }

    try {
      const result = await uploadImage(cloudinary, localPath, publicId);
      uploadResults.set(item.id, result);
      console.log(`  uploaded ${item.name} -> ${result.secure_url}`);
      await sleep(300);
    } catch (err) {
      console.error(`  failed ${item.name}:`, err.message);
    }
  }

  const medicines = buildMedicines(cloudinary, uploadResults);
  const store = {
    _id: STORE_ID,
    name: BRAND,
    logo: '/logos/logo-horizontal.png',
    description: 'Soorya Naturals — Healthy food products.',
    medicines
  };

  if (DRY_RUN) {
    console.log('Dry run — catalog not written');
    console.log(JSON.stringify(medicines.slice(0, 2), null, 2));
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const idx = catalog.findIndex(
    (entry) => entry && (entry._id === STORE_ID || String(entry.name || '').toLowerCase() === BRAND.toLowerCase())
  );
  if (idx >= 0) catalog[idx] = store;
  else catalog.push(store);

  const tmp = `${CATALOG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CATALOG_PATH);

  const withImages = medicines.filter((m) => m.imageUrl).length;
  console.log(`Updated ${BRAND}: ${medicines.length} products, ${withImages} with Cloudinary images`);
  console.log('Wrote', CATALOG_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

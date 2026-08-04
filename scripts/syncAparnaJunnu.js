'use strict';

/**
 * Add/update Aparna Junnu store in medicine-catalog.json.
 * Upload product images to Cloudinary.
 *
 * Usage: node scripts/syncAparnaJunnu.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine');
const STORE_ID = 'aparna-junnu';
const BRAND = 'Aparna Junnu';
const CLOUD_FOLDER = 'dheergayush/medicines';

const PRODUCTS = [
  {
    _id: 'JN-P-ORI210',
    name: "Aparna's Junnu Powder - Original",
    variant_id: 'JN-P-ORI210',
    price: 213,
    image: 'original.jpg'
  },
  {
    _id: 'JN-P-VAN210',
    name: "Aparna's Junnu Powder - Madagascar Vanilla",
    variant_id: 'JN-P-VAN210',
    price: 226,
    image: 'Madagascarvanila.jpg'
  },
  {
    _id: 'JN-P-STR210',
    name: "Aparna's Junnu Powder - Alpine Strawberry",
    variant_id: 'JN-P-STR210',
    price: 249,
    image: null
  },
  {
    _id: 'JN-P-PIS210',
    name: "Aparna's Junnu Powder - Pista Bliss",
    variant_id: 'JN-P-PIS210',
    price: 240,
    image: 'pistabliss.jpg'
  },
  {
    _id: 'JN-P-BAD210',
    name: "Aparna's Junnu Powder - Badam Royale",
    variant_id: 'JN-P-BAD210',
    price: 264,
    image: 'badamroyale.jpg'
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildMedicine(product, uploadResult) {
  const hasImage = !!product.image;
  const ext = hasImage ? path.extname(product.image).toLowerCase() || '.jpg' : '';
  const imageFile = hasImage ? `${product._id}${ext === '.png' ? '.png' : '.jpg'}` : '';

  const med = {
    _id: product._id,
    name: product.name,
    imageFile,
    description: `${product.name} - Ayurvedic Medicine Formulae`,
    category: 'Dairy Products',
    brand: BRAND,
    company: BRAND,
    weights: [
      {
        value: 210,
        unit: 'g',
        price: product.price,
        pack_label: '210g',
        variant_id: product.variant_id
      }
    ],
    subCategory: 'Health Supplements'
  };

  if (uploadResult?.secure_url) {
    med.imageUrl = uploadResult.secure_url;
    med.cloudinaryOnly = true;
  }

  return med;
}

async function main() {
  const cloudinary = initCloudinary();
  if (!cloudinary) {
    console.error('Missing CLOUDINARY_* in .env');
    process.exit(1);
  }

  const uploadResults = new Map();

  for (const product of PRODUCTS) {
    if (!product.image) {
      console.log(`  skip upload (no image): ${product.name}`);
      continue;
    }

    const localPath = path.join(IMAGE_DIR, product.image);
    if (!fs.existsSync(localPath)) {
      console.warn(`  missing file: ${localPath}`);
      continue;
    }

    const publicId = `${CLOUD_FOLDER}/${product._id}`;
    try {
      const result = await uploadImage(cloudinary, localPath, publicId);
      uploadResults.set(product._id, result);
      console.log(`  uploaded ${product.name} -> ${result.secure_url}`);
      await sleep(300);
    } catch (err) {
      console.error(`  failed ${product.name}:`, err.message);
    }
  }

  const medicines = PRODUCTS.map((p) => buildMedicine(p, uploadResults.get(p._id)));
  const store = {
    _id: STORE_ID,
    name: BRAND,
    logo: '/logos/logo-horizontal.png',
    description: "Aparna's Junnu — traditional colostrum milk pudding mix.",
    medicines
  };

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

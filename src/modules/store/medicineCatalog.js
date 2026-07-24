const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEDICINE_DIR = path.join(__dirname, '..', 'medicine', 'medicine');
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

const STORE_META = {
  name: 'DHEERGAYUSH Classical Pharmacy',
  logo: '/logos/logo-horizontal.png',
  description:
    'Curated classical arishtas, asavas, and arks — authentic Ayurvedic formulations with verified product imagery.'
};

function displayNameFromFile(filename) {
  let base = filename.replace(/\.[^.]+$/i, '');
  base = base.replace(/-Main$/i, '');
  base = base.replace(/-/g, ' ');
  return base
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .replace(/\bKa\b/g, 'ka');
}

function productTypeLabel(nameLower) {
  if (nameLower.includes('arishta')) return 'Classical fermented Ayurvedic arishta';
  if (nameLower.includes('asava') || nameLower.includes('asav')) return 'Traditional asava formulation';
  if (nameLower.includes('ark')) return 'Herbal aqueous extract (ark)';
  if (nameLower.includes('jirak') || nameLower.includes('jeerak')) return 'Digestive arishta with cumin base';
  return 'Authentic Ayurvedic classical preparation';
}

function defaultWeights(nameLower) {
  if (nameLower.includes('ark')) {
    return [
      { value: 100, unit: 'ml', price: 95 },
      { value: 200, unit: 'ml', price: 165 },
      { value: 450, unit: 'ml', price: 320 }
    ];
  }
  return [
    { value: 200, unit: 'ml', price: 185 },
    { value: 450, unit: 'ml', price: 345 },
    { value: 680, unit: 'ml', price: 495 }
  ];
}

function hashPrice(filename, index) {
  let h = 0;
  const s = filename + String(index);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return 150 + (Math.abs(h) % 200);
}

function stableMedicineId(imageFile) {
  return crypto.createHash('md5').update(imageFile).digest('hex').slice(0, 24);
}

function stableStoreId() {
  return crypto.createHash('md5').update(STORE_META.name).digest('hex').slice(0, 24);
}

function listMedicineImageFiles(dir = MEDICINE_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function buildMedicinesFromFolder(dir = MEDICINE_DIR) {
  const files = listMedicineImageFiles(dir);
  if (!files.length) {
    throw new Error('No image files found in: ' + dir);
  }

  return files.map((imageFile) => {
    const name = displayNameFromFile(imageFile);
    const nameLower = name.toLowerCase();
    const weights = defaultWeights(nameLower).map((w, i) => ({
      ...w,
      price: hashPrice(imageFile, i)
    }));

    return {
      _id: stableMedicineId(imageFile),
      name,
      imageFile,
      description: `${productTypeLabel(nameLower)} — physician-trusted classical formula. Pack sizes for home use.`,
      category: 'Ayurvedic Medicines',
      weights
    };
  });
}

function buildStoreFromMedicineImages(dir = MEDICINE_DIR) {
  return {
    _id: stableStoreId(),
    ...STORE_META,
    medicines: buildMedicinesFromFolder(dir)
  };
}

module.exports = {
  MEDICINE_DIR,
  STORE_META,
  listMedicineImageFiles,
  buildMedicinesFromFolder,
  buildStoreFromMedicineImages
};

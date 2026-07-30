'use strict';

/**
 * Adds (or refreshes) the Soorya Naturals store in public/data/medicine-catalog.json.
 * Safe to re-run: the existing soorya-naturals entry is replaced, never duplicated.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog.json');

const STORE_ID = 'soorya-naturals';
const BRAND = 'Soorya Naturals';

const PRODUCTS = [
  { id: 'sn-0001', name: 'Dasadinusulu', subCategory: 'Nuts and Dry Fruits', weights: [[200, 179], [1000, 720]] },
  { id: 'sn-0002', name: 'Triple Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[250, 270]] },
  { id: 'sn-0003', name: '5 Mix Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[250, 250]] },
  { id: 'sn-0004', name: 'Double Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[250, 150]] },
  { id: 'sn-0005', name: 'Flax Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[250, 130]] },
  { id: 'sn-0006', name: 'Pumpkin Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[250, 270]] },
  { id: 'sn-0007', name: 'Pro Beans', subCategory: 'Pulses', weights: [[250, 250]] },
  { id: 'sn-0008', name: 'Nutri Nuts', subCategory: 'Nuts and Dry Fruits', weights: [[250, 250]] },
  { id: 'sn-0009', name: 'Mexican Bites', subCategory: 'Packaged Foods', weights: [[250, 250]] },
  { id: 'sn-0010', name: 'Millet Mixture (Puff)', subCategory: 'Millets', weights: [[250, 150]] },
  { id: 'sn-0011', name: 'Bajra Mix', subCategory: 'Millets', weights: [[200, 120]] },
  { id: 'sn-0012', name: 'Quinoa Flakes Mix', subCategory: 'Packaged Foods', weights: [[200, 250]] },
  { id: 'sn-0014', name: 'Barley Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[200, 30]] },
  { id: 'sn-0015', name: 'Mahaabeera Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[100, 70], [250, 150]] },
  { id: 'sn-0017', name: 'Chia Seeds', subCategory: 'Nuts and Dry Fruits', weights: [[100, 100]] }
];

function buildStore() {
  return {
    _id: STORE_ID,
    name: BRAND,
    logo: '/logos/logo-horizontal.png',
    description: 'Soorya Naturals — Healthy food products.',
    medicines: PRODUCTS.map((product) => ({
      _id: product.id,
      name: product.name,
      imageFile: '',
      description: '',
      category: 'Organic Foods',
      brand: BRAND,
      company: BRAND,
      weights: product.weights.map(([value, price]) => ({
        value,
        unit: 'g',
        price,
        pack_label: `${product.name} ${value}g`,
        variant_id: ''
      })),
      subCategory: product.subCategory
    }))
  };
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  if (!Array.isArray(catalog)) throw new Error('Catalog root is not an array');

  const store = buildStore();
  const existingIndex = catalog.findIndex(
    (entry) => entry && (entry._id === STORE_ID || String(entry.name || '').toLowerCase() === BRAND.toLowerCase())
  );

  if (existingIndex >= 0) {
    catalog[existingIndex] = store;
  } else {
    const insertAt = catalog.findIndex(
      (entry) => entry && Array.isArray(entry.medicines)
        && String(entry.name || '').localeCompare(store.name, 'en', { sensitivity: 'base' }) > 0
    );
    if (insertAt === -1) catalog.push(store);
    else catalog.splice(insertAt, 0, store);
  }

  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const packs = store.medicines.reduce((sum, med) => sum + med.weights.length, 0);
  console.log(`${existingIndex >= 0 ? 'Updated' : 'Added'} ${BRAND}: ${store.medicines.length} products, ${packs} packs`);
}

main();

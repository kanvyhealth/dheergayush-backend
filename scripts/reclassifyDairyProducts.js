'use strict';

/**
 * Reclassify milk/dairy products in medicine-catalog.json to category "Dairy Products".
 * Usage: node scripts/reclassifyDairyProducts.js
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog.json');
const CATEGORY = 'Dairy Products';

const EXCLUDE_NAME = [
  /milk thistle/i,
  /cleansing milk/i,
  /milk masala/i,
  /goat milk soap/i,
  /ghritam|ghritham/i,
  /gheesutr/i,
  /ghee lip|lip butter/i,
  /ghee body|body butter|kumkumadi body butter/i,
  /ghee cleansing|cleansing balm/i,
  /ghee hand|hand and foot cream/i,
  /ghee face|face emulsion/i,
  /ghee nour|exfoliator/i,
  /baby bar|baby cream|baby lotion|baby wash|baby derma|cradle cap|rash relief|head to toe/i,
  /with pure cow ghee/i,
  /kitchen stars/i,
  /without milk|plant.?based milk|almond milk|soy milk|coconut milk|oat milk/i
];

function isDairyProduct(med) {
  const name = String(med.name || '');
  const desc = String(med.description || '');
  const text = `${name} ${desc}`;

  if (EXCLUDE_NAME.some((re) => re.test(text))) return false;

  if (/junnu/i.test(name)) return true;
  if (/\bpure ghee\b|\bcow'?s pure ghee\b|\bcow ghee\b|\ba2\b.*\bghee\b|\bdesi ghee\b|\borganic\b.*\bghee\b|\bbilona ghee\b|\bpremium ghee\b|\bmilk desi ghee\b|\bghee,\s*\d/i.test(name)) {
    return true;
  }
  if (/\bmilk\b/i.test(name)) return true;
  if (/\blassi\b|\bpaneer\b|\bcurd\b|\bdahi\b|\bbuttermilk\b|\bcheese\b|\bkhoya\b|\bmawa\b|\bmalai\b/i.test(name)) {
    return true;
  }

  return false;
}

function dairySubCategory(name) {
  const n = String(name || '').toLowerCase();
  if (/junnu/.test(n)) return 'Junnu';
  if (/ghee/.test(n)) return 'Ghee';
  if (/\bmilk\b/.test(n)) return 'Milk';
  if (/paneer|curd|dahi|lassi|buttermilk|cheese/.test(n)) return 'Curd and Paneer';
  return 'Other Dairy';
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  let updated = 0;
  const samples = [];

  for (const store of catalog) {
    for (const med of store.medicines || []) {
      if (!isDairyProduct(med)) continue;
      if (med.category !== CATEGORY) {
        med.category = CATEGORY;
        updated++;
        if (samples.length < 5) samples.push(med.name);
      }
      med.subCategory = dairySubCategory(med.name);
    }
  }

  const tmp = `${CATALOG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CATALOG_PATH);

  const total = catalog.flatMap((s) => s.medicines || []).filter(isDairyProduct).length;
  console.log(`Dairy Products: ${total} total, ${updated} category updated`);
  if (samples.length) console.log('Samples:', samples.join(', '));
}

module.exports = { isDairyProduct, dairySubCategory, CATEGORY };

if (require.main === module) main();

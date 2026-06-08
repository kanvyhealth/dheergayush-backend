/**
 * Download missing product images for a brand store.
 * Usage: node scripts/downloadBrandImages.js Dabur
 *        node scripts/downloadBrandImages.js Baidyanath
 */
const fs = require('fs');
const path = require('path');
const {
  CATALOG_PATH,
  IMAGE_DIR,
  resolveImageOnline,
  downloadImage,
} = require('./catalogBrandUtils');

const brand = process.argv[2];
const LIMIT = Number(process.env.LIMIT || 0);

if (!brand) {
  console.error('Usage: node scripts/downloadBrandImages.js <BrandName>');
  process.exit(1);
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const store = catalog.find((s) => new RegExp(brand, 'i').test(s.name || ''));
  if (!store) throw new Error(`Store not found: ${brand}`);

  const missing = (store.medicines || []).filter((m) => {
    const p = path.join(IMAGE_DIR, m.imageFile || '');
    return !m.imageFile || !fs.existsSync(p);
  });

  console.log(`${brand}: missing images ${missing.length}`);
  let done = 0;
  let ok = 0;

  for (const med of missing) {
    if (LIMIT > 0 && done >= LIMIT) break;
    done++;
    const dest = path.join(IMAGE_DIR, med.imageFile || `${med._id}.jpg`);
    process.stdout.write(`[${done}/${missing.length}] ${med.name} ... `);
    try {
      const url = await resolveImageOnline(brand, med.name);
      if (!url) {
        console.log('not found');
        continue;
      }
      await downloadImage(url, dest);
      ok++;
      console.log('ok');
      await new Promise((r) => setTimeout(r, 450));
    } catch (err) {
      console.log('fail', err.message);
    }
  }

  console.log(`Downloaded ${ok} / ${done} attempted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

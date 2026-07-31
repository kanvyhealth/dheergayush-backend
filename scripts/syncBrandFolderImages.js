/**
 * Match Pernati Naturals / Soorya Naturals catalog products to local brand
 * image folders, copy into medicine/medicine/{_id}{ext}, update imageFile.
 *
 * Usage:
 *   node scripts/syncBrandFolderImages.js --dry-run
 *   node scripts/syncBrandFolderImages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'medicine');
const UNMATCHED_PATH = path.join(ROOT, 'public', 'data', 'brand-image-match-unmatched.json');

const DRY_RUN = process.argv.includes('--dry-run');

const BRAND_SOURCES = [
  {
    storeName: 'Pernati Naturals',
    storeMatch: /pernati/i,
    sourceDir: path.join(ROOT, 'medicine', 'pernatiimages'),
    // Fallback when brand folder is emptied after copy into medicine/medicine
    fallbackDirs: [path.join(ROOT, 'medicine', 'medicine')],
    aliases: {
      'amchur powder': 'amchurpowder.jpg',
      'brown sugar candy': 'brownsugarcandy.jpg',
      'chilli powder': 'chillipowder.jpg',
      dhaniya: 'dhaniya.jpg',
      'dhaniya powder': 'dhaniyapowder.jpg',
      'dry chillies': 'drychillis.jpg',
      'dry chili': 'drychillis.jpg',
      'dry chillis': 'drychillis.jpg',
      'black salt': 'blacksalt.jpg',
      'himalayan pink powder': 'himalayapinkpowder.jpg',
      jaggery: 'jaggery.jpg',
      'jaggery cubes': 'jaggerycubes.jpg',
      'jaggery powder': 'jaggerypowder.jpg',
      mustard: 'mustard.jpg',
      'brown top millet': 'brown-top-millet-1.jpg',
      'foxtail millet': 'korralu-1.jpg',
      'little millet': 'saamalu-1.jpg',
      'organic chana dal': 'chickpeaswhite.jpg',
      'organic toor dal': 'toordal.jpg',
      'organic green gram': 'organicmoongdal.jpg',
      almonds: 'almond.jpg',
      'black raisins': 'kismis.jpg',
      'broken wheat ravva': 'broken-wheat-ravva.jpg',
    },
  },
  {
    storeName: 'Soorya Naturals',
    storeMatch: /soorya/i,
    sourceDir: path.join(ROOT, 'medicine', 'sooryaherbals'),
    fallbackDirs: [path.join(ROOT, 'medicine', 'medicine')],
    aliases: {
      'triple seeds': 'tripleseeds.jpg',
      '5 mix seeds': '5mixseeds.jpg',
      'double seeds': 'doubleseeds.jpg',
      'flax seeds': 'flaxseeds.jpg',
      'pro beans': 'beans.jpg',
      'nutri nuts': 'nutrinuts.jpg',
      'mexican bites': 'mexicanbites.jpg',
      'millet mixture (puff)': 'milletmixture.jpg',
      'millet mixture': 'milletmixture.jpg',
      'bajra mix': 'roastedbajra.jpg',
      'quinoa flakes mix': 'quinoaflakesmix.jpg',
      'barley seeds': 'barleyseeds.jpg',
      'chia seeds': 'chiaseeds.jpg',
      'pumpkin seeds': 'pumpkinseeds.jpg',
    },
  },
];

const MIN_IMAGE_BYTES = 2500;

function norm(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function listImageFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) return false;
    try {
      return fs.statSync(path.join(dir, f)).size >= MIN_IMAGE_BYTES;
    } catch (_) {
      return false;
    }
  });
}

function collectSourceFiles(brandCfg) {
  const dirs = [brandCfg.sourceDir, ...(brandCfg.fallbackDirs || [])].filter(Boolean);
  const byNorm = new Map();
  const entries = []; // { file, dir }
  for (const dir of dirs) {
    for (const file of listImageFiles(dir)) {
      const key = norm(file);
      if (byNorm.has(key)) continue; // prefer first dir (brand folder)
      byNorm.set(key, file);
      entries.push({ file, dir });
    }
  }
  return { files: entries.map((e) => e.file), fileIndex: byNorm, entries };
}

function resolveSourceFile(productName, aliases, fileIndex, files, entries) {
  const key = String(productName || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const locate = (fileName) => {
    const hitEntry =
      entries.find((e) => e.file.toLowerCase() === String(fileName).toLowerCase()) ||
      entries.find((e) => norm(e.file) === norm(fileName));
    if (hitEntry) return hitEntry;
    const name =
      files.find((f) => f.toLowerCase() === String(fileName).toLowerCase()) ||
      fileIndex.get(norm(fileName));
    if (!name) return null;
    return { file: name, dir: IMAGE_DIR };
  };

  if (aliases[key]) {
    const hit = locate(aliases[key]);
    if (hit) return { ...hit, how: 'alias' };
    return null;
  }

  const exactName = fileIndex.get(norm(productName));
  if (exactName) {
    const hit = locate(exactName);
    if (hit) return { ...hit, how: 'exact' };
  }

  return null;
}

function findStore(catalog, brandCfg) {
  return catalog.find(
    (s) =>
      s &&
      (brandCfg.storeMatch.test(String(s.name || '')) ||
        String(s.name || '').toLowerCase() === brandCfg.storeName.toLowerCase())
  );
}

function imageOnDisk(imageFile) {
  if (!imageFile) return false;
  const full = path.join(IMAGE_DIR, path.basename(imageFile));
  try {
    return fs.existsSync(full) && fs.statSync(full).size >= MIN_IMAGE_BYTES;
  } catch (_) {
    return false;
  }
}

function syncBrand(catalog, brandCfg) {
  const store = findStore(catalog, brandCfg);
  if (!store) {
    console.error(`Store not found: ${brandCfg.storeName}`);
    return { matched: 0, unmatched: [], skipped: 0 };
  }

  const { files, fileIndex, entries } = collectSourceFiles(brandCfg);
  if (!files.length) {
    console.error(`No images found for ${brandCfg.storeName} in source/fallback dirs`);
    return { matched: 0, unmatched: [], skipped: 0 };
  }

  const unmatched = [];
  let matched = 0;

  console.log(
    `\n=== ${store.name} (${(store.medicines || []).length} products, ${files.length} source files) ===`
  );

  for (const med of store.medicines || []) {
    const resolved = resolveSourceFile(med.name, brandCfg.aliases, fileIndex, files, entries);
    if (!resolved) {
      // Keep a working on-disk imageFile; clear broken Gemini/placeholder paths
      if (!imageOnDisk(med.imageFile)) {
        if (!DRY_RUN) med.imageFile = '';
      }
      unmatched.push({
        store: store.name,
        _id: med._id || '',
        name: med.name,
        currentImageFile: med.imageFile || '',
        reason: 'no_safe_match',
      });
      console.log(`  MISS  ${med.name}`);
      continue;
    }

    const id = String(med._id || '').trim();
    if (!id) {
      unmatched.push({
        store: store.name,
        _id: '',
        name: med.name,
        currentImageFile: med.imageFile || '',
        reason: 'missing_product_id',
      });
      console.log(`  MISS  ${med.name} (no id)`);
      continue;
    }

    const ext = path.extname(resolved.file).toLowerCase() || '.jpg';
    const destName = `${id}${ext}`;
    const srcPath = path.join(resolved.dir, resolved.file);
    const destPath = path.join(IMAGE_DIR, destName);

    console.log(`  OK    ${med.name} <= ${resolved.file} (${resolved.how}) -> ${destName}`);

    if (!DRY_RUN) {
      if (path.resolve(srcPath) !== path.resolve(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
      med.imageFile = destName;
    }
    matched++;
  }

  return { matched, unmatched, skipped: 0, storeName: store.name };
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('Catalog not found:', CATALOG_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  if (!Array.isArray(catalog)) {
    console.error('Catalog root must be an array');
    process.exit(1);
  }

  console.log(DRY_RUN ? 'DRY RUN — no files or catalog writes' : 'APPLYING sync');

  const allUnmatched = [];
  let totalMatched = 0;

  for (const brandCfg of BRAND_SOURCES) {
    const result = syncBrand(catalog, brandCfg);
    totalMatched += result.matched;
    allUnmatched.push(...result.unmatched);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    fs.writeFileSync(
      UNMATCHED_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          count: allUnmatched.length,
          products: allUnmatched,
        },
        null,
        2
      ),
      'utf8'
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Matched: ${totalMatched}`);
  console.log(`Unmatched: ${allUnmatched.length}`);
  if (allUnmatched.length) {
    allUnmatched.forEach((p) => console.log(`  - [${p.store}] ${p.name}`));
  }
  if (!DRY_RUN) {
    console.log('Catalog:', CATALOG_PATH);
    console.log('Unmatched report:', UNMATCHED_PATH);
  }
}

main();

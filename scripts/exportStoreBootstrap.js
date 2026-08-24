/**
 * Export static store snapshots for instant first paint after deploy.
 * Writes:
 *   public/data/store-bootstrap.json     — page-1 + department/subcategory pages + taxonomy
 *   public/data/store-catalog-ready.json — preformatted catalog for fast server warm
 *
 * Usage:
 *   node scripts/exportStoreBootstrap.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  BOOTSTRAP_PATH,
  PAGES_PATH,
  READY_PATH,
  bootstrapPageKey,
  invalidateStoreBootstrapMemo
} = require('../src/modules/store/storeBootstrapFile');
const {
  STORE_DEPARTMENTS,
  STORE_SUBCATEGORIES
} = require('../src/modules/store/storeCategories');

const PAGE_SIZE = 24;

async function main() {
  const {
    warmCatalogCache,
    getMedicinesPaginated,
    getStoresSummaryFromFirebase,
    getStoreTaxonomy,
    loadCatalogCache
  } = require('../src/core/firebase/catalog');

  await warmCatalogCache({ forceRebuild: true });

  const [page1, summary, taxonomy] = await Promise.all([
    getMedicinesPaginated({ page: 1, limit: PAGE_SIZE }),
    getStoresSummaryFromFirebase(),
    getStoreTaxonomy()
  ]);

  const departmentPages = {};
  for (const dept of STORE_DEPARTMENTS) {
    departmentPages[bootstrapPageKey(dept)] = await getMedicinesPaginated({
      page: 1,
      limit: PAGE_SIZE,
      category: dept
    });
  }

  const subcategoryPages = {};
  for (const [dept, subs] of Object.entries(STORE_SUBCATEGORIES)) {
    for (const sub of subs) {
      subcategoryPages[bootstrapPageKey(dept, sub)] = await getMedicinesPaginated({
        page: 1,
        limit: PAGE_SIZE,
        category: dept,
        subcategory: sub
      });
    }
  }

  const bootstrap = {
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    page1,
    summary,
    taxonomy
  };

  fs.mkdirSync(path.dirname(BOOTSTRAP_PATH), { recursive: true });
  fs.writeFileSync(BOOTSTRAP_PATH, `${JSON.stringify(bootstrap)}\n`, 'utf8');
  fs.writeFileSync(PAGES_PATH, `${JSON.stringify({
    generatedAt: bootstrap.generatedAt,
    departmentPages,
    subcategoryPages
  })}\n`, 'utf8');

  const cache = await loadCatalogCache();
  const ready = {
    generatedAt: bootstrap.generatedAt,
    medicines: cache.medicines,
    summary,
    taxonomy,
    page1
  };
  fs.writeFileSync(READY_PATH, `${JSON.stringify(ready)}\n`, 'utf8');
  invalidateStoreBootstrapMemo();

  const bootKb = Math.round(Buffer.byteLength(JSON.stringify(bootstrap)) / 1024);
  const pagesKb = Math.round(fs.statSync(PAGES_PATH).size / 1024);
  const readyKb = Math.round(fs.statSync(READY_PATH).size / 1024);
  console.log(`Wrote ${path.relative(ROOT, BOOTSTRAP_PATH)} (${bootKb} KB, ${page1.items?.length || 0} products, ${summary.length || 0} brands)`);
  console.log(`Wrote ${path.relative(ROOT, PAGES_PATH)} (${pagesKb} KB)`);
  console.log(`Wrote ${path.relative(ROOT, READY_PATH)} (${readyKb} KB, ${cache.medicines.length} catalog rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

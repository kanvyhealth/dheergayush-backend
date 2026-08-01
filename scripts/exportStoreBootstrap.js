/**
 * Export static store bootstrap JSON for instant first paint.
 * Writes public/data/store-bootstrap.json with page-1 products, brand summary, taxonomy.
 *
 * Usage:
 *   node scripts/exportStoreBootstrap.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'store-bootstrap.json');
const PAGE_SIZE = 24;

async function main() {
  const {
    warmCatalogCache,
    getMedicinesPaginated,
    getStoresSummaryFromFirebase,
    getStoreTaxonomy
  } = require('../src/core/firebase/catalog');

  await warmCatalogCache();

  const [page1, summary, taxonomy] = await Promise.all([
    getMedicinesPaginated({ page: 1, limit: PAGE_SIZE }),
    getStoresSummaryFromFirebase(),
    getStoreTaxonomy()
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    page1,
    summary,
    taxonomy
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  const kb = Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024);
  console.log(`Wrote ${OUT_PATH} (${kb} KB, ${page1.items?.length || 0} products, ${summary.length || 0} brands)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

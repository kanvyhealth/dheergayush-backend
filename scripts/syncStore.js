/**
 * Sync medicine images → MongoDB store catalog
 * Run: npm run db:sync
 */
require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../lib/db');
const { syncStoreCatalogFromImages } = require('../lib/storeCatalog');

(async () => {
  try {
    await connectDatabase();
    const result = await syncStoreCatalogFromImages({ forceRefresh: true });
    console.log('Result:', result);
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();

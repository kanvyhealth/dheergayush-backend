/**
 * Seed store catalog from all images in medicine/medicine/
 * Run: npm run seed:medicines
 */
require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../src/core/db');
const { syncStoreCatalogFromImages } = require('../src/modules/store/storeCatalog');

async function seedDatabase() {
  try {
    await connectDatabase();
    const result = await syncStoreCatalogFromImages({ forceRefresh: true });
    console.log('✅ Seed complete:', result);
    await disconnectDatabase();
    console.log('👋 Done. Run npm start and open /stores.html');
  } catch (error) {
    console.error('❌ Seeding error:', error.message);
    process.exit(1);
  }
}

seedDatabase();

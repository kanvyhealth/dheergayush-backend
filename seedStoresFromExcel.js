require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const Store = require('./models/Store');

// Connect to MongoDB
mongoose.connect(process.env.MONGOURI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Load Excel file
const workbook = xlsx.readFile('./store_medicine_details.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// Map to group medicines
let medicinesMap = new Map();

for (let i = 2; i < data.length; i++) {
  const row = data[i];

  const rawType = row[0] ? row[0].toString().trim() : "General";
  const name = row[2] ? row[2].toString().trim() : null;
  const quantity = row[3] ? row[3].toString().trim().toLowerCase() : null;
  const price = parseFloat(row[4]);
  const categoryRaw = (row[5] || '').toString().toLowerCase();

  // Skip invalid rows
  if (!name || !quantity || isNaN(price)) {
    console.log("❌ Skipped row:", row);
    continue;
  }

  // Extract quantity (e.g., 100 ml, 50 g)
  const match = quantity.match(/(\d+)\s*([a-zA-Z]+)/);
  if (!match) {
    console.log("❌ Invalid quantity:", quantity);
    continue;
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  // ✅ NEW CATEGORY LOGIC
  let category = "Ayurvedic Medicines";

  if (categoryRaw.includes("ayurvedic")) {
    category = "Ayurvedic Medicines";
  } 
  else if (categoryRaw.includes("organic food")) {
    category = "Organic Food";
  } 
  else if (categoryRaw.includes("beauty")) {
    category = "Beauty Care";
  } 
  else if (categoryRaw.includes("fitness")) {
    category = "Fitness Care";
  } 
  else if (categoryRaw.includes("organic groceries")) {
    category = "Organic Groceries";
  }

  const key = name + "|" + rawType;

  if (!medicinesMap.has(key)) {
    medicinesMap.set(key, {
      name,
      description: `Traditional ${rawType.toLowerCase()} remedy`,
      category,
      weights: []
    });
  }

  medicinesMap.get(key).weights.push({ value, unit, price });
}

// Final store object
const store = {
  name: 'DABUR',
  logo: 'https://example.com/dabur-logo.png',
  description: 'Ayurvedic and natural healthcare products',
  medicines: Array.from(medicinesMap.values())
};

// Seed DB
async function seedDatabase() {
  try {
    

    console.log('📦 Medicines count:', store.medicines.length);

    await Store.create(store);

    console.log('✅ Store with medicines added');

    await mongoose.connection.close();
    console.log('👋 Connection closed');
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();
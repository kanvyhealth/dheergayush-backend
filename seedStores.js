require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('./models/Store');

// Connect to MongoDB
mongoose.connect(process.env.MONGOURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Sample store data
const stores = [
    {
        name: 'DABUR',
        logo: 'https://example.com/dabur-logo.png',
        description: 'Ayurvedic and natural healthcare products',
        medicines: [
            {
                name: 'Dabur Honey',
                description: 'Pure and natural honey',
                category: 'Organic',
                weights: [
                    { value: 10, unit: 'g', price: 50 },
                    { value: 50, unit: 'g', price: 200 },
                    { value: 100, unit: 'g', price: 350 }
                ]
            },
            {
                name: 'Dabur Chyawanprash',
                description: 'Traditional health supplement',
                category: 'General',
                weights: [
                    { value: 100, unit: 'g', price: 150 },
                    { value: 500, unit: 'g', price: 600 }
                ]
            }
        ]
    },
    {
        name: 'PATANJALI',
        logo: 'https://example.com/patanjali-logo.png',
        description: 'Ayurvedic products and natural remedies',
        medicines: [
            {
                name: 'Patanjali Divya Coronil Kit',
                description: 'Ayurvedic immunity booster',
                category: 'General',
                weights: [
                    { value: 10, unit: 'g', price: 100 },
                    { value: 50, unit: 'g', price: 450 }
                ]
            },
            {
                name: 'Patanjali Aloe Vera Gel',
                description: 'Pure aloe vera gel',
                category: 'Organic',
                weights: [
                    { value: 50, unit: 'g', price: 80 },
                    { value: 100, unit: 'g', price: 150 }
                ]
            }
        ]
    },
    {
        name: 'SWASTIK',
        logo: 'https://example.com/swastik-logo.png',
        description: 'Traditional Ayurvedic medicines',
        medicines: [
            {
                name: 'Swasthik Amla Juice',
                description: 'Pure amla juice',
                category: 'Organic',
                weights: [
                    { value: 100, unit: 'ml', price: 120 },
                    { value: 500, unit: 'ml', price: 500 }
                ]
            },
            {
                name: 'Swasthik Ashwagandha',
                description: 'Pure ashwagandha powder',
                category: 'General',
                weights: [
                    { value: 50, unit: 'g', price: 200 },
                    { value: 100, unit: 'g', price: 350 }
                ]
            }
        ]
    }
];

// Function to seed the database
async function seedDatabase() {
    try {
        // Clear existing stores
        await Store.deleteMany({});
        console.log('🗑️  Cleared existing stores');

        // Insert new stores
        const insertedStores = await Store.insertMany(stores);
        console.log('✅ Successfully added stores:', insertedStores.map(s => s.name).join(', '));

        // Close the connection
        await mongoose.connection.close();
        console.log('👋 Database connection closed');
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

// Run the seed function
seedDatabase(); 
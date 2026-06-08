// const mongoose = require('mongoose');

// const medicineSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true
//     },
//     description: {
//         type: String,
//         required: true
//     },
//     category: {
//         type: String,
//         enum: ['Organic', 'General'],
//         required: true
//     },
//     weights: [{
//         value: {
//             type: Number,
//             required: true
//         },
//         unit: {
//             type: String,
//             default: 'g'
//         },
//         price: {
//             type: Number,
//             required: true
//         }
//     }]
// });

// const storeSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true,
//         unique: true
//     },
//     logo: {
//         type: String,
//         required: true
//     },
//     description: {
//         type: String,
//         required: true
//     },
//     medicines: [medicineSchema]
// }, {
//     timestamps: true
// });

// module.exports = mongoose.model('Store', storeSchema); 
const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: [
            'Ayurvedic Medicines',
            'Organic Food',
            'Beauty Care',
            'Fitness Care',
            'Organic Groceries',
            'Others'
        ],
        required: true
    },
    /** Exact filename under medicine/medicine/ for product image */
    imageFile: {
        type: String,
        default: ''
    },
    weights: [{
        value: {
            type: Number,
            required: true
        },
        unit: {
            type: String,
            default: 'g'
        },
        price: {
            type: Number,
            required: true
        }
    }]
});

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    logo: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    medicines: [medicineSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('Store', storeSchema);
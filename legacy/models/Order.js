const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    customerEmail: {
        type: String,
        required: false
    },
    deliveryAddress: {
        type: String,
        required: true
    },
    items: [
        {
            medicineId: String,
            storeId: String,
            storeName: String,
            name: String,
            selectedWeight: {
                value: Number,
                unit: String
            },
            pricePerUnit: Number,
            quantity: Number,
            totalPrice: Number
        }
    ],
    subtotal: {
        type: Number,
        required: true
    },
    deliveryFee: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['UPI', 'COD', 'Card'],
        default: 'UPI'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    paymentProof: {
        type: String,
        required: false
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    orderDate: {
        type: Date,
        default: Date.now
    },
    estimatedDelivery: {
        type: Date,
        required: false
    },
    notes: {
        type: String,
        required: false
    }
});

module.exports = mongoose.model('Order', orderSchema); 
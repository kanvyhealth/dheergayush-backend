const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  roomID: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  items: [
    {
      medicineId: String,
      storeId: String,
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
  total: {
    type: Number,
    required: true
  },
  paymentProof: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['delivered', 'not-delivered'],
    default: 'not-delivered'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Prescription', prescriptionSchema);

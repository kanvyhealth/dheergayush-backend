// prescribedCart.model.js
const mongoose = require('mongoose');

const PrescribedCartSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  cartItems: [
    {
      medicineId: { type: String },
      storeId: { type: String },
      name: { type: String },
      selectedWeight: {
        value: Number,
        unit: String
      },
      pricePerUnit: Number,
      quantity: Number,
      totalPrice: Number
    }
  ],
  prescribedAt: { type: Date, default: Date.now }
});

const PrescribedCart = mongoose.model('PrescribedCart', PrescribedCartSchema);

module.exports = PrescribedCart;

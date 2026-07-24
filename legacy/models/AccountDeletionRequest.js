const mongoose = require('mongoose');

const accountDeletionRequestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'processed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);

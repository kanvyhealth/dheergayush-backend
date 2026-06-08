const mongoose = require('mongoose');

const writtenPrescSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  filePath: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WrittenPresc', writtenPrescSchema);

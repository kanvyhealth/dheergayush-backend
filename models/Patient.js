const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    patientId: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // In a real app, hash this password!
    phone: { type: String, required: true },
    reports: [String],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', patientSchema);

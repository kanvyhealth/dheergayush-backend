// models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  selectedDoctorName: { type: String, required: true },
  selectedDoctorFee: { type: String, required: true },
  upiId: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentProofPath: { type: String, required: true },
  reports: [String], // Added reports field to store file paths
  patientSymptoms: { type: String, default: '' },
  doctorDiagnosis: { type: String, default: '' },
  consultationNotes: { type: String, default: '' },
  roomName: { type: String, required: true },
  doctorAvailableTime: { type: String, default: '' },
  consultationStatus: {
    type: String,
    enum: ['pending', 'waiting', 'ringing', 'accepted', 'rejected', 'timeout', 'in_call', 'completed', 'cancelled'],
    default: 'pending'
  },
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultationRequest' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
const mongoose = require('mongoose');

const consultationRequestSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  patientName: { type: String, required: true },
  patientPhone: { type: String, required: true },
  doctorName: { type: String, required: true },
  roomId: { type: String, required: true },
  amount: { type: Number },
  doctorAvailableTime: { type: String, default: '' },
  status: {
    type: String,
    enum: ['waiting', 'ringing', 'accepted', 'rejected', 'timeout', 'cancelled', 'in_call', 'completed'],
    default: 'ringing'
  },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date },
  rejectedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

consultationRequestSchema.index({ doctorName: 1, status: 1 });
consultationRequestSchema.index({ paymentId: 1 });

module.exports = mongoose.model('ConsultationRequest', consultationRequestSchema);

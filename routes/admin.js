const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Payment = require('../models/Payment');
const Prescription = require('../models/Prescription');

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Get all doctors
router.get('/doctors', asyncHandler(async (req, res) => {
    const doctors = await Doctor.find({});
    res.json(doctors);
}));

// Get all patients
router.get('/patients', asyncHandler(async (req, res) => {
    const patients = await Patient.find({});
    res.json(patients);
}));

// Get all payments
router.get('/payments', asyncHandler(async (req, res) => {
    const payments = await Payment.find({});
    res.json(payments);
}));

// Get all prescriptions
router.get('/prescriptions', asyncHandler(async (req, res) => {
    const prescriptions = await Prescription.find({});
    res.json(prescriptions);
}));

// Delete doctor
router.delete('/doctors/:id', asyncHandler(async (req, res) => {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
    }
    res.json({ message: 'Doctor deleted successfully' });
}));

// Delete patient
router.delete('/patients/:id', asyncHandler(async (req, res) => {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
    }
    res.json({ message: 'Patient deleted successfully' });
}));

// Delete payment
router.delete('/payments/:id', asyncHandler(async (req, res) => {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
    }
    res.json({ message: 'Payment deleted successfully' });
}));

// Delete prescription
router.delete('/prescriptions/:id', asyncHandler(async (req, res) => {
    const prescription = await Prescription.findByIdAndDelete(req.params.id);
    if (!prescription) {
        return res.status(404).json({ message: 'Prescription not found' });
    }
    res.json({ message: 'Prescription deleted successfully' });
}));

// Update doctor
router.put('/doctors/:id', asyncHandler(async (req, res) => {
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
    }
    res.json(doctor);
}));

// Update patient
router.put('/patients/:id', asyncHandler(async (req, res) => {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
    }
    res.json(patient);
}));

// Update payment
router.put('/payments/:id', asyncHandler(async (req, res) => {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
}));

// Update prescription
router.put('/prescriptions/:id', asyncHandler(async (req, res) => {
    const prescription = await Prescription.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!prescription) {
        return res.status(404).json({ message: 'Prescription not found' });
    }
    res.json(prescription);
}));

// Update prescription status
router.put('/prescriptions/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ message: 'Status is required' });
    }
    
    const prescription = await Prescription.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
    );
    
    if (!prescription) {
        return res.status(404).json({ message: 'Prescription not found' });
    }
    
    res.json(prescription);
}));

// Logout route
router.post('/logout', (req, res) => {
    // Clear any session data if you're using sessions
    if (req.session) {
        req.session.destroy();
    }
    res.json({ message: 'Logged out successfully' });
});

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

module.exports = router; 
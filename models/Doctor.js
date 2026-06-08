const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    specialization: { type: String, required: true },
    license: { type: String, required: true, unique: true }, // License should be unique
    // NEW FIELD: Location of the doctor
    location: { type: String, required: true },
    // NEW FIELD: To store languages the doctor speaks
    languages: { type: [String], default: [] }, // Array of strings, e.g., ['English', 'Hindi', 'Telugu']
    availableTime: { type: String, required: true }, // Store the single 1-hour slot string
    documents: [String], // Store uploaded file paths (these would be URLs from a storage service)
    // Unique video room ID for this doctor (legacy field: zegoRoomId)
    videoRoomId: { type: String, unique: true, sparse: true },
    zegoRoomId: { type: String, unique: true, sparse: true },
    // UPDATED FIELD: To track the doctor's approval status - hidden from frontend, admin controlled
    Regstatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, // Admin approval status
    // UPDATED FIELD: To track the doctor's current availability status for call routing and queuing
    status: { type: String, enum: ['Available', 'Busy', 'Offline'], default: 'Offline' }, // Call availability status
    photo: { type: String }, // New: photo file path
    fee: { type: Number, required: true }, // New: fee per video call
    bio: { type: String }, // New: doctor bio
    experience: { type: Number, required: true }, // New: years of experience
    lastSeenAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Doctor', doctorSchema);

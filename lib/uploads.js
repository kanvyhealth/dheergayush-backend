/**
 * Upload helpers — multer memory storage + Firebase Storage + Firestore documents.
 */
const fs = require('fs');
const path = require('path');
const { uploadMulterFile } = require('./firebaseStorage');

const uploadDir = path.join(__dirname, '..', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

async function uploadToFirebase(multerFile, folder, meta = {}) {
  ensureUploadDir();
  try {
    const result = await uploadMulterFile(multerFile, folder, { metadata: meta });
    if (result) return result;
  } catch (err) {
    console.warn('Firebase Storage upload failed, using local fallback:', err.message);
  }

  const localName = `${Date.now()}-${multerFile.originalname}`;
  const localPath = path.join(uploadDir, localName);
  if (multerFile.buffer) {
    fs.writeFileSync(localPath, multerFile.buffer);
  } else if (multerFile.path) {
    fs.copyFileSync(multerFile.path, localPath);
  }
  return {
    storagePath: `uploads/${localName}`,
    downloadUrl: `/uploads/${localName}`,
    fileName: localName
  };
}

async function saveDocumentRecord({
  Document,
  fileName,
  downloadUrl,
  patientId,
  userId,
  doctorId,
  appointmentId,
  category = 'medical_report',
  uploadedByRole = 'patient',
  reportType = 'consultation'
}) {
  if (!Document) return null;
  return Document.create({
    fileName,
    downloadUrl,
    patientId: patientId || userId || '',
    userId: userId || patientId || '',
    doctorId: doctorId || '',
    appointmentId: appointmentId || '',
    category,
    uploadedByRole,
    reportType,
    status: 'active',
    sharedWithDoctor: true,
    uploadedAt: new Date()
  });
}

module.exports = {
  uploadToFirebase,
  saveDocumentRecord
};

const { verifyIdToken, getUserProfile } = require('./firebaseAuth');
const { findCustomerByUid, findCustomerByPhone, findDoctorByUid, normalizePhone } = require('./userQueries');

function getBearer(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

async function resolveFirebaseSession(req) {
  const token = getBearer(req);
  if (!token || token.length < 20) return null;
  try {
    const decoded = await verifyIdToken(token);
    const profile = await getUserProfile(decoded.uid);
    const doctor = await findDoctorByUid(decoded.uid);
    const customer =
      (await findCustomerByUid(decoded.uid)) ||
      (profile?.phone ? await findCustomerByPhone(profile.phone) : null);
    return { decoded, profile, doctor, customer, patient: customer };
  } catch {
    return null;
  }
}

function requireFirebaseSession(message = 'Authentication required.') {
  return async (req, res, next) => {
    const session = await resolveFirebaseSession(req);
    if (!session) {
      return res.status(401).json({ message });
    }
    req.firebaseUid = session.decoded.uid;
    req.firebaseUser = session.decoded;
    req.userProfile = session.profile;
    req.doctor = session.doctor;
    req.patient = session.patient;
    next();
  };
}

function requirePatientPhoneAccess(paramName = 'phoneNumber') {
  return async (req, res, next) => {
    const session = await resolveFirebaseSession(req);
    if (!session) {
      return res.status(401).json({ message: 'Sign in to view this patient data.' });
    }
    const requested = req.params[paramName] || req.params.phone || '';
    const patientPhone = session.customer?.phone || session.profile?.phone || '';
    const uid = session.decoded.uid;
    if (patientPhone && normalizePhone(patientPhone) !== normalizePhone(requested) && String(uid) !== String(requested)) {
      return res.status(403).json({ message: 'Not authorized to view this patient data.' });
    }
    req.firebaseUid = uid;
    req.userProfile = session.profile;
    next();
  };
}

function requireDoctorNameAccess(paramName = 'doctorName') {
  return async (req, res, next) => {
    const session = await resolveFirebaseSession(req);
    if (!session?.doctor) {
      return res.status(401).json({ message: 'Doctor sign-in required.' });
    }
    const requested = decodeURIComponent(req.params[paramName] || req.body?.doctorName || '').trim();
    const sessionName = String(session.doctor.name || session.doctor.displayName || '').trim();
    if (
      requested &&
      sessionName.toLowerCase() !== requested.toLowerCase()
    ) {
      return res.status(403).json({ message: 'Not authorized for this doctor account.' });
    }
    req.doctor = session.doctor;
    req.firebaseUid = session.decoded.uid;
    next();
  };
}

function requireConsultationDoctor() {
  return async (req, res, next) => {
    const session = await resolveFirebaseSession(req);
    if (!session?.doctor) {
      return res.status(401).json({ message: 'Doctor sign-in required.' });
    }
    const { ConsultationRequest } = require('./data');
    const consultation = await ConsultationRequest.findById(req.params.id);
    if (consultation && consultation.doctorName !== session.doctor.name) {
      return res.status(403).json({ message: 'This consultation belongs to another doctor.' });
    }
    req.doctor = session.doctor;
    next();
  };
}

function requireDoctorSession(message = 'Doctor sign-in required.') {
  return async (req, res, next) => {
    const session = await resolveFirebaseSession(req);
    if (!session?.doctor) {
      return res.status(401).json({ message });
    }
    req.doctor = session.doctor;
    req.firebaseUid = session.decoded.uid;
    req.firebaseUser = session.decoded;
    req.userProfile = session.profile;
    next();
  };
}

module.exports = {
  getBearer,
  resolveFirebaseSession,
  requireFirebaseSession,
  requirePatientPhoneAccess,
  requireDoctorNameAccess,
  requireConsultationDoctor,
  requireDoctorSession
};

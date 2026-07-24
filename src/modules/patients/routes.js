/**
 * Domain routes: patients
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.post('/api/login-patient', authLimiter, async (req, res) => {
        try {
            const { email, password } = req.body;
    
            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required.' });
            }
    
            const auth = await signInWithPassword(email, password);
            const profile = await getUserProfile(auth.localId);
            if (profile && profile.role && profile.role !== 'Customer') {
                return res.status(403).json({ message: 'This account is not a patient account.' });
            }
            return res.status(200).json({
                message: 'Patient logged in successfully.',
                idToken: auth.idToken,
                refreshToken: auth.refreshToken,
                patientId: profile?.name || email.split('@')[0],
                phone: profile?.phone || '',
                user: profile || { uid: auth.localId, email: auth.email, name: auth.displayName }
            });
        } catch (err) {
            console.error('❌ Patient login error:', err.message);
            res.status(401).json({ message: err.message || 'Invalid email or password.' });
        }
    });
    
    app.get('/api/patient/consultation-history/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
        try {
            const { phoneOrUid } = req.params;
            if (!phoneOrUid) {
                return res.status(400).json({ message: 'Phone or user id is required.' });
            }
            const identifiers = new Set([phoneOrUid]);
            if (req.firebaseUid) identifiers.add(req.firebaseUid);
            const customer = await findCustomerByPhone(phoneOrUid);
            if (customer?.uid) identifiers.add(String(customer.uid));
            if (customer?._id) identifiers.add(String(customer._id));
    
            const seen = new Set();
            const merged = [];
            for (const id of identifiers) {
                const batch = await listConsultationHistoryForPatient(id);
                for (const row of batch) {
                    const key = String(row.id || row.consultationId || row.roomId);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(row);
                    }
                }
            }
            merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            res.status(200).json(merged);
        } catch (err) {
            console.error('❌ Error fetching patient consultation history:', err);
            res.status(500).json({ message: 'Failed to fetch consultation history.', error: err.message });
        }
    });
    
    app.get('/api/patient/consultation-access', requireFirebaseAuth(), async (req, res) => {
        try {
            const phone = req.query.phone || '';
            const list = await listAccessForPatient(req.firebaseUid, phone);
            return res.json(list.filter((row) => row.active));
        } catch (err) {
            console.error('List access error:', err);
            return res.status(500).json({ message: 'Could not load consultation access.' });
        }
    });
    
    app.get('/api/patient/orders/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
        try {
            const { phoneOrUid } = req.params;
            const identifiers = new Set([phoneOrUid]);
            if (req.firebaseUid) identifiers.add(req.firebaseUid);
            const customer = await findCustomerByPhone(phoneOrUid);
            if (customer?.uid) identifiers.add(String(customer.uid));
            const seen = new Set();
            const merged = [];
            for (const id of identifiers) {
                const batch = await listOrdersForPatient(id);
                for (const row of batch) {
                    const key = String(row.id || row.orderId);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(row);
                    }
                }
            }
            merged.sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime());
            return res.json(merged);
        } catch (err) {
            console.error('Patient orders error:', err);
            return res.status(500).json({ message: 'Failed to fetch orders.' });
        }
    });
    
    app.get('/api/patient/dashboard/:phoneOrUid', requirePatientPhoneAccess('phoneOrUid'), async (req, res) => {
        try {
            const { phoneOrUid } = req.params;
            const [consultations, prescriptions, orders, accessPlans] = await Promise.all([
                listConsultationHistoryForPatient(phoneOrUid),
                (async () => {
                    const phone = normalizePhone(phoneOrUid) || phoneOrUid;
                    const rx = await Prescription.find({}).sort({ createdAt: -1 });
                    return rx.filter((r) => {
                        const d = r.toObject ? r.toObject() : r;
                        return normalizePhone(d.phone) === phone || String(d.phone) === String(phoneOrUid);
                    });
                })(),
                listOrdersForPatient(phoneOrUid),
                listAccessForPatient(req.firebaseUid, phoneOrUid)
            ]);
            return res.json({
                consultations,
                prescriptions: prescriptions.map((r) => (r.toObject ? r.toObject() : r)),
                orders,
                accessPlans: accessPlans.filter((a) => a.active)
            });
        } catch (err) {
            console.error('Patient dashboard error:', err);
            return res.status(500).json({ message: 'Failed to load dashboard.' });
        }
    });
    
    app.get('/api/patient/reports/:phone', requirePatientPhoneAccess('phone'), async (req, res) => {
        try {
            const { phone } = req.params;
    
            const customer = await findCustomerByPhone(phone);
            if (!customer) {
                return res.status(404).json({ message: 'Customer not found' });
            }
    
            const reports = await resolveReportEntries(customer.reports || [], customer.createdAt);
    
            res.json({
                reports,
                patientInfo: {
                    phone: customer.phone,
                    name: customer.name,
                    email: customer.email,
                    registrationDate: customer.createdAt
                }
            });
        } catch (err) {
            console.error('❌ Error fetching reports:', err);
            res.status(500).json({
                message: 'Failed to fetch reports',
                error: err.message
            });
        }
    });
  }
};

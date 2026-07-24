/**
 * Domain routes: admin
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/admin/doctors/all', async (req, res) => {
        try {
            const doctors = await listDoctors().sort({ createdAt: -1 });
            res.json(doctors);
        } catch (error) {
            console.error('Error fetching all doctors:', error);
            res.status(500).json({ message: 'Error fetching doctors', error: error.message });
        }
    });
    
    app.put('/api/admin/doctors/:id/status', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const { validateApprovalTransition } = require('../../modules/doctors/doctorFields');
    
            if (!['pending', 'approved', 'rejected'].includes(status)) {
                return res.status(400).json({ message: 'Invalid status. Must be pending, approved, or rejected.' });
            }
    
            const existing = await findDoctorById(id);
            if (!existing) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const check = validateApprovalTransition(existing, status);
            if (!check.ok) {
                return res.status(403).json({ message: check.error });
            }
    
            const doctor = await syncDoctorRecordsUpdate(existing, buildApprovalUpdate(status));
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            if (status === 'approved') {
                await ensureDoctorPublicId(doctor);
            }
    
            res.json({
                message: `Doctor ${status} successfully`,
                doctor: {
                    id: doctor._id,
                    name: doctor.name,
                    Regstatus: doctor.Regstatus
                }
            });
        } catch (error) {
            console.error('Error updating doctor status:', error);
            res.status(500).json({ message: 'Error updating doctor status', error: error.message });
        }
    });
    
    app.put('/api/admin/prescriptions/:id/status', async (req, res) => {
        try {
            const { status } = req.body;
            const prescription = await Prescription.findByIdAndUpdate(
                req.params.id,
                { status },
                { new: true }
            );
            if (!prescription) {
                return res.status(404).json({ message: 'Prescription not found' });
            }
            res.json(prescription);
        } catch (err) {
            console.error('❌ Error updating prescription status:', err);
            res.status(500).json({ message: 'Failed to update status', error: err.message });
        }
    });
    
    app.get('/api/admin/doctors', async (req, res) => {
        try {
            if (!isConnected()) {
                return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
            }
            const doctors = await listDoctors();
            const reconciled = [];
            for (const doctor of doctors) {
                reconciled.push((await reconcileDoctorFeeAndPersist(doctor)) || doctor);
            }
            res.json(await enrichDoctorRows(reconciled));
        } catch (error) {
            adminDbErrorResponse(res, 'doctors', error);
        }
    });
    
    app.get('/api/admin/patients', async (req, res) => {
        try {
            if (!isConnected()) {
                return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
            }
            const customers = await listCustomers();
            res.json(customers);
        } catch (error) {
            adminDbErrorResponse(res, 'customers', error);
        }
    });
    
    app.get('/api/admin/payments', async (req, res) => {
        try {
            if (!isConnected()) {
                return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
            }
            const payments = await Payment.find({}).sort({ createdAt: -1 }).exec();
            res.json(payments);
        } catch (error) {
            adminDbErrorResponse(res, 'payments', error);
        }
    });
    
    app.get('/api/admin/settlements', async (req, res) => {
        try {
            if (!isConnected()) {
                return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
            }
            const {
                enrichSettlementRow,
                getPaymentGrossAmount
            } = require('../../modules/doctors/doctorSettlement');
            const payments = await Payment.find({}).sort({ createdAt: -1 }).exec();
            const doctors = await listDoctors();
            const doctorById = new Map();
            const doctorByName = new Map();
            for (const doctor of doctors) {
                const id = String(doctor._id || doctor.id || doctor.uid || '').trim();
                const name = String(doctor.name || '').trim().toLowerCase();
                if (id) doctorById.set(id, doctor);
                if (name) doctorByName.set(name, doctor);
            }
    
            const rows = payments
                .filter((payment) => getPaymentGrossAmount(payment) > 0)
                .map((payment) => {
                    const doctorId = String(payment.doctorId || payment.selectedDoctorId || '').trim();
                    const doctorName = String(payment.doctorName || payment.selectedDoctorName || '').trim().toLowerCase();
                    const doctor = doctorById.get(doctorId) || doctorByName.get(doctorName) || null;
                    return enrichSettlementRow(payment, doctor);
                });
    
            res.json(rows);
        } catch (error) {
            adminDbErrorResponse(res, 'settlements', error);
        }
    });
    
    app.put('/api/admin/settlements/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const {
                buildSettlementPatch,
                calcSettlement,
                enrichSettlementRow,
                getPaymentGrossAmount
            } = require('../../modules/doctors/doctorSettlement');
    
            const payment = await Payment.findById(id);
            if (!payment) {
                return res.status(404).json({ message: 'Payment not found' });
            }
    
            const commissionPercent = req.body.commissionPercent ?? req.body.settlementCommissionPercent;
            if (commissionPercent == null && req.body.settlementStatus == null) {
                return res.status(400).json({ message: 'commissionPercent or settlementStatus is required.' });
            }
    
            const patch = buildSettlementPatch(req.body);
            if (patch.settlementStatus === 'settled' && commissionPercent == null) {
                const existingPct = payment.settlementCommissionPercent ?? payment.commissionPercent;
                if (existingPct == null) {
                    return res.status(400).json({ message: 'Enter commission percentage before marking as settled.' });
                }
            }
    
            if (commissionPercent != null) {
                const gross = getPaymentGrossAmount(payment);
                const calc = calcSettlement(gross, commissionPercent);
                patch.commissionAmount = calc.commissionAmount;
                patch.doctorNetAmount = calc.doctorNetAmount;
            }
    
            const updated = await Payment.findByIdAndUpdate(id, { $set: patch }, { new: true });
            let doctor = null;
            const doctorId = String(updated.doctorId || updated.selectedDoctorId || '').trim();
            if (doctorId) doctor = await findDoctorById(doctorId);
            if (!doctor && updated.doctorName) {
                doctor = await findDoctorByName(updated.doctorName || updated.selectedDoctorName);
            }
    
            res.json({
                message: 'Settlement updated successfully',
                settlement: enrichSettlementRow(updated, doctor)
            });
        } catch (error) {
            console.error('Error updating settlement:', error);
            res.status(500).json({ message: 'Error updating settlement', error: error.message });
        }
    });
    
    app.get('/api/admin/prescriptions', async (req, res) => {
        try {
            if (!isConnected()) {
                return res.status(503).json({ message: 'Database not connected. Check Firebase credentials on the server.' });
            }
            const prescriptions = await Prescription.find({}).sort({ createdAt: -1 }).exec();
            res.json(prescriptions);
        } catch (error) {
            adminDbErrorResponse(res, 'prescriptions', error);
        }
    });
    
    app.delete('/api/admin/doctors/:id', async (req, res) => {
        try {
            const doctor = await findDoctorById(req.params.id);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
            await deleteAllDoctorRecords(doctor);
            res.json({ message: 'Doctor deleted successfully' });
        } catch (error) {
            console.error('Error deleting doctor:', error);
            res.status(500).json({ message: 'Error deleting doctor', error: error.message });
        }
    });
    
    app.delete('/api/admin/patients/:id', async (req, res) => {
        try {
            const customer = await findCustomerByUid(req.params.id) || await findCustomerByPhone(req.params.id);
            if (!customer) {
                return res.status(404).json({ message: 'Customer not found' });
            }
            await User.findByIdAndDelete(customer._id || customer.uid);
            res.json({ message: 'Customer deleted successfully' });
        } catch (error) {
            console.error('Error deleting customer:', error);
            res.status(500).json({ message: 'Error deleting customer', error: error.message });
        }
    });
    
    app.delete('/api/admin/payments/:id', async (req, res) => {
        try {
            const payment = await Payment.findByIdAndDelete(req.params.id);
            if (!payment) {
                return res.status(404).json({ message: 'Payment not found' });
            }
            res.json({ message: 'Payment deleted successfully' });
        } catch (error) {
            console.error('Error deleting payment:', error);
            res.status(500).json({ message: 'Error deleting payment', error: error.message });
        }
    });
    
    app.delete('/api/admin/prescriptions/:id', async (req, res) => {
        try {
            const prescription = await Prescription.findByIdAndDelete(req.params.id);
            if (!prescription) {
                return res.status(404).json({ message: 'Prescription not found' });
            }
            res.json({ message: 'Prescription deleted successfully' });
        } catch (error) {
            console.error('Error deleting prescription:', error);
            res.status(500).json({ message: 'Error deleting prescription', error: error.message });
        }
    });
    
    app.put('/api/admin/prescriptions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
    
            // Validate required fields - only phone and total are required now
            if (!updates.phone || updates.total === undefined) {
                return res.status(400).json({ message: 'Phone and total amount are required fields' });
            }
    
            const prescription = await Prescription.findByIdAndUpdate(
                id,
                { $set: updates },
                { new: true, runValidators: true }
            );
    
            if (!prescription) {
                return res.status(404).json({ message: 'Prescription not found' });
            }
    
            res.json({
                message: 'Prescription updated successfully',
                prescription
            });
        } catch (error) {
            console.error('Error updating prescription:', error);
            res.status(500).json({ message: 'Error updating prescription', error: error.message });
        }
    });
    
    app.put('/api/admin/doctors/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { parseAdminDoctorUpdates, validateApprovalTransition } = require('../../modules/doctors/doctorFields');
    
            let doctor = await findDoctorById(id);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const { profile, approval, working } = parseAdminDoctorUpdates(req.body, doctor);
    
            const paymentPatchResult = buildPaymentDetailsPatch(req.body, doctor);
            if (req.body.paymentMode || req.body.upiId || req.body.accountNumber || req.body.bankName) {
                if (!paymentPatchResult.ok) {
                    return res.status(400).json({ message: paymentPatchResult.error });
                }
                Object.assign(profile, paymentPatchResult.patch);
            }
    
            if (!profile.name || !profile.specialization || !profile.license) {
                return res.status(400).json({ message: 'Name, specialization, and license are required fields' });
            }
    
            if (typeof profile.languages === 'string') {
                profile.languages = profile.languages
                    .split(/[,|]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
    
            const adminFeeCheck = parseConsultationFeeInput(req.body);
            if (!adminFeeCheck.ok) {
                return res.status(400).json({ message: adminFeeCheck.error });
            }
            if (!adminFeeCheck.skipped) {
                const feePatch = buildAdminApprovedFeePatch(adminFeeCheck.fee);
                if (!feePatch.ok) {
                    return res.status(400).json({ message: feePatch.error });
                }
                Object.assign(profile, feePatch.patch);
            }
    
            delete profile.itemId;
            delete profile.id;
            delete profile._id;
            profile.updatedAt = new Date();
    
            doctor = await syncDoctorRecordsUpdate(doctor, profile);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            if (approval && ['pending', 'approved', 'rejected'].includes(String(approval).toLowerCase())) {
                const check = validateApprovalTransition(doctor, approval);
                if (!check.ok) {
                    return res.status(403).json({ message: check.error });
                }
                doctor = await syncDoctorRecordsUpdate(doctor, buildApprovalUpdate(approval));
                const doctorUid = doctor?.uid || doctor?._id;
                if (doctorUid) {
                    await User.findByIdAndUpdate(
                        doctorUid,
                        { status: approval, approvalStatus: approval, updatedAt: new Date() },
                        { new: true }
                    );
                }
            }
    
            if (working != null && String(working).trim() !== '') {
                doctor = await findDoctorById(id);
                await updateDoctorPresence(doctor, working);
                doctor = await findDoctorById(id);
                const payload = await buildStatusPayload(doctor);
                if (payload && doctor.name) emitDoctorStatus(doctor.name, payload);
            }
    
            res.json({
                message: 'Doctor updated successfully',
                doctor: enrichDoctorRow(doctor)
            });
        } catch (error) {
            console.error('Error updating doctor:', error);
            res.status(500).json({ message: 'Error updating doctor', error: error.message });
        }
    });
    
    app.put('/api/admin/doctors/:id/fee', async (req, res) => {
        try {
            const { id } = req.params;
            const adminFeeCheck = parseConsultationFeeInput(req.body);
            if (!adminFeeCheck.ok) {
                return res.status(400).json({ message: adminFeeCheck.error });
            }
            if (adminFeeCheck.skipped) {
                return res.status(400).json({ message: 'consultationFee is required.' });
            }
    
            let doctor = await findDoctorById(id);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const result = buildAdminApprovedFeePatch(adminFeeCheck.fee);
            if (!result.ok) {
                return res.status(400).json({ message: result.error });
            }
    
            doctor = await syncDoctorRecordsUpdate(doctor, result.patch);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            return res.json({
                message: `Consultation fee updated to ₹${result.approvedFee}.`,
                doctor: enrichDoctorRow(doctor)
            });
        } catch (error) {
            console.error('Error updating doctor fee:', error);
            return res.status(500).json({ message: 'Error updating doctor fee', error: error.message });
        }
    });
    
    app.put('/api/admin/doctors/:id/fee-request', async (req, res) => {
        try {
            const { id } = req.params;
            const action = String(req.body?.action || '').trim().toLowerCase();
    
            if (!['approve', 'reject'].includes(action)) {
                return res.status(400).json({ message: 'action must be approve or reject.' });
            }
    
            let doctor = await findDoctorById(id);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const result = action === 'approve'
                ? buildApprovedFeePatch(doctor)
                : buildRejectedFeePatch();
    
            if (!result.ok) {
                return res.status(400).json({ message: result.error });
            }
    
            doctor = await syncDoctorRecordsUpdate(doctor, result.patch);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const message = action === 'approve'
                ? `Consultation fee updated to ₹${result.approvedFee}.`
                : 'Pending fee change rejected.';
    
            return res.json({
                message,
                doctor: enrichDoctorRow(doctor)
            });
        } catch (error) {
            console.error('Error updating doctor fee request:', error);
            return res.status(500).json({ message: 'Error updating fee request', error: error.message });
        }
    });
    
    app.put('/api/admin/doctors/:id/approve', async (req, res) => {
        try {
            const { id } = req.params;
            const { Regstatus } = req.body;
            const { validateApprovalTransition } = require('../../modules/doctors/doctorFields');
    
            if (!Regstatus || !['pending', 'approved', 'rejected'].includes(Regstatus)) {
                return res.status(400).json({ message: 'Valid Regstatus (pending, approved, rejected) is required' });
            }
    
            const existing = await findDoctorById(id);
            if (!existing) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            const check = validateApprovalTransition(existing, Regstatus);
            if (!check.ok) {
                return res.status(403).json({ message: check.error });
            }
    
            const doctor = await syncDoctorRecordsUpdate(existing, buildApprovalUpdate(Regstatus));
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor not found' });
            }
    
            if (Regstatus === 'approved') {
                await ensureDoctorPublicId(doctor);
            }
    
            res.json({
                message: `Doctor ${Regstatus} successfully`,
                doctor
            });
        } catch (error) {
            console.error('Error updating doctor status:', error);
            res.status(500).json({ message: 'Error updating doctor status', error: error.message });
        }
    });
    
    app.post('/api/admin/login', authLimiter, (req, res) => {
        const username = (req.body.username || req.body.email || '').trim();
        const password = req.body.password || '';
        if (!validateAdminCredentials(username, password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const challenge = createAdminOtpChallenge({
            ip: clientIp(req),
            ua: req.get('user-agent') || ''
        });
        sendAdminOtp(challenge.otp)
            .then((delivery) => {
                if (!delivery.ok) {
                    dropAdminOtpChallenge(challenge.challengeId);
                    return res.status(503).json({
                        ok: false,
                        message: 'Admin OTP delivery is not configured. Configure email and SMS OTP providers, then try again.',
                        delivery
                    });
                }
                const payload = {
                    ok: true,
                    mfaRequired: true,
                    message: delivery.consoleDev
                        ? 'OTP generated (console delivery). Enter the code shown below.'
                        : 'OTP sent to admin mobile and email.',
                    challengeId: challenge.challengeId,
                    expiresIn: challenge.expiresIn,
                    resendIn: challenge.resendIn,
                    maskedEmail: challenge.maskedEmail,
                    maskedPhone: challenge.maskedPhone
                };
                if (delivery.consoleDev) {
                    payload.devOtp = challenge.otp;
                }
                return res.json(payload);
            })
            .catch((err) => {
                dropAdminOtpChallenge(challenge.challengeId);
                return res.status(503).json({
                    ok: false,
                    message: 'Could not send admin OTP. Please try again later.',
                    error: err.message
                });
            });
    });
    
    app.post('/api/admin/login/resend', authLimiter, async (req, res) => {
        try {
            const result = regenerateAdminOtp(req.body?.challengeId);
            if (!result.ok) {
                return res.status(result.status || 400).json({
                    ok: false,
                    message: result.message,
                    resendIn: result.resendIn || 0
                });
            }
            const delivery = await sendAdminOtp(result.otp);
            if (!delivery.ok) {
                dropAdminOtpChallenge(result.challengeId);
                return res.status(503).json({
                    ok: false,
                    message: 'Could not send admin OTP. Please login again and try later.',
                    delivery
                });
            }
            const payload = {
                ok: true,
                message: delivery.consoleDev
                    ? 'OTP regenerated (console delivery). Enter the code shown below.'
                    : 'OTP resent to admin mobile and email.',
                challengeId: result.challengeId,
                expiresIn: result.expiresIn,
                resendIn: result.resendIn,
                maskedEmail: result.maskedEmail,
                maskedPhone: result.maskedPhone
            };
            if (delivery.consoleDev) {
                payload.devOtp = result.otp;
            }
            return res.json(payload);
        } catch (err) {
            return res.status(503).json({ ok: false, message: 'Could not resend admin OTP.', error: err.message });
        }
    });
    
    app.post('/api/admin/login/verify', authLimiter, (req, res) => {
        const result = verifyAdminOtp(req.body?.challengeId, req.body?.otp);
        if (!result.ok) {
            return res.status(result.status || 401).json({ ok: false, message: result.message });
        }
        const token = issueAdminToken();
        return res.json({ message: 'Login successful', ok: true, token });
    });
    
    app.post('/api/admin/logout', (req, res) => {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        revokeAdminToken(token);
        res.json({ message: 'Logged out successfully' });
    });

    app.get('/api/admin/medicines', async (req, res) => {
        try {
            const {
                listMedicinesAdmin
            } = require('../../modules/store/medicineCatalogAdmin');
            const result = listMedicinesAdmin({
                q: req.query.q,
                brand: req.query.brand,
                category: req.query.category,
                page: req.query.page,
                limit: req.query.limit
            });
            res.json({
                ...result,
                medicines: result.items
            });
        } catch (err) {
            console.error('Admin list medicines error:', err);
            res.status(500).json({ message: 'Failed to list medicines', error: err.message });
        }
    });

    app.get('/api/admin/medicines/:id', async (req, res) => {
        try {
            const { getMedicineAdmin } = require('../../modules/store/medicineCatalogAdmin');
            const med = getMedicineAdmin(req.params.id);
            if (!med) return res.status(404).json({ message: 'Medicine not found' });
            res.json(med);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });

    app.post('/api/admin/medicines', async (req, res) => {
        try {
            const {
                upsertMedicineAdmin,
                upsertFirebaseMedicine
            } = require('../../modules/store/medicineCatalogAdmin');
            const { warmCatalogCache } = require('../../core/firebase/catalog');
            const result = upsertMedicineAdmin(req.body || {});
            await upsertFirebaseMedicine(result.medicine);
            warmCatalogCache().catch(() => {});
            res.status(result.created ? 201 : 200).json(result);
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message });
        }
    });

    app.put('/api/admin/medicines/:id', async (req, res) => {
        try {
            const {
                upsertMedicineAdmin,
                upsertFirebaseMedicine
            } = require('../../modules/store/medicineCatalogAdmin');
            const { warmCatalogCache } = require('../../core/firebase/catalog');
            const result = upsertMedicineAdmin({ ...(req.body || {}), _id: req.params.id });
            await upsertFirebaseMedicine(result.medicine);
            warmCatalogCache().catch(() => {});
            res.json(result);
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message });
        }
    });

    app.delete('/api/admin/medicines/:id', async (req, res) => {
        try {
            const {
                hideMedicineAdmin,
                upsertFirebaseMedicine
            } = require('../../modules/store/medicineCatalogAdmin');
            const { warmCatalogCache } = require('../../core/firebase/catalog');
            const med = hideMedicineAdmin(req.params.id);
            if (!med) return res.status(404).json({ message: 'Medicine not found' });
            await upsertFirebaseMedicine(med);
            warmCatalogCache().catch(() => {});
            res.json({ ok: true, medicine: med });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });

    app.post('/api/admin/medicines/export-json', async (req, res) => {
        try {
            const { CATALOG_PATH, readStoresRaw, writeStoresRaw } = require('../../modules/store/medicineCatalogAdmin');
            const { warmCatalogCache } = require('../../core/firebase/catalog');
            const stores = readStoresRaw();
            writeStoresRaw(stores);
            await warmCatalogCache();
            res.json({
                ok: true,
                path: CATALOG_PATH,
                stores: stores.length,
                medicines: stores.reduce((n, s) => n + (s.medicines || []).length, 0)
            });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });
    
    app.get('/api/doctors/debug', async (req, res) => {
        try {
            const doctors = await listDoctors();
            const summary = doctors.map((d) => ({
                name: d.name,
                location: d.location,
                languages: d.languages,
                status: d.status,
                Regstatus: d.Regstatus,
                availableTime: d.availableTime
            }));
            console.log('🔍 All doctors in database:');
            summary.forEach(doctor => {
                console.log(`👨‍⚕️ ${doctor.name}: Location="${doctor.location}", Status="${doctor.status}", Regstatus="${doctor.Regstatus}"`);
            });
            res.status(200).json(summary);
        } catch (err) {
            console.error('❌ Error fetching debug doctors:', err);
            res.status(500).json({ message: 'Failed to fetch debug doctors', error: err.message });
        }
    });
  }
};

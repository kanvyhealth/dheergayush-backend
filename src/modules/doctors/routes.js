/**
 * Domain routes: doctors
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.post('/api/register-doctor', upload.fields([
        { name: 'documents', maxCount: 5 },
        { name: 'photo', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const {
                name,
                specialization,
                license,
                location,
                availableTime,
                fee,
                bio,
                experience,
                email,
                password,
                degree,
            } = req.body;
    
            let languages = req.body.languages;
            if (languages && !Array.isArray(languages)) {
                languages = [languages];
            } else if (!languages) {
                languages = [];
            }
    
            const docFiles = (req.files && req.files.documents) ? req.files.documents : [];
            const photoFile = (req.files && req.files.photo && req.files.photo[0]) ? req.files.photo[0] : null;
    
            const trimmedName = String(name || '').trim();
            const trimmedSpec = String(specialization || '').trim();
            const trimmedLicense = String(license || '').trim();
            const trimmedLocation = String(location || '').trim();
            const trimmedTime = String(availableTime || '').trim();
            const trimmedBio = String(bio || '').trim();
            const trimmedEmail = String(email || '').trim().toLowerCase();
            const feeNum = parseFloat(fee);
            const expNum = parseInt(experience, 10);
    
            const missing = [];
            if (!trimmedName) missing.push('full name');
            if (!trimmedSpec) missing.push('specialization');
            if (!trimmedLicense) missing.push('doctor license ID');
            if (!trimmedLocation) missing.push('location');
            if (!trimmedTime || trimmedTime.includes('Select a time')) missing.push('consultation time slot');
            if (!languages.length) missing.push('at least one language');
            if (!docFiles.length) missing.push('at least one document (PDF/JPG/PNG)');
            if (!photoFile) missing.push('profile photo');
            if (!trimmedBio) missing.push('bio');
            if (Number.isNaN(feeNum) || feeNum < 0) missing.push('valid consultation fee');
            if (Number.isNaN(expNum) || expNum < 0) missing.push('years of experience');
            if (!trimmedEmail) missing.push('email');
            if (!password) missing.push('password');
    
            const paymentCheck = validatePaymentDetailsInput(req.body);
            if (!paymentCheck.ok) {
                return res.status(400).json({ message: paymentCheck.error });
            }
    
            if (missing.length) {
                return res.status(400).json({
                    message: `Please complete: ${missing.join(', ')}.`
                });
            }
            if (password.length < 6) {
                return res.status(400).json({ message: 'Password must be at least 6 characters.' });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                return res.status(400).json({ message: 'Valid email is required for app sync.' });
            }
    
            const licenseTaken = await Doctor.findOne({ license: trimmedLicense })
                || await Doctor.findOne({ doctorId: trimmedLicense });
            if (licenseTaken) {
                return res.status(409).json({ message: 'Doctor with this license already exists.' });
            }
    
            let uid;
            let authEmail = trimmedEmail;
    
            try {
                uid = await ensureDoctorAuthAccount({
                    email: trimmedEmail,
                    password,
                    name: trimmedName
                });
                await initFirebase();
                // Doctors live in `doctors` only — no `users` stub (avoids app role conflicts).
            } catch (authErr) {
                if (authErr.status) {
                    return res.status(authErr.status).json({ message: authErr.message });
                }
                const code = authErr.code || '';
                if (code === 'auth/weak-password') {
                    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
                }
                if (code === 'auth/invalid-email') {
                    return res.status(400).json({ message: 'Invalid email address.' });
                }
                throw authErr;
            }
    
            const storagePrefix = `Doctor/${uid}`;
            const docUploads = await Promise.all(
                docFiles.map((file, i) => uploadToFirebase(file, `${storagePrefix}/doc_${i}`))
            );
            const documents = docUploads.map((u) => u.downloadUrl);
    
            let photoUp;
            try {
                photoUp = await uploadFile(photoFile.buffer, `${storagePrefix}/profile.jpg`, {
                    contentType: photoFile.mimetype
                });
            } catch (uploadErr) {
                console.warn('Fixed-path profile upload failed, using fallback:', uploadErr.message);
                photoUp = await uploadToFirebase(photoFile, `${storagePrefix}/profile`);
            }
            const photo = photoUp.downloadUrl;
            const videoRoomId = generateVideoRoomId();
    
            const paymentPatchResult = buildPaymentDetailsPatch(req.body, null);
            if (!paymentPatchResult.ok) {
                return res.status(400).json({ message: paymentPatchResult.error });
            }
    
            const doctorPayload = {
                name: trimmedName,
                specialization: trimmedSpec,
                specializations: [trimmedSpec],
                license: trimmedLicense,
                doctorId: trimmedLicense,
                location: trimmedLocation,
                availableTime: trimmedTime,
                slotTime: trimmedTime,
                documents,
                photo,
                profileUrl: photo,
                aadharUrl: documents[0] || '',
                degreeCertificateUrl: documents[1] || '',
                degree: String(degree || '').trim() || trimmedSpec,
                email: authEmail,
                fee: feeNum,
                consultationFee: feeNum,
                approvedConsultationFee: feeNum,
                bio: trimmedBio,
                about: trimmedBio,
                experience: expNum,
                languages,
                language: languages,
                videoRoomId,
                uid,
                role: 'Doctor',
                ...paymentPatchResult.patch,
                ...require('../../modules/doctors/doctorFields').buildApprovalFirestorePatch('pending'),
                ...require('../../modules/doctors/doctorFields').buildWorkingFirestorePatch('offline'),
                workingHours: parseAvailableTimeToWorkingHours(trimmedTime),
                workingDays: workingDaysToAppFormat(DEFAULT_WORKING_DAYS_INT)
            };
    
            const doctor = new Doctor(doctorPayload);
    
            await doctor.save();
            await mirrorDoctorToAuthUid(doctor);
            const auth = await signInWithPassword(trimmedEmail, password);
            const verificationSent = await safeSendEmailVerification(auth, req, 'doctor');
    
            res.status(201).json({
                message: verificationSent
                    ? 'Doctor registration submitted successfully. A verification link has been sent to your email. Pending admin approval.'
                    : 'Doctor registration submitted successfully. Pending admin approval.',
                requiresEmailVerification: verificationSent,
                doctorId: doctor._id,
                videoRoomId: doctor.videoRoomId
            });
        } catch (err) {
            console.error('❌ Error registering doctor:', err);
            if (err.code === 11000) {
                return res.status(409).json({ message: 'Doctor with this license already exists.' });
            }
            res.status(500).json({
                message: err.message || 'Failed to register doctor. Please try again.',
                error: err.message
            });
        }
    });
    
    app.get('/api/doctor/profile', requireDoctorSession(), async (req, res) => {
        try {
            const id = req.doctor._id || req.doctor.id;
            let fresh = id ? await Doctor.findById(id) : req.doctor;
            if (!fresh) {
                return res.status(404).json({ message: 'Doctor profile not found.' });
            }
            fresh = (await reconcileDoctorFeeAndPersist(fresh)) || fresh;
            const rows = await enrichDoctorPhotos([enrichDoctorRow(fresh)]);
            return res.json({ doctor: rows[0] || enrichDoctorRow(fresh) });
        } catch (err) {
            console.error('GET /api/doctor/profile failed:', err);
            return res.status(500).json({ message: 'Failed to load profile.', error: err.message });
        }
    });
    
    app.put(
        '/api/doctor/profile',
        requireDoctorSession(),
        upload.fields([
            { name: 'documents', maxCount: 5 },
            { name: 'photo', maxCount: 1 }
        ]),
        async (req, res) => {
            try {
                const id = req.doctor._id || req.doctor.id;
                let doctor = id ? await Doctor.findById(id) : req.doctor;
                if (!doctor) {
                    return res.status(404).json({ message: 'Doctor profile not found.' });
                }
    
                const profile = parseDoctorSelfServiceProfile(req.body);
                const feeCheck = parseConsultationFeeInput(req.body);
                if (!feeCheck.ok) {
                    return res.status(400).json({ message: feeCheck.error });
                }
                const trimmedTime = String(profile.availableTime || profile.slotTime || '').trim();
                if (trimmedTime && !trimmedTime.includes('Select a time')) {
                    profile.availableTime = trimmedTime;
                    profile.slotTime = trimmedTime;
                    profile.workingHours = parseAvailableTimeToWorkingHours(trimmedTime);
                }
    
                if (profile.specialization) {
                    profile.specializations = [String(profile.specialization).trim()];
                }
    
                const paymentBody = mergePaymentBodyWithExisting(req.body, doctor);
                const paymentPatchResult = buildPaymentDetailsPatch(paymentBody, doctor);
                if (!paymentPatchResult.ok) {
                    return res.status(400).json({ message: paymentPatchResult.error });
                }
    
                const docFiles = (req.files && req.files.documents) ? req.files.documents : [];
                const photoFile = (req.files && req.files.photo && req.files.photo[0]) ? req.files.photo[0] : null;
                const uid = String(doctor.uid || req.firebaseUid || id || '').trim();
                const storagePrefix = uid ? `Doctor/${uid}` : `Doctor/${id}`;
    
                if (docFiles.length) {
                    const docUploads = await Promise.all(
                        docFiles.map((file, i) => uploadToFirebase(file, `${storagePrefix}/doc_${Date.now()}_${i}`))
                    );
                    const newDocs = docUploads.map((u) => u.downloadUrl);
                    const existing = Array.isArray(doctor.documents) ? doctor.documents : [];
                    profile.documents = [...existing, ...newDocs];
                }
    
                if (photoFile) {
                    let photoUp;
                    try {
                        photoUp = await uploadFile(photoFile.buffer, `${storagePrefix}/profile.jpg`, {
                            contentType: photoFile.mimetype
                        });
                    } catch (uploadErr) {
                        console.warn('Profile photo upload fallback:', uploadErr.message);
                        photoUp = await uploadToFirebase(photoFile, `${storagePrefix}/profile`);
                    }
                    profile.photo = photoUp.downloadUrl;
                    profile.profileUrl = photoUp.downloadUrl;
                }
    
                const updates = {
                    ...profile,
                    ...paymentPatchResult.patch,
                    updatedAt: new Date()
                };
    
                let feeMessage = '';
                if (!feeCheck.skipped && feeCheck.fee !== getActiveConsultationFee(doctor)) {
                    const pendingFee = buildPendingFeeRequestPatch(doctor, feeCheck.fee);
                    if (!pendingFee.ok) {
                        return res.status(400).json({ message: pendingFee.error });
                    }
                    Object.assign(updates, pendingFee.patch);
                    feeMessage = ' Fee change submitted for admin approval.';
                }
    
                doctor = await syncDoctorRecordsUpdate(doctor, updates);
                if (!doctor) {
                    return res.status(404).json({ message: 'Doctor profile not found.' });
                }
    
                const rows = await enrichDoctorPhotos([enrichDoctorRow(doctor)]);
                return res.json({
                    message: 'Profile updated successfully.' + feeMessage,
                    doctor: rows[0] || enrichDoctorRow(doctor)
                });
            } catch (err) {
                console.error('PUT /api/doctor/profile failed:', err);
                return res.status(500).json({ message: 'Failed to update profile.', error: err.message });
            }
        }
    );
    
    app.put('/api/doctor/consultation-fee', requireDoctorSession(), async (req, res) => {
        try {
            const feeCheck = parseConsultationFeeInput(req.body);
            if (!feeCheck.ok) {
                return res.status(400).json({ message: feeCheck.error });
            }
            if (feeCheck.skipped) {
                return res.status(400).json({ message: 'Consultation fee is required.' });
            }
    
            let doctor = req.doctor;
            const id = doctor?._id || doctor?.id;
            if (id) {
                doctor = (await Doctor.findById(id)) || doctor;
            }
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor profile not found.' });
            }
    
            const pendingFee = buildPendingFeeRequestPatch(doctor, feeCheck.fee);
            if (!pendingFee.ok) {
                return res.status(400).json({ message: pendingFee.error });
            }
    
            doctor = await syncDoctorRecordsUpdate(doctor, pendingFee.patch);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor profile not found.' });
            }
    
            const rows = await enrichDoctorPhotos([enrichDoctorRow(doctor)]);
            const enriched = rows[0] || enrichDoctorRow(doctor);
            return res.json({
                message: 'Fee change submitted for admin approval. Your current fee stays active until approved.',
                pending: true,
                fee: enriched.fee,
                consultationFee: enriched.consultationFee,
                pendingConsultationFee: enriched.pendingConsultationFee,
                doctor: enriched
            });
        } catch (err) {
            console.error('PUT /api/doctor/consultation-fee failed:', err);
            return res.status(500).json({ message: 'Failed to update consultation fee.', error: err.message });
        }
    });
    
    app.get('/api/media/doctor-photo/:uid', async (req, res) => {
        try {
            const uid = String(req.params.uid || '').trim();
            if (!uid) return res.status(400).end();
            const hint = typeof req.query.url === 'string' ? req.query.url : '';
            const result = await streamDoctorPhoto(uid, hint);
            if (result) {
                res.setHeader('Content-Type', result.contentType || 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                result.stream.on('error', () => {
                    if (!res.headersSent) res.status(500).end();
                });
                return result.stream.pipe(res);
            }
            if (hint.startsWith('/uploads/') || hint.startsWith('uploads/')) {
                return res.redirect(hint.startsWith('/') ? hint : '/' + hint);
            }
            if (/^https?:\/\//i.test(hint)) {
                return res.redirect(hint);
            }
            return res.status(404).end();
        } catch (err) {
            console.error('doctor-photo stream failed:', err.message);
            if (!res.headersSent) res.status(500).end();
        }
    });
    
    app.get('/api/doctors', async (req, res) => {
        try {
            const { bookableOnly } = req.query;
            const doctors = await listDoctors({ _webRegstatus: 'approved', _publicOnly: true }).sort({ name: 1 });
            let result = await enrichDoctorRowsWithAppSync(doctors);
    
            if (bookableOnly === '1' || bookableOnly === 'true') {
                result = result.filter((d) => d.bookable);
            }
    
            result.sort((a, b) => {
                if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
                return (a.name || '').localeCompare(b.name || '');
            });
    
            res.status(200).json(result);
        } catch (err) {
            console.error('❌ Error fetching doctors:', err);
            res.status(500).json({ message: 'Failed to fetch doctors', error: err.message });
        }
    });
    
    app.post('/api/doctor-login', async (req, res) => {
        const { idToken } = req.body;
    
        if (!idToken) {
            return res.status(400).json({ message: 'Firebase idToken is required. Use email and password to sign in.' });
        }
    
        try {
            const decoded = await verifyIdToken(idToken);
            const doctor = await findDoctorByUid(decoded.uid);
            if (!doctor) {
                return res.status(404).json({ message: 'Doctor profile not found for this account.' });
            }
            if (!isDoctorApproved(doctor)) {
                return res.status(403).json({ message: 'Your registration is pending approval. Please contact admin.' });
            }
            const loginPresence = getDoctorPresenceStatus(doctor);
            if (loginPresence !== 'Busy') {
                await updateDoctorPresence(doctor, 'Available');
            }
            return res.status(200).json({
                message: 'Login successful!',
                doctor: {
                    name: doctor.name,
                    specialization: doctor.specialization || doctor.specializations?.[0],
                    license: doctor.license || doctor.doctorId,
                    doctorId: doctor.doctorId || doctor.license,
                    uid: doctor.uid,
                    status: 'Available'
                }
            });
        } catch (error) {
            console.error('❌ Firebase doctor login error:', error);
            return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
        }
    });
    
    app.get('/api/doctors/:doctorName/consultation-history', requireDoctorNameAccess('doctorName'), async (req, res) => {
        try {
            const { doctorName } = req.params;
            if (!doctorName) {
                return res.status(400).json({ message: 'Doctor name is required.' });
            }
            const history = await listConsultationHistoryForDoctor(doctorName);
            res.status(200).json(history);
        } catch (err) {
            console.error('❌ Error fetching consultation history:', err);
            res.status(500).json({ message: 'Failed to fetch consultation history.', error: err.message });
        }
    });
    
    app.get('/api/doctors/roomId/:doctorName', async (req, res) => {
      const doctorName = req.params.doctorName;
    
      try {
        const doctor = await findDoctorByName(doctorName);
    
        if (!doctor) {
          return res.status(404).json({ message: 'Doctor not found' });
        }
    
        const roomId = doctor.videoRoomId || generateVideoRoomId();
        return res.json({ videoRoomId: roomId, channel: roomId });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.get('/api/doctors/status/:doctorName', async (req, res) => {
      const doctorName = decodeURIComponent(req.params.doctorName || '').trim();
    
      try {
        await clearStaleDoctorConsultations(doctorName);
        const doctor = await findDoctorByName(doctorName);
        if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
        const payload = await buildStatusPayload(doctor);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.json({
          working: payload.working,
          status: payload.dbStatus,
          effectiveStatus: payload.effectiveStatus,
          scheduleStatus: payload.scheduleStatus,
          bookable: payload.bookable,
          dbStatus: payload.dbStatus,
          lastSeenAt: payload.lastSeenAt
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.post('/api/doctors/heartbeat', async (req, res) => {
      const { doctorName } = req.body;
      if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });
      try {
        const doctor = await findDoctorByName(doctorName);
        if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
        const updated = await syncDoctorRecordsUpdate(doctor, {
          lastSeenAt: new Date(),
          updatedAt: new Date()
        });
        const payload = await buildStatusPayload(updated || doctor);
        return res.json({ ok: true, ...payload });
      } catch (err) {
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.post('/api/doctors/updateStatus', requireDoctorNameAccess(), async (req, res) => {
      const { status } = req.body;
      const doctorName = String(req.body?.doctorName || req.doctor?.name || '').trim();
    
      if (!doctorName || !status) {
        return res.status(400).json({ message: 'doctorName and status are required' });
      }
    
      const normalized = normalizeDbStatus(status);
      if (!['Available', 'Busy', 'Offline'].includes(normalized)) {
        return res.status(400).json({ message: 'Invalid status value. Use Available, Busy, or Offline.' });
      }
    
      try {
        const doctor = req.doctor || (await findDoctorByName(doctorName));
        if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
        const currentPresence = getDoctorPresenceStatus(doctor);
        if (normalized === 'Offline' && currentPresence === 'Busy') {
          const live = await hasLiveActiveConsultation(doctor.name || doctorName);
          if (!live) {
            await clearStaleDoctorConsultations(doctor.name || doctorName);
          } else {
            return res.status(409).json({
                message: 'Cannot go offline while in a consultation. End the video call first.'
            });
          }
        }
    
        await updateDoctorPresence(doctor, normalized);
    
        const canonicalName = String(doctor.name || doctorName).trim();
        const refreshed = (await findDoctorByName(canonicalName)) || doctor;
        await syncDoctorRecordsUpdate(refreshed, { lastSeenAt: new Date(), updatedAt: new Date() });
    
        const payload = await buildStatusPayload(refreshed || doctor);
        emitDoctorStatus(canonicalName, payload);
    
        const working = normalized.toLowerCase();
        return res.json({
          message: 'Status updated',
          doctorName: canonicalName,
          working,
          presenceStatus: working,
          effectiveStatus: payload.effectiveStatus,
          scheduleStatus: payload.scheduleStatus,
          bookable: payload.bookable,
          dbStatus: payload.dbStatus
        });
      } catch (err) {
        console.error('updateStatus error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
    });
    
    app.post('/api/doctors/:doctorName/end-active-calls', requireDoctorNameAccess('doctorName'), async (req, res) => {
      try {
        const doctorName = decodeURIComponent(req.params.doctorName || '').trim();
        if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });
    
        const exceptRoomId = String(req.body?.exceptRoomId || req.query?.exceptRoomId || '').trim();
        await clearStaleDoctorConsultations(doctorName, { exceptRoomId });
    
        const ACTIVE_STATUSES = ['accepted', 'in_call', 'ringing', 'waiting'];
        const all = await ConsultationRequest.find({ doctorName }).exec();
        const active = (Array.isArray(all) ? all : []).filter((c) => {
          if (!ACTIVE_STATUSES.includes(normalizeConsultationStatus(c, null))) return false;
          const room = c.roomId || c.videoRoomId;
          if (exceptRoomId && room && String(room) === exceptRoomId) return false;
          return true;
        });
    
        const roomIds = [];
        for (const c of active) {
          const room = c.roomId || c.videoRoomId;
          if (room) {
            await markConsultationCompleted(room);
            roomIds.push(String(room));
          } else {
            const id = c._id || c.id;
            if (id) {
              await ConsultationRequest.findByIdAndUpdate(id, {
                $set: buildConsultationStatusFields('completed', id)
              });
              if (c.paymentId) {
                await syncPaymentForConsultationStatus(c.paymentId, 'completed', id);
              }
              await syncActiveCallForStatus(id, 'completed');
            }
          }
        }
    
        const doctor = await findDoctorByName(doctorName);
    
        try {
          const doctorUid = String(doctor?.uid || doctor?._id || doctor?.id || req.doctor?.uid || '');
          if (doctorUid) {
            const db = getFirestore();
            const activeCalls = await db.collection('active_calls').where('doctorId', '==', doctorUid).get();
            const batch = db.batch();
            activeCalls.forEach((doc) => {
              const data = doc.data() || {};
              const callRoom = String(data.callRoomId || '');
              if (!exceptRoomId || callRoom !== exceptRoomId) {
                batch.delete(doc.ref);
              }
            });
            await batch.commit();
          }
        } catch (activeErr) {
          console.warn('active_calls cleanup:', activeErr.message);
        }
        if (doctor) {
          await updateDoctorPresence(doctor, 'Available');
          const payload = await buildStatusPayload(doctor);
          if (payload) emitDoctorStatus(doctorName, payload);
        }
    
        return res.json({
          ok: true,
          ended: active.length,
          roomIds,
          message:
            active.length > 0
              ? `Ended ${active.length} active consultation(s). You can join a new call.`
              : 'No active video consultations were running.'
        });
      } catch (err) {
        console.error('end-active-calls error:', err);
        return res.status(500).json({ message: 'Could not end active calls.' });
      }
    });
    
    app.get('/api/doctors/:doctorName/ringing-consultations', async (req, res) => {
      try {
        const doctorName = decodeURIComponent(req.params.doctorName || '').trim();
        if (!doctorName) return res.status(400).json({ message: 'doctorName is required' });
        const all = await ConsultationRequest.find({ doctorName }).exec();
        const list = (Array.isArray(all) ? all : [])
          .filter((c) => RINGING_STATUSES.includes(normalizeConsultationStatus(c, null)))
          .map((c) => formatConsultationResponse(c));
        return res.json(list);
      } catch (err) {
        console.error('ringing-consultations error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.get('/api/doctors/all-approved', async (req, res) => {
        try {
            const doctors = await listDoctors({ role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true });
            const enriched = await enrichDoctorRowsWithAppSync(doctors);
            res.status(200).json(enriched);
        } catch (err) {
            console.error('❌ Error fetching all approved doctors:', err);
            res.status(500).json({ message: 'Failed to fetch doctors', error: err.message });
        }
    });
    
    app.get('/api/doctors/locations', async (req, res) => {
        console.log('📍 Location API called');
        try {
            const locations = await Doctor.distinct('location', { role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true });
            console.log('📍 Found locations:', locations);
            const filteredLocations = locations.filter(location => location && location.trim() !== '');
            console.log('📍 Filtered locations:', filteredLocations);
            res.status(200).json(filteredLocations);
        } catch (err) {
            console.error('❌ Error fetching locations:', err);
            res.status(500).json({ message: 'Failed to fetch locations', error: err.message });
        }
    });
    
    app.get('/api/doctors/languages', async (req, res) => {
        console.log('🗣️ Languages API called');
        try {
            const doctors = await listDoctors({ _webRegstatus: 'approved', _publicOnly: true });
            const allLanguages = doctors.reduce((acc, doctor) => {
                if (Array.isArray(doctor.languages)) {
                    doctor.languages.forEach((lang) => {
                        if (lang && String(lang).trim()) acc.push(String(lang).trim());
                    });
                }
                const legacy = doctor.language;
                if (Array.isArray(legacy)) {
                    legacy.forEach((lang) => {
                        if (lang && String(lang).trim()) acc.push(String(lang).trim());
                    });
                } else if (legacy && String(legacy).trim()) {
                    String(legacy).split(/[,|/]+/).forEach((part) => {
                        const t = part.trim();
                        if (t) acc.push(t);
                    });
                }
                return acc;
            }, []);
    
            const uniqueLanguages = [...new Set(allLanguages.map((l) => l.replace(/\s+/g, ' ')))].sort((a, b) =>
                a.localeCompare(b)
            );
            console.log('🗣️ Unique languages:', uniqueLanguages);
            res.status(200).json(uniqueLanguages);
        } catch (err) {
            console.error('❌ Error fetching languages:', err);
            res.status(500).json({ message: 'Failed to fetch languages', error: err.message });
        }
    });
    
    app.get('/api/doctors/filtered', async (req, res) => {
        try {
            const { locations, languages } = req.query;
    
            console.log('🔍 Filter request received:');
            console.log('📍 Locations:', locations);
            console.log('🗣️ Languages:', languages);
    
            const parseFilterList = (value) => {
                if (!value || value === '') return [];
                const delimiter = String(value).includes('|') ? '|' : ',';
                return String(value)
                    .split(delimiter)
                    .map((item) => decodeURIComponent(item.trim()))
                    .filter(Boolean);
            };
    
            const andConditions = [{ role: 'Doctor', _webRegstatus: 'approved', _publicOnly: true }];
    
            const locationArray = parseFilterList(locations);
            if (locationArray.length) {
                const locationConditions = locationArray.map((loc) => {
                    const normalized = loc.replace(/\s*,\s*/g, ', ').trim();
                    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return { location: { $regex: escaped, $options: 'i' } };
                });
                andConditions.push({ $or: locationConditions });
            }
    
            const languageArray = parseFilterList(languages);
            if (languageArray.length) {
                andConditions.push({
                    $or: languageArray.map((lang) => {
                        const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const pattern = new RegExp(escaped, 'i');
                        return {
                            $or: [
                                { languages: pattern },
                                { language: pattern }
                            ]
                        };
                    })
                });
            }
    
            const filterQuery = andConditions.length === 1
                ? andConditions[0]
                : { $and: andConditions };
    
            console.log('🔍 Final filter query:', JSON.stringify(filterQuery, null, 2));
    
            const doctors = await listDoctors(filterQuery);
            console.log('👨‍⚕️ Found doctors:', doctors.length);
    
            const enrichedFiltered = await enrichDoctorRows(doctors);
    
            enrichedFiltered.sort((a, b) => {
                if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
                return (a.name || '').localeCompare(b.name || '');
            });
    
            console.log(`✅ Final result: ${enrichedFiltered.length} doctors`);
            res.status(200).json(enrichedFiltered);
        } catch (err) {
            console.error('❌ Error fetching filtered doctors:', err);
            res.status(500).json({ message: 'Failed to fetch filtered doctors', error: err.message });
        }
    });
  }
};

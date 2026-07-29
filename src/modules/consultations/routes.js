/**
 * Domain routes: consultations
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/consultations/access-check', requireFirebaseAuth(), async (req, res) => {
        try {
            const doctorName = String(req.query.doctorName || '').trim();
            if (!doctorName) {
                return res.status(400).json({ message: 'doctorName is required.' });
            }
            const phone = req.query.phone || req.body?.phone || '';
            const access = await findActiveAccess({
                patientUid: req.firebaseUid,
                patientPhone: phone,
                doctorName
            });
            const remaining = access?.freeConsultationsRemaining ?? 0;
            const planActive = !!access;
            return res.json({
                covered: planActive && remaining > 0,
                planActive,
                freeConsultationsRemaining: remaining,
                freeConsultationsLimit: access?.freeConsultationsLimit ?? FREE_FOLLOWUP_LIMIT,
                freeConsultationsUsed: access?.freeConsultationsUsed ?? 0,
                doctorName,
                daysRemaining: access?.daysRemaining || 0,
                expiresAt: access?.expiresAt || null,
                message: !planActive
                    ? 'Consultation fee applies for this doctor.'
                    : remaining > 0
                        ? `${remaining} of ${access.freeConsultationsLimit} free follow-up call(s) left with ${doctorName} (${access.daysRemaining} day(s) remaining).`
                        : `You have used all ${FREE_FOLLOWUP_LIMIT} free follow-ups for this 15-day plan. Please pay for a new consultation.`
            });
        } catch (err) {
            console.error('Access check error:', err);
            return res.status(500).json({ message: 'Could not check consultation access.' });
        }
    });
    
    app.post(
        '/api/consultations/start-followup',
        upload.fields([{ name: 'reports', maxCount: 5 }]),
        requireFirebaseAuth(),
        async (req, res) => {
            try {
                const { name, phone, address, selectedDoctorName, doctorAvailableTime, patientSymptoms } = req.body;
                if (!name || !phone || !address || !selectedDoctorName) {
                    return res.status(400).json({ message: 'Patient details and doctor name are required.' });
                }
                const doctor = await findDoctorByName(selectedDoctorName);
                if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
                const fee = parseFloat(String(doctor.consultationFee ?? doctor.fee ?? '').replace(/[^\d.]/g, '')) || 0;
                const access = await findActiveAccess({
                    patientUid: req.firebaseUid,
                    patientPhone: phone,
                    doctorName: selectedDoctorName
                });
                if (!access && fee > 0) {
                    return res.status(402).json({
                        message: 'No active 15-day plan for this doctor. Please pay the consultation fee first.',
                        requiresPayment: true
                    });
                }
                if (access && !canUseFreeFollowUp(access)) {
                    return res.status(402).json({
                        message: `You have used all ${FREE_FOLLOWUP_LIMIT} free follow-up consultations for this 15-day plan. Please pay for a new consultation.`,
                        requiresPayment: true,
                        freeConsultationsExhausted: true
                    });
                }
                const result = await completeWebsiteConsultationCheckout({
                    firebaseUid: req.firebaseUid,
                    name,
                    phone,
                    address,
                    selectedDoctorName,
                    selectedDoctorFee: String(fee),
                    amountNum: 0,
                    doctorAvailableTime,
                    patientSymptoms,
                    reportFiles: req.files?.reports || []
                });
                return res.status(201).json({
                    message: 'Free follow-up consultation started. Waiting for doctor to accept.',
                    payment: result.savedPayment,
                    consultation: result.consultation,
                    videoRoomId: result.videoRoomId,
                    roomId: result.videoRoomId,
                    isFollowUp: true
                });
            } catch (err) {
                console.error('Start follow-up error:', err);
                return res.status(err.status || 500).json({ message: err.message || 'Could not start follow-up call.' });
            }
        }
    );
    
    app.post('/api/upload-report', upload.array('reports', 5), async (req, res) => {
        try {
            const { room } = req.body;
            const files = req.files;
            if (!room || !files || !files.length) {
                return res.status(400).json({ message: 'Room and files are required' });
            }
            const payment = await Payment.findOne({ roomName: room });
            if (!payment) {
                return res.status(404).json({ message: 'Room not found' });
            }
            const patientPhone = payment.phone || payment.patientPhone;
            const folder = `medical_reports/${patientPhone}/consultation`;
            const uploads = await Promise.all(files.map((file) => uploadToFirebase(file, folder)));
            const urls = uploads.map((u) => u.downloadUrl);
    
            for (const up of uploads) {
              await saveDocumentRecord({
                Document,
                fileName: up.fileName,
                downloadUrl: up.downloadUrl,
                patientId: patientPhone,
                userId: patientPhone,
                appointmentId: room,
                category: 'medical_report',
                uploadedByRole: 'patient'
              });
            }
    
            const customer = await findCustomerByPhone(patientPhone);
            if (customer) {
                const mergedReports = (customer.reports || []).concat(urls);
                await User.findByIdAndUpdate(customer._id || customer.id, { $set: { reports: mergedReports } });
            }
    
            await Payment.findByIdAndUpdate(payment._id || payment.id, {
                $set: { reports: (payment.reports || []).concat(urls) }
            });
    
            res.json({ success: true, message: 'Reports uploaded successfully', urls });
        } catch (err) {
            console.error('❌ Error uploading reports:', err);
            res.status(500).json({ message: 'Failed to upload reports', error: err.message });
        }
    });
    
    app.get('/videocall', (req, res) => {
        const qs = new URLSearchParams();
        if (req.query.roomID) qs.set('roomID', String(req.query.roomID));
        if (req.query.role) qs.set('role', String(req.query.role));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        res.redirect(302, `/video-call.html${suffix}`);
    });
    
    app.get('/api/getReports', async (req, res) => {
      try {
        const roomId = req.query.roomId;
        if (!roomId) return res.status(400).json({ error: 'roomId missing' });
    
        const payment = await Payment.findOne({ roomName: roomId }).sort({ createdAt: -1 });
        if (!payment) {
          return res.status(404).json({ error: 'No consultation found for this room' });
        }
    
        const reportPaths = (payment.reports?.length ? payment.reports : []).map((report) => {
          const reportStr = String(report || '');
          return /^https?:\/\//i.test(reportStr) ? reportStr : reportStr;
        });
    
        if (!reportPaths.length) {
          return res.status(404).json({ error: 'No reports uploaded for this consultation' });
        }
    
        res.json({
          reports: reportPaths,
          patientName: payment.name,
          doctorName: payment.selectedDoctorName
        });
      } catch (err) {
        console.error('Error in /api/getReports:', err);
        res.status(500).json({ error: 'Server error' });
      }
    });
    
    app.get('/api/reports/:roomId', async (req, res) => {
        try {
          const { roomId } = req.params;
          console.log('🔍 Fetching reports for room:', roomId);
    
          const payment = await Payment.findOne({ roomName: roomId }).sort({ createdAt: -1 });
          let consultation = await findConsultationByAppointmentRoom(roomId);
          if (!payment && !consultation) {
            consultation = await ConsultationRequest.findOne({
              $or: [{ roomId }, { videoRoomId: roomId }]
            }).sort({ createdAt: -1 });
          }
          if (!payment && !consultation) {
            return res.status(404).json({ message: 'No consultation found for this room' });
          }

          const appointmentId = parseAppointmentIdFromRoom(roomId)
            || payment?.appointmentId
            || payment?.consultationId
            || consultation?._id
            || consultation?.id
            || '';
          let appointment = consultation;
          if (!appointment && appointmentId) {
            appointment = await ConsultationRequest.findById(appointmentId);
          }
    
          const patientPhone =
            payment?.phone
            || payment?.patientPhone
            || consultation?.patientPhone
            || consultation?.phone
            || appointment?.patientPhone
            || appointment?.phone
            || '';
          const patientName =
            payment?.name
            || payment?.patientName
            || consultation?.patientName
            || consultation?.userName
            || appointment?.patientName
            || appointment?.userName
            || appointment?.name
            || '';
          const rawConsultationReports = Array.isArray(payment?.reports) ? payment.reports : [];
          const consultationReports = await resolveReportEntries(
            rawConsultationReports,
            payment?.createdAt || consultation?.createdAt || appointment?.createdAt
          );
    
          let previousReports = [];
          if (patientPhone) {
            const customer = await findCustomerByPhone(patientPhone);
            if (customer && Array.isArray(customer.reports) && customer.reports.length) {
              const currentSet = new Set(rawConsultationReports.map((r) => String(r || '').trim()));
              const previousRaw = customer.reports.filter((r) => !currentSet.has(String(r || '').trim()));
              previousReports = await resolveReportEntries(previousRaw, customer.createdAt);
            }
          }
    
          const reports = consultationReports.concat(previousReports);
    
          let prescribedItems = [];
          try {
            const prescribedCart = await PrescribedCart.findOne({ roomId }).sort({ prescribedAt: -1 });
            if (prescribedCart?.cartItems) {
              prescribedItems = prescribedCart.cartItems;
            }
          } catch (cartErr) {
            console.warn('Could not load prescribed cart for reports:', cartErr.message);
          }
    
          res.json({
            reports,
            consultationReports,
            previousReports,
            prescribedItems,
            patientInfo: {
              name: patientName,
              phone: patientPhone,
              address: payment?.address || appointment?.address || '',
              doctor: payment?.selectedDoctorName || consultation?.doctorName || appointment?.doctorName || '',
              doctorFee: payment?.selectedDoctorFee,
              amountPaid: payment?.amount,
              registrationDate: payment?.createdAt || consultation?.createdAt || appointment?.createdAt
            },
            paymentInfo: payment ? {
              name: payment.name || payment.patientName || patientName,
              phone: payment.phone || payment.patientPhone || patientPhone,
              address: payment.address,
              total: payment.amount,
              createdAt: payment.createdAt
            } : null
          });
    
        } catch (err) {
          console.error('❌ Error fetching reports:', err);
          res.status(500).json({
            message: 'Failed to fetch reports',
            error: err.message
          });
        }
      });
    
    app.get('/api/video-call/diagnosis-history/:roomId', requireDoctorSession(), async (req, res) => {
      try {
        const { roomId } = req.params;
        if (!roomId) {
          return res.status(400).json({ message: 'Room ID is required.' });
        }
        if (!(await prescriptionVideoRoomExists(roomId))) {
          return res.status(403).json({ message: 'Invalid or unknown video room.' });
        }
    
        const result = await getPatientDiagnosisHistoryForDoctor(roomId, req.doctor.name);
        if (result.error === 'not_found') {
          return res.status(404).json({ message: result.message });
        }
        if (result.error === 'forbidden') {
          return res.status(403).json({ message: result.message });
        }
    
        return res.json(result);
      } catch (err) {
        console.error('Diagnosis history error:', err);
        return res.status(500).json({ message: 'Failed to load diagnosis history.', error: err.message });
      }
    });
    
    app.post('/api/video-call/consultation-notes', requireDoctorSession(), async (req, res) => {
      try {
        const { roomId, patientSymptoms, doctorDiagnosis, consultationNotes } = req.body || {};
        if (!roomId) {
          return res.status(400).json({ message: 'Room ID is required.' });
        }
        if (!(await prescriptionVideoRoomExists(roomId))) {
          return res.status(403).json({ message: 'Invalid or unknown video room.' });
        }
    
        const result = await saveConsultationClinicalNotes(roomId, req.doctor.name, {
          patientSymptoms,
          doctorDiagnosis,
          consultationNotes
        });
    
        if (result.error === 'not_found') {
          return res.status(404).json({ message: result.message });
        }
        if (result.error === 'forbidden') {
          return res.status(403).json({ message: result.message });
        }
        if (result.error === 'bad_request') {
          return res.status(400).json({ message: result.message });
        }
    
        return res.json({
          message: 'Clinical notes saved.',
          patientSymptoms: result.patientSymptoms,
          doctorDiagnosis: result.doctorDiagnosis,
          consultationNotes: result.consultationNotes
        });
      } catch (err) {
        console.error('Save consultation notes error:', err);
        return res.status(500).json({ message: 'Failed to save clinical notes.', error: err.message });
      }
    });
    
    app.get('/api/video-room/:roomId/access', async (req, res) => {
        try {
            const role = req.query.role || 'patient';
            const access = await validateVideoRoomAccess(req.params.roomId, role);
            if (!access.ok) {
                const deniedStatus = access.payment || access.consultation
                    ? consultationStatusOf(access.consultation, access.payment)
                    : '';
                const payload = {
                    canJoin: false,
                    message: access.message,
                    consultationStatus: deniedStatus
                };
                if (access.payment) {
                    payload.refundStatus = access.payment.refundStatus || '';
                    payload.refunded = access.payment.refundStatus === 'processed';
                }
                return res.status(access.status || 403).json(payload);
            }
            return res.json({
                canJoin: true,
                consultationStatus: access.status || '',
                roomId: access.room
            });
        } catch (err) {
            console.error('Video room access check error:', err);
            return res.status(500).json({ canJoin: false, message: 'Could not verify room access.' });
        }
    });
    
    app.post('/api/video-room/:roomId/call-ended', async (req, res) => {
        try {
            const official = req.body?.official !== false;
            if (!official) {
                await markCallDisconnected(req.params.roomId, {
                    role: req.body?.role || '',
                    accidental: true
                });
                return res.json({ ok: true, grace: true });
            }
            await markConsultationCompleted(req.params.roomId);
            return res.json({ ok: true, completed: true });
        } catch (err) {
            console.error('Call ended error:', err);
            return res.status(500).json({ message: 'Could not update consultation status.' });
        }
    });
    
    app.get('/api/video-room/:roomId/session-state', async (req, res) => {
        try {
            const role = req.query.role || 'patient';
            const state = await getCallSessionState(req.params.roomId, role);
            if (!state) {
                return res.status(404).json({ message: 'Session not found.' });
            }
            if (state.consultationStatus === 'completed') {
                return res.json({ ...state, sessionEnded: true });
            }
            return res.json(state);
        } catch (err) {
            console.error('Session state error:', err);
            return res.status(500).json({ message: 'Could not load session state.' });
        }
    });
    
    app.post('/api/video-room/:roomId/consultation-complete-answer', async (req, res) => {
        try {
            const { RECONNECT_RING_MS } = require('../../modules/consultations/callDisconnectGrace');
            const answer = String(req.body?.answer || '').trim().toLowerCase();
            const role = String(req.body?.role || req.query?.role || '').trim().toLowerCase();
            const ctx = await loadRoomContext(req.params.roomId);
            if (!ctx?.consultation) {
                return res.status(404).json({ message: 'Consultation not found.' });
            }
            const id = ctx.consultation._id || ctx.consultation.id;
            if (!id) return res.status(404).json({ message: 'Consultation not found.' });
    
            if (answer === 'yes') {
                await ConsultationRequest.findByIdAndUpdate(id, {
                    $set: { consultationCompletionAnswer: 'yes', updatedAt: new Date() }
                });
                await markConsultationCompleted(req.params.roomId);
                return res.json({ ok: true, completed: true, message: 'Consultation marked as completed.' });
            }
    
            const now = new Date();
            await ConsultationRequest.findByIdAndUpdate(id, {
                $set: {
                    consultationCompletionAnswer: 'no',
                    reconnectRingActive: true,
                    reconnectRingUntil: new Date(now.getTime() + RECONNECT_RING_MS),
                    callReconnectPending: true,
                    updatedAt: now
                }
            });
            const state = await getCallSessionState(req.params.roomId, role);
            return res.json({
                ok: true,
                completed: false,
                reconnecting: true,
                message: 'Trying to reconnect both participants to continue the consultation.',
                session: state
            });
        } catch (err) {
            console.error('Consultation complete answer error:', err);
            return res.status(500).json({ message: 'Could not save your answer.' });
        }
    });
    
    app.post('/api/video-room/:roomId/rejoin-call', async (req, res) => {
        try {
            const role = String(req.body?.role || '').trim().toLowerCase();
            const ctx = await loadRoomContext(req.params.roomId);
            if (!ctx?.consultation) {
                return res.status(404).json({ message: 'Consultation not found.' });
            }
            const current = consultationStatusOf(ctx.consultation, ctx.payment);
            if (current === 'completed') {
                return res.status(409).json({ message: 'This consultation has already ended.' });
            }
            await clearCallDisconnectGrace(req.params.roomId);
            await markConsultationInCall(req.params.roomId);
            const state = await getCallSessionState(req.params.roomId, role);
            return res.json({
                ok: true,
                message: 'Rejoined consultation session. Connect video to continue.',
                session: state
            });
        } catch (err) {
            console.error('Rejoin call error:', err);
            return res.status(500).json({ message: 'Could not rejoin call.' });
        }
    });
    
    app.post('/api/video-room/:roomId/call-disconnected', async (req, res) => {
        try {
            const { DISCONNECT_GRACE_MS } = require('../../modules/consultations/callDisconnectGrace');
            const role = req.body?.role || req.query?.role || '';
            const result = await markCallDisconnected(req.params.roomId, { role, accidental: true });
            if (!result) {
                return res.status(404).json({ message: 'Consultation not found.' });
            }
            return res.json({
                ok: true,
                graceMs: DISCONNECT_GRACE_MS,
                message: 'Disconnect recorded. Waiting up to 4 minutes before ending — you can reconnect.',
                session: result.session
            });
        } catch (err) {
            console.error('Call disconnected error:', err);
            return res.status(500).json({ message: 'Could not update call status.' });
        }
    });
    
    app.post('/api/video-room/:roomId/heartbeat', async (req, res) => {
        try {
            const roomId = req.params.roomId;
            const role = req.body?.role || req.query?.role || '';
            await touchCallActivity(roomId);
            const ctx = await loadRoomContext(roomId);
            if (ctx?.consultation?.doctorName) {
                await clearStaleDoctorConsultations(ctx.consultation.doctorName, { exceptRoomId: roomId });
            }
            const session = await getCallSessionState(roomId, role);
            if (session?.consultationStatus === 'completed') {
                return res.json({ ok: true, sessionEnded: true, consultationStatus: 'completed', session });
            }
            return res.json({
                ok: true,
                consultationStatus: session?.consultationStatus || '',
                session
            });
        } catch (err) {
            console.error('Call heartbeat error:', err);
            return res.status(500).json({ message: 'Could not update call activity.' });
        }
    });
    
    app.post('/api/video-room/:roomId/refund', async (req, res) => {
        try {
            const reason = String(req.body?.reason || 'connection_failed').trim();
            const result = await refundConsultationForRoom(req.params.roomId, reason);
            if (!result.ok) {
                return res.status(result.status || 400).json({
                    refunded: false,
                    message: result.message
                });
            }
            return res.json({
                refunded: !!result.refunded,
                alreadyRefunded: !!result.alreadyRefunded,
                freeConsultation: !!result.freeConsultation,
                amount: result.amount || 0,
                refundId: result.refundId || null,
                message: result.message
            });
        } catch (err) {
            console.error('Video room refund error:', err);
            return res.status(500).json({
                refunded: false,
                message: 'Could not process refund. Please contact support.'
            });
        }
    });
    
    app.post('/createAgoraRtcToken', requireFirebaseAuth(), handleCreateAgoraRtcToken);
    
    app.post('/api/createAgoraRtcToken', requireFirebaseAuth(), handleCreateAgoraRtcToken);
    
    app.post('/api/agora/token', async (req, res) => {
        const { channel, userID, userName, role, appointmentId } = req.body || {};
        let roomID = channel || req.body?.roomID;
        if (!roomID || (!userID && !req.headers.authorization)) {
            return res.status(400).json({ message: 'channel (roomID) and userID are required' });
        }

        const {
            canonicalizeAgoraChannelAlias,
            canonicalVideoChannelForAppointment
        } = require('./appAppointmentSync');
    
        const authHeader = req.headers.authorization || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const normalizedRole = normalizeVideoRole(role);
    
        if (bearer) {
            try {
                const decoded = await verifyIdToken(bearer);
                req.firebaseUid = decoded.uid;
            } catch (err) {
                return res.status(401).json({
                    message: 'Invalid or expired Firebase token. Please log in again.',
                    error: err.message
                });
            }
        } else if (normalizedRole === 'doctor') {
            return res.status(401).json({
                message: 'Firebase ID token required for doctor video calls. Log in at /doctor.html first.'
            });
        }

        const apptId = String(appointmentId || '').trim();
        if (apptId) {
            try {
                const appointment = await ConsultationRequest.findById(apptId);
                roomID = canonicalVideoChannelForAppointment(
                    appointment ? (appointment.toObject ? appointment.toObject() : appointment) : null,
                    apptId,
                    roomID
                );
            } catch (_) {
                roomID = canonicalizeAgoraChannelAlias(roomID, apptId);
            }
        } else {
            roomID = canonicalizeAgoraChannelAlias(roomID);
        }

        const tokenUserId = String(req.firebaseUid || userID || '').trim();
        if (!tokenUserId) {
            return res.status(400).json({ message: 'channel (roomID) and userID are required' });
        }
    
        try {
            const access = await validateVideoRoomAccess(roomID, role);
            if (!access.ok) {
                return res.status(access.status || 403).json({ message: access.message });
            }
            await markConsultationInCall(roomID);
        } catch (err) {
            console.error('Agora token room validation error:', err);
            return res.status(500).json({ message: 'Could not validate video room.' });
        }
    
        const result = generateAgoraToken(roomID, tokenUserId, { role: 'publisher' });
        if (!result) {
            return res.status(503).json({
                message: 'Video calling is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server.'
            });
        }
        res.json({
            appId: result.appId,
            token: result.token,
            uid: result.uid,
            channel: result.channel,
            channelName: result.channel,
            userName: userName || tokenUserId,
            success: true
        });
    });
    
    app.get('/api/consultations/:id', async (req, res) => {
      try {
        const consultation = await ConsultationRequest.findById(req.params.id);
        if (!consultation) return res.status(404).json({ message: 'Consultation not found' });
        return res.json(formatConsultationResponse(consultation));
      } catch (err) {
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.post('/api/consultations/:id/accept', requireConsultationDoctor(), async (req, res) => {
      try {
        const existing = await ConsultationRequest.findById(req.params.id);
        if (existing?.doctorName) {
          const exceptRoom = existing.roomId || existing.videoRoomId || '';
          await clearStaleDoctorConsultations(existing.doctorName, { exceptRoomId: exceptRoom });
        }
    
        let consultation;
        try {
          consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, {
            ...buildConsultationStatusFields('accepted', req.params.id),
            acceptedAt: new Date()
          });
        } catch (err) {
          if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
          if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
          throw err;
        }
    
        await syncPaymentForConsultationStatus(consultation.paymentId, 'accepted', req.params.id);
    
        const appointmentId = String(consultation._id || consultation.id || req.params.id);
        try {
          const activeCall = buildActiveCallRecord({
            appointmentId,
            appointment: consultation,
            doctorId: consultation.doctorId,
            patientId: consultation.patientId || consultation.userId
          });
          await getFirestore().collection('active_calls').doc(activeCall._id).set(activeCall, { merge: true });
        } catch (activeErr) {
          console.warn('active_calls sync:', activeErr.message);
        }
    
        const doctor = await findDoctorByName(consultation.doctorName);
        if (doctor) {
          await updateDoctorPresence(doctor, 'Busy');
          const payload = await buildStatusPayload(doctor);
          if (payload) emitDoctorStatus(doctor.name, payload);
        }
    
        const acceptedRoomId = consultation.roomId || consultation.videoRoomId || '';
        const payload = {
          consultationId: String(consultation._id),
          roomId: acceptedRoomId,
          videoRoomId: acceptedRoomId,
          patientName: consultation.patientName,
          status: 'accepted'
        };
        notifyConsultationEvent(String(consultation._id), 'consultation:accepted', payload);
    
        return res.json({ message: 'Consultation accepted', consultation, ...payload });
      } catch (err) {
        console.error('Accept consultation error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.post('/api/consultations/:id/reject', requireConsultationDoctor(), async (req, res) => {
      try {
        let consultation;
        try {
          consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, {
            ...buildConsultationStatusFields('rejected', req.params.id),
            rejectedAt: new Date()
          });
        } catch (err) {
          if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
          if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
          throw err;
        }
    
        await syncPaymentForConsultationStatus(consultation.paymentId, 'rejected', req.params.id);
        await syncActiveCallForStatus(req.params.id, 'rejected');
    
        const doctor = await findDoctorByName(consultation.doctorName);
        if (doctor && isDoctorBusy(doctor)) {
          await updateDoctorPresence(doctor, 'Available');
          const payload = await buildStatusPayload(doctor);
          if (payload) emitDoctorStatus(doctor.name, payload);
        }
    
        const roomId = consultation.roomId || consultation.videoRoomId || '';
        const rejectRefund = roomId
          ? await refundConsultationForRoom(roomId, 'doctor_rejected').catch((e) => ({
              ok: false,
              message: e.message
            }))
          : { ok: false };
    
        notifyConsultationEvent(String(consultation._id), 'consultation:rejected', {
          consultationId: String(consultation._id),
          message: rejectRefund.message || 'Doctor declined the consultation.',
          refunded: !!rejectRefund.refunded,
          amount: rejectRefund.amount || 0
        });
    
        return res.json({
          message: rejectRefund.message || 'Consultation rejected',
          consultation,
          refunded: !!rejectRefund.refunded,
          amount: rejectRefund.amount || 0
        });
      } catch (err) {
        console.error('Reject consultation error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
    });
    
    app.post('/api/consultations/:id/cancel', async (req, res) => {
      try {
        let consultation;
        try {
          consultation = await transitionConsultation(req.params.id, RINGING_STATUSES, {
            ...buildConsultationStatusFields('cancelled', req.params.id),
            cancelledAt: new Date()
          });
        } catch (err) {
          if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Consultation not found' });
          if (err.code === 'CONFLICT') return res.status(409).json({ message: err.message });
          throw err;
        }
    
        await syncPaymentForConsultationStatus(consultation.paymentId, 'cancelled', req.params.id);
        await syncActiveCallForStatus(req.params.id, 'cancelled');
    
        const doctor = await findDoctorByName(consultation.doctorName);
        if (doctor && isDoctorBusy(doctor)) {
          await updateDoctorPresence(doctor, 'Available');
          const payload = await buildStatusPayload(doctor);
          if (payload) emitDoctorStatus(doctor.name, payload);
        }
    
        const cancelRoomId = consultation.roomId || consultation.videoRoomId || '';
        if (cancelRoomId) {
          await refundConsultationForRoom(cancelRoomId, 'consultation_cancelled').catch((e) => {
            console.error('Cancel consultation refund error:', e.message);
          });
        }
    
        notifyConsultationEvent(String(consultation._id || consultation.id), 'consultation:cancelled', {
          consultationId: String(consultation._id || consultation.id),
          message: 'Patient cancelled the consultation request.'
        });
    
        return res.json({ message: 'Consultation cancelled', consultation: formatConsultationResponse(consultation) });
      } catch (err) {
        return res.status(500).json({ message: 'Server error' });
      }
    });
  }
};

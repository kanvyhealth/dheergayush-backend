/**
 * Domain routes: prescriptions
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.post('/api/written-prescription/upload', upload.single('file'), async (req, res) => {
        const { roomId } = req.body;
      
        if (!req.file || !roomId) {
          return res.status(400).json({ success: false, error: 'Missing file or roomId' });
        }
    
        if (!(await assertDoctorBearerToken(req, res))) return;
        if (!(await prescriptionVideoRoomExists(roomId))) {
          return res.status(403).json({ success: false, error: 'Invalid or unknown video room.' });
        }
      
        try {
          const uploaded = await uploadToFirebase(req.file, `prescriptions/${roomId}`);
          const updated = await WrittenPresc.findOneAndUpdate(
            { roomId, appointmentId: roomId },
            {
              filePath: uploaded.downloadUrl,
              downloadUrl: uploaded.downloadUrl,
              fileName: uploaded.fileName,
              category: 'written_prescription',
              uploadedAt: new Date()
            },
            { upsert: true, new: true }
          );
      
          res.json({ success: true, data: updated, url: uploaded.downloadUrl });
        } catch (err) {
          console.error(err);
          res.status(500).json({ success: false, error: 'Upload failed' });
        }
      });
    
    app.post('/api/prescribe-cart', requireDoctorSession('Doctor sign-in required to prescribe.'), async (req, res) => {
      try {
        const { roomId, cartItems } = req.body;
    
        if (!roomId || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
          return res.status(400).json({ message: 'Room ID and cart items are required.' });
        }
    
        if (!(await prescriptionVideoRoomExists(roomId))) {
          return res.status(403).json({ message: 'Invalid or unknown video room.' });
        }
    
        const normalizedRoomId = normalizeVideoRoomId(roomId);
        const enrichedItems = await enrichPrescribedCartItems(cartItems);
        const prescribedAt = new Date();
        const existing = await findPrescriptionForRoom(normalizedRoomId);
    
        let saved;
        if (existing?._id) {
          saved = await PrescribedCart.findByIdAndUpdate(
            existing._id,
            { $set: { cartItems: enrichedItems, prescribedAt, roomId: normalizedRoomId } },
            { new: true }
          );
        } else {
          saved = await PrescribedCart.create({
            roomId: normalizedRoomId,
            cartItems: enrichedItems,
            prescribedAt
          });
        }
    
        const prescribedAtIso = (() => {
          const raw = saved?.prescribedAt || prescribedAt;
          if (!raw) return new Date().toISOString();
          const d = raw instanceof Date ? raw : new Date(raw);
          return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        })();

        try {
          await mirrorPrescribedCartToAppPrescription({
            roomId: normalizedRoomId,
            cartItems: enrichedItems,
            prescribedAt,
            doctorName: req.doctor?.name || req.doctor?.displayName || ''
          });
        } catch (mirrorErr) {
          console.error('Failed to mirror prescribed cart to app prescriptions:', mirrorErr);
        }
    
        res.status(200).json({
          message: 'Prescription saved successfully!',
          roomId: normalizedRoomId,
          prescribedAt: prescribedAtIso,
          itemCount: enrichedItems.length,
          cartItems: enrichedItems
        });
    
      } catch (error) {
        console.error('Error saving prescribed cart items:', error);
        res.status(500).json({ message: 'Failed to save prescribed cart items.', error: error.message });
      }
    });
    
    app.get('/api/get-prescription/:roomId', async (req, res) => {
      try {
        const roomId = normalizeVideoRoomId(req.params.roomId);
    
        if (!(await prescriptionVideoRoomExists(roomId))) {
          return res.status(403).json({
            message: 'Invalid or unknown video room.',
            roomVerified: false
          });
        }
    
        const prescription = await findPrescriptionForRoom(roomId);
    
        if (!prescription) {
          return res.status(200).json({
            roomVerified: true,
            pending: true,
            cartItems: [],
            prescribedAt: null
          });
        }
    
        const enrichedItems = await enrichPrescribedCartItems(
          Array.isArray(prescription.cartItems) ? prescription.cartItems : []
        );
    
        const payload = typeof prescription.toObject === 'function'
          ? prescription.toObject()
          : Object.assign({}, prescription);
        res.json(Object.assign({}, payload, {
          roomVerified: true,
          pending: false,
          cartItems: enrichedItems,
          prescribedAt: prescription.prescribedAt || prescription.createdAt || null
        }));
      } catch (err) {
        res.status(500).json({ message: 'Error fetching prescription.', error: err.message });
      }
    });
    
    app.post('/api/submit-prescription', handleSubmitPrescription);
    
    app.post('/api/generate-prescription', async (req, res) => {
        try {
            const { room, medicines, totalAmount } = req.body;
    
            const payment = await Payment.findOne({ roomName: room });
            if (!payment) {
                return res.status(404).json({ message: 'Room not found' });
            }
    
            // Create new prescription
            const prescription = new Prescription({
                roomID: room,
                phone: payment.phone,
                items: Array.isArray(medicines) ? medicines.map((m) => ({
                    name: m.name || m.medicineName || 'Medicine',
                    quantity: m.quantity || 1,
                    totalPrice: m.totalPrice || m.price || 0
                })) : [],
                total: Number(totalAmount) || 0,
                paymentProof: 'consultation-invoice'
            });
    
            await prescription.save();
    
            res.json({ 
                success: true, 
                message: 'Prescription generated successfully',
                prescription: prescription
            });
        } catch (err) {
            console.error('❌ Error generating prescription:', err);
            res.status(500).json({ message: 'Failed to generate prescription', error: err.message });
        }
    });
    
    app.get('/api/prescriptions/patient/:phone', requirePatientPhoneAccess('phone'), async (req, res) => {
        try {
            const phone = req.params.phone;
            const payments = await listPaymentsForPatient(phone);
            const roomIds = new Set(payments.map((p) => p.roomName || p.videoRoomId).filter(Boolean));
            const all = await Prescription.find({}).sort({ createdAt: -1 });
            const prescriptions = all.filter((rx) => {
                const rxPhone = normalizePhone(rx.phone || rx.patientPhone || '');
                if (rxPhone && rxPhone === normalizePhone(phone)) return true;
                const room = rx.roomID || rx.roomId || rx.videoRoomId;
                return room && roomIds.has(room);
            });
            res.json(prescriptions);
        } catch (err) {
            console.error('❌ Error fetching prescriptions:', err);
            res.status(500).json({ message: 'Failed to fetch prescriptions', error: err.message });
        }
    });
    
    app.get('/api/prescriptions/doctor/:doctorName', requireDoctorNameAccess('doctorName'), async (req, res) => {
        try {
            const roomIds = await listRoomIdsForDoctor(req.params.doctorName);
            const all = await Prescription.find({}).sort({ createdAt: -1 });
            const prescriptions = all.filter((rx) => {
                const room = rx.roomID || rx.roomId || rx.videoRoomId;
                return room && roomIds.includes(room);
            });
            res.json(prescriptions);
        } catch (err) {
            console.error('❌ Error fetching prescriptions:', err);
            res.status(500).json({ message: 'Failed to fetch prescriptions', error: err.message });
        }
    });
    
    app.put('/api/prescriptions/:id/status', async (req, res) => {
        try {
            const { status } = req.body;
            const prescription = await Prescription.findByIdAndUpdate(
                req.params.id,
                { status: status },
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
    
    app.post('/api/prescriptions', handleSubmitPrescription);
    
    app.get('/api/prescriptions/room/:roomID', async (req, res) => {
        try {
            const { roomID } = req.params;
            
            if (!roomID) {
                return res.status(400).json({ message: 'Room ID is required' });
            }
    
            const prescriptions = await Prescription.find({ roomID }).sort({ createdAt: -1 });
            
            res.json({
                success: true,
                roomID,
                prescriptions,
                count: prescriptions.length
            });
        } catch (err) {
            console.error('❌ Error fetching prescriptions by room ID:', err);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch prescriptions', 
                error: err.message 
            });
        }
    });
    
    app.get('/api/prescriptions/stats/:roomID', async (req, res) => {
        try {
            const { roomID } = req.params;
            
            if (!roomID) {
                return res.status(400).json({ message: 'Room ID is required' });
            }
    
            const prescriptions = await Prescription.find({ roomID });
            
            // Calculate statistics
            const totalPrescriptions = prescriptions.length;
            const totalAmount = prescriptions.reduce((sum, prescription) => sum + prescription.total, 0);
            const deliveredCount = prescriptions.filter(p => p.status === 'delivered').length;
            const pendingCount = prescriptions.filter(p => p.status === 'not-delivered').length;
            
            // Get unique patients
            const uniquePatients = [...new Set(prescriptions.map(p => p.phone))];
            
            res.json({
                success: true,
                roomID,
                statistics: {
                    totalPrescriptions,
                    totalAmount,
                    deliveredCount,
                    pendingCount,
                    uniquePatients: uniquePatients.length,
                    averageAmount: totalPrescriptions > 0 ? (totalAmount / totalPrescriptions).toFixed(2) : 0
                },
                prescriptions: prescriptions.map(p => ({
                    id: p._id,
                    phone: p.phone,
                    total: p.total,
                    status: p.status,
                    createdAt: p.createdAt,
                    itemsCount: p.items.length
                }))
            });
        } catch (err) {
            console.error('❌ Error fetching prescription statistics:', err);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch prescription statistics', 
                error: err.message 
            });
        }
    });
    
    app.post('/api/written-presc', upload.single('writtenPresc'), async (req, res) => {
        try {
            const { roomId } = req.body;
            if (!roomId || !req.file) {
                return res.status(400).json({ message: 'roomId and file are required' });
            }
            // Upsert: update if exists, else create
            const writtenPresc = await WrittenPresc.findOneAndUpdate(
                { roomId },
                { filePath: req.file.filename, uploadedAt: new Date() },
                { upsert: true, new: true }
            );
            res.json({ success: true, writtenPresc });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });
    
    app.get('/api/written-presc/:roomId', async (req, res) => {
        try {
            const { roomId } = req.params;
            const writtenPresc = await WrittenPresc.findOne({ roomId });
            if (!writtenPresc) {
                return res.status(404).json({ message: 'No written prescription found' });
            }
            res.json({ success: true, writtenPresc });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });
  }
};

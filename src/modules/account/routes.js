/**
 * Domain routes: account
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.post('/api/account/deletion-request', async (req, res) => {
        try {
            const { email, phone, reason } = req.body || {};
            if (!email || !String(email).includes('@')) {
                return res.status(400).json({ message: 'Valid email is required' });
            }
            const docId = String(req.body.userId || req.body.uid || '').trim() || undefined;
            await AccountDeletionRequest.create({
                _id: docId,
                email: String(email).trim(),
                phone: String(phone || '').trim(),
                reason: String(reason || '').trim(),
                status: 'pending',
                source: 'website',
                accountType: String(req.body.accountType || 'customer').toLowerCase(),
                requestedAt: new Date()
            });
            res.status(201).json({
                message: 'Deletion request received. We will process it within 7 business days.',
                ok: true
            });
        } catch (err) {
            console.error('Deletion request error:', err);
            res.status(500).json({ message: 'Could not submit request' });
        }
    });
  }
};

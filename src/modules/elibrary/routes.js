/**
 * Domain routes: elibrary
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/api/elibrary/ping', (req, res) => {
      res.json({ ok: true, service: 'elibrary-stream' });
    });
    
    app.get('/api/elibrary/stream', async (req, res) => {
      const rawUrl = req.query.url;
      if (!rawUrl || typeof rawUrl !== 'string') {
        return res.status(400).json({ message: 'url query parameter is required' });
      }
      let target;
      try {
        target = new URL(rawUrl);
      } catch {
        return res.status(400).json({ message: 'Invalid url' });
      }
      if (target.protocol !== 'https:' || !isAllowedElibPdfHost(target.hostname)) {
        return res.status(403).json({ message: 'PDF host not permitted' });
      }
      try {
        const upstream = await fetch(target.toString(), {
          headers: { 'User-Agent': 'Dheergayush-E-Library/1.0 (educational)' }
        });
        if (!upstream.ok) {
          return res.status(upstream.status).json({ message: 'Could not fetch manuscript PDF' });
        }
        const contentType = upstream.headers.get('content-type') || 'application/pdf';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline; filename="dheergayush-manuscript.pdf"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (upstream.body) {
          const { Readable } = require('stream');
          Readable.fromWeb(upstream.body).pipe(res);
        } else {
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.send(buf);
        }
      } catch (err) {
        console.error('E-Library stream error:', err.message);
        res.status(502).json({ message: 'Failed to stream PDF' });
      }
    });
  }
};

/**
 * Public site-visit ping (no auth). Unique visitors are counted per browser per IST day.
 */
module.exports = function register(app) {
  const { recordSiteVisit } = require('./siteVisits');

  app.post('/api/site-visit', async (req, res) => {
    try {
      const visitorId = String(req.body?.visitorId || '').trim();
      const path = String(req.body?.path || req.get('referer') || '/');
      const result = await recordSiteVisit({ visitorId, path });
      if (!result.ok) {
        return res.status(204).end();
      }
      return res.status(204).end();
    } catch (_) {
      return res.status(204).end();
    }
  });
};

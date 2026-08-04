/**
 * Domain routes: pages
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/dev', (req, res) => {
        if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_PAGE !== '1') {
          return res.status(404).send('Not found');
        }
        res.sendFile(path.join(ROOT_DIR, 'public', 'developer.html'));
      });
    
    app.get('/auth-action', (req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'public', 'auth-action.html'));
    });

    function serveReferralInvite(req, res) {
      const filePath = path.join(ROOT_DIR, 'public', 'invite.html');
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Invite page not found');
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html');
      return res.sendFile(filePath);
    }

    // Referral deep-link landing: opens the app or falls back to Play Store.
    app.get('/invite', serveReferralInvite);
    app.get('/invite/', serveReferralInvite);
    app.get('/invite/:code', serveReferralInvite);
    app.get('/r/:code', serveReferralInvite);
  }
};

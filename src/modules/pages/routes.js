/**
 * Domain routes: pages
 */
module.exports = function register(app, deps) {
  with (deps) {
    app.get('/dev', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'public', 'developer.html'));
      });
    
    app.get('/auth-action', (req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'public', 'auth-action.html'));
    });
  }
};

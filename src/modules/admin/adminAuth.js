const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USERNAME || 'muralimohan';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'Muralimohan123@';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, number>} token -> expiry timestamp */
const activeTokens = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [token, exp] of activeTokens.entries()) {
    if (exp <= now) activeTokens.delete(token);
  }
}

function validateCredentials(username, password) {
  const u = (username || '').trim();
  const p = password || '';
  return u === ADMIN_USER && p === ADMIN_PASS;
}

function issueAdminToken() {
  pruneExpired();
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function revokeAdminToken(token) {
  if (token) activeTokens.delete(token);
}

function readAdminToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers['x-admin-token'] || '').trim();
}

function isAdminTokenValid(token) {
  pruneExpired();
  const exp = activeTokens.get(token);
  return !!(token && exp && Date.now() <= exp);
}

function requireAdmin(req, res, next) {
  const token = readAdminToken(req);
  if (!isAdminTokenValid(token)) {
    return res.status(401).json({ message: 'Admin authentication required' });
  }
  req.adminToken = token;
  next();
}

module.exports = {
  validateCredentials,
  issueAdminToken,
  revokeAdminToken,
  requireAdmin,
  isAdminTokenValid,
  readAdminToken
};

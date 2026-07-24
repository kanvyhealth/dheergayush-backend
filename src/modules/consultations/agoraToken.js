const crypto = require('crypto');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

/** Same UID algorithm as Flutter app Firebase Functions (createAgoraRtcToken). */
function agoraUidForUserId(userId) {
  const hash = crypto.createHash('sha256').update(String(userId || 'user')).digest();
  const uid = hash.readUInt32BE(0) & 0x7fffffff;
  return uid === 0 ? 1 : uid;
}

function uidFromString(value) {
  return agoraUidForUserId(value);
}

function generateAgoraToken(channelName, userId, options = {}) {
  const appId = process.env.AGORA_APP_ID || '';
  const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
  if (!appId || !appCertificate || !channelName || !userId) return null;

  const uid = options.uid != null ? Number(options.uid) : uidFromString(userId);
  const role = options.role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const expireSeconds = Number(options.expireSeconds || 3600);

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    String(channelName),
    uid,
    role,
    expireSeconds,
    expireSeconds
  );

  return {
    appId,
    token,
    uid,
    channel: String(channelName),
    expireSeconds,
    expiresAt: new Date(Date.now() + expireSeconds * 1000).toISOString()
  };
}

module.exports = { generateAgoraToken, uidFromString, agoraUidForUserId };

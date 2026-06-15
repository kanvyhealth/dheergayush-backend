/**
 * Miss-tap / accidental disconnect grace — keep consultation alive 3–5 min and offer reconnect.
 */
const DISCONNECT_GRACE_MS = 4 * 60 * 1000;
const RECONNECT_RING_MS = 4 * 60 * 1000;

function parseTs(value) {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function buildDisconnectGracePatch(role, accidental = true) {
  const now = new Date();
  const graceUntil = new Date(now.getTime() + DISCONNECT_GRACE_MS);
  return {
    callDisconnectedAt: now,
    callGraceUntil: graceUntil,
    callReconnectPending: !!accidental,
    callDisconnectedRole: String(role || '').trim().toLowerCase(),
    consultationCompletionAnswer: null,
    reconnectRingActive: false,
    reconnectRingUntil: null,
    updatedAt: now
  };
}

function buildClearGracePatch() {
  const now = new Date();
  return {
    callDisconnectedAt: null,
    callGraceUntil: null,
    callReconnectPending: false,
    callDisconnectedRole: null,
    consultationCompletionAnswer: null,
    reconnectRingActive: false,
    reconnectRingUntil: null,
    lastCallActivityAt: now,
    updatedAt: now
  };
}

function isWithinDisconnectGrace(consultation) {
  if (!consultation?.callReconnectPending) return false;
  const until = parseTs(consultation.callGraceUntil);
  if (until != null) return Date.now() <= until;
  const disconnected = parseTs(consultation.callDisconnectedAt);
  if (disconnected == null) return false;
  return Date.now() - disconnected <= DISCONNECT_GRACE_MS;
}

function isReconnectRingActive(consultation) {
  if (!consultation?.reconnectRingActive) return false;
  const until = parseTs(consultation.reconnectRingUntil);
  if (until == null) return true;
  return Date.now() <= until;
}

function buildSessionState(consultation, payment, viewerRole) {
  const status = String(
    consultation?.status || consultation?.consultationStatus || payment?.consultationStatus || ''
  ).toLowerCase();

  const inGrace = isWithinDisconnectGrace(consultation);
  const graceUntil = consultation?.callGraceUntil || null;
  const disconnectedRole = String(consultation?.callDisconnectedRole || '').toLowerCase();
  const completionAnswer = consultation?.consultationCompletionAnswer || null;
  const reconnectRing = isReconnectRingActive(consultation);
  const viewer = String(viewerRole || '').toLowerCase();

  const graceExpired =
    !!consultation?.callReconnectPending &&
    !inGrace &&
    parseTs(consultation?.callGraceUntil) != null &&
    Date.now() > parseTs(consultation.callGraceUntil);

  const showCompletionPrompt =
    inGrace &&
    !completionAnswer &&
    disconnectedRole &&
    viewer &&
    viewer !== disconnectedRole;

  const showRejoinPrompt =
    (inGrace || reconnectRing) &&
    disconnectedRole &&
    viewer === disconnectedRole;

  const peerReconnecting =
    reconnectRing || (inGrace && disconnectedRole && viewer !== disconnectedRole);

  return {
    consultationStatus: status,
    sessionPhase: status === 'completed' ? 'completed' : inGrace ? 'grace' : reconnectRing ? 'reconnecting' : 'active',
    inGrace,
    graceUntil,
    graceExpired,
    graceMsRemaining: inGrace && parseTs(graceUntil) ? Math.max(0, parseTs(graceUntil) - Date.now()) : 0,
    disconnectedRole,
    completionAnswer,
    reconnectRingActive: reconnectRing,
    showCompletionPrompt,
    showRejoinPrompt,
    peerReconnecting,
    reconnectMessage: reconnectRing
      ? `Please rejoin the video call — your ${disconnectedRole === 'doctor' ? 'patient' : 'doctor'} is waiting.`
      : inGrace
        ? 'Consultation still active — waiting to reconnect.'
        : ''
  };
}

function inCallStaleThresholdMs(consultation) {
  if (isWithinDisconnectGrace(consultation) || isReconnectRingActive(consultation)) {
    return DISCONNECT_GRACE_MS + RECONNECT_RING_MS;
  }
  if (consultation?.callDisconnectedAt) {
    return DISCONNECT_GRACE_MS + RECONNECT_RING_MS;
  }
  return null;
}

module.exports = {
  DISCONNECT_GRACE_MS,
  RECONNECT_RING_MS,
  buildDisconnectGracePatch,
  buildClearGracePatch,
  isWithinDisconnectGrace,
  isReconnectRingActive,
  buildSessionState,
  inCallStaleThresholdMs
};

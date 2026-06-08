const { Server } = require('socket.io');
const { Doctor } = require('./data');
const { getEffectiveStatus, workingToPresenceValue } = require('./doctorAvailability');
const { updateDoctorPresence, isDoctorBusy, findDoctorByName } = require('./doctorPresence');

let io = null;
const doctorSocketCounts = new Map();
const offlineTimers = new Map();
const OFFLINE_GRACE_MS = 45000;

function getIO() {
  return io;
}

function doctorRoom(doctorName) {
  return `doctor:${String(doctorName).trim()}`;
}

function consultationRoom(consultationId) {
  return `consultation:${String(consultationId)}`;
}

async function buildStatusPayload(doctor) {
  if (!doctor) return null;
  const doc = doctor.toObject ? doctor.toObject() : doctor;
  const avail = getEffectiveStatus(doc);
  const working = doc.working || doc.presenceStatus || workingToPresenceValue(avail.dbStatus);
  return {
    doctorName: doc.name,
    working,
    presenceStatus: doc.presenceStatus || working,
    dbStatus: avail.dbStatus,
    effectiveStatus: avail.effective,
    scheduleStatus: avail.scheduleStatus,
    bookable: avail.bookable,
    lastSeenAt: doc.lastSeenAt || null
  };
}

function emitDoctorStatus(doctorName, payload) {
  if (!io || !doctorName) return;
  io.to(doctorRoom(doctorName)).emit('doctor:status', payload);
  io.emit('presence:update', payload);
}

function notifyConsultationRequest(doctorName, consultation) {
  if (!io || !doctorName) return;
  io.to(doctorRoom(doctorName)).emit('consultation:requested', consultation);
}

function notifyConsultationEvent(consultationId, event, data) {
  if (!io || !consultationId) return;
  io.to(consultationRoom(consultationId)).emit(event, data);
}

function clearOfflineTimer(doctorName) {
  const t = offlineTimers.get(doctorName);
  if (t) clearTimeout(t);
  offlineTimers.delete(doctorName);
}

function scheduleOfflineIfDisconnected(doctorName) {
  clearOfflineTimer(doctorName);
  offlineTimers.set(doctorName, setTimeout(async () => {
    if ((doctorSocketCounts.get(doctorName) || 0) > 0) return;
    try {
      const doctor = await findDoctorByName(doctorName);
      if (!doctor || isDoctorBusy(doctor)) return;
      await updateDoctorPresence(doctor, 'Offline');
      const payload = await buildStatusPayload(doctor);
      if (payload) emitDoctorStatus(doctorName, payload);
    } catch (err) {
      console.error('Offline grace error:', err.message);
    }
  }, OFFLINE_GRACE_MS));
}

function trackDoctorSocket(doctorName, delta) {
  const count = Math.max(0, (doctorSocketCounts.get(doctorName) || 0) + delta);
  if (count === 0) {
    doctorSocketCounts.delete(doctorName);
    scheduleOfflineIfDisconnected(doctorName);
  } else {
    doctorSocketCounts.set(doctorName, count);
    clearOfflineTimer(doctorName);
  }
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    socket.on('doctor:register', async ({ doctorName }) => {
      if (!doctorName) return;
      socket.doctorName = String(doctorName).trim();
      socket.join(doctorRoom(socket.doctorName));
      trackDoctorSocket(socket.doctorName, 1);
      try {
        const doctor = await findDoctorByName(socket.doctorName);
        const payload = await buildStatusPayload(doctor);
        if (payload) socket.emit('doctor:status', payload);
      } catch (err) {
        console.error('doctor:register error:', err.message);
      }
    });

    socket.on('patient:watch', ({ consultationId }) => {
      if (!consultationId) return;
      socket.join(consultationRoom(consultationId));
    });

    socket.on('doctor:heartbeat', async ({ doctorName }) => {
      const name = String(doctorName || socket.doctorName || '').trim();
      if (!name) return;
      try {
        await Doctor.findOneAndUpdate({ name }, { lastSeenAt: new Date() });
      } catch (err) {
        console.error('heartbeat error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      if (socket.doctorName) {
        trackDoctorSocket(socket.doctorName, -1);
      }
    });
  });

  console.log('✅ Socket.io realtime initialized');
  return io;
}

module.exports = {
  initRealtime,
  getIO,
  emitDoctorStatus,
  notifyConsultationRequest,
  notifyConsultationEvent,
  buildStatusPayload,
  doctorRoom,
  consultationRoom
};

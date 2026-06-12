const { Server } = require('socket.io');
const { Doctor } = require('./data');
const { getEffectiveStatus, workingToPresenceValue, getDoctorPresenceStatus } = require('./doctorAvailability');
const { updateDoctorPresence, isDoctorBusy, findDoctorByName } = require('./doctorPresence');

let io = null;
const doctorSocketIds = new Map();
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

function getDoctorSocketSet(doctorName) {
  if (!doctorSocketIds.has(doctorName)) {
    doctorSocketIds.set(doctorName, new Set());
  }
  return doctorSocketIds.get(doctorName);
}

function shouldSkipSocketAutoOffline(doctor) {
  if (!doctor) return true;
  if (isDoctorBusy(doctor)) return true;
  const working = getDoctorPresenceStatus(doctor);
  if (working !== 'Available') return true;
  if (String(doctor.presenceSource || '').trim().toLowerCase() === 'manual') return true;
  if (doctor.lastOnlineAt) {
    const age = Date.now() - new Date(doctor.lastOnlineAt).getTime();
    if (age < 30 * 60 * 1000) return true;
  }
  return false;
}

function scheduleOfflineIfDisconnected(doctorName) {
  clearOfflineTimer(doctorName);
  offlineTimers.set(doctorName, setTimeout(async () => {
    const sockets = doctorSocketIds.get(doctorName);
    if (sockets && sockets.size > 0) return;
    try {
      const doctor = await findDoctorByName(doctorName);
      if (shouldSkipSocketAutoOffline(doctor)) return;
      await updateDoctorPresence(doctor, 'Offline');
      const refreshed = await findDoctorByName(doctorName);
      const payload = await buildStatusPayload(refreshed || doctor);
      if (payload) emitDoctorStatus(doctorName, payload);
    } catch (err) {
      console.error('Offline grace error:', err.message);
    }
  }, OFFLINE_GRACE_MS));
}

function trackDoctorSocketConnected(doctorName, socketId) {
  const set = getDoctorSocketSet(doctorName);
  set.add(socketId);
  clearOfflineTimer(doctorName);
}

function trackDoctorSocketDisconnected(doctorName, socketId) {
  const set = doctorSocketIds.get(doctorName);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    doctorSocketIds.delete(doctorName);
    scheduleOfflineIfDisconnected(doctorName);
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
      trackDoctorSocketConnected(socket.doctorName, socket.id);
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
        trackDoctorSocketDisconnected(socket.doctorName, socket.id);
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

(function (global) {
  'use strict';

  var socket = null;
  var registeredDoctorName = '';
  var heartbeatTimer = null;
  var ringAudio = null;
  var speechInterval = null;
  var VOICE_MESSAGE = 'DHEERGAYUSH patient is waiting';

  function connect() {
    if (socket && socket.connected) return socket;
    if (typeof io === 'undefined') {
      console.warn('Socket.io client not loaded');
      return null;
    }
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch (e) { /* ignore */ }
      socket = null;
    }
    socket = io({ transports: ['websocket', 'polling'], reconnection: true });
    socket.on('connect', function () {
      if (registeredDoctorName) {
        socket.emit('doctor:register', { doctorName: registeredDoctorName });
      }
    });
    return socket;
  }

  function registerDoctor(doctorName) {
    registeredDoctorName = String(doctorName || '').trim();
    var s = connect();
    if (!s || !registeredDoctorName) return;
    if (s.connected) {
      s.emit('doctor:register', { doctorName: registeredDoctorName });
    }
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(function () {
        if (socket && socket.connected && registeredDoctorName) {
          socket.emit('doctor:heartbeat', { doctorName: registeredDoctorName });
        }
      }, 20000);
    }
  }

  function watchConsultation(consultationId) {
    var s = connect();
    if (!s || !consultationId) return;
    s.emit('patient:watch', { consultationId: consultationId });
  }

  function onConsultationRequested(handler) {
    var s = connect();
    if (!s) return;
    s.off('consultation:requested');
    s.on('consultation:requested', handler);
  }

  function onConsultationAccepted(handler) {
    var s = connect();
    if (!s) return;
    s.off('consultation:accepted');
    s.on('consultation:accepted', handler);
  }

  function onConsultationRejected(handler) {
    var s = connect();
    if (!s) return;
    s.off('consultation:rejected');
    s.on('consultation:rejected', handler);
  }

  function onConsultationTimeout(handler) {
    var s = connect();
    if (!s) return;
    s.off('consultation:timeout');
    s.on('consultation:timeout', handler);
  }

  function onConsultationCancelled(handler) {
    var s = connect();
    if (!s) return;
    s.off('consultation:cancelled');
    s.on('consultation:cancelled', handler);
  }

  function onPresenceUpdate(handler) {
    var s = connect();
    if (!s) return;
    s.off('presence:update');
    s.on('presence:update', handler);
  }

  function onDoctorStatus(handler) {
    var s = connect();
    if (!s) return;
    s.off('doctor:status');
    s.on('doctor:status', handler);
  }

  function ensureRingAudio() {
    if (ringAudio) return ringAudio;
    ringAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmHgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    ringAudio.loop = true;
    ringAudio.volume = 0.6;
    return ringAudio;
  }

  function speakWaitingMessage() {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(VOICE_MESSAGE);
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      var voices = window.speechSynthesis.getVoices();
      var preferred = voices.find(function (v) {
        return /en/i.test(v.lang) && (/female|zira|samantha|google uk english female/i.test(v.name));
      }) || voices.find(function (v) { return /en/i.test(v.lang); });
      if (preferred) utterance.voice = preferred;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Voice announcement unavailable', e);
    }
  }

  function startRing() {
    var audio = ensureRingAudio();
    audio.play().catch(function () {
      var btn = document.getElementById('dgEnableSoundBtn');
      if (btn) btn.style.display = 'inline-flex';
    });
    speakWaitingMessage();
    if (speechInterval) clearInterval(speechInterval);
    speechInterval = setInterval(speakWaitingMessage, 9000);
  }

  function stopRing() {
    if (ringAudio) {
      ringAudio.pause();
      ringAudio.currentTime = 0;
    }
    if (speechInterval) {
      clearInterval(speechInterval);
      speechInterval = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  global.DgRealtime = {
    connect: connect,
    registerDoctor: registerDoctor,
    watchConsultation: watchConsultation,
    onConsultationRequested: onConsultationRequested,
    onConsultationAccepted: onConsultationAccepted,
    onConsultationRejected: onConsultationRejected,
    onConsultationTimeout: onConsultationTimeout,
    onConsultationCancelled: onConsultationCancelled,
    onPresenceUpdate: onPresenceUpdate,
    onDoctorStatus: onDoctorStatus,
    startRing: startRing,
    stopRing: stopRing
  };
})(window);

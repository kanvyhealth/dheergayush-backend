(function (global) {
  'use strict';

  function authHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    const token = localStorage.getItem('firebaseIdToken');
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function endActiveCalls(doctorName, options) {
    if (!doctorName) throw new Error('Doctor name is required');
    const exceptRoomId = options && options.exceptRoomId ? String(options.exceptRoomId) : '';
    const res = await fetch(
      '/api/doctors/' + encodeURIComponent(doctorName) + '/end-active-calls',
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(exceptRoomId ? { exceptRoomId } : {})
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not end active calls');
    if (global.DgAgoraCall && typeof global.DgAgoraCall.leaveCall === 'function' && global.DgAgoraCall.isJoined()) {
      await global.DgAgoraCall.leaveCall();
    }
    return data;
  }

  global.DgDoctorEndCalls = { endActiveCalls, authHeaders };
})(window);

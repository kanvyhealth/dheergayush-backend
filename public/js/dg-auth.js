/**
 * Shared auth — same Firebase users as Android app.
 */
(function (global) {
  const TOKEN_KEY = 'firebaseIdToken';
  const REFRESH_KEY = 'firebaseRefreshToken';
  const USER_KEY = 'dgUser';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  async function parseJsonResponse(res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    if (!text) return {};
    if (ct.includes('application/json') || text.trim().charAt(0) === '{' || text.trim().charAt(0) === '[') {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('Server returned invalid JSON.');
      }
    }
    if (text.trim().indexOf('<!') === 0 || text.trim().toLowerCase().indexOf('<html') === 0) {
      throw new Error(
        res.status === 404
          ? 'API not found. Ensure the backend is running and deployed.'
          : 'Server returned an HTML error page. Check FIREBASE_API_KEY on Render and try again.'
      );
    }
    throw new Error(text.slice(0, 180) || 'Unexpected server response');
  }

  async function authPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
    return data;
  }

  function setSession(data) {
    if (data.idToken) localStorage.setItem(TOKEN_KEY, data.idToken);
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    if (data.user?.uid) localStorage.setItem('firebaseUid', data.user.uid);
    else if (data.uid) localStorage.setItem('firebaseUid', data.uid);
    if (data.user?.name) localStorage.setItem('patientId', data.user.name);
    if (data.user?.phone) localStorage.setItem('patientPhoneNumber', data.user.phone);
    if (data.user?.email) localStorage.setItem('userEmail', data.user.email);

    var isDoctor = data.portal === 'doctor' || data.role === 'Doctor' || data.user?.role === 'Doctor';
    if (isDoctor) {
      localStorage.setItem('userRole', 'doctor');
      localStorage.setItem('isLoggedInDoctor', 'true');
      if (data.doctor) {
        localStorage.setItem('doctorName', data.doctor.name || '');
        localStorage.setItem('doctorLicense', data.doctor.doctorId || data.doctor.license || '');
        localStorage.setItem('doctorUid', data.doctor.uid || data.user?.uid || data.uid || '');
      }
    } else {
      localStorage.setItem('userRole', 'patient');
      localStorage.removeItem('isLoggedInDoctor');
    }
  }

  function redirectForPortal(data) {
    if (!data || !data.redirectTo) return false;
    if (data.portal === 'doctor') {
      window.location.replace(data.redirectTo);
      return true;
    }
    return false;
  }

  function clearSession() {
    [TOKEN_KEY, REFRESH_KEY, USER_KEY, 'firebaseUid', 'patientId', 'patientPhoneNumber', 'userEmail',
      'userRole', 'isLoggedInDoctor', 'doctorName', 'doctorLicense', 'doctorUid'].forEach(function (k) {
      localStorage.removeItem(k);
    });
  }

  async function ensureValidToken() {
    var token = getToken();
    if (token) {
      try {
        var check = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (check.ok) return token;
      } catch (_) { /* try refresh */ }
    }
    var refresh = localStorage.getItem(REFRESH_KEY) || '';
    if (!refresh) return '';
    try {
      var data = await authPost('/api/auth/refresh', { refreshToken: refresh });
      setSession(data);
      return getToken();
    } catch (_) {
      clearSession();
      return '';
    }
  }

  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  async function registerCustomer(payload) {
    return authPost('/api/auth/register', Object.assign({}, payload, { role: 'Customer' }));
  }

  async function login(payload) {
    const data = await authPost('/api/auth/login', payload);
    setSession(data);
    return data;
  }

  async function loginDoctor(payload) {
    const data = await authPost('/api/auth/login-doctor', payload);
    setSession(data);
    return data;
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  global.DgAuth = {
    getToken,
    setSession,
    clearSession,
    ensureValidToken,
    authHeaders,
    authFetch(url, options) {
      options = options || {};
      const headers = Object.assign({}, options.headers || {}, authHeaders());
      if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      return fetch(url, Object.assign({}, options, { headers }));
    },
    registerCustomer,
    login,
    loginDoctor,
    getUser,
    redirectForPortal
  };
})(typeof window !== 'undefined' ? window : global);

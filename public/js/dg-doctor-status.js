/**
 * Client-side doctor availability (schedule + DB status) — matches Android app schema.
 */
(function (global) {
  function convertToMinutes(time) {
    if (!time || typeof time !== 'string') return 0;
    const parts = time.trim().split(/\s+/);
    if (parts.length < 2) return 0;
    const hourPart = parts[0];
    const modifier = (parts[1] || '').toUpperCase();
    let hours;
    let minutes = 0;
    if (hourPart.includes(':')) {
      [hours, minutes] = hourPart.split(':').map(Number);
    } else {
      hours = parseInt(hourPart, 10);
    }
    if (Number.isNaN(hours)) return 0;
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + (minutes || 0);
  }

  function getScheduleStatus(timeSlot) {
    if (!timeSlot || typeof timeSlot !== 'string') return 'Offline';
    const sep = timeSlot.includes(' to ') ? ' to ' : (timeSlot.includes('-') ? '-' : null);
    if (!sep) return 'Offline';
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [start, end] = timeSlot.split(sep);
    const startMinutes = convertToMinutes(start);
    const endMinutes = convertToMinutes(end);
    if (startMinutes === 0 && endMinutes === 0) return 'Offline';
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return 'Available';
    return 'Offline';
  }

  function normalizeDbStatus(status) {
    if (!status) return 'Offline';
    const s = String(status).trim();
    if (/^available$/i.test(s) || /^online$/i.test(s)) return 'Available';
    if (/^busy$/i.test(s) || /^in_consultation$/i.test(s)) return 'Busy';
    if (/^offline$/i.test(s)) return 'Offline';
    return 'Offline';
  }

  function getPhotoUrl(photo) {
    if (!photo) return null;
    const normalized = String(photo).replace(/\\/g, '/').trim();
    if (!normalized) return null;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('/uploads/')) return normalized;
    if (normalized.startsWith('uploads/')) return '/' + normalized;
    const filename = normalized.split('/').pop();
    return filename ? `/uploads/${filename.split('?')[0]}` : null;
  }

  function getDoctorPhotoProxyUrl(doctor) {
    if (!doctor) return null;
    const uid = doctor.uid || doctor._id || doctor.id;
    if (!uid) return null;
    const stored = doctor.profileUrl || doctor.photo;
    const base = '/api/media/doctor-photo/' + encodeURIComponent(String(uid));
    if (stored && /^https?:\/\//i.test(String(stored))) {
      return base + '?url=' + encodeURIComponent(String(stored));
    }
    return base;
  }

  function getDoctorPhoto(doctor) {
    if (!doctor) return null;
    const proxy = getDoctorPhotoProxyUrl(doctor);
    if (proxy) return proxy;
    return getPhotoUrl(doctor.profileUrl || doctor.photo);
  }

  function getDoctorTimeSlot(doctor) {
    return (doctor && (doctor.availableTime || doctor.slotTime)) || '';
  }

  function getDoctorApprovalStatus(doctor) {
    if (!doctor) return 'pending';
    const raw = doctor.approvalStatus || doctor.Regstatus || doctor.status;
    const s = String(raw || '').trim().toLowerCase();
    if (/^(approved|pending|rejected)$/.test(s)) return s;
    if (/^(available|busy|offline|online|in_consultation)$/.test(s)) return 'pending';
    return 'pending';
  }

  function getDoctorWorking(doctor) {
    if (!doctor) return 'offline';
    if (doctor.working) return String(doctor.working).trim().toLowerCase();
    if (doctor.presenceStatus) return String(doctor.presenceStatus).trim().toLowerCase();
    const legacy = String(doctor.status || '').trim().toLowerCase();
    if (/^(available|busy|offline|online|in_consultation)$/.test(legacy)) {
      return legacy === 'online' ? 'available' : legacy;
    }
    return 'offline';
  }

  function getDoctorPresence(doctor) {
    return normalizeDbStatus(getDoctorWorking(doctor));
  }

  function isDoctorApproved(doctor) {
    return getDoctorApprovalStatus(doctor) === 'approved';
  }

  function getEffectiveStatus(doctor) {
    const dbStatus = getDoctorPresence(doctor);
    const scheduleStatus = getScheduleStatus(getDoctorTimeSlot(doctor));
    let effective = 'Offline';
    let bookable = false;
    if (!isDoctorApproved(doctor)) return { dbStatus, scheduleStatus, effective, bookable };
    if (dbStatus === 'Offline') effective = 'Offline';
    else if (dbStatus === 'Busy') effective = 'Busy';
    else if (dbStatus === 'Available') {
      effective = 'Available';
      bookable = true;
    } else effective = 'Offline';
    return { dbStatus, scheduleStatus, effective, bookable };
  }

  function statusBadgeHtml(effective) {
    const map = {
      Available: ['#28a745', 'Available'],
      Busy: ['#ffc107', 'Busy'],
      Offline: ['#6c757d', 'Offline']
    };
    const [bg, label] = map[effective] || map.Offline;
    return `<span style="background:${bg};color:${effective === 'Busy' ? '#333' : '#fff'};padding:2px 8px;border-radius:12px;font-size:0.8rem;">${label}</span>`;
  }

  function bookButtonLabel(effective) {
    if (effective === 'Available') return 'Book Appointment';
    if (effective === 'Busy') return 'Currently Busy';
    return 'Currently Offline';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function avatarHtml(doctor, size) {
    const px = size || 96;
    const name = (doctor && doctor.name) || 'Doctor';
    const initial = name.charAt(0).toUpperCase();
    const url = getDoctorPhoto(doctor);
    const fallbackStyle = `width:${px}px;height:${px}px;border-radius:50%;background:linear-gradient(135deg,#F26727,#3C3C3C);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${Math.max(18, Math.round(px / 3))}px;font-weight:700;`;
    if (!url) {
      return `<div class="dg-doctor-avatar-fallback" style="${fallbackStyle}">${escapeHtml(initial)}</div>`;
    }
    return `<div class="dg-doctor-avatar-wrap" style="width:${px}px;height:${px}px;">` +
      `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" class="dg-doctor-avatar-img" style="width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` +
      `<div class="dg-doctor-avatar-fallback" style="${fallbackStyle}display:none;">${escapeHtml(initial)}</div>` +
      `</div>`;
  }

  async function updateDoctorStatus(doctorName, status) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('firebaseIdToken');
    if (token) headers.Authorization = 'Bearer ' + token;
    const body = { status };
    const resolvedName = String(doctorName || '').trim();
    if (resolvedName) body.doctorName = resolvedName;
    const res = await fetch('/api/doctors/updateStatus', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Status update failed');
    }
    return res.json();
  }

  global.DgDoctorStatus = {
    convertToMinutes,
    getScheduleStatus,
    normalizeDbStatus,
    getDoctorApprovalStatus,
    getDoctorWorking,
    getEffectiveStatus,
    statusBadgeHtml,
    bookButtonLabel,
    getPhotoUrl,
    getDoctorPhotoProxyUrl,
    avatarHtml,
    escapeHtml,
    updateDoctorStatus
  };

  global.getDoctorStatus = getScheduleStatus;
})(typeof window !== 'undefined' ? window : global);

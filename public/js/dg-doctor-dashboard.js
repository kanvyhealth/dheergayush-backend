(function (global) {
  'use strict';

  var allConsultations = [];
  var activeFilter = 'all';
  var searchTerm = '';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatAmount(amount) {
    var n = Number(amount);
    if (Number.isNaN(n) || n <= 0) return '—';
    return '₹' + n.toLocaleString('en-IN');
  }

  function statusLabel(status) {
    var s = String(status || 'pending').toLowerCase();
    return s.replace(/_/g, ' ');
  }

  function canJoinVideo(status) {
    var s = String(status || '').toLowerCase();
    return ['accepted', 'in_call', 'completed'].indexOf(s) !== -1;
  }

  function filterConsultations(list) {
    return list.filter(function (item) {
      var status = String(item.status || '').toLowerCase();
      if (activeFilter === 'completed' && status !== 'completed') return false;
      if (activeFilter === 'active' && ['accepted', 'in_call', 'ringing', 'waiting'].indexOf(status) === -1) return false;
      if (activeFilter === 'cancelled' && ['rejected', 'cancelled', 'timeout'].indexOf(status) === -1) return false;
      if (!searchTerm) return true;
      var q = searchTerm.toLowerCase();
      return (
        String(item.patientName || '').toLowerCase().includes(q) ||
        String(item.patientPhone || '').toLowerCase().includes(q) ||
        String(item.roomId || '').toLowerCase().includes(q)
      );
    });
  }

  function computeStats(list) {
    var completed = 0;
    var active = 0;
    var revenue = 0;
    list.forEach(function (item) {
      var s = String(item.status || '').toLowerCase();
      if (s === 'completed') completed += 1;
      if (['accepted', 'in_call', 'ringing', 'waiting'].indexOf(s) !== -1) active += 1;
      if (s === 'completed' || s === 'accepted' || s === 'in_call') {
        revenue += Number(item.amount) || 0;
      }
    });
    return {
      total: list.length,
      completed: completed,
      active: active,
      revenue: revenue
    };
  }

  function updateStats(list) {
    var stats = computeStats(list);
    var totalEl = document.getElementById('dgDocStatTotal');
    var completedEl = document.getElementById('dgDocStatCompleted');
    var activeEl = document.getElementById('dgDocStatActive');
    var revenueEl = document.getElementById('dgDocStatRevenue');
    if (totalEl) totalEl.textContent = stats.total;
    if (completedEl) completedEl.textContent = stats.completed;
    if (activeEl) activeEl.textContent = stats.active;
    if (revenueEl) revenueEl.textContent = formatAmount(stats.revenue);
  }

  function joinConsultation(roomId) {
    if (!roomId) return;
    localStorage.setItem('userRole', 'doctor');
    localStorage.setItem('videoRoomId', roomId);
    window.location.href = '/video-call.html?roomID=' + encodeURIComponent(roomId) + '&role=doctor';
  }

  function renderConsultations(list) {
    var tbody = document.getElementById('dgDocConsultTbody');
    var emptyEl = document.getElementById('dgDocConsultEmpty');
    var tableWrap = document.getElementById('dgDocTableWrap');
    if (!tbody) return;

    var filtered = filterConsultations(list);
    tbody.innerHTML = '';

    if (!filtered.length) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (tableWrap) tableWrap.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    filtered.forEach(function (item) {
      var status = String(item.status || 'pending').toLowerCase().replace(/\s+/g, '_');
      var room = item.roomId || '';
      var tr = document.createElement('tr');

      tr.innerHTML =
        '<td data-label="Patient"><div class="dg-doc-patient-cell">' +
          '<strong>' + escapeHtml(item.patientName) + '</strong>' +
          '<span>' + escapeHtml(item.patientPhone) + '</span>' +
        '</div></td>' +
        '<td data-label="Date">' + escapeHtml(formatDate(item.createdAt)) + '</td>' +
        '<td data-label="Fee">' + escapeHtml(formatAmount(item.amount)) + '</td>' +
        '<td data-label="Status"><span class="dg-doc-status dg-doc-status--' + escapeHtml(status) + '">' +
          escapeHtml(statusLabel(status)) + '</span></td>' +
        '<td data-label="Action">' +
          (room && canJoinVideo(status)
            ? '<button type="button" class="dg-doc-join" data-room="' + escapeHtml(room) + '"><i class="fas fa-video"></i> Join</button>'
            : '<button type="button" class="dg-doc-join" disabled>No room</button>') +
        '</td>';

      var joinBtn = tr.querySelector('.dg-doc-join[data-room]');
      if (joinBtn) {
        joinBtn.addEventListener('click', function () {
          joinConsultation(joinBtn.getAttribute('data-room'));
        });
      }

      tbody.appendChild(tr);
    });
  }

  function showLoading(show) {
    var loading = document.getElementById('dgDocConsultLoading');
    var tableWrap = document.getElementById('dgDocTableWrap');
    var emptyEl = document.getElementById('dgDocConsultEmpty');
    if (loading) loading.style.display = show ? 'block' : 'none';
    if (show) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'none';
    }
  }

  async function loadConsultationHistory(forceRefresh) {
    var doctorName = localStorage.getItem('doctorName');
    if (!doctorName) return;

    showLoading(true);
    try {
      var headers = {};
      var token = localStorage.getItem('firebaseIdToken');
      if (token) headers.Authorization = 'Bearer ' + token;

      var url = '/api/doctors/' + encodeURIComponent(doctorName) + '/consultation-history';
      if (forceRefresh) url += '?t=' + Date.now();

      var res = await fetch(url, { headers: headers });
      var data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Could not load consultations');
      }

      allConsultations = Array.isArray(data) ? data : [];
      updateStats(allConsultations);
      renderConsultations(allConsultations);
    } catch (err) {
      console.error('Consultation history error:', err);
      allConsultations = [];
      updateStats([]);
      var emptyEl = document.getElementById('dgDocConsultEmpty');
      var tableWrap = document.getElementById('dgDocTableWrap');
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML =
          '<i class="fas fa-exclamation-circle"></i>' +
          '<p><strong>Could not load consultations</strong></p>' +
          '<p style="font-size:0.85rem;color:#888;">' + escapeHtml(err.message) + '</p>' +
          '<button type="button" class="dg-doc-btn dg-doc-btn--primary" id="dgDocRetryBtn">Try again</button>';
        var retry = document.getElementById('dgDocRetryBtn');
        if (retry) retry.addEventListener('click', function () { loadConsultationHistory(true); });
      }
    } finally {
      showLoading(false);
    }
  }

  function initFilters() {
    document.querySelectorAll('.dg-doc-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.dg-doc-filter').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-filter') || 'all';
        renderConsultations(allConsultations);
      });
    });

    var search = document.getElementById('dgDocSearch');
    if (search) {
      search.addEventListener('input', function () {
        searchTerm = search.value.trim();
        renderConsultations(allConsultations);
      });
    }

    var refresh = document.getElementById('dgDocRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        loadConsultationHistory(true);
      });
    }
  }

  function setDoctorHeaderInfo() {
    var name = localStorage.getItem('doctorName') || '';
    var spec = localStorage.getItem('doctorSpecialization') || '';
    var license = localStorage.getItem('doctorLicense') || '';

    var nameEl = document.getElementById('doctorName');
    var specEl = document.getElementById('doctorSpecialization');
    var licenseEl = document.getElementById('doctorLicense');
    var avatarEl = document.getElementById('dgDocAvatarInitials');

    if (nameEl) nameEl.textContent = name ? 'Dr. ' + name : 'Doctor';
    if (specEl) specEl.textContent = spec || 'Ayurvedic Consultant';
    if (licenseEl) licenseEl.textContent = license ? 'License: ' + license : '';
    if (avatarEl && name) {
      var parts = name.trim().split(/\s+/);
      avatarEl.textContent = parts.length > 1
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    }
  }

  function init() {
    setDoctorHeaderInfo();
    initFilters();
    loadConsultationHistory(false);
    setInterval(function () { loadConsultationHistory(false); }, 60000);
  }

  global.DgDoctorDashboard = {
    init: init,
    refresh: loadConsultationHistory,
    getConsultations: function () { return allConsultations.slice(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

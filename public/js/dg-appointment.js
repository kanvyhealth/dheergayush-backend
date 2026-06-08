(function (global) {
  'use strict';

  var doctorsCache = {};
  var allDoctors = [];
  var selectedLocations = [];
  var selectedLanguages = [];
  var searchQuery = '';
  var showAvailableOnly = false;

  function $(id) { return document.getElementById(id); }

  function getLanguages(doctor) {
    if (Array.isArray(doctor.languages) && doctor.languages.length) return doctor.languages.join(', ');
    if (doctor.language) return Array.isArray(doctor.language) ? doctor.language.join(', ') : String(doctor.language);
    return '\u2014';
  }

  function showLoading(show) {
    var el = $('dgApptLoading');
    var grid = $('doctorsGrid');
    if (el) el.style.display = show ? 'block' : 'none';
    if (grid && show) grid.style.display = 'none';
  }

  function updateStats(doctors) {
    var total = $('dgApptStatTotal');
    var avail = $('dgApptStatAvailable');
    if (!total || !avail) return;
    var bookable = doctors.filter(function (d) { return d.bookable; }).length;
    total.textContent = String(doctors.length);
    avail.textContent = String(bookable);
  }

  function escapeHtml(value) {
    if (global.DgDoctorStatus && DgDoctorStatus.escapeHtml) return DgDoctorStatus.escapeHtml(value);
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderFilterChips() {
    var wrap = $('dgApptChips');
    if (!wrap) return;
    var chips = [];
    selectedLocations.forEach(function (loc, i) {
      chips.push('<span class="dg-appt-chip">\uD83D\uDCCD ' + escapeHtml(loc) + ' <button type="button" data-type="loc" data-value="' + escapeHtml(loc) + '" aria-label="Remove">\u00d7</button></span>');
    });
    selectedLanguages.forEach(function (lang, i) {
      chips.push('<span class="dg-appt-chip">\uD83D\uDDE3\uFE0F ' + escapeHtml(lang) + ' <button type="button" data-type="lang" data-value="' + escapeHtml(lang) + '" aria-label="Remove">\u00d7</button></span>');
    });
    if (searchQuery) {
      chips.push('<span class="dg-appt-chip">Search: ' + escapeHtml(searchQuery) + ' <button type="button" data-type="search" aria-label="Clear search">\u00d7</button></span>');
    }
    wrap.innerHTML = chips.join('');
    wrap.style.display = chips.length ? 'flex' : 'none';
  }

  function syncCheckboxFilters() {
    document.querySelectorAll('#locationCheckboxes input[type="checkbox"]').forEach(function (cb) {
      cb.checked = selectedLocations.indexOf(cb.value) !== -1;
    });
    document.querySelectorAll('#languageCheckboxes input[type="checkbox"]').forEach(function (cb) {
      cb.checked = selectedLanguages.indexOf(cb.value) !== -1;
    });
  }

  function clientFilter(doctors) {
    var q = searchQuery.toLowerCase().trim();
    return doctors.filter(function (doctor) {
      if (showAvailableOnly && !doctor.bookable) return false;
      if (!q) return true;
      var hay = [doctor.name, doctor.specialization, doctor.location, getLanguages(doctor), doctor.bio].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderDoctors(doctors) {
    var grid = $('doctorsGrid');
    if (!grid) return;
    var DS = global.DgDoctorStatus;
    if (!DS) return;

    grid.innerHTML = '';
    grid.style.display = 'grid';
    showLoading(false);

    var list = clientFilter(doctors);
    updateStats(doctors);

    if (!list.length) {
      grid.innerHTML = '<div class="dg-appt-empty"><h3>No doctors found</h3><p>Try clearing filters or search, or check back during consultation hours.</p><button type="button" class="btn" onclick="DgAppointment.clearFilters()">Reset filters</button></div>';
      return;
    }

    list.forEach(function (doctor) { appendDoctorCard(doctor, grid); });
  }

  function appendDoctorCard(doctor, grid) {
    var DS = global.DgDoctorStatus;
    var doctorId = doctor._id || doctor.id || ('doc-' + Math.random().toString(36).slice(2, 9));
    doctorsCache[doctorId] = doctor;
    global.doctorsCache = doctorsCache;

    var avail = doctor.effectiveStatus
      ? { effective: doctor.effectiveStatus, bookable: !!doctor.bookable }
      : DS.getEffectiveStatus(doctor);
    var effective = avail.effective;
    var bookable = avail.bookable;
    var spec = doctor.specialization || (doctor.specializations && doctor.specializations[0]) || 'Ayurveda Specialist';

    var card = document.createElement('article');
    card.className = 'doctor-card' + (effective !== 'Available' ? ' offline-card' : '');
    card.innerHTML =
      '<div class="dg-appt-card-top">' +
        '<div class="doctor-avatar">' + DS.avatarHtml(doctor, 72) + '</div>' +
        '<div class="dg-appt-card-head">' +
          '<h4>' + escapeHtml(doctor.name || '') + '</h4>' +
          '<p class="dg-appt-card-spec">' + escapeHtml(spec) + '</p>' +
          DS.statusBadgeHtml(effective) +
        '</div>' +
      '</div>' +
      '<div class="dg-appt-card-body">' +
        '<div class="dg-appt-meta"><strong>Fee</strong>\u20b9' + escapeHtml(doctor.fee || '0') + '</div>' +
        '<div class="dg-appt-meta"><strong>Experience</strong>' + escapeHtml(doctor.experience || '0') + ' yrs</div>' +
        '<div class="dg-appt-meta"><strong>Location</strong>' + escapeHtml(doctor.location || '\u2014') + '</div>' +
        '<div class="dg-appt-meta"><strong>Hours</strong>' + escapeHtml(doctor.availableTime || doctor.slotTime || '\u2014') + '</div>' +
        '<div class="dg-appt-meta dg-appt-meta-full"><strong>Languages</strong>' + escapeHtml(getLanguages(doctor)) + '</div>' +
      '</div>' +
      '<div class="doctor-card-actions">' +
        '<button type="button" class="btn btn-outline" onclick="showDoctorProfile(\'' + doctorId + '\')">Profile</button>' +
        '<button type="button" class="btn btn-success" onclick="selectDoctorById(\'' + doctorId + '\')" ' + (!bookable ? 'disabled' : '') + '>' + DS.bookButtonLabel(effective) + '</button>' +
      '</div>';
    grid.appendChild(card);
  }

  async function fetchDoctors(url) {
    showLoading(true);
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load doctors');
      return await res.json();
    } finally {
      showLoading(false);
    }
  }

  async function loadAvailableDoctors() {
    try {
      allDoctors = await fetchDoctors('/api/doctors');
      renderDoctors(allDoctors);
    } catch (e) {
      var grid = $('doctorsGrid');
      if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = '<div class="dg-appt-empty"><h3>Could not load doctors</h3><p>Please check your connection and try again.</p><button type="button" class="btn" onclick="DgAppointment.loadDoctors()">Retry</button></div>';
      }
    }
  }

  async function loadAllApprovedDoctors() {
    allDoctors = await fetchDoctors('/api/doctors/all-approved');
    renderDoctors(allDoctors);
  }

  function syncFilterSelections() {
    selectedLocations = Array.from(document.querySelectorAll('#locationCheckboxes input[type="checkbox"]:checked')).map(function (cb) { return cb.value; });
    selectedLanguages = Array.from(document.querySelectorAll('#languageCheckboxes input[type="checkbox"]:checked')).map(function (cb) { return cb.value; });
    renderFilterChips();
  }

  async function loadFilterOptions() {
    try {
      var locRes = await fetch('/api/doctors/locations');
      var locations = locRes.ok ? await locRes.json() : [];
      var locBox = $('locationCheckboxes');
      if (locBox) {
        locBox.innerHTML = '';
        if (!locations.length) {
          locBox.innerHTML = '<p style="color:#666;font-style:italic;">No locations yet</p>';
        } else {
          locations.forEach(function (location, index) {
            var normalized = String(location).replace(/\s*,\s*/g, ', ').trim();
            var item = document.createElement('div');
            item.className = 'filter-checkbox-item';
            item.innerHTML = '<input type="checkbox" id="loc_' + index + '" value="' + normalized.replace(/"/g, '&quot;') + '"><label for="loc_' + index + '">' + escapeHtml(normalized) + '</label>';
            item.querySelector('input').addEventListener('change', syncFilterSelections);
            locBox.appendChild(item);
          });
        }
      }

      var langRes = await fetch('/api/doctors/languages');
      var languages = langRes.ok ? await langRes.json() : [];
      if (!Array.isArray(languages) || !languages.length) {
        languages = ['English', 'Hindi', 'Telugu', 'Kannada', 'Malayalam', 'Tamil'];
      }
      var langBox = $('languageCheckboxes');
      if (langBox) {
        langBox.innerHTML = '';
        languages.forEach(function (language, index) {
          var item = document.createElement('div');
          item.className = 'filter-checkbox-item';
          item.innerHTML = '<input type="checkbox" id="lang_' + index + '" value="' + String(language).replace(/"/g, '&quot;') + '"><label for="lang_' + index + '">' + escapeHtml(language) + '</label>';
          item.querySelector('input').addEventListener('change', syncFilterSelections);
          langBox.appendChild(item);
        });
      }
    } catch (err) {
      console.error('Filter options error', err);
    }
  }

  function closeFilterDropdown() {
    var dd = $('filterDropdown');
    if (dd) dd.classList.remove('show');
  }

  async function applyFilters() {
    syncFilterSelections();
    if (!selectedLocations.length && !selectedLanguages.length) {
      closeFilterDropdown();
      return loadAvailableDoctors();
    }
    try {
      var locationParam = selectedLocations.map(encodeURIComponent).join('|');
      var languageParam = selectedLanguages.map(encodeURIComponent).join('|');
      var url = '/api/doctors/filtered?locations=' + locationParam + '&languages=' + languageParam;
      allDoctors = await fetchDoctors(url);
      closeFilterDropdown();
      renderDoctors(allDoctors);
    } catch (e) {
      var grid = $('doctorsGrid');
      if (grid) grid.innerHTML = '<div class="dg-appt-empty"><h3>Filter error</h3><p>Could not apply filters. Please try again.</p></div>';
    }
  }

  function clearFilters() {
    document.querySelectorAll('#locationCheckboxes input[type="checkbox"], #languageCheckboxes input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    selectedLocations = [];
    selectedLanguages = [];
    searchQuery = '';
    showAvailableOnly = false;
    var search = $('dgApptSearch');
    if (search) search.value = '';
    var toggle = $('dgApptAvailableOnly');
    if (toggle) toggle.checked = false;
    closeFilterDropdown();
    renderFilterChips();
    loadAvailableDoctors();
  }

  function removeFilterChip(type, value) {
    if (type === 'loc') {
      selectedLocations = selectedLocations.filter(function (v) { return v !== value; });
    } else if (type === 'lang') {
      selectedLanguages = selectedLanguages.filter(function (v) { return v !== value; });
    } else if (type === 'search') {
      searchQuery = '';
      if ($('dgApptSearch')) $('dgApptSearch').value = '';
      renderFilterChips();
      renderDoctors(allDoctors);
      return;
    }
    syncCheckboxFilters();
    applyFilters();
  }

  function initUi() {
    document.body.classList.add('dg-appointment-page');
    var back = $('backToHomeBtn');
    if (back) {
      back.textContent = '\u2190 Back to Home';
      back.href = '/patient.html';
    }
    var reg = $('regdocsec');
    if (reg) reg.style.display = 'none';
    var section = $('doctorsSection');
    if (section) {
      section.style.display = 'block';
      section.classList.add('show');
    }
    var filterSec = document.querySelector('.filter-section');
    if (filterSec) filterSec.style.display = 'inline-block';

    var chips = $('dgApptChips');
    if (chips) {
      chips.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        removeFilterChip(btn.getAttribute('data-type'), btn.getAttribute('data-value') || '');
      });
    }

    var search = $('dgApptSearch');
    if (search) {
      search.addEventListener('input', function () {
        searchQuery = search.value;
        renderFilterChips();
        renderDoctors(allDoctors);
      });
    }

    var toggle = $('dgApptAvailableOnly');
    if (toggle) {
      toggle.addEventListener('change', function () {
        showAvailableOnly = toggle.checked;
        renderDoctors(allDoctors);
      });
    }
  }

  function wireGlobals() {
    global.loadAvailableDoctors = loadAvailableDoctors;
    global.loadAllApprovedDoctors = loadAllApprovedDoctors;
    global.applyFilters = applyFilters;
    global.clearFilters = clearFilters;
    global.loadFilterOptions = loadFilterOptions;
    global.doctorsCache = doctorsCache;
  }

  function init() {
    initUi();
    wireGlobals();
    loadFilterOptions().then(loadAvailableDoctors);
  }

  global.DgAppointment = {
    init: init,
    loadDoctors: loadAvailableDoctors,
    loadAllApprovedDoctors: loadAllApprovedDoctors,
    applyFilters: applyFilters,
    clearFilters: clearFilters,
    loadFilterOptions: loadFilterOptions,
    appendDoctorCard: appendDoctorCard,
    renderDoctors: renderDoctors,
    wireGlobals: wireGlobals
  };
})(window);

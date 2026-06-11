(function (global) {
  'use strict';

  function authHeaders(extra) {
    const token = (global.DgAuth && DgAuth.getToken && DgAuth.getToken()) ||
      localStorage.getItem('firebaseIdToken') || '';
    const headers = Object.assign({}, extra || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function setStatus(msg, type) {
    const el = document.getElementById('doctorProfileStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'dg-profile-status' + (type ? ' ' + type : '');
  }

  function togglePaymentMode(mode) {
    const upi = document.getElementById('profileUpiFields');
    const bank = document.getElementById('profileBankFields');
    if (upi) upi.style.display = mode === 'bank' ? 'none' : 'block';
    if (bank) bank.style.display = mode === 'bank' ? 'block' : 'none';
  }

  function fillProfileForm(doctor) {
    if (!doctor) return;
    const map = {
      profileName: doctor.name,
      profileEmail: doctor.email,
      profileSpec: doctor.specialization || (doctor.specializations && doctor.specializations[0]),
      profileLicense: doctor.license || doctor.licenseId,
      profileDegree: doctor.degree,
      profileLocation: doctor.location,
      profileAvailableTime: doctor.availableTime || doctor.slotTime,
      profileLanguages: Array.isArray(doctor.languages) ? doctor.languages.join(', ') : doctor.languages,
      profileFee: doctor.consultationFee || doctor.fee,
      profileExperience: doctor.experience,
      profileBio: doctor.bio || doctor.description,
      profileUpiId: doctor.upiId || doctor.paymentUpiId,
      profileAccountHolder: doctor.accountHolder,
      profileBankName: doctor.bankName,
      profileAccountNumber: doctor.accountNumber,
      profileIfsc: doctor.ifsc
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el && map[id] != null) el.value = map[id];
    });
    const mode = doctor.paymentMode || (doctor.bankName ? 'bank' : 'upi');
    document.querySelectorAll('input[name="profilePaymentMode"]').forEach((r) => {
      r.checked = r.value === mode;
    });
    togglePaymentMode(mode);
    const nameEl = document.getElementById('doctorName');
    if (nameEl && doctor.name) nameEl.textContent = 'Dr. ' + doctor.name;
    const specEl = document.getElementById('doctorSpecialization');
    if (specEl && map.profileSpec) specEl.textContent = map.profileSpec;
    const licEl = document.getElementById('doctorLicense');
    if (licEl && map.profileLicense) licEl.textContent = 'License: ' + map.profileLicense;
  }

  async function loadDoctorProfile() {
    try {
      const res = await fetch('/api/doctor/profile', { headers: authHeaders() });
      if (!res.ok) throw new Error('Could not load profile');
      const data = await res.json();
      fillProfileForm(data.doctor);
      return data.doctor;
    } catch (err) {
      console.warn('Doctor profile load:', err.message);
      return null;
    }
  }

  async function saveDoctorProfile() {
    const form = new FormData();
    const fields = [
      'profileName', 'profileSpec', 'profileLicense', 'profileDegree', 'profileLocation',
      'profileAvailableTime', 'profileLanguages', 'profileFee', 'profileExperience', 'profileBio',
      'profileUpiId', 'profileAccountHolder', 'profileBankName', 'profileAccountNumber', 'profileIfsc'
    ];
    const keyMap = {
      profileName: 'name',
      profileSpec: 'specialization',
      profileLicense: 'license',
      profileDegree: 'degree',
      profileLocation: 'location',
      profileAvailableTime: 'availableTime',
      profileLanguages: 'languages',
      profileFee: 'consultationFee',
      profileExperience: 'experience',
      profileBio: 'bio',
      profileUpiId: 'upiId',
      profileAccountHolder: 'accountHolder',
      profileBankName: 'bankName',
      profileAccountNumber: 'accountNumber',
      profileIfsc: 'ifsc'
    };
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) form.append(keyMap[id] || id, el.value);
    });
    const modeEl = document.querySelector('input[name="profilePaymentMode"]:checked');
    if (modeEl) form.append('paymentMode', modeEl.value);
    const photo = document.getElementById('profilePhoto');
    if (photo && photo.files[0]) form.append('photo', photo.files[0]);
    const docs = document.getElementById('profileDocs');
    if (docs && docs.files.length) {
      Array.from(docs.files).forEach((f) => form.append('documents', f));
    }
    setStatus('Saving profile…', 'info');
    const res = await fetch('/api/doctor/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Save failed');
    fillProfileForm(data.doctor);
    setStatus('Profile saved successfully.', 'success');
    return data.doctor;
  }

  function bindProfileModal() {
    const modal = document.getElementById('doctorProfileEditModal');
    const openBtn = document.getElementById('openDoctorProfileBtn');
    const closeBtn = document.getElementById('closeDoctorProfileBtn');
    const saveBtn = document.getElementById('saveDoctorProfileBtn');
    if (!modal) return;

    document.querySelectorAll('input[name="profilePaymentMode"]').forEach((r) => {
      r.addEventListener('change', () => togglePaymentMode(r.value));
    });

    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        modal.classList.add('show');
        setStatus('', '');
        await loadDoctorProfile();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          await saveDoctorProfile();
        } catch (err) {
          setStatus(err.message || 'Could not save profile.', 'error');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindProfileModal();
    loadDoctorProfile();
  });

  global.DgDoctorProfile = {
    loadDoctorProfile,
    saveDoctorProfile,
    fillProfileForm
  };
})(window);

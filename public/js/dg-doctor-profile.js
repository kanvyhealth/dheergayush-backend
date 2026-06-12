(function (global) {
  'use strict';

  function authHeaders(extra) {
    const token = (global.DgAuth && DgAuth.getToken && DgAuth.getToken()) ||
      localStorage.getItem('firebaseIdToken') || '';
    const headers = Object.assign({}, extra || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function setStatus(msg, type, targetId) {
    const el = document.getElementById(targetId || 'doctorProfileStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'dg-profile-status' + (type ? ' ' + type : '');
  }

  function getDoctorFeeAmount(doctor) {
    if (!doctor) return null;
    const raw = doctor.consultationFee != null ? doctor.consultationFee : doctor.fee;
    if (raw == null || raw === '') return null;
    const feeNum = parseFloat(String(raw).replace(/[^\d.]/g, ''));
    return Number.isNaN(feeNum) ? null : feeNum;
  }

  function formatDoctorFee(amount) {
    if (amount == null) return '₹ —';
    return '₹' + Math.round(amount).toLocaleString('en-IN');
  }

  function updateFeeDisplay(doctor) {
    const display = document.getElementById('doctorFeeDisplay');
    const quickInput = document.getElementById('quickFeeInput');
    const profileFee = document.getElementById('profileFee');
    const fee = getDoctorFeeAmount(doctor);
    if (display) display.textContent = formatDoctorFee(fee);
    if (quickInput && fee != null) quickInput.value = String(Math.round(fee));
    if (profileFee && fee != null) profileFee.value = String(Math.round(fee));
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
    const nameEl = document.getElementById('doctorDisplayName');
    if (nameEl && doctor.name) nameEl.textContent = 'Dr. ' + doctor.name;
    const specEl = document.getElementById('doctorSpecialization');
    if (specEl && map.profileSpec) specEl.textContent = map.profileSpec;
    const licEl = document.getElementById('doctorLicense');
    if (licEl && map.profileLicense) licEl.textContent = 'License: ' + map.profileLicense;

    updateFeeDisplay(doctor);

    if (global.DgAuth && DgAuth.hydrateDoctorPortal) {
      DgAuth.hydrateDoctorPortal({ portal: 'doctor', role: 'Doctor', doctor: doctor });
    }
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
    setStatus('Saving profile…', 'info', 'doctorProfileStatus');
    const res = await fetch('/api/doctor/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Save failed');
    fillProfileForm(data.doctor);
    setStatus('Profile saved successfully.', 'success', 'doctorProfileStatus');
    return data.doctor;
  }

  async function updateConsultationFee(fee) {
    const feeNum = parseFloat(String(fee).replace(/[^\d.]/g, ''));
    if (Number.isNaN(feeNum) || feeNum < 0) {
      throw new Error('Enter a valid consultation fee (₹0 or more).');
    }
    setStatus('Saving fee…', 'info', 'doctorFeeStatus');
    const res = await fetch('/api/doctor/consultation-fee', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ consultationFee: feeNum })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Could not update fee');
    fillProfileForm(data.doctor);
    setStatus('Consultation fee updated.', 'success', 'doctorFeeStatus');
    return data.doctor;
  }

  function bindFeeModal() {
    const modal = document.getElementById('doctorFeeModal');
    const openBtn = document.getElementById('openDoctorFeeBtn');
    const closeBtn = document.getElementById('closeDoctorFeeBtn');
    const saveBtn = document.getElementById('saveDoctorFeeBtn');
    const input = document.getElementById('quickFeeInput');
    if (!modal) return;

    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        modal.classList.add('show');
        setStatus('', '', 'doctorFeeStatus');
        const doctor = await loadDoctorProfile();
        if (doctor) updateFeeDisplay(doctor);
        if (input) input.focus();
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
          await updateConsultationFee(input ? input.value : '');
          setTimeout(() => modal.classList.remove('show'), 600);
        } catch (err) {
          setStatus(err.message || 'Could not update fee.', 'error', 'doctorFeeStatus');
        }
      });
    }
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
    bindFeeModal();
    bindProfileModal();
    loadDoctorProfile();
  });

  global.DgDoctorProfile = {
    loadDoctorProfile,
    saveDoctorProfile,
    updateConsultationFee,
    fillProfileForm,
    updateFeeDisplay
  };
})(window);

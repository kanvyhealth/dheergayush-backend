document.addEventListener('DOMContentLoaded', async () => {
    if (window.DgApi) {
        await DgApi.bootstrapApp({ skipOnLocalhost: true });
    }

    const loginCard = document.getElementById('loginCard');
    const mainOptionsCard = document.getElementById('mainOptionsCard');
    const appointmentsSection = document.getElementById('appointmentsSection');
    const patientLoginForm = document.getElementById('patientLoginForm');
    const messageDiv = document.getElementById('message');
    const yourAppointmentsBtn = document.getElementById('yourAppointmentsBtn');
    const newAppointmentBtn = document.getElementById('newAppointmentBtn');
    const noAppointmentsMessage = document.getElementById('noAppointmentsMessage');

    const transitionDuration = 600;

    async function verifySession() {
        const token = window.DgAuth && DgAuth.getToken();
        if (!token) return false;
        try {
            const res = await fetch('/api/auth/me', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) {
                if (window.DgAuth) DgAuth.clearSession();
                return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    if (await verifySession()) {
        loginCard.classList.remove('visible');
        loginCard.classList.add('hidden');
        mainOptionsCard.classList.remove('hidden');
        mainOptionsCard.classList.add('visible');
    }

    patientLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('patientEmail').value.trim();
        const password = document.getElementById('patientPassword').value;

        if (!email || !password) {
            showMessage('Email and password are required.', 'error');
            return;
        }

        showMessage('Logging in...', 'info');
        try {
            const data = window.DgAuth
                ? await DgAuth.login({ email, password })
                : await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                }).then(async (r) => {
                    const body = await r.json();
                    if (!r.ok) throw new Error(body.message || 'Login failed');
                    if (body.idToken && window.DgAuth) {
                        DgAuth.setSession({ idToken: body.idToken, refreshToken: body.refreshToken, user: body.user });
                    } else if (body.idToken) {
                        localStorage.setItem('firebaseIdToken', body.idToken);
                        if (body.refreshToken) localStorage.setItem('firebaseRefreshToken', body.refreshToken);
                    }
                    return body;
                });

            if (data.idToken && window.DgAuth) {
                DgAuth.setSession({ idToken: data.idToken, refreshToken: data.refreshToken, user: data.user });
            }
            localStorage.setItem('patientPhoneNumber', data.user?.phone || localStorage.getItem('patientPhoneNumber') || '');
            localStorage.setItem('patientId', data.user?.name || data.patientId || email.split('@')[0]);
            localStorage.setItem('userEmail', email);
            showMessage('Login successful!', 'success');

            setTimeout(() => {
                loginCard.classList.remove('visible');
                loginCard.classList.add('hidden');
                setTimeout(() => {
                    mainOptionsCard.classList.remove('hidden');
                    mainOptionsCard.classList.add('visible');
                }, transitionDuration);
            }, 800);
        } catch (error) {
            console.error('Login error:', error);
            showMessage(error.message || 'Invalid email or password.', 'error');
        }
    });

    yourAppointmentsBtn.addEventListener('click', async () => {
        if (!(await verifySession())) {
            showMessage('Session expired. Please log in again.', 'error');
            setTimeout(() => window.location.reload(), 1200);
            return;
        }

        mainOptionsCard.classList.remove('visible');
        mainOptionsCard.classList.add('hidden');

        setTimeout(async () => {
            appointmentsSection.innerHTML = '<h2>Your Appointments</h2>';
            noAppointmentsMessage.style.display = 'none';
            appointmentsSection.appendChild(noAppointmentsMessage);

            const patientPhoneNumber = localStorage.getItem('patientPhoneNumber');
            if (!patientPhoneNumber) {
                showMessage('Phone number not found on your profile. Update it during registration.', 'error');
                return;
            }

            showMessage('Fetching your appointments...', 'info');
            try {
                const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
            const uid = localStorage.getItem('firebaseUid');
            let response;
            let appointments = [];

            if (uid) {
                response = await fetchFn(`/api/payments/patient/${encodeURIComponent(uid)}`);
                if (response.ok) appointments = await response.json();
            }
            if (!appointments.length && patientPhoneNumber) {
                response = await fetchFn(`/api/payments/patient/${encodeURIComponent(patientPhoneNumber)}`);
                if (response.ok) appointments = await response.json();
            }

                if (response.ok && appointments.length > 0) {
                    appointments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                    appointments.forEach((appointment, index) => {
                        const appointmentCard = document.createElement('div');
                        appointmentCard.classList.add('appointment-card');

                        const createdAtDate = new Date(appointment.createdAt);
                        const consultationFee = appointment.selectedDoctorFee || `₹${appointment.amount}`;
                        const daysRemaining = Math.ceil((15 - (new Date() - createdAtDate) / (1000 * 60 * 60 * 24)));
                        const isExpired = daysRemaining <= 0;

                        if (isExpired) appointmentCard.classList.add('expired');

                        appointmentCard.innerHTML = `
                            <div class="timer">${isExpired ? 'Expired' : `${daysRemaining} days left`}</div>
                            <h3>Appointment ${index + 1}</h3>
                            <p><strong>Doctor:</strong> ${appointment.selectedDoctorName}</p>
                            <p><strong>Date:</strong> ${createdAtDate.toLocaleDateString()}</p>
                            <p><strong>Amount Paid:</strong> ${consultationFee}</p>
                            <p><strong>Time Slot:</strong> ${appointment.doctorAvailableTime || 'Not Available'}</p>
                            <p><strong>Room ID:</strong> <span class="room-id">${appointment.roomName}</span></p>
                            ${isExpired
                                ? '<button class="expired-btn">Consultation Expired</button>'
                                : `<button class="start-call-btn" data-room-name="${appointment.roomName}" data-doctor-name="${appointment.selectedDoctorName || ''}" data-time-slot="${(appointment.doctorAvailableTime || '').replace(/"/g, '&quot;')}">Start Video Call Consultation</button>`
                            }
                        `;
                        appointmentsSection.appendChild(appointmentCard);
                    });

                    showMessage('Appointments loaded successfully.', 'success');
                    appointmentsSection.classList.add('visible');

                    await loadConsultationHistory(patientPhoneNumber, appointmentsSection);
                    await loadPrescriptionHistory(patientPhoneNumber, appointmentsSection);

                    document.querySelectorAll('.start-call-btn').forEach((button) => {
                        button.addEventListener('click', async (e) => {
                            const roomName = e.currentTarget.dataset.roomName;
                            const doctorName = e.currentTarget.dataset.doctorName;

                            let effective = 'Available';
                            if (window.DgDoctorStatus && doctorName) {
                                try {
                                    const res = await fetch(`/api/doctors/status/${encodeURIComponent(doctorName)}`);
                                    const data = await res.json();
                                    effective = data.effectiveStatus || data.status || 'Offline';
                                    if (data.bookable === false && effective === 'Available') {
                                        effective = 'Offline';
                                    }
                                } catch (err) {
                                    console.warn('Status check failed', err);
                                }
                            }

                            if (effective !== 'Available') {
                                showMessage(`Doctor is currently ${effective}. Try again during their available hours.`, 'error');
                                return;
                            }

                            try {
                                const accessRes = await fetch(
                                    `/api/video-room/${encodeURIComponent(roomName)}/access?role=patient&t=${Date.now()}`
                                );
                                const accessData = await accessRes.json();
                                if (!accessRes.ok || !accessData.canJoin) {
                                    showMessage(
                                        accessData.message || 'You cannot join this video call yet.',
                                        'error'
                                    );
                                    return;
                                }
                            } catch (err) {
                                console.warn('Room access check failed', err);
                                showMessage('Could not verify consultation status. Please try again.', 'error');
                                return;
                            }

                            localStorage.setItem('videoRoomId', roomName);
                            localStorage.setItem('userRole', 'patient');
                            window.location.href = `/video-call.html?roomID=${encodeURIComponent(roomName)}&role=patient`;
                        });
                    });
                } else {
                    noAppointmentsMessage.style.display = 'block';
                    showMessage('No appointments found for this phone number.', 'info');
                    appointmentsSection.classList.add('visible');
                }
            } catch (error) {
                console.error('Error fetching appointments:', error);
                showMessage('Failed to load appointments. Please try again.', 'error');
            }
        }, transitionDuration);
    });

    newAppointmentBtn.addEventListener('click', () => {
        window.location.href = 'telemedicine_platform.html?mode=new-appointment';
    });

    function showMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
    }

    async function loadConsultationHistory(phone, container) {
        try {
            const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
            const uid = localStorage.getItem('firebaseUid');
            let history = [];
            if (uid) {
                const byUid = await fetchFn(`/api/patient/consultation-history/${encodeURIComponent(uid)}`);
                if (byUid.ok) history = await byUid.json();
            }
            if (!history.length && phone) {
                const byPhone = await fetchFn(`/api/patient/consultation-history/${encodeURIComponent(phone)}`);
                if (byPhone.ok) history = await byPhone.json();
            }
            if (!Array.isArray(history) || history.length === 0) return;

            const section = document.createElement('div');
            section.className = 'consultation-history-section';
            section.innerHTML = '<h2 style="margin-top:2rem;">Consultation History</h2>';

            history.slice(0, 10).forEach((row, index) => {
                const card = document.createElement('div');
                card.className = 'appointment-card';
                const createdAt = row.createdAt ? new Date(row.createdAt).toLocaleString() : '—';
                card.innerHTML = `
                    <h3>Consultation ${index + 1}</h3>
                    <p><strong>Doctor:</strong> ${row.doctorName || '—'}</p>
                    <p><strong>Status:</strong> ${row.status || '—'}</p>
                    <p><strong>Fee:</strong> ₹${row.amount || 0}</p>
                    <p><strong>Room:</strong> ${row.roomId || '—'}</p>
                    <p><strong>Date:</strong> ${createdAt}</p>
                `;
                section.appendChild(card);
            });

            container.appendChild(section);
        } catch (err) {
            console.warn('Consultation history unavailable:', err);
        }
    }

    async function loadPrescriptionHistory(phone, container) {
        try {
            const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
            const res = await fetchFn(`/api/prescriptions/patient/${encodeURIComponent(phone)}`);
            if (!res.ok) return;
            const prescriptions = await res.json();
            if (!Array.isArray(prescriptions) || prescriptions.length === 0) return;

            const section = document.createElement('div');
            section.className = 'prescription-history-section';
            section.innerHTML = '<h2 style="margin-top:2rem;">Your Prescriptions</h2>';

            prescriptions.slice(0, 10).forEach((rx, index) => {
                const card = document.createElement('div');
                card.className = 'appointment-card';
                const items = Array.isArray(rx.items) ? rx.items : [];
                const itemSummary = items.slice(0, 3).map(i => i.name || 'Medicine').join(', ');
                const orderLine = rx.orderId
                    ? `<p><strong>Store order:</strong> ${rx.orderId}</p>`
                    : '';
                card.innerHTML = `
                    <h3>Prescription ${index + 1}</h3>
                    <p><strong>Room:</strong> ${rx.roomID || '—'}</p>
                    <p><strong>Total:</strong> ₹${rx.total || 0}</p>
                    <p><strong>Status:</strong> ${rx.status || 'not-delivered'}</p>
                    <p><strong>Medicines:</strong> ${itemSummary || '—'}${items.length > 3 ? '…' : ''}</p>
                    ${orderLine}
                    <p><strong>Date:</strong> ${rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '—'}</p>
                `;
                section.appendChild(card);
            });

            container.appendChild(section);
        } catch (err) {
            console.warn('Prescription history unavailable:', err);
        }
    }
});

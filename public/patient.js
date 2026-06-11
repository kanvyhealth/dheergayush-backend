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
            if (data.user?.uid) localStorage.setItem('firebaseUid', data.user.uid);
            else if (data.uid) localStorage.setItem('firebaseUid', data.uid);
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

    function initDashboardTabs() {
        document.querySelectorAll('.dg-dash-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.dg-dash-tab').forEach((t) => t.classList.remove('active'));
                document.querySelectorAll('.dg-dash-panel').forEach((p) => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById('tab-' + tab.dataset.tab);
                if (panel) panel.classList.add('active');
            });
        });
    }

    function renderDashStats(statsEl, data) {
        if (!statsEl) return;
        const consultations = data.consultations || [];
        const prescriptions = data.prescriptions || [];
        const orders = data.orders || [];
        const accessPlans = data.accessPlans || [];
        statsEl.innerHTML = `
            <div class="dg-dash-stat"><strong>${consultations.length}</strong><span>Consultations</span></div>
            <div class="dg-dash-stat"><strong>${prescriptions.length}</strong><span>Prescriptions</span></div>
            <div class="dg-dash-stat"><strong>${orders.length}</strong><span>Orders</span></div>
            <div class="dg-dash-stat"><strong>${accessPlans.length}</strong><span>Active plans</span></div>
        `;
    }

    function doctorHasActiveAccess(doctorName, accessPlans) {
        return (accessPlans || []).some(
            (p) => p.active && String(p.doctorName || '').trim() === String(doctorName || '').trim()
        );
    }

    async function startFreeFollowUp(doctorName) {
        const name = localStorage.getItem('patientId') || '';
        const phone = localStorage.getItem('patientPhoneNumber') || '';
        if (!name || !phone) {
            showMessage('Profile details missing. Please log in again.', 'error');
            return;
        }
        showMessage('Starting free follow-up call…', 'info');
        const formData = new FormData();
        formData.append('name', name);
        formData.append('phone', phone);
        formData.append('address', 'Follow-up consultation');
        formData.append('selectedDoctorName', doctorName);
        const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
        const res = await fetchFn('/api/consultations/start-followup', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
            showMessage(data.message || 'Could not start follow-up call.', 'error');
            if (data.requiresPayment) {
                localStorage.setItem('selectedDoctorName', doctorName);
                window.location.href = 'telemedicine_platform.html?mode=new-appointment';
            }
            return;
        }
        const roomId = data.videoRoomId || data.roomId;
        localStorage.setItem('videoRoomId', roomId);
        localStorage.setItem('userRole', 'patient');
        showMessage('Follow-up started! Waiting for doctor to accept…', 'success');
        setTimeout(() => {
            window.location.href = `video-call.html?roomID=${encodeURIComponent(roomId)}&role=patient`;
        }, 1200);
    }

    function bindStartCallButtons(container, accessPlans) {
        container.querySelectorAll('.start-call-btn').forEach((button) => {
            button.addEventListener('click', async (e) => {
                const roomName = e.currentTarget.dataset.roomName;
                const doctorName = e.currentTarget.dataset.doctorName;
                let effective = 'Available';
                if (window.DgDoctorStatus && doctorName) {
                    try {
                        const res = await fetch(`/api/doctors/status/${encodeURIComponent(doctorName)}`);
                        const data = await res.json();
                        effective = data.effectiveStatus || data.status || 'Offline';
                        if (data.bookable === false && effective === 'Available') effective = 'Offline';
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
                        let accessMsg = accessData.message || 'You cannot join this video call yet.';
                        const terminalStatus = accessData.consultationStatus || '';
                        const refundReasonByStatus = {
                            timeout: 'doctor_timeout',
                            rejected: 'doctor_rejected',
                            cancelled: 'consultation_cancelled',
                            refunded: 'doctor_rejected'
                        };
                        const refundReason = refundReasonByStatus[terminalStatus];
                        if (refundReason && !accessData.refunded) {
                            try {
                                const refundRes = await fetch(
                                    `/api/video-room/${encodeURIComponent(roomName)}/refund`,
                                    {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ reason: refundReason })
                                    }
                                );
                                const refundData = await refundRes.json();
                                if (refundData && (refundData.refunded || refundData.alreadyRefunded) && refundData.message) {
                                    accessMsg = refundData.message;
                                }
                            } catch (refundErr) {
                                console.warn('Refund check failed', refundErr);
                            }
                        } else if (accessData.refunded) {
                            accessMsg += ' Your refund has already been processed.';
                        }
                        showMessage(accessMsg, 'error');
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
        container.querySelectorAll('.dg-followup-btn').forEach((btn) => {
            btn.addEventListener('click', () => startFreeFollowUp(btn.dataset.doctorName));
        });
    }

    function renderAppointmentsPanel(panel, appointments, accessPlans) {
        panel.innerHTML = '';
        if (!appointments.length) {
            panel.innerHTML = '<p style="text-align:center;color:#666;">No active appointments.</p>';
            return;
        }
        appointments.forEach((appointment, index) => {
            const appointmentCard = document.createElement('div');
            appointmentCard.classList.add('appointment-card');
            const createdAtDate = new Date(appointment.createdAt);
            const consultationFee = appointment.selectedDoctorFee || `₹${appointment.amount}`;
            const daysRemaining = Math.ceil((15 - (new Date() - createdAtDate) / (1000 * 60 * 60 * 24)));
            const isExpired = daysRemaining <= 0;
            const doctorName = appointment.selectedDoctorName || appointment.doctorName || '';
            const hasAccess = doctorHasActiveAccess(doctorName, accessPlans);
            if (isExpired) appointmentCard.classList.add('expired');
            appointmentCard.innerHTML = `
                <div class="timer">${isExpired ? 'Expired' : `${daysRemaining} days left`}</div>
                <h3>Appointment ${index + 1}</h3>
                <p><strong>Doctor:</strong> ${doctorName}</p>
                <p><strong>Date:</strong> ${createdAtDate.toLocaleDateString()}</p>
                <p><strong>Amount Paid:</strong> ${consultationFee}</p>
                <p><strong>Time Slot:</strong> ${appointment.doctorAvailableTime || 'Not Available'}</p>
                <p><strong>Room ID:</strong> <span class="room-id">${appointment.roomName}</span></p>
                ${hasAccess ? '<p style="color:#16a34a;font-weight:600;">Free follow-up calls available</p>' : ''}
                ${isExpired
                    ? (hasAccess
                        ? `<button class="dg-followup-btn" data-doctor-name="${doctorName.replace(/"/g, '&quot;')}">Call doctor free (15-day plan)</button>`
                        : '<button class="expired-btn">Consultation Expired</button>')
                    : `<button class="start-call-btn" data-room-name="${appointment.roomName}" data-doctor-name="${doctorName.replace(/"/g, '&quot;')}">Start Video Call</button>
                       ${hasAccess ? `<button class="dg-followup-btn" data-doctor-name="${doctorName.replace(/"/g, '&quot;')}">New free follow-up call</button>` : ''}`
                }
            `;
            panel.appendChild(appointmentCard);
        });
        bindStartCallButtons(panel, accessPlans);
    }

    function renderConsultationsPanel(panel, history) {
        panel.innerHTML = '';
        if (!history.length) {
            panel.innerHTML = '<p style="text-align:center;color:#666;">No consultation history yet.</p>';
            return;
        }
        history.forEach((row, index) => {
            const card = document.createElement('div');
            card.className = 'appointment-card';
            card.innerHTML = `
                <h3>Consultation ${index + 1}</h3>
                <p><strong>Doctor:</strong> ${row.doctorName || '—'}</p>
                <p><strong>Status:</strong> ${row.status || '—'}</p>
                <p><strong>Fee:</strong> ₹${row.amount || 0}</p>
                <p><strong>Room:</strong> ${row.roomId || '—'}</p>
                <p><strong>Date:</strong> ${row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</p>
            `;
            panel.appendChild(card);
        });
    }

    function renderPrescriptionsPanel(panel, prescriptions) {
        panel.innerHTML = '';
        if (!prescriptions.length) {
            panel.innerHTML = '<p style="text-align:center;color:#666;">No prescriptions yet.</p>';
            return;
        }
        prescriptions.forEach((rx, index) => {
            const items = Array.isArray(rx.items) ? rx.items : [];
            const itemSummary = items.slice(0, 4).map((i) => i.name || 'Medicine').join(', ');
            const card = document.createElement('div');
            card.className = 'appointment-card';
            card.innerHTML = `
                <h3>Prescription ${index + 1}</h3>
                <p><strong>Room:</strong> ${rx.roomID || '—'}</p>
                <p><strong>Total:</strong> ₹${rx.total || 0}</p>
                <p><strong>Delivery:</strong> ${rx.status || 'not-delivered'}</p>
                <p><strong>Medicines:</strong> ${itemSummary || '—'}${items.length > 4 ? '…' : ''}</p>
                ${rx.orderId ? `<p><strong>Order ID:</strong> ${rx.orderId}</p>` : ''}
                <p><strong>Date:</strong> ${rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '—'}</p>
            `;
            panel.appendChild(card);
        });
    }

    function renderOrdersPanel(panel, orders) {
        panel.innerHTML = '';
        if (!orders.length) {
            panel.innerHTML = '<p style="text-align:center;color:#666;">No store orders yet.</p>';
            return;
        }
        orders.forEach((order, index) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const card = document.createElement('div');
            card.className = 'appointment-card';
            card.innerHTML = `
                <h3>Order ${index + 1}</h3>
                <p><strong>Items:</strong> ${order.itemCount || items.length}</p>
                <p><strong>Total:</strong> ₹${order.totalAmount || 0}</p>
                <p><strong>Payment:</strong> ${order.paymentStatus || '—'}</p>
                <p><strong>Status:</strong> ${order.orderStatus || 'pending'}</p>
                <p><strong>Source:</strong> ${order.source || 'website'}</p>
                <p><strong>Date:</strong> ${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</p>
            `;
            panel.appendChild(card);
        });
    }

    yourAppointmentsBtn.addEventListener('click', async () => {
        if (!(await verifySession())) {
            showMessage('Session expired. Please log in again.', 'error');
            setTimeout(() => window.location.reload(), 1200);
            return;
        }

        mainOptionsCard.classList.remove('visible');
        mainOptionsCard.classList.add('hidden');
        initDashboardTabs();

        setTimeout(async () => {
            noAppointmentsMessage.style.display = 'none';
            const patientPhoneNumber = localStorage.getItem('patientPhoneNumber');
            if (!patientPhoneNumber) {
                showMessage('Phone number not found on your profile. Update it during registration.', 'error');
                return;
            }

            showMessage('Loading your health dashboard…', 'info');
            try {
                const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
                const uid = localStorage.getItem('firebaseUid');
                let dashboard = { consultations: [], prescriptions: [], orders: [], accessPlans: [] };
                let appointments = [];

                const dashId = uid || patientPhoneNumber;
                const dashRes = await fetchFn(`/api/patient/dashboard/${encodeURIComponent(dashId)}`);
                if (dashRes.ok) {
                    dashboard = await dashRes.json();
                }

                if (uid) {
                    const response = await fetchFn(`/api/payments/patient/${encodeURIComponent(uid)}`);
                    if (response.ok) appointments = await response.json();
                }
                if (!appointments.length) {
                    const response = await fetchFn(`/api/payments/patient/${encodeURIComponent(patientPhoneNumber)}`);
                    if (response.ok) appointments = await response.json();
                }
                appointments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                renderDashStats(document.getElementById('patientDashStats'), dashboard);
                renderAppointmentsPanel(
                    document.getElementById('tab-appointments'),
                    appointments,
                    dashboard.accessPlans || []
                );
                renderConsultationsPanel(
                    document.getElementById('tab-consultations'),
                    dashboard.consultations || []
                );
                renderPrescriptionsPanel(
                    document.getElementById('tab-prescriptions'),
                    dashboard.prescriptions || []
                );
                renderOrdersPanel(
                    document.getElementById('tab-orders'),
                    dashboard.orders || []
                );

                if (!appointments.length && !(dashboard.consultations || []).length) {
                    noAppointmentsMessage.style.display = 'block';
                }

                showMessage('Dashboard loaded.', 'success');
                appointmentsSection.classList.add('visible');
            } catch (error) {
                console.error('Error fetching dashboard:', error);
                showMessage('Failed to load dashboard. Please try again.', 'error');
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
});

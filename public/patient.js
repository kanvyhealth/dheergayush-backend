document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('dg-role-pending');

    if (window.DgApi) {
        await DgApi.bootstrapApp({ skipOnLocalhost: true });
    }

    const loginCard = document.getElementById('loginCard');
    const mainOptionsCard = document.getElementById('mainOptionsCard');
    const appointmentsSection = document.getElementById('appointmentsSection');
    const patientLoginForm = document.getElementById('patientLoginForm');
    const loginMessageDiv = document.getElementById('message');
    const dashboardMessageDiv = document.getElementById('dashboardMessage');
    const yourAppointmentsBtn = document.getElementById('yourAppointmentsBtn');
    const newAppointmentBtn = document.getElementById('newAppointmentBtn');
    const dashNewAppointmentBtn = document.getElementById('dashNewAppointmentBtn');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const menuLogoutBtn = document.getElementById('menuLogoutBtn');
    const patientLogoutBtn = document.getElementById('patientLogoutBtn');
    const noAppointmentsMessage = document.getElementById('noAppointmentsMessage');
    const welcomeTitle = document.getElementById('welcomeTitle');
    const welcomeSub = document.getElementById('welcomeSub');
    const patientAvatar = document.getElementById('patientAvatar');
    const patientDashGreeting = document.getElementById('patientDashGreeting');

    const transitionDuration = 500;
    let dashboardTabsReady = false;

    function setPortalLayout(mode) {
        document.body.classList.toggle('dashboard-view', mode === 'dashboard');
        document.body.classList.toggle('auth-login-view', mode === 'login');
    }

    function getDisplayName() {
        const user = window.DgAuth && DgAuth.getUser ? DgAuth.getUser() : null;
        return localStorage.getItem('patientId') || user?.name || 'Patient';
    }

    function updateWelcomeUi() {
        const name = getDisplayName();
        const initial = (name.charAt(0) || 'P').toUpperCase();
        if (welcomeTitle) welcomeTitle.textContent = 'Welcome, ' + name + '!';
        if (welcomeSub) welcomeSub.textContent = 'Book consultations or open your health dashboard.';
        if (patientAvatar) patientAvatar.textContent = initial;
        if (patientDashGreeting) patientDashGreeting.textContent = 'Signed in as ' + name;
    }

    function showMessage(msg, type, scope) {
        const useDashboard = scope === 'dashboard' ||
            (appointmentsSection && appointmentsSection.classList.contains('visible'));
        const el = useDashboard ? dashboardMessageDiv : loginMessageDiv;
        if (!el) return;
        el.textContent = msg;
        el.className = (useDashboard ? 'dg-portal-toast' : 'portal-message') + ' ' + (type || '');
        el.style.display = msg ? 'block' : 'none';
        if (type === 'success' && msg) {
            setTimeout(() => {
                if (el.textContent === msg) {
                    el.style.display = 'none';
                    el.textContent = '';
                }
            }, 4000);
        }
    }

    async function fetchSession() {
        const token = window.DgAuth && DgAuth.getToken();
        if (!token) return null;
        try {
            const res = await fetch('/api/auth/me', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) {
                if (window.DgAuth) DgAuth.clearSession();
                return null;
            }
            return await res.json();
        } catch (_) {
            return null;
        }
    }

    function redirectDoctorIfNeeded(session) {
        if (!session) return false;
        if (session.portal === 'doctor') {
            if (window.DgAuth) DgAuth.setSession(session);
            if (window.DgAuth && DgAuth.redirectAfterAuth(session)) return true;
            window.location.replace(session.redirectTo || '/doctor1.html');
            return true;
        }
        return false;
    }

    function showPatientMenu() {
        loginCard.classList.remove('visible');
        loginCard.classList.add('hidden');
        mainOptionsCard.classList.remove('hidden');
        mainOptionsCard.classList.add('visible');
        appointmentsSection.classList.remove('visible');
        setPortalLayout('menu');
        updateWelcomeUi();
    }

    function logout() {
        if (window.DgAuth) DgAuth.clearSession();
        window.location.reload();
    }

    const session = await fetchSession();
    if (session) {
        if (window.DgAuth) DgAuth.setSession(session);
        if (redirectDoctorIfNeeded(session)) return;
        document.body.classList.remove('dg-role-pending');
        showPatientMenu();
    } else {
        document.body.classList.remove('dg-role-pending');
        setPortalLayout('login');
    }

    patientLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('patientEmail').value.trim();
        const password = document.getElementById('patientPassword').value;

        if (!email || !password) {
            showMessage('Email and password are required.', 'error', 'login');
            return;
        }

        showMessage('Signing in…', 'info', 'login');
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
                    if (window.DgAuth) DgAuth.setSession(body);
                    return body;
                });

            if (data.portal === 'doctor') {
                if (window.DgAuth && DgAuth.redirectAfterAuth(data)) return;
                window.location.replace(data.redirectTo || '/doctor1.html');
                return;
            }

            localStorage.setItem('patientPhoneNumber', data.user?.phone || localStorage.getItem('patientPhoneNumber') || '');
            localStorage.setItem('patientId', data.user?.name || localStorage.getItem('patientId') || email.split('@')[0]);
            localStorage.setItem('userEmail', email);
            if (data.user?.uid) localStorage.setItem('firebaseUid', data.user.uid);

            showMessage('Login successful!', 'success', 'login');
            setTimeout(() => {
                loginCard.classList.remove('visible');
                loginCard.classList.add('hidden');
                setTimeout(showPatientMenu, transitionDuration);
            }, 500);
        } catch (error) {
            console.error('Login error:', error);
            showMessage(error.message || 'Invalid email or password.', 'error', 'login');
        }
    });

    function initDashboardTabs() {
        if (dashboardTabsReady) return;
        document.querySelectorAll('.dg-dash-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.dg-dash-tab').forEach((t) => t.classList.remove('active'));
                document.querySelectorAll('.dg-dash-panel').forEach((p) => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById('tab-' + tab.dataset.tab);
                if (panel) panel.classList.add('active');
            });
        });
        dashboardTabsReady = true;
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

    function getAccessDaysRemaining(doctorName, accessPlans) {
        const row = (accessPlans || []).find(
            (p) => p.active && String(p.doctorName || '').trim() === String(doctorName || '').trim()
        );
        return row ? Number(row.daysRemaining) || 0 : 0;
    }

    function getFreeConsultationsRemaining(doctorName, accessPlans) {
        const row = (accessPlans || []).find(
            (p) => p.active && String(p.doctorName || '').trim() === String(doctorName || '').trim()
        );
        return row ? Number(row.freeConsultationsRemaining) || 0 : 0;
    }

    function canStartFreeFollowUp(doctorName, accessPlans) {
        return getFreeConsultationsRemaining(doctorName, accessPlans) > 0;
    }

    async function startFreeFollowUp(doctorName) {
        const name = localStorage.getItem('patientId') || '';
        const phone = localStorage.getItem('patientPhoneNumber') || '';
        if (!name || !phone) {
            showMessage('Profile details missing. Please log in again.', 'error', 'dashboard');
            return;
        }
        showMessage('Starting free follow-up call…', 'info', 'dashboard');
        const formData = new FormData();
        formData.append('name', name);
        formData.append('phone', phone);
        formData.append('address', 'Follow-up consultation');
        formData.append('selectedDoctorName', doctorName);
        const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
        const res = await fetchFn('/api/consultations/start-followup', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
            showMessage(data.message || 'Could not start follow-up call.', 'error', 'dashboard');
            if (data.requiresPayment) {
                localStorage.setItem('selectedDoctorName', doctorName);
                window.location.href = 'telemedicine_platform.html?mode=new-appointment';
            }
            return;
        }
        const roomId = data.videoRoomId || data.roomId;
        localStorage.setItem('videoRoomId', roomId);
        localStorage.setItem('userRole', 'patient');
        showMessage('Follow-up started! Opening video room — your doctor will join after accepting.', 'success', 'dashboard');
        window.location.href = `/video-call.html?roomID=${encodeURIComponent(roomId)}&role=patient&fromPayment=1`;
    }

    function bindStartCallButtons(container, accessPlans) {
        container.querySelectorAll('.dg-action-btn--call').forEach((button) => {
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
                    showMessage(`Doctor is currently ${effective}. Try again later.`, 'error', 'dashboard');
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
                        showMessage(accessMsg, 'error', 'dashboard');
                        return;
                    }
                } catch (err) {
                    console.warn('Room access check failed', err);
                    showMessage('Could not verify consultation status. Please try again.', 'error', 'dashboard');
                    return;
                }
                localStorage.setItem('videoRoomId', roomName);
                localStorage.setItem('userRole', 'patient');
                window.location.href = `/video-call.html?roomID=${encodeURIComponent(roomName)}&role=patient`;
            });
        });
        container.querySelectorAll('.dg-action-btn--followup').forEach((btn) => {
            btn.addEventListener('click', () => startFreeFollowUp(btn.dataset.doctorName));
        });
    }

    function renderAppointmentsPanel(panel, appointments, accessPlans) {
        panel.innerHTML = '';
        if (!appointments.length) {
            panel.innerHTML = '<p class="dg-dash-empty">No active appointments.</p>';
            return;
        }
        appointments.forEach((appointment, index) => {
            const card = document.createElement('div');
            card.classList.add('dg-record-card');
            const createdAtDate = new Date(appointment.createdAt);
            const consultationFee = appointment.selectedDoctorFee || `₹${appointment.amount}`;
            const doctorName = appointment.selectedDoctorName || appointment.doctorName || '';
            const hasAccess = doctorHasActiveAccess(doctorName, accessPlans);
            const daysRemaining = hasAccess ? getAccessDaysRemaining(doctorName, accessPlans) : 0;
            const freeRemaining = hasAccess ? getFreeConsultationsRemaining(doctorName, accessPlans) : 0;
            const canFollowUp = hasAccess && canStartFreeFollowUp(doctorName, accessPlans);
            const isExpired = !hasAccess;
            if (isExpired) card.classList.add('expired');
            const safeDoctor = doctorName.replace(/"/g, '&quot;');
            card.innerHTML = `
                <div class="timer">${hasAccess ? `${daysRemaining} day(s) free follow-up left` : '15-day plan expired'}</div>
                <h3>Appointment ${index + 1}</h3>
                <p><strong>Doctor:</strong> ${doctorName}</p>
                <p><strong>Date:</strong> ${createdAtDate.toLocaleDateString()}</p>
                <p><strong>Amount:</strong> ${consultationFee}</p>
                <p><strong>Time Slot:</strong> ${appointment.doctorAvailableTime || 'Not set'}</p>
                <p><strong>Room ID:</strong> <span class="room-id">${appointment.roomName}</span></p>
                ${hasAccess
                    ? (canFollowUp
                        ? `<p style="color:#16a34a;font-weight:600;">${freeRemaining} free follow-up call(s) remaining</p>`
                        : '<p style="color:#b45309;font-weight:600;">All 3 free follow-ups used — pay for a new consultation</p>')
                    : ''}
                ${isExpired
                    ? (canFollowUp
                        ? `<button type="button" class="dg-action-btn dg-action-btn--followup" data-doctor-name="${safeDoctor}">Call doctor free (15-day plan)</button>`
                        : '<button type="button" class="dg-action-btn dg-action-btn--expired" disabled>Consultation Expired</button>')
                    : `<button type="button" class="dg-action-btn dg-action-btn--call" data-room-name="${appointment.roomName}" data-doctor-name="${safeDoctor}">Start Video Call</button>
                       ${canFollowUp ? `<button type="button" class="dg-action-btn dg-action-btn--followup" data-doctor-name="${safeDoctor}">New free follow-up call</button>` : ''}`
                }
            `;
            panel.appendChild(card);
        });
        bindStartCallButtons(panel, accessPlans);
    }

    function renderConsultationsPanel(panel, history) {
        panel.innerHTML = '';
        if (!history.length) {
            panel.innerHTML = '<p class="dg-dash-empty">No consultation history yet.</p>';
            return;
        }
        history.forEach((row, index) => {
            const card = document.createElement('div');
            card.className = 'dg-record-card';
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
            panel.innerHTML = '<p class="dg-dash-empty">No prescriptions yet.</p>';
            return;
        }
        prescriptions.forEach((rx, index) => {
            const items = Array.isArray(rx.items) ? rx.items : [];
            const itemSummary = items.slice(0, 4).map((i) => i.name || 'Medicine').join(', ');
            const card = document.createElement('div');
            card.className = 'dg-record-card';
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
            panel.innerHTML = '<p class="dg-dash-empty">No store orders yet.</p>';
            return;
        }
        orders.forEach((order, index) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const card = document.createElement('div');
            card.className = 'dg-record-card';
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

    async function openDashboard() {
        const activeSession = await fetchSession();
        if (!activeSession) {
            showMessage('Session expired. Please sign in again.', 'error', 'dashboard');
            setTimeout(() => window.location.reload(), 1200);
            return;
        }
        if (redirectDoctorIfNeeded(activeSession)) return;

        mainOptionsCard.classList.remove('visible');
        mainOptionsCard.classList.add('hidden');
        setPortalLayout('dashboard');
        initDashboardTabs();
        updateWelcomeUi();

        noAppointmentsMessage.style.display = 'none';
        showMessage('Loading your health dashboard…', 'info', 'dashboard');

        const patientPhoneNumber = localStorage.getItem('patientPhoneNumber');
        if (!patientPhoneNumber) {
            showMessage('Phone number not found on your profile. Update it during registration.', 'error', 'dashboard');
            appointmentsSection.classList.add('visible');
            return;
        }

        try {
            const fetchFn = window.DgAuth && DgAuth.authFetch ? DgAuth.authFetch.bind(DgAuth) : fetch;
            const uid = localStorage.getItem('firebaseUid');
            let dashboard = { consultations: [], prescriptions: [], orders: [], accessPlans: [] };
            let appointments = [];

            const dashId = uid || patientPhoneNumber;
            const dashRes = await fetchFn(`/api/patient/dashboard/${encodeURIComponent(dashId)}`);
            if (dashRes.ok) dashboard = await dashRes.json();

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

            const hasAnyData = appointments.length ||
                (dashboard.consultations || []).length ||
                (dashboard.prescriptions || []).length ||
                (dashboard.orders || []).length;
            noAppointmentsMessage.style.display = hasAnyData ? 'none' : 'block';

            showMessage('Dashboard loaded.', 'success', 'dashboard');
            appointmentsSection.classList.add('visible');
        } catch (error) {
            console.error('Error fetching dashboard:', error);
            showMessage('Failed to load dashboard. Please try again.', 'error', 'dashboard');
            appointmentsSection.classList.add('visible');
        }
    }

    yourAppointmentsBtn.addEventListener('click', () => openDashboard());

    function goNewAppointment() {
        window.location.href = 'telemedicine_platform.html?mode=new-appointment';
    }

    newAppointmentBtn.addEventListener('click', goNewAppointment);
    if (dashNewAppointmentBtn) dashNewAppointmentBtn.addEventListener('click', goNewAppointment);

    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            appointmentsSection.classList.remove('visible');
            showPatientMenu();
        });
    }

    if (menuLogoutBtn) menuLogoutBtn.addEventListener('click', logout);
    if (patientLogoutBtn) patientLogoutBtn.addEventListener('click', logout);
});

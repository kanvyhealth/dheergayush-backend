document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('dg-role-pending');

    if (window.DgApi) {
        await DgApi.bootstrapApp({ skipOnLocalhost: true });
    }

    const loginCard = document.getElementById('loginCard');
    const mainOptionsCard = document.getElementById('mainOptionsCard');
    const appointmentsSection = document.getElementById('appointmentsSection');
    const patientLoginForm = document.getElementById('patientLoginForm');
    const patientForgotPasswordBtn = document.getElementById('patientForgotPasswordBtn');
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

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatMoney(value) {
        const raw = String(value == null ? '' : value).replace(/[₹,\s]/g, '');
        const num = Number(raw);
        if (!Number.isFinite(num)) return escapeHtml(value == null || value === '' ? '—' : value);
        return '₹' + num.toLocaleString('en-IN');
    }

    function formatDate(value, withTime) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return withTime
            ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
            : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function prettyStatus(value) {
        const raw = String(value || '').trim();
        if (!raw) return '—';
        return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function chipKind(value) {
        const s = String(value || '').toLowerCase();
        if (/active|paid|delivered|complete|confirmed|success/.test(s)) return 'ok';
        if (/pending|process|ship|packed|follow/.test(s)) return 'info';
        if (/expir|cancel|fail|reject|refund|unpaid/.test(s)) return 'danger';
        if (/used|wait/.test(s)) return 'warn';
        return 'muted';
    }

    function metaRow(label, valueHtml) {
        if (!valueHtml || valueHtml === '—') return '';
        return '<div class="dg-meta-row"><span>' + escapeHtml(label) + '</span><strong>' + valueHtml + '</strong></div>';
    }

    function switchDashTab(tabName) {
        const tab = document.querySelector('.dg-dash-tab[data-tab="' + tabName + '"]');
        if (!tab) return;
        tab.click();
    }

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
        openDashboard();
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
                openDashboard();
            }, 350);
        } catch (error) {
            console.error('Login error:', error);
            showMessage(error.message || 'Invalid email or password.', 'error', 'login');
        }
    });

    if (patientForgotPasswordBtn) {
        patientForgotPasswordBtn.addEventListener('click', async () => {
            const email = document.getElementById('patientEmail').value.trim();
            if (!email) {
                showMessage('Enter your registered email above, then tap Forgot Password.', 'error', 'login');
                return;
            }
            showMessage('Sending password reset link...', 'info', 'login');
            try {
                const data = window.DgAuth && DgAuth.forgotPassword
                    ? await DgAuth.forgotPassword(email)
                    : await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    }).then(async (r) => {
                        const body = await r.json().catch(() => ({}));
                        if (!r.ok) throw new Error(body.message || 'Could not send reset link');
                        return body;
                    });
                showMessage(data.message || 'If an account exists, a password reset link has been sent.', 'success', 'login');
            } catch (error) {
                showMessage(error.message || 'Could not send reset link.', 'error', 'login');
            }
        });
    }

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

    function renderDashStats(statsEl, data, appointmentCount) {
        if (!statsEl) return;
        const consultations = data.consultations || [];
        const prescriptions = data.prescriptions || [];
        const orders = data.orders || [];
        statsEl.innerHTML = `
            <button type="button" class="dg-dash-stat" data-jump="appointments"><strong>${appointmentCount || 0}</strong><span>Appointments</span></button>
            <button type="button" class="dg-dash-stat" data-jump="consultations"><strong>${consultations.length}</strong><span>Consultations</span></button>
            <button type="button" class="dg-dash-stat" data-jump="prescriptions"><strong>${prescriptions.length}</strong><span>Prescriptions</span></button>
            <button type="button" class="dg-dash-stat" data-jump="orders"><strong>${orders.length}</strong><span>Orders</span></button>
        `;
        statsEl.querySelectorAll('[data-jump]').forEach((btn) => {
            btn.addEventListener('click', () => switchDashTab(btn.getAttribute('data-jump')));
        });
        document.querySelectorAll('.dg-dash-tab').forEach((tab) => {
            const counts = {
                appointments: appointmentCount || 0,
                consultations: consultations.length,
                prescriptions: prescriptions.length,
                orders: orders.length
            };
            const key = tab.dataset.tab;
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            tab.innerHTML = label + ' <span class="dg-tab-count">' + (counts[key] || 0) + '</span>';
        });
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
                window.location.href = 'book-appointment.html';
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
            const hasAnyPlan = (accessPlans || []).length > 0;
            const hasActive = (accessPlans || []).some((p) => p.active);
            if (!hasAnyPlan) {
                panel.innerHTML = '<p class="dg-dash-empty">No appointments yet. Book a consultation to get started.</p>';
            } else if (!hasActive) {
                panel.innerHTML = '<p class="dg-dash-empty">Your 15-day follow-up window has ended. Book a new consultation to continue with your doctor.</p>';
            } else {
                panel.innerHTML = '<p class="dg-dash-empty">No live appointment right now. You still have free follow-up access from Consultations.</p>';
            }
            return;
        }
        appointments.forEach((appointment) => {
            const card = document.createElement('div');
            card.classList.add('dg-record-card');
            const doctorName = appointment.selectedDoctorName || appointment.doctorName || '';
            const hasAccess = doctorHasActiveAccess(doctorName, accessPlans);
            const daysRemaining = hasAccess ? getAccessDaysRemaining(doctorName, accessPlans) : 0;
            const freeRemaining = hasAccess ? getFreeConsultationsRemaining(doctorName, accessPlans) : 0;
            const canFollowUp = hasAccess && canStartFreeFollowUp(doctorName, accessPlans);
            const isExpired = !hasAccess;
            if (isExpired) card.classList.add('expired');
            const safeDoctor = escapeHtml(doctorName);
            const chip = hasAccess
                ? `<span class="dg-chip dg-chip--ok">${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left</span>`
                : '<span class="dg-chip dg-chip--danger">Plan ended</span>';
            const followNote = hasAccess
                ? (canFollowUp
                    ? metaRow('Follow-up', escapeHtml(freeRemaining + ' free call' + (freeRemaining === 1 ? '' : 's') + ' remaining'))
                    : metaRow('Follow-up', 'All free calls used'))
                : '';
            const actions = isExpired
                ? (canFollowUp
                    ? `<div class="dg-record-actions"><button type="button" class="dg-action-btn dg-action-btn--followup" data-doctor-name="${safeDoctor}">Start free follow-up</button></div>`
                    : '<div class="dg-record-actions"><button type="button" class="dg-action-btn dg-action-btn--expired" disabled>Consultation ended</button></div>')
                : `<div class="dg-record-actions">
                    <button type="button" class="dg-action-btn dg-action-btn--call" data-room-name="${escapeHtml(appointment.roomName || '')}" data-doctor-name="${safeDoctor}">Join video call</button>
                    ${canFollowUp ? `<button type="button" class="dg-action-btn dg-action-btn--followup" data-doctor-name="${safeDoctor}">Free follow-up</button>` : ''}
                   </div>`;
            card.innerHTML = `
                <div class="dg-record-head">
                    <h3>${safeDoctor || 'Appointment'}</h3>
                    ${chip}
                </div>
                ${metaRow('Date', escapeHtml(formatDate(appointment.createdAt)))}
                ${metaRow('Fee', escapeHtml(formatMoney(appointment.selectedDoctorFee || appointment.amount)))}
                ${metaRow('Slot', escapeHtml(appointment.doctorAvailableTime || '—'))}
                ${followNote}
                ${actions}
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
        history.forEach((row) => {
            const card = document.createElement('div');
            card.className = 'dg-record-card';
            const status = prettyStatus(row.status);
            card.innerHTML = `
                <div class="dg-record-head">
                    <h3>${escapeHtml(row.doctorName || 'Consultation')}</h3>
                    <span class="dg-chip dg-chip--${chipKind(row.status)}">${escapeHtml(status)}</span>
                </div>
                ${metaRow('Date', escapeHtml(formatDate(row.createdAt, true)))}
                ${metaRow('Fee', escapeHtml(formatMoney(row.amount)))}
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
        prescriptions.forEach((rx) => {
            const items = Array.isArray(rx.items) ? rx.items : [];
            const itemSummary = items.slice(0, 4).map((i) => i.name || 'Medicine').join(', ');
            const card = document.createElement('div');
            card.className = 'dg-record-card';
            const delivery = prettyStatus(rx.status || 'not delivered');
            card.innerHTML = `
                <div class="dg-record-head">
                    <h3>${escapeHtml(itemSummary || 'Prescription')}</h3>
                    <span class="dg-chip dg-chip--${chipKind(rx.status)}">${escapeHtml(delivery)}</span>
                </div>
                ${metaRow('Total', escapeHtml(formatMoney(rx.total)))}
                ${metaRow('Date', escapeHtml(formatDate(rx.createdAt)))}
                ${rx.orderId ? metaRow('Order', escapeHtml(rx.orderId)) : ''}
                <div class="dg-record-actions">
                  <button type="button" class="dg-action-btn dg-action-btn--primary" data-order-rx>Order from store</button>
                  ${rx.orderId ? `<a class="dg-action-btn dg-action-btn--ghost" href="/store-invoice.html?orderId=${encodeURIComponent(rx.orderId)}" target="_blank" rel="noopener">View order</a>` : ''}
                </div>
            `;
            const orderBtn = card.querySelector('[data-order-rx]');
            if (orderBtn) {
                orderBtn.addEventListener('click', () => {
                    try {
                        const handoff = {
                            items: items.map((i) => ({
                                medicineId: i.medicineId || i.productId || i.id || '',
                                name: i.name || 'Medicine',
                                pricePerUnit: Number(i.pricePerUnit != null ? i.pricePerUnit : i.price) || 0,
                                quantity: Number(i.quantity || 1) || 1,
                                weightValue: i.weightValue != null ? i.weightValue : (i.selectedWeight && i.selectedWeight.value) || 1,
                                weightUnit: i.weightUnit || (i.selectedWeight && i.selectedWeight.unit) || i.unit || 'unit',
                                storeId: i.storeId || i.company || 'general',
                                storeName: i.storeName || i.company || '',
                                imageUrl: i.imageUrl || ''
                            })),
                            total: rx.total || 0,
                            savedAt: new Date().toISOString(),
                            roomId: rx.roomID || rx.appointmentId || '',
                            appointmentId: rx.appointmentId || rx.roomID || '',
                            prescriptionId: rx._id || rx.id || rx.prescriptionId || ''
                        };
                        localStorage.setItem('dgStorePrescriptionCartHandoff', JSON.stringify(handoff));
                        const q = new URLSearchParams();
                        if (handoff.prescriptionId) q.set('prescriptionId', handoff.prescriptionId);
                        if (handoff.appointmentId) q.set('appointmentId', handoff.appointmentId);
                        window.location.href = '/store' + (q.toString() ? ('?' + q.toString()) : '');
                    } catch (err) {
                        showMessage(err.message || 'Could not open store', 'error', 'dashboard');
                    }
                });
            }
            panel.appendChild(card);
        });
    }

    function renderOrdersPanel(panel, orders) {
        panel.innerHTML = '';
        if (!orders.length) {
            panel.innerHTML = '<p class="dg-dash-empty">No store orders yet.</p>';
            return;
        }
        orders.forEach((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const card = document.createElement('div');
            card.className = 'dg-record-card';
            const itemNames = items.slice(0, 4).map((it) => it.name || it.medicineName || 'Item').join(', ');
            const ship = order.shipment && (order.shipment.trackingNumber || order.shipment.courier || order.shipment.status)
                ? [order.shipment.status, order.shipment.courier, order.shipment.trackingNumber].filter(Boolean).join(' · ')
                : 'Not shipped yet';
            const trackLink = order.shipment && order.shipment.trackingUrl
                ? ' <a href="' + escapeHtml(order.shipment.trackingUrl) + '" target="_blank" rel="noopener">Track</a>'
                : '';
            const canCancel = ['pending', 'confirmed'].includes(String(order.orderStatus || order.status || '').toLowerCase());
            const orderStatus = prettyStatus(order.orderStatus || 'pending');
            card.innerHTML = `
                <div class="dg-record-head">
                    <h3>${escapeHtml(itemNames || 'Store order')}</h3>
                    <span class="dg-chip dg-chip--${chipKind(order.orderStatus || order.paymentStatus)}">${escapeHtml(orderStatus)}</span>
                </div>
                ${metaRow('Items', escapeHtml(String(order.itemCount || items.length || 0)))}
                ${metaRow('Total', escapeHtml(formatMoney(order.totalAmount)))}
                ${metaRow('Payment', escapeHtml(prettyStatus(order.paymentStatus)))}
                ${metaRow('Date', escapeHtml(formatDate(order.orderDate, true)))}
                ${metaRow('Shipment', escapeHtml(ship) + trackLink)}
                <div class="dg-record-actions">
                  <a class="dg-action-btn dg-action-btn--ghost" href="/store-invoice.html?orderId=${encodeURIComponent(order._id || order.id || '')}" target="_blank" rel="noopener">Invoice</a>
                  <a class="dg-action-btn dg-action-btn--ghost" href="/store">Reorder</a>
                  ${canCancel ? `<button type="button" class="dg-action-btn dg-action-btn--ghost" data-cancel-order="${escapeHtml(order._id || order.id || '')}">Cancel</button>` : ''}
                </div>
            `;
            const cancelBtn = card.querySelector('[data-cancel-order]');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', async () => {
                    const oid = cancelBtn.getAttribute('data-cancel-order');
                    if (!oid || !confirm('Cancel this order?')) return;
                    try {
                        const token = localStorage.getItem('firebaseIdToken') || localStorage.getItem('idToken') || '';
                        const res = await fetch(`/api/orders/${encodeURIComponent(oid)}/cancel`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {})
                            },
                            body: JSON.stringify({ reason: 'customer_cancelled' })
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.message || 'Cancel failed');
                        showMessage(data.message || 'Order cancelled', 'success', 'dashboard');
                        openDashboard();
                    } catch (err) {
                        showMessage(err.message || 'Cancel failed', 'error', 'dashboard');
                    }
                });
            }
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

        loginCard.classList.remove('visible');
        loginCard.classList.add('hidden');
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

            renderDashStats(document.getElementById('patientDashStats'), dashboard, appointments.length);
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

            if (noAppointmentsMessage) {
                noAppointmentsMessage.hidden = true;
                noAppointmentsMessage.style.display = 'none';
            }

            if (dashboardMessageDiv) {
                dashboardMessageDiv.style.display = 'none';
                dashboardMessageDiv.textContent = '';
            }
            appointmentsSection.classList.add('visible');
        } catch (error) {
            console.error('Error fetching dashboard:', error);
            showMessage('Failed to load dashboard. Please try again.', 'error', 'dashboard');
            appointmentsSection.classList.add('visible');
        }
    }

    function goNewAppointment() {
        window.location.href = 'book-appointment.html';
    }

    if (yourAppointmentsBtn) yourAppointmentsBtn.addEventListener('click', () => openDashboard());
    if (newAppointmentBtn) newAppointmentBtn.addEventListener('click', goNewAppointment);
    if (dashNewAppointmentBtn) dashNewAppointmentBtn.addEventListener('click', goNewAppointment);

    if (backToMenuBtn && backToMenuBtn.tagName === 'BUTTON') {
        backToMenuBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    if (menuLogoutBtn) menuLogoutBtn.addEventListener('click', logout);
    if (patientLogoutBtn) patientLogoutBtn.addEventListener('click', logout);
});

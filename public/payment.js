document.addEventListener('DOMContentLoaded', async () => {
    if (window.DgApi) {
        await DgApi.bootstrapApp({ skipOnLocalhost: true });
    }
    if (window.DgRealtime) {
        DgRealtime.connect();
    }
    const paymentForm = document.getElementById('paymentForm');
    const displayDoctorName = document.getElementById('displayDoctorName');
    const displayDoctorFee = document.getElementById('displayDoctorFee');
    const selectedDoctorNameInput = document.getElementById('selectedDoctorName');
    const selectedDoctorFeeInput = document.getElementById('selectedDoctorFee');
    const responseMessageDiv = document.getElementById('responseMessage');
    const razorpayFeeEl = document.getElementById('razorpayFee');
    const razorpayLoginHint = document.getElementById('razorpayLoginHint');
    const payBtn = document.getElementById('payBtn');
    const patientReportsInput = document.getElementById('patientReports');
    const patientFileList = document.getElementById('patientFileList');
    const waitingPopup = document.getElementById('waitingPopup');
    const countdownText = document.getElementById('countdown');
    const consultationWaitingRoom = document.getElementById('consultationWaitingRoom');
    const consultWaitStatus = document.getElementById('consultWaitStatus');
    const consultWaitTimer = document.getElementById('consultWaitTimer');
    const cancelConsultWaitBtn = document.getElementById('cancelConsultWaitBtn');

    let doctorName = localStorage.getItem('selectedDoctorName');
    let doctorFeeRaw = localStorage.getItem('selectedDoctorFee');
    let selectedReports = [];
    let activeConsultationId = null;
    let waitCountdownInterval = null;
    const consultationAmount = parseFloat(String(doctorFeeRaw || '').replace(/[^\d.]/g, '')) || 0;

    if (doctorName && doctorFeeRaw) {
        displayDoctorName.textContent = doctorName;
        displayDoctorFee.textContent = doctorFeeRaw;
        selectedDoctorNameInput.value = doctorName;
        selectedDoctorFeeInput.value = String(consultationAmount);
    } else {
        showMessage('Doctor or fee details not found.', 'error');
        return;
    }

    const nameInput = document.getElementById('name');
    const phoneInput = document.getElementById('phone');
    const addressInput = document.getElementById('address');
    const loggedName = localStorage.getItem('patientId') || (window.DgAuth && DgAuth.getUser && DgAuth.getUser()?.name);
    const loggedPhone = localStorage.getItem('patientPhoneNumber') || (window.DgAuth && DgAuth.getUser && DgAuth.getUser()?.phone);
    if (nameInput && loggedName && !nameInput.value) nameInput.value = loggedName;
    if (phoneInput && loggedPhone && !phoneInput.value) phoneInput.value = loggedPhone.replace(/\D/g, '').slice(-10);
    if (addressInput && !addressInput.value) addressInput.placeholder = 'Full address for consultation records';

    let followUpAccess = null;

    async function checkConsultationAccess() {
        if (!doctorName || !window.DgAuth || !DgAuth.authFetch) return;
        try {
            const phone = phoneInput ? phoneInput.value.trim() : localStorage.getItem('patientPhoneNumber') || '';
            const qs = new URLSearchParams({ doctorName, phone });
            const res = await DgAuth.authFetch('/api/consultations/access-check?' + qs.toString());
            if (!res.ok) return;
            followUpAccess = await res.json();
            if (followUpAccess && followUpAccess.covered) {
                if (razorpayFeeEl) {
                    razorpayFeeEl.innerHTML = '<strong style="color:#16a34a;">Free follow-up</strong> — ' +
                        (followUpAccess.message || 'Included in your 15-day plan with this doctor.');
                }
                if (payBtn) payBtn.textContent = 'Start free follow-up call';
                selectedDoctorFeeInput.value = '0';
            }
        } catch (e) {
            console.warn('Access check failed', e);
        }
    }

    if (razorpayFeeEl) {
        razorpayFeeEl.textContent = consultationAmount > 0
            ? 'Amount: ₹' + consultationAmount.toFixed(2)
            : 'Free consultation';
    }
    checkConsultationAccess();
    const hasAuth = window.DgAuth && DgAuth.getToken && DgAuth.getToken();
    if (!hasAuth && razorpayLoginHint) {
        razorpayLoginHint.style.display = 'block';
        if (payBtn) payBtn.disabled = true;
    }

    patientReportsInput.addEventListener('change', (e) => {
        selectedReports = Array.from(e.target.files);
        updateReportsList();
    });

    function updateReportsList() {
        patientFileList.innerHTML = '';
        if (selectedReports.length === 0) {
            patientFileList.innerHTML = '<li><span class="file-name">No files selected</span></li>';
            return;
        }
        selectedReports.forEach((file, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="file-name">${file.name}</span><button type="button" onclick="removeReport(${index})">❌</button>`;
            patientFileList.appendChild(li);
        });
    }

    window.removeReport = function(index) {
        selectedReports = selectedReports.filter((_, i) => i !== index);
        updateReportsList();
        if (selectedReports.length === 0) patientReportsInput.value = '';
    };

    async function getDoctorStatusInfo(name) {
        try {
            const res = await fetch(`/api/doctors/status/${encodeURIComponent(name)}`);
            if (!res.ok) throw new Error('Failed to fetch status');
            const data = await res.json();
            return {
                status: data.status,
                effectiveStatus: data.effectiveStatus || data.status,
                bookable: !!data.bookable
            };
        } catch (err) {
            console.error('Status error:', err);
            return { status: 'Unavailable', effectiveStatus: 'Unavailable', bookable: false };
        }
    }

    async function waitForAvailabilityAndThenSubmit(name) {
        waitingPopup.classList.add('visible');
        let timeLeft = 300;

        const updateCountdown = () => {
            const min = Math.floor(timeLeft / 60);
            const sec = timeLeft % 60;
            countdownText.textContent = `⏳ ${min}:${sec.toString().padStart(2, '0')} minutes remaining`;
        };
        updateCountdown();

        const countdownInterval = setInterval(() => {
            timeLeft--;
            updateCountdown();
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                clearInterval(statusCheck);
                waitingPopup.classList.remove('visible');
                alert('Doctor is still unavailable. Please try again later.');
                window.location.href = '/';
            }
        }, 1000);

        const checkStatus = async () => {
            const info = await getDoctorStatusInfo(name);
            if (info.effectiveStatus !== 'Busy') {
                clearInterval(countdownInterval);
                clearInterval(statusCheck);
                waitingPopup.classList.remove('visible');
                submitPayment();
            }
        };

        await checkStatus();
        const statusCheck = setInterval(checkStatus, 5000);
    }

    async function downloadReceipt(paymentData) {
        try {
            const response = await fetch('invoice.html');
            let template = await response.text();
            template = template.replace(/<span id="receiptTransactionId"><\/span>/, `<span id="receiptTransactionId">${paymentData.transactionId}</span>`);
            template = template.replace(/<span id="receiptDate"><\/span>/, `<span id="receiptDate">${new Date().toLocaleDateString('en-GB')}</span>`);
            template = template.replace(/<span id="receiptDoctorName"><\/span>/, `<span id="receiptDoctorName">${paymentData.doctorName}</span>`);
            template = template.replace(/<span id="receiptDoctorFee"><\/span>/, `<span id="receiptDoctorFee">${paymentData.doctorFee}</span>`);
            template = template.replace(/<span id="receiptPatientName"><\/span>/, `<span id="receiptPatientName">${paymentData.patientName}</span>`);
            template = template.replace(/<span id="receiptPatientPhone"><\/span>/, `<span id="receiptPatientPhone">${paymentData.patientPhone}</span>`);
            template = template.replace(/<span id="receiptPatientAddress"><\/span>/, `<span id="receiptPatientAddress">${paymentData.patientAddress}</span>`);
            template = template.replace(/<span id="receiptTotalPaid"><\/span>/, `<span id="receiptTotalPaid">${paymentData.totalPaid}</span>`);
            const element = document.createElement('div');
            element.innerHTML = template;
            const printButton = element.querySelector('.print-button');
            if (printButton) printButton.remove();
            await html2pdf().set({
                margin: 1,
                filename: `receipt_${paymentData.transactionId}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(element).save();
            return true;
        } catch (error) {
            console.error('Error generating PDF:', error);
            return false;
        }
    }

    function clearWaitCountdown() {
        if (waitCountdownInterval) {
            clearInterval(waitCountdownInterval);
            waitCountdownInterval = null;
        }
    }

    function formatRefundStatus(data, fallback) {
        if (!data) return fallback;
        if (data.message && (data.refunded || data.alreadyRefunded)) return data.message;
        if (data.refunded && data.amount > 0) {
            return fallback + ` A refund of ₹${data.amount} has been initiated to your original payment method.`;
        }
        if (data.refunded) return fallback + ' Your refund has been initiated.';
        return fallback;
    }

    async function requestRoomRefund(roomId, reason) {
        if (!roomId) return null;
        try {
            const res = await fetch(`/api/video-room/${encodeURIComponent(roomId)}/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            return await res.json();
        } catch (e) {
            console.warn('Refund request failed', e);
            return null;
        }
    }

    function resolveConsultationId(data) {
        if (!data) return '';
        const consultation = data.consultation || {};
        const payment = data.payment || {};
        return String(
            consultation._id ||
            consultation.id ||
            payment.consultationId ||
            payment.appointmentId ||
            ''
        ).trim();
    }

    function goToVideoCall(roomId, opts) {
        const options = opts || {};
        localStorage.setItem('userRole', 'patient');
        localStorage.setItem('videoRoomId', roomId);
        const token = window.DgAuth && DgAuth.getToken ? DgAuth.getToken() : localStorage.getItem('firebaseIdToken');
        if (token) {
            sessionStorage.setItem('firebaseIdToken', token);
            const refresh = localStorage.getItem('firebaseRefreshToken');
            if (refresh) sessionStorage.setItem('firebaseRefreshToken', refresh);
        }
        const qs = new URLSearchParams({
            roomID: roomId,
            role: 'patient'
        });
        if (options.fromPayment) qs.set('fromPayment', '1');
        window.location.href = '/video-call.html?' + qs.toString();
    }

    async function refundFailedBooking(paymentResponse) {
        if (!paymentResponse || !paymentResponse.razorpay_payment_id || !window.DgAuth || !DgAuth.authFetch) {
            return null;
        }
        try {
            const res = await DgAuth.authFetch('/api/payments/razorpay/refund-failed-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature
                })
            });
            return await res.json();
        } catch (e) {
            console.warn('Refund request failed', e);
            return null;
        }
    }

    function showConsultationWaitingRoom(consultation, roomId) {
        activeConsultationId = consultation._id || consultation.consultationId;
        localStorage.setItem('currentConsultationId', activeConsultationId);
        paymentForm.style.display = 'none';
        consultationWaitingRoom.style.display = 'flex';
        consultationWaitingRoom.classList.add('visible');
        consultWaitStatus.textContent = 'Payment successful. Ringing your doctor…';

        let timeLeft = 300;
        waitCountdownInterval = setInterval(() => {
            const min = Math.floor(timeLeft / 60);
            const sec = timeLeft % 60;
            consultWaitTimer.textContent = `⏳ ${min}:${sec.toString().padStart(2, '0')} remaining`;
            timeLeft--;
            if (timeLeft < 0) {
                clearWaitCountdown();
                requestRoomRefund(roomId, 'doctor_timeout').then((data) => {
                    consultWaitStatus.textContent = formatRefundStatus(
                        data,
                        'Request timed out. Please try booking again.'
                    );
                });
            }
        }, 1000);

        if (window.DgRealtime) {
            DgRealtime.watchConsultation(activeConsultationId);
            DgRealtime.onConsultationAccepted((data) => {
                clearWaitCountdown();
                DgRealtime.stopRing();
                consultWaitStatus.textContent = 'Doctor accepted! Joining video call…';
                setTimeout(() => goToVideoCall(data.roomId || roomId), 800);
            });
            DgRealtime.onConsultationRejected((data) => {
                clearWaitCountdown();
                consultWaitStatus.textContent = formatRefundStatus(
                    data,
                    'Doctor declined this consultation.'
                );
            });
            DgRealtime.onConsultationTimeout((data) => {
                clearWaitCountdown();
                consultWaitStatus.textContent = formatRefundStatus(
                    data,
                    'Doctor did not respond in time.'
                );
            });
            DgRealtime.onConsultationCancelled(() => {
                clearWaitCountdown();
                requestRoomRefund(roomId, 'consultation_cancelled').then((data) => {
                    consultWaitStatus.textContent = formatRefundStatus(
                        data,
                        'Consultation cancelled.'
                    );
                });
            });
        }
        pollConsultationStatus(activeConsultationId, roomId);
    }

    async function pollConsultationStatus(consultationId, roomId) {
        let redirected = false;
        const poll = setInterval(async () => {
            if (redirected) return;
            try {
                const res = await fetch(`/api/consultations/${consultationId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.status === 'ringing') {
                    consultWaitStatus.textContent = 'Ringing your doctor…';
                } else if (data.status === 'accepted') {
                    redirected = true;
                    clearInterval(poll);
                    clearWaitCountdown();
                    consultWaitStatus.textContent = 'Doctor accepted! Joining video call…';
                    setTimeout(() => goToVideoCall(data.roomId || roomId), 800);
                } else if (data.status === 'rejected') {
                    redirected = true;
                    clearInterval(poll);
                    clearWaitCountdown();
                    const refundData = await requestRoomRefund(roomId, 'doctor_rejected');
                    consultWaitStatus.textContent = formatRefundStatus(
                        refundData,
                        'Doctor declined this consultation.'
                    );
                } else if (data.status === 'timeout') {
                    redirected = true;
                    clearInterval(poll);
                    clearWaitCountdown();
                    const refundData = await requestRoomRefund(roomId, 'doctor_timeout');
                    consultWaitStatus.textContent = formatRefundStatus(
                        refundData,
                        'Doctor did not respond in time.'
                    );
                } else if (data.status === 'cancelled') {
                    redirected = true;
                    clearInterval(poll);
                    clearWaitCountdown();
                    const refundData = await requestRoomRefund(roomId, 'consultation_cancelled');
                    consultWaitStatus.textContent = formatRefundStatus(
                        refundData,
                        'Consultation cancelled.'
                    );
                }
            } catch (e) { /* retry */ }
        }, 3000);
    }

    if (cancelConsultWaitBtn) {
        cancelConsultWaitBtn.addEventListener('click', async () => {
            if (!activeConsultationId) return;
            try {
                await fetch(`/api/consultations/${activeConsultationId}/cancel`, { method: 'POST' });
            } catch (e) { /* ignore */ }
            clearWaitCountdown();
            consultationWaitingRoom.style.display = 'none';
            paymentForm.style.display = 'block';
            showMessage('Consultation request cancelled.', 'info');
        });
    }

    async function submitPayment() {
        if (!window.DgAuth || !DgAuth.getToken()) {
            showMessage('Please log in before paying.', 'error');
            window.location.href = 'patient.html';
            return;
        }
        if (!doctorName) {
            showMessage('Doctor information not found', 'error');
            return;
        }

        const name = document.getElementById('name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const patientSymptoms = document.getElementById('patientSymptoms')
            ? document.getElementById('patientSymptoms').value.trim()
            : '';

        let paymentResponse = null;
        try {
            if (payBtn) payBtn.disabled = true;
            if (followUpAccess && followUpAccess.covered) {
                showMessage('Starting your free follow-up consultation…', 'info');
                await confirmFreeConsultation(name, phone, address, patientSymptoms);
                if (payBtn) payBtn.disabled = false;
                return;
            }
            if (consultationAmount <= 0) {
                showMessage('Confirming free consultation…', 'info');
                await confirmFreeConsultation(name, phone, address, patientSymptoms);
                if (payBtn) payBtn.disabled = false;
                return;
            }

            showMessage('Starting secure payment…', 'info');
            const amountPaise = Math.max(100, Math.round(consultationAmount * 100));
            const authFetch = DgAuth.authFetch.bind(DgAuth);
            const orderData = await DgRazorpayCheckout.createOrder({
                amount: amountPaise,
                currency: 'INR',
                receipt: 'consult_' + Date.now(),
                fetchFn: authFetch
            });

            paymentResponse = await DgRazorpayCheckout.openCheckout({
                keyId: orderData.key_id,
                orderId: orderData.order_id,
                amount: orderData.amount,
                currency: orderData.currency,
                description: 'Consultation — ' + doctorName,
                checkoutConfig: orderData.checkout_config,
                prefill: {
                    name,
                    contact: phone,
                    email: localStorage.getItem('userEmail') || ''
                }
            });

            showMessage('Verifying payment…', 'info');
            await DgRazorpayCheckout.verifyPayment(paymentResponse, authFetch);

            const confirmData = new FormData();
            confirmData.append('name', name);
            confirmData.append('phone', phone);
            confirmData.append('address', address);
            confirmData.append('patientSymptoms', patientSymptoms);
            confirmData.append('selectedDoctorName', doctorName);
            confirmData.append('selectedDoctorFee', String(consultationAmount));
            confirmData.append('amount', String(consultationAmount));
            confirmData.append('doctorAvailableTime', localStorage.getItem('selectedDoctorTime') || '');
            confirmData.append('razorpay_order_id', paymentResponse.razorpay_order_id);
            confirmData.append('razorpay_payment_id', paymentResponse.razorpay_payment_id);
            confirmData.append('razorpay_signature', paymentResponse.razorpay_signature);
            selectedReports.forEach(function (file) {
                confirmData.append('reports', file);
            });

            showMessage('Booking consultation…', 'info');
            const confirmRes = await authFetch('/api/payments/razorpay/confirm-consultation', {
                method: 'POST',
                body: confirmData
            });
            const confirmText = await confirmRes.text();
            let data;
            try {
                data = JSON.parse(confirmText);
            } catch (e) {
                throw new Error('Payment verified but booking response was invalid.');
            }
            if (!confirmRes.ok) {
                if (!data.refunded && paymentResponse) {
                    const refundData = await refundFailedBooking(paymentResponse);
                    if (refundData && (refundData.refunded || refundData.alreadyRefunded)) {
                        throw new Error(refundData.message || data.message || 'Consultation booking failed. Refund initiated.');
                    }
                }
                throw new Error(data.message || 'Consultation booking failed');
            }
            await handlePaymentSuccess(data, name, phone);
        } catch (err) {
            console.error('Payment error:', err);
            const msg = err.message || 'Payment failed.';
            if (msg.indexOf('cancelled') !== -1) {
                showMessage('Payment cancelled.', 'info');
            } else if (paymentResponse && paymentResponse.razorpay_payment_id && !/refund/i.test(msg)) {
                const refundData = await refundFailedBooking(paymentResponse);
                if (refundData && (refundData.refunded || refundData.alreadyRefunded)) {
                    showMessage(refundData.message || 'Payment received but booking failed. Refund initiated.', 'error');
                } else {
                    showMessage(msg, 'error');
                }
            } else {
                showMessage(msg, 'error');
            }
            if (payBtn) payBtn.disabled = false;
        }
    }

    async function handlePaymentSuccess(data, name, phone) {
        if (!data) return;
        const consultationRoomId =
            data.videoRoomId ||
            data.roomId ||
            data.consultation?.roomId ||
            data.consultation?.videoRoomId ||
            data.payment?.roomName ||
            data.payment?.videoRoomId;

        if (!consultationRoomId) {
            showMessage('Payment saved but video room ID missing. Contact support.', 'error');
            return;
        }

        const consultationId = resolveConsultationId(data);
        localStorage.setItem('videoRoomId', consultationRoomId);
        localStorage.setItem('currentPaymentId', data.payment._id || data.payment?.id);
        if (consultationId) localStorage.setItem('currentConsultationId', consultationId);
        localStorage.setItem('patientId', name);
        localStorage.setItem('patientPhoneNumber', phone);
        showMessage('Payment successful! Opening video consultation…', 'success');

        if (typeof downloadReceipt === 'function') {
            downloadReceipt({
                transactionId: data.payment._id || data.payment?.id,
                doctorName,
                doctorFee: displayDoctorFee.textContent,
                patientName: name,
                patientPhone: phone,
                patientAddress: document.getElementById('address').value.trim(),
                totalPaid: displayDoctorFee.textContent
            }).catch(function () {});
        }

        setTimeout(function () {
            goToVideoCall(consultationRoomId, { fromPayment: true });
        }, 600);
    }

    async function confirmFreeConsultation(name, phone, address, symptomsText) {
        const confirmData = new FormData();
        confirmData.append('name', name);
        confirmData.append('phone', phone);
        confirmData.append('address', address);
        confirmData.append('patientSymptoms', symptomsText || '');
        confirmData.append('selectedDoctorName', doctorName);
        confirmData.append('selectedDoctorFee', '0');
        confirmData.append('amount', '0');
        confirmData.append('doctorAvailableTime', localStorage.getItem('selectedDoctorTime') || '');
        selectedReports.forEach(function (file) { confirmData.append('reports', file); });
        const confirmRes = await DgAuth.authFetch('/api/payments/razorpay/confirm-consultation', {
            method: 'POST',
            body: confirmData
        });
        const data = JSON.parse(await confirmRes.text());
        if (!confirmRes.ok) throw new Error(data.message || 'Booking failed');
        await handlePaymentSuccess(data, name, phone);
    }

    function showMessage(msg, type) {
        responseMessageDiv.textContent = msg;
        responseMessageDiv.className = `response-message ${type}`;
        responseMessageDiv.style.display = 'block';
    }

    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const patientSymptoms = document.getElementById('patientSymptoms')
            ? document.getElementById('patientSymptoms').value.trim()
            : '';

        if (!/^[A-Za-z ]+$/.test(name)) {
            alert('Full Name should contain only letters and spaces.');
            return;
        }
        if (!/^\d{10}$/.test(phone)) {
            alert('Phone number must be exactly 10 digits.');
            return;
        }
        if (!/^[A-Za-z0-9 ,\.\-#]{10,}$/.test(address)) {
            alert('Address should be at least 10 characters.');
            return;
        }

        if (selectedReports.length === 0) {
            const proceed = confirm(
                "You haven't uploaded medical reports.\n\nReports help doctors diagnose better.\n\nProceed without reports?"
            );
            if (!proceed) return;
        }

        try {
            const info = await getDoctorStatusInfo(doctorName);
            if (info.effectiveStatus === 'Busy') {
                showMessage('Doctor is in another consultation. We will notify you when they are free…', 'info');
                waitForAvailabilityAndThenSubmit(doctorName);
            } else {
                if (info.effectiveStatus === 'Offline') {
                    showMessage('Doctor is offline. Payment will go through — we will ring them when they come online.', 'info');
                }
                submitPayment();
            }
        } catch (err) {
            showMessage('Could not verify doctor status. Proceeding with payment…', 'info');
            submitPayment();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const doctorLoginForm = document.getElementById('doctorLoginForm');
    const emailInput = document.getElementById('doctorEmail');
    const passwordInput = document.getElementById('doctorPassword');
    const messageDiv = document.getElementById('message');

    doctorLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!email || !password) {
            showMessage('Email and password are required.', 'error');
            return;
        }

        showMessage('Logging in...', 'info');

        try {
            const data = window.DgAuth
                ? await DgAuth.loginDoctor({ email, password })
                : await fetch('/api/auth/login-doctor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                }).then(async (r) => {
                    const body = await r.json();
                    if (!r.ok) throw new Error(body.message || 'Login failed');
                    if (body.idToken && window.DgAuth) {
                        DgAuth.setSession({
                            idToken: body.idToken,
                            refreshToken: body.refreshToken,
                            user: body.user,
                            doctor: body.doctor
                        });
                    } else if (body.idToken) {
                        localStorage.setItem('firebaseIdToken', body.idToken);
                        if (body.refreshToken) localStorage.setItem('firebaseRefreshToken', body.refreshToken);
                    }
                    return body;
                });

            if (data.idToken && window.DgAuth) {
                DgAuth.setSession({
                    idToken: data.idToken,
                    refreshToken: data.refreshToken,
                    user: data.user,
                    doctor: data.doctor
                });
            }
            if (!data.idToken) {
                showMessage('Login failed — no session token received.', 'error');
                return;
            }

            showMessage('Login successful!', 'success');
            localStorage.setItem('isLoggedInDoctor', 'true');
            localStorage.setItem('userRole', 'doctor');
            if (data.doctor) {
                localStorage.setItem('doctorName', data.doctor.name);
                localStorage.setItem('doctorLicense', data.doctor.doctorId || data.doctor.license || '');
                localStorage.setItem('doctorSpecialization', data.doctor.specialization || (data.doctor.specializations && data.doctor.specializations[0]) || '');
                localStorage.setItem('doctorUid', data.doctor.uid || '');
            }
            var redirectTo = data.redirectTo || '/doctor1.html';
            setTimeout(function () { window.location.href = redirectTo; }, 1000);
        } catch (error) {
            console.error('Doctor login error:', error);
            showMessage(error.message || 'Invalid email or password.', 'error');
        }
    });

    function showMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
    }
});

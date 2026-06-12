document.addEventListener('DOMContentLoaded', () => {
    const doctorLoginForm = document.getElementById('doctorLoginForm');
    const emailInput = document.getElementById('doctorEmail');
    const passwordInput = document.getElementById('doctorPassword');
    const messageDiv = document.getElementById('message');

    if (!doctorLoginForm) return;

    doctorLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!email || !password) {
            showMessage('Email and password are required.', 'error');
            return;
        }

        showMessage('Signing in…', 'info');

        try {
            let data;
            if (window.DgAuth && DgAuth.loginDoctor) {
                try {
                    data = await DgAuth.loginDoctor({ email, password });
                } catch (doctorErr) {
                    if (/doctor profile not found/i.test(doctorErr.message || '')) {
                        data = await DgAuth.login({ email, password });
                    } else {
                        throw doctorErr;
                    }
                }
            } else {
                data = await fetch('/api/auth/login-doctor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                }).then(async (r) => {
                    const body = await r.json();
                    if (!r.ok) throw new Error(body.message || 'Login failed');
                    if (window.DgAuth) DgAuth.setSession(body);
                    return body;
                });
            }

            if (!data.idToken) {
                showMessage('Login failed — no session token received.', 'error');
                return;
            }

            if (window.DgAuth && DgAuth.redirectAfterAuth(data)) {
                return;
            }

            window.location.replace(
                (window.DgAuth && DgAuth.resolveRedirectTarget)
                    ? DgAuth.resolveRedirectTarget(data)
                    : (data.redirectTo || '/doctor1.html')
            );
        } catch (error) {
            console.error('Doctor login error:', error);
            const msg = error.message || 'Invalid email or password.';
            if (/pending admin approval/i.test(msg)) {
                showMessage(msg, 'error');
            } else {
                showMessage(msg, 'error');
            }
        }
    });

    function showMessage(msg, type) {
        if (!messageDiv) return;
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
    }
});

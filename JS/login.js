const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usernameOrEmail = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: usernameOrEmail.includes('@') ? usernameOrEmail : undefined, username: !usernameOrEmail.includes('@') ? usernameOrEmail : undefined, password })
        });
        const data = await res.json();
        if (!data.success) {
            errorMessage.textContent = data.message || 'Invalid credentials';
            return;
        }

        // Store JWT safely in sessionStorage
        sessionStorage.setItem('token', data.data.token);
        sessionStorage.setItem('user', JSON.stringify(data.data.user));

        window.location.href = 'dashboard.html';
    } catch (err) {
        errorMessage.textContent = 'Login failed. Please try again.';
    }
});

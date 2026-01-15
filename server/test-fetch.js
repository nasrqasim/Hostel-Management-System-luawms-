
import http from 'http';

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 4000,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    // Login
    const login = await request('/auth/login', 'POST', { username: 'Admin', password: 'Admin@3456!' });
    if (!login.success) return console.log('Login failed', login);
    const token = login.data.token;

    // Fetch
    const students = await request('/students', 'GET', null, token);
    if (students.data && students.data.length > 0) {
        console.log('Sample Student ID:', students.data[0]._id);
        console.log('Sample Student Keys:', Object.keys(students.data[0]));
    } else {
        console.log('No students found.');
    }
}
run();

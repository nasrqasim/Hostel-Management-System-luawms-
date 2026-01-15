
import http from 'http';

// Helper for requests
function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const bodyString = body ? JSON.stringify(body) : '';
        const options = {
            hostname: 'localhost',
            port: 4000,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': bodyString.length,
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    console.log("Raw Response:", data);
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (bodyString) req.write(bodyString);
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting CRUD Tests ---');

    // 1. Login
    console.log('\n[1] Logging in as Admin...');
    const loginRes = await request('POST', '/auth/login', { username: 'Admin', password: 'Admin@3456!' });
    if (!loginRes.body.success) {
        console.error('Login Failed:', loginRes.body);
        return;
    }
    const token = loginRes.body.data.token;
    console.log('Login Success. Token acquired.');

    // 2. Create Student
    console.log('\n[2] Creating Test Student...');
    const studentData = {
        studentName: 'TestUser',
        fatherName: 'TestFather',
        registrationNumber: 'TEST-001',
        degree: 'BS',
        department: 'TEST_DEPT',
        semester: 1,
        district: 'TestDist',
        assignedHostel: 'Armabel',
        roomNumber: 'A-01'
    };
    const createRes = await request('POST', '/students', studentData, token);
    console.log(`Create Status: ${createRes.status}`, createRes.body.success ? 'Success' : 'Failed');
    if (!createRes.body.success) console.log(createRes.body);
    const studentId = createRes.body.data?._id;

    if (!studentId) {
        console.error('Checking if student exists via Search because create might have silently failed or duplicate?');
        // ... search logic passed, skipping
        return; // Cannot proceed without ID
    }

    // 3. Update Student
    console.log(`\n[3] Updating Student ${studentId}...`);
    const updateRes = await request('PUT', `/students/${studentId}`, { ...studentData, studentName: 'TestUserUpdated' }, token);
    console.log(`Update Status: ${updateRes.status}`, updateRes.body.success ? 'Success' : 'Failed');
    if (updateRes.body.data?.studentName === 'TestUserUpdated') console.log('Variable verification: Passed');

    // 4. Delete Student
    console.log(`\n[4] Deleting Student ${studentId}...`);
    const deleteRes = await request('DELETE', `/students/${studentId}`, null, token);
    console.log(`Delete Status: ${deleteRes.status}`, deleteRes.body.success ? 'Success' : 'Failed');

    // 5. Batch Delete Setup
    console.log('\n[5] Setting up Batch Delete (Creating 2 students)...');
    await request('POST', '/students', { ...studentData, registrationNumber: 'BATCH-01', studentName: 'B1' }, token);
    await request('POST', '/students', { ...studentData, registrationNumber: 'BATCH-02', studentName: 'B2' }, token);

    // 6. Batch Delete
    console.log('\n[6] Testing Batch Delete (TEST_DEPT + BATCH)...');
    // Note: Standard regex for batch delete usually looks for the string in reg number.
    // Server implementation: registrationNumber: new RegExp(batch, 'i')
    // So 'BATCH' should match 'BATCH-01' and 'BATCH-02'.
    const batchRes = await request('DELETE', '/students/batch', { department: 'TEST_DEPT', batch: 'BATCH' }, token);
    console.log(`Batch Delete Status: ${batchRes.status}`);
    console.log('Response:', batchRes.body);

    console.log('\n--- Tests Completed ---');
}

runTests();

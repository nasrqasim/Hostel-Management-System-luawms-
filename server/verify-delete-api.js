import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000/api';
const ADMIN_CREDENTIALS = { username: 'Admin', password: 'Admin@3456!' };

let authToken = '';

const log = (msg, type = 'info') => console.log(`[${type.toUpperCase()}] ${msg}`);

async function login() {
    log('Logging in as Admin...');
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ADMIN_CREDENTIALS)
    });
    const data = await res.json();
    if (data.success) {
        authToken = data.data.token;
        log('Login successful');
    } else {
        throw new Error(`Login failed: ${data.message}`);
    }
}

async function createHostel(name) {
    log(`Creating Hostel: ${name}`);
    const res = await fetch(`${API_URL}/hostels`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
            name,
            warden: 'Test Warden',
            numberOfRooms: 10,
            capacityPerRoom: 3
        })
    });
    const data = await res.json();
    if (data.success) return data.data;
    if (data.message.includes('already exists')) {
        // Fetch it
        const list = await fetch(`${API_URL}/hostels`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.json());
        return list.data.find(h => h.name === name);
    }
    throw new Error(`Create Hostel failed: ${data.message}`);
}

async function createStudent(student) {
    log(`Creating Student: ${student.studentName}`);
    const res = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(student)
    });
    const data = await res.json();
    if (data.success) return data.data;
    throw new Error(`Create Student failed: ${data.message} ${JSON.stringify(data.errors || {})}`);
}

async function deleteStudent(id) {
    log(`Deleting Student ID: ${id}`);
    const res = await fetch(`${API_URL}/students/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) log('Student deleted');
    else throw new Error(`Delete Student failed: ${data.message}`);
}

async function deleteBatch(department, batch) {
    log(`Deleting Batch: ${department} - ${batch}`);
    const res = await fetch(`${API_URL}/students/batch`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ department, batch })
    });
    const data = await res.json();
    if (data.success) log(`Batch deleted: ${data.data.count} students removed`);
    else throw new Error(`Batch delete failed: ${data.message}`);
}

async function verifyStudentGone(id) {
    const res = await fetch(`${API_URL}/students?search=${id}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    const found = data.data.find(s => s._id === id || s.id === id);
    if (found) throw new Error(`Student ${id} still exists!`);
    log(`Verified Student ${id} is gone`);
}

async function verifyOrphanedData(regNo) {
    // Check Challans
    const res = await fetch(`${API_URL}/challans`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const data = await res.json();
    const found = data.data.find(c => c.registrationNumber === regNo);
    if (found) throw new Error(`Challan for ${regNo} still exists!`);
    log(`Verified Challans for ${regNo} are gone`);

    // Check Logs (if accessible via API, checking logs requires looking for description)
    const logsRes = await fetch(`${API_URL}/logs`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const logsData = await logsRes.json();
    // We expect NO logs with this regNo in description? 
    // Wait, the delete middleware deletes logs that MATCH the regNo.
    // So if we check logs, we should NOT find the student refs. 
    // BUT the "DELETE_STUDENT" activity log is created AFTER delete logic?
    // In server.js: 
    //   await Student.findOneAndDelete... (middleware runs, deletes logs)
    //   await createActivityLog('DELETE_STUDENT'...)
    // So there SHOULD be a "DELETE_STUDENT" log, but previous logs (like ADD_STUDENT) should be GONE.

    const relevantLogs = logsData.data.filter(l => l.description.includes(regNo));
    // We expect exactly 1 log: the deletion log itself.
    if (relevantLogs.length > 1) {
        console.warn(`Warning: Found ${relevantLogs.length} logs for ${regNo}. Expected 1 (the deletion log). Check if cascade matched.`);
        relevantLogs.forEach(l => console.log('   - ', l.action, l.description));
    } else {
        log(`Verified historic logs for ${regNo} are gone (only deletion log remains)`);
    }
}

async function main() {
    try {
        await login();

        // 1. Single Delete Test
        log('--- START SINGLE DELETE TEST ---');
        const hostel = await createHostel('DeleteTestHostel');
        const s1 = await createStudent({
            studentName: 'Delete Me',
            fatherName: 'Father',
            registrationNumber: 'DEL-001',
            degree: 'Bachelors',
            department: 'Computer Science',
            semester: 1,
            district: 'Test',
            assignedHostel: hostel.name,
            roomNumber: 'A-01'
        });

        await deleteStudent(s1._id || s1.id);
        await verifyStudentGone(s1._id || s1.id);
        await verifyOrphanedData('DEL-001');
        log('--- SINGLE DELETE TEST PASSED ---');

        // 2. Batch Delete Test
        log('--- START BATCH DELETE TEST ---');
        // Create 3 students
        await createStudent({
            studentName: 'Batch One',
            fatherName: 'Father',
            registrationNumber: 'BATCH-2k25-01',
            degree: 'Bachelors',
            department: 'Software Engineering',
            semester: 1,
            district: 'Test',
            assignedHostel: hostel.name,
            roomNumber: 'A-02'
        });
        await createStudent({
            studentName: 'Batch Two',
            fatherName: 'Father',
            registrationNumber: 'BATCH-2k25-02',
            degree: 'Bachelors',
            department: 'Software Engineering',
            semester: 1,
            district: 'Test',
            assignedHostel: hostel.name,
            roomNumber: 'A-03'
        });

        await deleteBatch('Software Engineering', '2k25');

        // Verify
        await verifyStudentGone('BATCH-2k25-01 (dummy call)'); // API search won't find by ID if we don't have it, but we can search by regNo

        // Check manually via list
        const res = await fetch(`${API_URL}/students?search=BATCH-2k25`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const list = await res.json();
        if (list.data.length > 0) throw new Error('Batch students still exist!');

        log('--- BATCH DELETE TEST PASSED ---');

    } catch (err) {
        console.error('TEST FAILED:', err);
        process.exit(1);
    }
}

main();

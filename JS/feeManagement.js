// Fee Management System for LUAWMS Hostel Management
import ApiHelper from './apiHelper.js';

// DOM elements
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const paymentForm = document.getElementById('paymentForm');
const registrationNumberInput = document.getElementById('registrationNumberInput');
const challanNumberInput = document.getElementById('challanNumberInput');
const semesterSelect = document.getElementById('semesterSelect');
const paymentMessage = document.getElementById('paymentMessage');
const checkDefaultersBtn = document.getElementById('checkDefaultersBtn');
const defaultersTableBody = document.getElementById('defaultersTableBody');
const challansTableBody = document.getElementById('challansTableBody');
const statusFilter = document.getElementById('statusFilter');
const searchChallansInput = document.getElementById('searchChallansInput');
const feeStructureHead = document.getElementById('feeStructureHead');
const feeStructureBody = document.getElementById('feeStructureBody');
const hostelFilter = document.getElementById('hostelFilter');

// Global variables
let allStudents = [];
let allChallans = [];
let allHostels = [];
let currentUser = null;

// Fee amounts per semester
const HOSTEL_FEE_AMOUNT = 15000; // PKR per semester

// Check authentication on page load
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = user;
    if (welcomeMessage) {
        welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;
    }
    
    // Initialize the page
    initializePage();
});

// Function to display messages
const showMessage = (element, message, color) => {
    if (element) {
        element.textContent = message;
        element.style.color = color;
        setTimeout(() => {
            element.textContent = '';
        }, 3000);
    }
};

// Initialize the page
const initializePage = () => {
    loadStudents();
    loadChallans();
    loadHostels();
    renderFeeStructure();
    setupEventListeners();
};

// Load students for payment/defaulter operations
const loadStudents = async () => {
    try {
        const response = await ApiHelper.get('/students');
        allStudents = response.data;
        renderFeeStructure();
    } catch (error) { console.error('Failed to load students', error); }
};

// Load challans (existing records)
const loadChallans = async () => {
    try {
        const response = await ApiHelper.get('/challans');
        allChallans = response.data;
        renderChallansTable(allChallans);
    } catch (error) { console.error('Failed to load challans', error); }
};

// Load hostels for filtering
const loadHostels = async () => {
    try {
        const response = await ApiHelper.get('/hostels');
        allHostels = response.data;
        populateHostelFilter();
    } catch (error) { console.error('Failed to load hostels', error); }
};

// Populate hostel filter dropdown
const populateHostelFilter = () => {
    if (!hostelFilter) return;
    
    hostelFilter.innerHTML = '<option value="">All Hostels</option>';
    allHostels.forEach(hostel => {
        const option = document.createElement('option');
        option.value = hostel.name;
        option.textContent = hostel.name;
        hostelFilter.appendChild(option);
    });
};

// Mark challan as paid using Registration Number + Challan Number
const markChallanAsPaid = async (e) => {
    e.preventDefault();
    
    const challanNumber = (challanNumberInput?.value || '').trim();
    const registrationNumber = (registrationNumberInput?.value || '').trim();
    const semester = parseInt(semesterSelect?.value || '');
    
    if (!challanNumber || !registrationNumber || !semester) {
        showMessage(paymentMessage, 'Enter Registration No., Semester and Challan No.', 'red');
        return;
    }
    
    try {
        // Find the student by registration number
        const student = allStudents.find(s => (s.registrationNumber || '').toLowerCase() === registrationNumber.toLowerCase());
        if (!student) {
            showMessage(paymentMessage, 'Student not found.', 'red');
            return;
        }

        // Record a payment entry
        await ApiHelper.post('/challans/mark-paid', { 
            registrationNumber, 
            challanNumber, 
            semester,
            username: currentUser.username
        });
        await loadStudents();
        await loadChallans();

        showMessage(paymentMessage, 'Challan marked as paid successfully!', 'green');
        paymentForm.reset();
        
    } catch (error) {
        console.error('Error marking challan as paid:', error);
        showMessage(paymentMessage, 'Failed to mark challan as paid. Please try again.', 'red');
    }
};

// Check for defaulters based on student records
const checkDefaulters = async () => {
    try {
        const now = Date.now();
        const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
        const defaulters = allStudents
            .filter(s => (s.hostelFee || 'pending') !== 'paid')
            .map(s => {
                const updated = s.feeUpdatedAt?.toDate ? s.feeUpdatedAt.toDate().getTime() : (s.updatedAt?.toDate ? s.updatedAt.toDate().getTime() : 0);
                const diff = now - updated;
                return {
                    studentId: s.id,
                    studentName: s.studentName,
                    registrationNumber: s.registrationNumber,
                    department: s.department,
                    semester: s.semester,
                    challanNumber: s.challanNumber || '-',
                    amount: HOSTEL_FEE_AMOUNT,
                    daysOverdue: Math.floor(diff / (24*60*60*1000)),
                    overdue: diff > twentyDaysMs
                };
            })
            .filter(x => x.overdue);

        // Auto-cancel allotments for defaulters
        for (const d of defaulters) {
            await cancelHostelAllotment(d.studentId);
        }

        renderDefaultersTable(defaulters);
        
    } catch (error) {
        console.error('Error checking defaulters:', error);
        showMessage(paymentMessage, 'Error checking defaulters. Please try again.', 'red');
    }
};

// Cancel hostel allotment for defaulter
const cancelHostelAllotment = async (studentId) => {
    try {
        // Update student status via API
        const response = await ApiHelper.put(`/students/${studentId}`, {
            hostelAllotmentStatus: 'cancelled',
            allotmentCancelledAt: new Date().toISOString(),
            allotmentCancelledReason: 'Fee default - 20 days overdue'
        });

        if (response.success) {
            // Log the cancellation
            await ApiHelper.post('/logs', {
                action: 'allotment_cancelled',
                studentId,
                reason: 'Fee default - 20 days overdue',
                username: currentUser?.username || 'system'
            });
        }
    } catch (error) {
        console.error('Error cancelling hostel allotment:', error);
    }
};

// Render defaulters table
const renderDefaultersTable = (defaulters) => {
    defaultersTableBody.innerHTML = '';
    
    if (defaulters.length === 0) {
        defaultersTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No defaulters found.</td></tr>';
        return;
    }
    
    defaulters.forEach(defaulter => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${defaulter.studentName || ''}</td>
            <td>${defaulter.registrationNumber || ''}</td>
            <td>${defaulter.department || ''}</td>
            <td>${defaulter.semester || ''}</td>
            <td>${defaulter.challanNumber || ''}</td>
            <td>PKR ${defaulter.amount || 0}</td>
            <td>${defaulter.daysOverdue || 0} days</td>
            <td><span class="status cancelled">Unpaid</span></td>
        `;
        defaultersTableBody.appendChild(row);
    });
};

// Render challans table
const renderChallansTable = (challans) => {
    challansTableBody.innerHTML = '';
    
    if (challans.length === 0) {
        challansTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No challans found.</td></tr>';
        return;
    }
    
    challans.forEach(challan => {
        const dueDate = challan.dueDate ? challan.dueDate.toDate().toLocaleDateString() : 'N/A';
        const status = getChallanStatus(challan);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${challan.studentName || ''}</td>
            <td>${challan.registrationNumber || ''}</td>
            <td>${challan.department || ''}</td>
            <td>${challan.semester || ''}</td>
            <td>${challan.challanNumber || ''}</td>
            <td>PKR ${challan.amount || 0}</td>
            <td>${dueDate}</td>
            <td><span class="status ${status.toLowerCase()}">${status}</span></td>
        `;
        challansTableBody.appendChild(row);
    });
};

// Render fee structure table (8 or 10 semesters based on department)
const renderFeeStructure = () => {
    if (!feeStructureHead || !feeStructureBody) return;
    feeStructureHead.innerHTML = '';
    feeStructureBody.innerHTML = '';

    // Get filter values
    const selectedHostel = hostelFilter?.value || '';
    const selectedStatus = statusFilter?.value || '';

    // Filter students based on hostel selection
    let filteredStudents = allStudents;
    if (selectedHostel) {
        filteredStudents = allStudents.filter(s => s.assignedHostel === selectedHostel);
    }

    if (filteredStudents.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="15" class="text-center">No students found.</td>';
        feeStructureBody.appendChild(row);
        return;
    }

    // Determine max semesters per student: DVM or Doctor of Veterinary Medicine -> 10, else 8
    const maxSemFor = (dept) => /doctor of veterinary medicine|dvm/i.test(dept || '') ? 10 : 8;

    // Build a header that supports max 10 columns with new columns
    const headRow = document.createElement('tr');
    headRow.innerHTML = `
        <th>Student</th>
        <th>Reg No.</th>
        <th>Department</th>
        <th>Room No.</th>
        <th>Assigned Hostel</th>
        ${Array.from({length: 10}).map((_,i)=>`<th>Sem ${i+1}</th>`).join('')}
    `;
    feeStructureHead.appendChild(headRow);

    // Render each student
    filteredStudents.forEach(s => {
        const maxSem = maxSemFor(s.department);
        const tr = document.createElement('tr');
        
        // Handle both MongoDB Map and regular object for feeTable
        let feeTable = {};
        if (s.feeTable) {
            if (s.feeTable instanceof Map) {
                feeTable = Object.fromEntries(s.feeTable);
            } else if (typeof s.feeTable === 'object') {
                feeTable = s.feeTable;
            }
        }
        
        const cells = Array.from({length: 10}).map((_,i) => {
            const sem = i+1;
            // Only display up to maxSem; beyond show '-'
            if (sem > maxSem) return '<td>-</td>';
            const status = (feeTable[`sem${sem}`] || 'pending').toLowerCase();
            const badge = status === 'paid' ? '<span class="status paid">Paid</span>' : '<span class="status pending">Pending</span>';
            return `<td>${badge}</td>`;
        }).join('');
        tr.innerHTML = `
            <td>${s.studentName || ''}</td>
            <td>${s.registrationNumber || ''}</td>
            <td>${s.department || ''}</td>
            <td>${s.roomNumber || 'N/A'}</td>
            <td>${s.assignedHostel || 'N/A'}</td>
            ${cells}
        `;
        feeStructureBody.appendChild(tr);
    });
};

// Get challan status
const getChallanStatus = (challan) => {
    if (challan.status === 'paid') return 'Paid';
    
    const currentDate = new Date();
    const dueDate = challan.dueDate ? challan.dueDate.toDate() : new Date();
    const daysOverdue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24));
    
    if (daysOverdue > 20) return 'Cancelled';
    if (daysOverdue > 0) return 'Overdue';
    return 'Pending';
};

// Update student fee status
const updateStudentFeeStatus = async () => {};

// Helper functions
const calculateDueDate = (semester) => {
    const currentDate = new Date();
    const semesterEndDate = new Date(currentDate.getFullYear(), 5 + (parseInt(semester) * 2), 30);
    const dueDate = new Date(semesterEndDate.getTime() + (20 * 24 * 60 * 60 * 1000));
    return dueDate;
};

const generateChallanNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `CH${timestamp}${random}`;
};

// Setup event listeners
const setupEventListeners = () => {
    // Form submissions
    if (paymentForm) paymentForm.addEventListener('submit', markChallanAsPaid);
    
    // Buttons
    if (checkDefaultersBtn) checkDefaultersBtn.addEventListener('click', checkDefaulters);
    
    // Filters
    if (statusFilter) statusFilter.addEventListener('change', (e) => {
        const selectedStatus = e.target.value;
        const filteredChallans = selectedStatus ? 
            allChallans.filter(c => getChallanStatus(c).toLowerCase() === selectedStatus) : 
            allChallans;
        renderChallansTable(filteredChallans);
        renderFeeStructure(); // Re-render fee structure when status filter changes
    });
    
    // Hostel filter for fee structure
    if (hostelFilter) hostelFilter.addEventListener('change', () => {
        renderFeeStructure(); // Re-render fee structure when hostel filter changes
    });
    
    // Search
    if (searchChallansInput) searchChallansInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredChallans = allChallans.filter(challan =>
            challan.studentName?.toLowerCase().includes(searchTerm) ||
            challan.registrationNumber?.toLowerCase().includes(searchTerm) ||
            challan.challanNumber?.toLowerCase().includes(searchTerm)
        );
        renderChallansTable(filteredChallans);
    });
    
    // Listen for hostel updates from other components
    window.addEventListener('hostelsUpdated', (event) => {
        allHostels = event.detail;
        populateHostelFilter();
    });
    
    // Logout
    if (logoutButton) logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
        window.location.href = 'login.html';
    });
    // Download Fees PDF
    const downloadFeesPdfBtn = document.getElementById('downloadFeesPdfBtn');
    if (downloadFeesPdfBtn) {
        downloadFeesPdfBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const base = (localStorage.getItem('API_BASE') || 'http://localhost:4000/api').replace(/\/$/, '');
            window.open(`${base}/export/fees.pdf`, '_blank');
        });
    }

    // Download Fee Structure CSV
    const downloadFeesCsvBtn = document.getElementById('downloadFeesCsvBtn');
    if (downloadFeesCsvBtn) {
        downloadFeesCsvBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exportFeeStructureCsv();
        });
    }
};

function exportFeeStructureCsv() {
    try {
        const table = document.getElementById('feeStructureTable');
        if (!table) return;
        const rows = [];
        // Header
        const thead = table.querySelector('thead');
        if (thead) {
            const ths = thead.querySelectorAll('th');
            rows.push(Array.from(ths).map(th => th.textContent.trim()));
        }
        // Body
        const tbody = table.querySelector('tbody');
        if (tbody) {
            const trs = tbody.querySelectorAll('tr');
            trs.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                const cells = Array.from(tds).map(td => {
                    const badge = td.querySelector('.status');
                    return badge ? badge.textContent.trim() : td.textContent.trim();
                });
                rows.push(cells);
            });
        }
        const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
        const user = JSON.parse(sessionStorage.getItem('user') || 'null');
        const scope = user && (user.role === 'Warden' || user.role === 'warden') ? (hostelFilter?.value || 'MyHostel') : 'All';
        triggerCsvDownload("\ufeff" + csv, `FeeStructure_${scope}.csv`);
    } catch (_) {}
}

function escapeCsv(val) {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
}

function triggerCsvDownload(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

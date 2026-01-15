// Import necessary Firebase modules
import ApiHelper from './apiHelper.js';

// DOM elements
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const studentForm = document.getElementById('studentForm');
const studentNameInput = document.getElementById('studentName');
const studentImageInput = document.getElementById('studentImage');
const fatherNameInput = document.getElementById('fatherName');
const registrationNumberInput = document.getElementById('registrationNumber');
const degreeInput = document.getElementById('degree');
const departmentInput = document.getElementById('department');
const semesterInput = document.getElementById('semester');
const districtInput = document.getElementById('district');
const assignedHostelSelect = document.getElementById('assignedHostel');
const roomNumberInput = document.getElementById('roomNumber');
const hostelFeeInput = document.getElementById('hostelFee');
const addStudentBtn = document.getElementById('addStudentBtn');
const updateStudentBtn = document.getElementById('updateStudentBtn');
const studentMessage = document.getElementById('studentMessage');
const studentsTableBody = document.getElementById('studentsTableBody');
const hostelFilterSelect = document.getElementById('hostelFilter');
const searchStudentsInput = document.getElementById('serverSearchInput');
// Image modal elements
const imageModal = document.getElementById('imageModal');
const imageModalImg = document.getElementById('imageModalImg');
const imageModalCaption = document.getElementById('imageModalCaption');
const imageModalClose = document.getElementById('imageModalClose');

// Global state variables
let currentEditingStudent = null;
let allStudents = [];
let allHostels = [];
let currentUser = null;

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

// Function to display messages to the user
const showMessage = (message, type = 'info') => {
    if (!studentMessage) return;

    studentMessage.textContent = message;

    // Map type to color
    const colorMap = {
        'success': 'green',
        'error': 'red',
        'warning': 'orange',
        'info': 'blue'
    };

    studentMessage.style.color = colorMap[type] || colorMap.info;
    setTimeout(() => {
        studentMessage.textContent = '';
    }, 5000);
};

// Function to log actions to the 'logs' collection
const logActivity = async (action, details) => {
    try {
        await ApiHelper.post('/logs', {
            userId: currentUser._id || currentUser.id,
            username: currentUser.username,
            action,
            details
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};

// Initialize the page
const initializePage = () => {
    // Load hostels for dropdown
    loadHostels();

    // Load students
    loadStudents();

    // Set up event listeners
    setupEventListeners();
};

// Helpers: initials and file->base64
const getInitials = (fullName) => {
    if (!fullName) return 'NA';
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts[parts.length - 1] && parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// Load hostels from API
const loadHostels = async () => {
    try {
        // Prefer lightweight public endpoint for names (no role restrictions)
        const response = await ApiHelper.get('/hostels/public');
        // Normalize to objects with name
        allHostels = (response.data || []).map(h => ({ name: h.name }));
        populateHostelDropdowns();

        // Listen for hostel updates from other components
        window.addEventListener('hostelsUpdated', (event) => {
            allHostels = (event.detail || []).map(h => ({ name: h.name || h }));
            populateHostelDropdowns();
        });
    } catch (error) {
        console.error("Error loading hostels:", error);
        // Warden-safe fallback: use assignedHostels from session user
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || 'null');
            if (user && (user.role === 'Warden' || user.role === 'warden')) {
                const names = Array.isArray(user.assignedHostels) && user.assignedHostels.length > 0
                    ? user.assignedHostels
                    : (user.hostelName ? [user.hostelName] : []);
                allHostels = names.map(n => ({ name: n }));
            }
        } catch (_) { /* ignore */ }
        populateHostelDropdowns();
    }
};

// Populate hostel dropdowns
const populateHostelDropdowns = () => {
    // Populate assigned hostel dropdown
    if (assignedHostelSelect) {
        assignedHostelSelect.innerHTML = '<option value="">Select Hostel</option>';
        allHostels.forEach(hostel => {
            const option = document.createElement('option');
            const name = hostel.name || hostel.hostelName;
            option.value = name;
            option.textContent = name;
            assignedHostelSelect.appendChild(option);
        });
    }

    // Populate filter dropdown
    if (hostelFilterSelect) {
        hostelFilterSelect.innerHTML = '<option value="">All Hostels</option>';
        allHostels.forEach(hostel => {
            const option = document.createElement('option');
            const name = hostel.name || hostel.hostelName;
            option.value = name;
            option.textContent = name;
            hostelFilterSelect.appendChild(option);
        });
    }
};

// Load students from API
const loadStudents = async (searchQuery = '') => {
    try {
        const endpoint = searchQuery
            ? `/students?search=${encodeURIComponent(searchQuery)}`
            : '/students';
        const response = await ApiHelper.get(endpoint);
        allStudents = response.data;
        // Re-apply current hostel filter if any
        const currentHostelFilter = hostelFilterSelect ? hostelFilterSelect.value : '';
        const filtered = currentHostelFilter
            ? allStudents.filter(s => s.assignedHostel === currentHostelFilter)
            : allStudents;
        renderStudents(filtered);
    } catch (error) {
        console.error("Error loading students:", error);
        showMessage("Failed to load students", "error");
    }
};

// Render students in the table
const renderStudents = (students) => {
    studentsTableBody.innerHTML = '';

    if (students.length === 0) {
        studentsTableBody.innerHTML = '<tr><td colspan="11" class="text-center">No students found.</td></tr>';
        return;
    }

    students.forEach(student => {
        const row = document.createElement('tr');
        const initials = getInitials(student.studentName);
        const hasImage = !!student.profileImage;
        const pictureCell = hasImage
            ? `<img src="${student.profileImage}" alt="${student.studentName || 'Student'}" class="avatar student-avatar" data-fullsrc="${student.profileImage}" data-name="${student.studentName || ''}">`
            : `<div class="avatar-initials student-avatar" data-fullsrc="" data-name="${student.studentName || ''}">${initials}</div>`;
        row.innerHTML = `
            <td>${pictureCell}</td>
            <td>${student.studentName || ''}</td>
            <td>${student.registrationNumber || ''}</td>
            <td>${student.fatherName || ''}</td>
            <td>${student.degree || ''}</td>
            <td>${student.department || ''}</td>
            <td>${student.semester || ''}</td>
            <td>${student.district || ''}</td>
            <td>${student.assignedHostel || ''}</td>
            <td>${student.roomNumber || ''}</td>
            <td><span class="fee-status ${student.hostelFee || 'pending'}">${student.hostelFee || 'pending'}</span></td>
            <td class="actions-cell">
                <button class="edit-btn" data-id="${student._id || student.id}">Edit</button>
                <button class="delete-btn" data-id="${student._id || student.id}">Delete</button>
            </td>
        `;
        studentsTableBody.appendChild(row);

        studentsTableBody.appendChild(row);
    });
};

// Event Delegation for Table Actions (Edit/Delete/Image)
studentsTableBody.addEventListener('click', (e) => {
    const target = e.target;

    // Delete Button
    if (target.classList.contains('delete-btn')) {
        const id = target.getAttribute('data-id');
        // Find the student name from the row (2nd column)
        const row = target.closest('tr');
        const name = row.children[1].textContent;
        if (id) deleteStudent(id, name);
    }

    // Edit Button
    if (target.classList.contains('edit-btn')) {
        const id = target.getAttribute('data-id');
        const student = allStudents.find(s => (s._id || s.id) === id);
        if (student) editStudent(student);
    }

    // Image Click
    if (target.classList.contains('student-avatar')) {
        openImageModal(target.getAttribute('data-fullsrc'), target.getAttribute('data-name'));
    }
});

// Handle form submission
const handleFormSubmit = async (e) => {
    e.preventDefault();

    // Normalize room number format (e.g., "b-2" -> "B-02", "B-02" stays "B-02")
    const normalizeRoomNumber = (roomNo) => {
        if (!roomNo) return '';
        const trimmed = roomNo.trim();
        // Match pattern like "B-2" or "B-02" or "b-2"
        const match = trimmed.match(/^([A-Za-z]+)[-\s]*(\d+)$/i);
        if (match) {
            const block = match[1].toUpperCase();
            const num = parseInt(match[2], 10);
            return `${block}-${String(num).padStart(2, '0')}`;
        }
        return trimmed; // Return as-is if pattern doesn't match
    };

    const studentData = {
        studentName: studentNameInput.value.trim(),
        fatherName: fatherNameInput.value.trim(),
        registrationNumber: registrationNumberInput.value.trim(),
        degree: degreeInput.value,
        department: departmentInput.value,
        semester: Number(semesterInput.value),
        district: districtInput.value.trim(),
        assignedHostel: assignedHostelSelect.value,
        roomNumber: normalizeRoomNumber(roomNumberInput.value),
        hostelFee: hostelFeeInput.value,
        feeTable: {},
    };

    // Update UI with normalized room number if it changed
    const normalizedRoom = normalizeRoomNumber(roomNumberInput.value);
    if (normalizedRoom && normalizedRoom !== roomNumberInput.value.trim()) {
        roomNumberInput.value = normalizedRoom;
    }

    // Validate required fields
    if (!studentData.studentName || !studentData.registrationNumber) {
        showMessage('Student name and registration number are required.', 'error');
        return;
    }

    try {
        // Auto-allocate room when needed (new add or room not provided/invalid)
        const needAutoAssign = !studentData.roomNumber;
        if (studentData.assignedHostel && (needAutoAssign || !(await validateRoomCapacity(studentData.assignedHostel, studentData.roomNumber)))) {
            const suggestedRoom = await findFirstAvailableRoom(studentData.assignedHostel);
            if (!suggestedRoom) {
                showMessage('No available rooms in this hostel.', 'error');
                return;
            }
            studentData.roomNumber = suggestedRoom;
            if (roomNumberInput) roomNumberInput.value = suggestedRoom; // reflect in UI
        }
        // Handle optional image
        let profileImageBase64 = null;
        const file = studentImageInput && studentImageInput.files && studentImageInput.files[0] ? studentImageInput.files[0] : null;
        if (file) {
            // Limit ~1MB client-side for safety
            const maxBytes = 1.5 * 1024 * 1024;
            if (file.size > maxBytes) {
                showMessage('Image too large. Please select an image under 1.5MB.', 'error');
                return;
            }
            profileImageBase64 = await fileToBase64(file);
        }

        if (currentEditingStudent) {
            const changedHostel = currentEditingStudent.assignedHostel !== studentData.assignedHostel;
            const changedRoom = currentEditingStudent.roomNumber !== studentData.roomNumber;
            const response = await ApiHelper.put(`/students/${currentEditingStudent.id || currentEditingStudent._id}`, {
                ...studentData,
                profileImage: profileImageBase64 || currentEditingStudent.profileImage || undefined,
                username: currentUser.username
            });
            showMessage(response.message || 'Student updated successfully!', 'success');
            currentEditingStudent = null;
            addStudentBtn.style.display = 'block';
            updateStudentBtn.style.display = 'none';
            await logActivity('UPDATE_STUDENT', `Updated student: ${studentData.studentName}`);
            // If hostel/room changed, notify hostels page/details to refresh
            if (changedHostel || changedRoom) {
                try { localStorage.setItem('hostels:updated', String(Date.now())); } catch (_) { }
            }
        } else {
            const response = await ApiHelper.post('/students', {
                ...studentData,
                profileImage: profileImageBase64 || undefined,
                username: currentUser.username
            });
            showMessage(response.message || 'Student added successfully!', 'success');
            await logActivity('ADD_STUDENT', `Added new student: ${studentData.studentName}`);
            try { localStorage.setItem('students:updated', String(Date.now())); } catch (_) { }
            try { localStorage.setItem('hostels:updated', String(Date.now())); } catch (_) { }
        }
        studentForm.reset();
        await loadStudents();
    } catch (error) {
        console.error("Error adding/updating student:", error);
        showMessage(error.message || 'Failed to add/update student. Please try again.', 'error');
    }
};

// Edit student
const editStudent = (student) => {
    currentEditingStudent = student;

    // Populate form fields
    studentNameInput.value = student.studentName || '';
    fatherNameInput.value = student.fatherName || '';
    registrationNumberInput.value = student.registrationNumber || '';
    degreeInput.value = student.degree || '';
    departmentInput.value = student.department || '';
    semesterInput.value = student.semester || '';
    districtInput.value = student.district || '';
    assignedHostelSelect.value = student.assignedHostel || '';
    roomNumberInput.value = student.roomNumber || '';
    hostelFeeInput.value = student.hostelFee || 'pending';

    // Show update button, hide add button
    addStudentBtn.style.display = 'none';
    updateStudentBtn.style.display = 'block';

    showMessage('Editing student...', 'blue');
};

// Delete student
const deleteStudent = async (studentId, studentName) => {
    const confirmation = window.confirm(`Are you sure you want to delete ${studentName}?`);
    if (!confirmation) return;

    try {
        const response = await ApiHelper.delete(`/students/${studentId}`);
        if (response.success) {
            alert('Student deleted successfully!');
            showMessage(response.message || 'Student deleted successfully!', 'success');
            await logActivity('DELETE_STUDENT', `Deleted student: ${studentName}`);
            await loadStudents();
            try { localStorage.setItem('students:updated', String(Date.now())); } catch (_) { }
        } else {
            throw new Error(response.message || 'Delete failed');
        }
    } catch (error) {
        console.error("Error deleting student:", error);
        alert('Delete Failed: ' + (error.message || 'An error occurred'));
        showMessage(error.message || 'Failed to delete student. Please try again.', 'error');
    }
};

// Setup event listeners
const setupEventListeners = () => {
    // Form submission
    studentForm.addEventListener('submit', handleFormSubmit);

    // Update button
    updateStudentBtn.addEventListener('click', handleFormSubmit);

    // Search functionality with debounce
    let searchTimeout;
    searchStudentsInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadStudents(searchTerm);
        }, 300);
    });

    // Filter by hostel
    hostelFilterSelect.addEventListener('change', (e) => {
        // For local filtering combined with server search, we might need to adjust loadStudents
        // But currently, loadStudents fetches all or searched.
        // Let's keep local filter for now or reload with params if backend supports it.
        // The current backend implementation of GET /api/students returns *all* matches for search.
        // To combine, we should ideally filter the *result* of loadStudents or pass both params.
        // For simplicity: refetch with search term, then apply local filter if needed, 
        // OR better: filteredStudents logic inside render.
        // Let's stick to client-side filtering of the *fetched* results for hostel, 
        // while search does a server fetch.
        const selectedHostel = e.target.value;
        const filtered = selectedHostel
            ? allStudents.filter(s => s.assignedHostel === selectedHostel)
            : allStudents;
        renderStudents(filtered);
    });

    // Logout functionality
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
        window.location.href = 'login.html';
    });

    // Batch Delete Functionality
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async () => {
            const deptInput = document.getElementById('batchDeptInput');
            const batchInput = document.getElementById('batchYearInput');
            const department = deptInput?.value?.trim();
            const batch = batchInput?.value?.trim();

            if (!department || !batch) {
                showMessage('Please enter both Department and Batch (e.g. 2k21).', 'error');
                return;
            }

            const confirmMsg = `Are you sure you want to delete ALL students in:\nDepartment: ${department}\nBatch: ${batch}?\n\nThis action cannot be undone and will delete all related records (challans, logs, etc.)!`;
            if (!confirm(confirmMsg)) return;

            try {
                // Double confirmation for safety
                const doubleCheck = prompt(`Type "DELETE" to confirm batch deletion for ${department} ${batch}:`);
                if (!doubleCheck || doubleCheck.toUpperCase() !== "DELETE") {
                    showMessage('Batch deletion cancelled. You must type "DELETE".', 'info');
                    return;
                }

                const response = await ApiHelper.request('/students/batch', {
                    method: 'DELETE',
                    body: JSON.stringify({ department, batch })
                });

                if (response.success) {
                    alert(response.message || 'Batch deleted successfully!');
                    showMessage(response.message || 'Batch deleted successfully!', 'success');
                    await logActivity('BATCH_DELETE', `Deleted batch ${batch} of ${department}`);
                    loadStudents(); // Refresh table
                    deptInput.value = '';
                    batchInput.value = '';
                } else {
                    throw new Error(response.message || 'Batch delete failed');
                }
            } catch (error) {
                console.error("Error deleting batch:", error);
                alert('Error: ' + (error.message || 'Failed to delete batch.'));
                showMessage(error.message || 'Failed to delete batch.', 'error');
            }
        });
    }

    // Download Students PDF (top and bottom buttons)
    const wirePdf = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const base = (localStorage.getItem('API_BASE') || 'http://localhost:4000/api').replace(/\/$/, '');
            window.open(`${base}/export/students.pdf`, '_blank');
        });
    };
    wirePdf('downloadStudentsPdfTop');
    wirePdf('downloadStudentsPdfBottom');

    // Download Students CSV (Excel) like fee management page
    const downloadCsvBtn = document.getElementById('downloadStudentsCsvBtn');
    if (downloadCsvBtn) {
        // Neutralize default anchor download of current page HTML
        try { downloadCsvBtn.removeAttribute('download'); } catch (_) { }
        try { downloadCsvBtn.setAttribute('href', 'javascript:void(0)'); } catch (_) { }
        downloadCsvBtn.addEventListener('click', (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            // Build CSV from the visible table (id 'studentTable' or '.students-table')
            const result = exportVisibleStudentsTableCsv();
            if (!result) return;
            const { csv } = result;
            // Trigger a file download using an object URL (same pattern as fee page)
            triggerCsvDownload(csv, 'students_data.csv');
        });
    }

    // Delegated fallback: ensure download works even if direct listener is missed
    document.addEventListener('click', (evt) => {
        const el = evt.target && evt.target.closest && evt.target.closest('#downloadStudentsCsvBtn');
        if (!el) return;
        evt.preventDefault();
        const result = exportVisibleStudentsTableCsv();
        if (!result) return;
        const { csv } = result;
        triggerCsvDownload(csv, 'students_data.csv');
    });

    // Modal handlers
    if (imageModal && imageModalClose) {
        imageModalClose.addEventListener('click', closeImageModal);
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) closeImageModal();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeImageModal();
        });
    }
};

// Modal functions
const openImageModal = (src, name) => {
    if (!imageModal) return;
    if (!src) return; // No-op when no image uploaded
    imageModal.style.display = 'flex';
    if (imageModalImg) imageModalImg.src = src;
    if (imageModalCaption) imageModalCaption.textContent = name || '';
};

// ---- Room allocation helpers ----
async function fetchHostelRooms(hostelName) {
    try {
        const resp = await ApiHelper.get(`/hostels/${encodeURIComponent(hostelName)}/rooms`);
        // Expect shape: { data: { hostel, rooms } }
        const { hostel, rooms } = resp.data || {};
        return { hostel, rooms: Array.isArray(rooms) ? rooms : [] };
    } catch (_) {
        return { hostel: null, rooms: [] };
    }
}

function buildRoomCapacityMap(hostel, rooms) {
    const perRoom = Number(hostel?.capacityPerRoom || 0) || 3;
    const map = new Map();
    (rooms || []).forEach(r => {
        const id = r.roomId || r.roomNo || '';
        const idNormalized = id.toUpperCase().trim();
        const cap = Number(r.capacity || perRoom || 3);
        const occupied = Array.isArray(r.students) ? r.students.filter(s => s && s.name !== 'To Be Alloted').length : 0;
        // Store with normalized key for case-insensitive lookup
        map.set(idNormalized, { capacity: cap, occupied, originalId: id });
    });
    return map;
}

async function validateRoomCapacity(hostelName, roomNo) {
    if (!roomNo) return false;
    const { hostel, rooms } = await fetchHostelRooms(hostelName);
    if (!hostel) return false;
    const map = buildRoomCapacityMap(hostel, rooms);
    const roomNoNormalized = roomNo.toUpperCase().trim();

    // Allow adding students beyond defined capacity - automatically create new slot
    // If room exists in map, always allow (capacity can be exceeded)
    if (map.has(roomNoNormalized)) {
        return true; // Allow exceeding capacity - system will create new slot
    }

    // If room doesn't exist in map, allow it anyway (backend will handle it)
    // This allows B, C, D blocks even if not in blocks definition
    return true;
}

async function findFirstAvailableRoom(hostelName) {
    const { hostel, rooms } = await fetchHostelRooms(hostelName);
    if (!hostel) return null;
    const perRoom = Number(hostel.capacityPerRoom || 0) || 3;

    // If API provides rooms, scan them in sorted order
    if (Array.isArray(rooms) && rooms.length > 0) {
        const sorted = [...rooms].sort((a, b) => String(a.roomId || a.roomNo || '').localeCompare(String(b.roomId || b.roomNo || '')));
        for (const r of sorted) {
            const id = r.roomId || r.roomNo;
            const capacity = Number(r.capacity || perRoom || 3);
            const occupied = Array.isArray(r.students) ? r.students.filter(s => s && s.name !== 'To Be Alloted').length : 0;
            if (occupied < capacity) return id;
        }
        return null;
    }

    // If rooms not returned, try to infer from hostel.blocks and numberOfRooms via public hostels endpoint
    try {
        const basic = await ApiHelper.get('/hostels?includeStats=true');
        const found = (basic.data || []).find(h => h.name === hostelName);
        const blocks = Array.isArray(found?.blocks) ? found.blocks : [];
        const totalRooms = Number(found?.numberOfRooms || found?.totalRooms || 0);
        const roomIds = [];
        if (blocks && blocks.length) {
            blocks.forEach(b => {
                const count = Number(b.numRooms || 0);
                for (let i = 1; i <= count; i++) roomIds.push(`${b.name}-${String(i).padStart(2, '0')}`);
            });
        } else {
            const numBlocks = Number(found?.numberOfBlocks || 0) || 5;
            const letters = Array.from({ length: numBlocks }, (_, idx) => String.fromCharCode('A'.charCodeAt(0) + idx));
            const perBlock = Math.floor(totalRooms / numBlocks);
            const remainder = totalRooms % numBlocks;
            letters.forEach((letter, idx) => {
                const count = perBlock + (idx < remainder ? 1 : 0);
                for (let i = 1; i <= count; i++) roomIds.push(`${letter}-${String(i).padStart(2, '0')}`);
            });
        }
        // Without occupancy info, just return the first id and rely on backend to reject if full
        return roomIds[0] || null;
    } catch (_) {
        return null;
    }
}

const closeImageModal = () => {
    if (!imageModal) return;
    imageModal.style.display = 'none';
    if (imageModalImg) imageModalImg.src = '';
    if (imageModalCaption) imageModalCaption.textContent = '';
};

// ---- CSV Export (Excel) ----
function buildStudentsCsv() {
    try {
        const rows = [];
        // Header
        rows.push([
            'Name',
            'Reg No',
            "Father's Name",
            'Degree',
            'Department',
            'Semester',
            'District',
            'Assigned Hostel',
            'Room No',
            'Fee Status'
        ]);

        // Data rows from in-memory list (authoritative)
        if (Array.isArray(allStudents) && allStudents.length > 0) {
            allStudents.forEach((s) => {
                rows.push([
                    s.studentName || '',
                    s.registrationNumber || '',
                    s.fatherName || '',
                    s.degree || '',
                    s.department || '',
                    String(s.semester ?? ''),
                    s.district || '',
                    s.assignedHostel || '',
                    s.roomNumber || '',
                    s.hostelFee || 'pending'
                ]);
            });
        } else {
            // Fallback: parse from visible table so the button always works
            const table = document.querySelector('.students-table');
            if (table) {
                const bodyRows = table.querySelectorAll('tbody tr');
                bodyRows.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    // td[0] is picture; slice data columns accordingly
                    const name = tds[1]?.textContent?.trim() || '';
                    const reg = tds[2]?.textContent?.trim() || '';
                    const father = tds[3]?.textContent?.trim() || '';
                    const degree = tds[4]?.textContent?.trim() || '';
                    const department = tds[5]?.textContent?.trim() || '';
                    const semester = tds[6]?.textContent?.trim() || '';
                    const district = tds[7]?.textContent?.trim() || '';
                    const hostel = tds[8]?.textContent?.trim() || '';
                    const room = tds[9]?.textContent?.trim() || '';
                    const fee = tds[10]?.textContent?.trim() || '';
                    rows.push([name, reg, father, degree, department, semester, district, hostel, room, fee]);
                });
            }
        }

        const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
        const scope = (hostelFilterSelect && hostelFilterSelect.value) ? hostelFilterSelect.value : 'All';
        return { csv: "\ufeff" + csv, filename: `Students_${scope}.csv` };
    } catch (_) { return null; }
}

function escapeCsv(val) {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

// kept for parity if needed elsewhere
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

// ---- Table-based CSV export (collects headers + all visible rows) ----
function exportVisibleStudentsTableCsv() {
    try {
        // Prefer an explicit id if present; otherwise fall back to existing students table
        const table = document.getElementById('studentTable') || document.querySelector('.students-table');
        if (!table) return null;

        const rows = [];

        // Headers
        const thead = table.tHead || table.querySelector('thead');
        if (thead) {
            const headerRow = thead.querySelector('tr');
            if (headerRow) {
                const headerCells = Array.from(headerRow.querySelectorAll('th')).map(c => (c.textContent || '').trim());
                if (headerCells.length) rows.push(headerCells);
            }
        }

        // Body rows
        const body = table.tBodies && table.tBodies.length ? table.tBodies[0] : table.querySelector('tbody');
        if (body) {
            Array.from(body.querySelectorAll('tr')).forEach(tr => {
                // Exclude rows that are purely placeholders (no cells)
                const tds = Array.from(tr.querySelectorAll('td'));
                if (!tds.length) return;
                const cells = tds.map(td => (td.textContent || '').trim());
                rows.push(cells);
            });
        }

        // Build CSV
        const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
        return { csv: "\ufeff" + csv };
    } catch (_) { return null; }
}

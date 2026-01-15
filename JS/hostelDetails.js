import ApiHelper from './apiHelper.js';

const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const hostelTitle = document.getElementById('hostelTitle');
const hostelStats = document.getElementById('hostelStats');
const roomsContainer = document.getElementById('roomsContainer');
const detailMessage = document.getElementById('detailMessage');
const searchRoomsInput = document.getElementById('searchRoomsInput');
const hostelSelect = document.getElementById('hostelSelect');

let hostelData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(sessionStorage.getItem('user'));
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;

  // Hide Users menu for Wardens
  if (user.role === 'Warden') {
    document.querySelector('a[href="users.html"]')?.closest('li')?.remove();
  }

  await initializeHostelSelection();
  setupEvents();
  setupUpdateListeners();
});

// Setup listeners for hostel updates (only once)
let updateListenersSetup = false;
const setupUpdateListeners = () => {
  if (updateListenersSetup) return; // Prevent duplicate listeners
  updateListenersSetup = true;
  
  // auto-refresh when hostels updated elsewhere
  window.addEventListener('hostelsUpdated', async (event) => {
    // Reload hostel selection dropdown
    await initializeHostelSelection();
    // Reload current hostel details
    await refreshCurrentHostelData();
  });
  
  // Listen for localStorage changes (when hostels are added/updated from other pages/tabs)
  window.addEventListener('storage', async (e) => {
    if (e.key === 'hostels:updated') {
      // Reload hostel selection dropdown
      await initializeHostelSelection();
      // Reload current hostel details
      await refreshCurrentHostelData();
    }
  });
  
  // Also check localStorage periodically for updates (fallback for same-tab updates)
  let lastKnownUpdate = localStorage.getItem('hostels:updated');
  setInterval(async () => {
    const currentUpdate = localStorage.getItem('hostels:updated');
    if (currentUpdate && currentUpdate !== lastKnownUpdate) {
      lastKnownUpdate = currentUpdate;
      // Reload hostel selection dropdown
      await initializeHostelSelection();
      // Reload current hostel details
      await refreshCurrentHostelData();
    }
  }, 1000); // Check every second
};

const setupEvents = () => {
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('token');
      window.location.href = 'login.html';
    });
  }
  if (searchRoomsInput) {
    searchRoomsInput.addEventListener('input', (e) => {
      const term = e.target.value.trim().toLowerCase();
      renderRooms(filterRooms(term));
    });
  }
  if (hostelSelect) {
    hostelSelect.addEventListener('change', async (e) => {
      const chosen = e.target.value;
      if (chosen) await loadDetailsWithVariants(chosen);
    });
  }
  const dlBtn = document.getElementById('downloadHostelCsvBtn');
  if (dlBtn) {
    dlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportCurrentHostelViewToCsv();
    });
  }
};

// Helper function to refresh current hostel data (defined outside to avoid scope issues)
const refreshCurrentHostelData = async () => {
  try {
    // Get current selection - prefer dropdown value, then URL param
    let currentHostel = hostelSelect?.value;
    if (!currentHostel) {
      const urlParams = new URLSearchParams(window.location.search);
      currentHostel = urlParams.get('id');
    }
    
    // If we have a selection, reload the details
    if (currentHostel) {
      await loadDetailsWithVariants(currentHostel);
    } else {
      // No selection - try to get from dropdown options
      if (hostelSelect && hostelSelect.options.length > 0) {
        currentHostel = hostelSelect.options[0].value;
        hostelSelect.value = currentHostel;
        await loadDetailsWithVariants(currentHostel);
      }
    }
  } catch (err) {
    console.error('Error refreshing hostel data:', err);
  }
};

const initializeHostelSelection = async () => {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem('user') || 'null');

    let hostels = [];
    // Wardens may not be allowed to hit admin endpoint; build from their assignment
    if (currentUser && (currentUser.role === 'Warden' || currentUser.role === 'warden')) {
      const names = Array.isArray(currentUser.assignedHostels) && currentUser.assignedHostels.length > 0
        ? currentUser.assignedHostels
        : (currentUser.hostelName ? [currentUser.hostelName] : []);
      hostels = names.map(n => ({ name: n }));
    } else {
      // Get all hostel names with stats
      const resp = await ApiHelper.get('/hostels?includeStats=true');
      hostels = resp.data || [];
    }

    // Store current selection before updating dropdown
    const currentSelection = hostelSelect?.value;

    if (hostelSelect) {
      hostelSelect.innerHTML = '';
      hostels.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.name;
        opt.textContent = h.name;
        hostelSelect.appendChild(opt);
      });

      // If warden, lock dropdown to own hostel and hide the control
      if (currentUser && (currentUser.role === 'Warden' || currentUser.role === 'warden') && (currentUser.hostelName || (currentUser.assignedHostels && currentUser.assignedHostels.length === 1))) {
        const onlyName = currentUser.hostelName || currentUser.assignedHostels[0];
        [...hostelSelect.options].forEach(opt => { if (opt.value !== onlyName) opt.remove(); });
        hostelSelect.value = onlyName;
        hostelSelect.disabled = true;
        const label = document.querySelector('label[for="hostelSelect"]');
        if (label) label.style.display = 'none';
        hostelSelect.style.display = 'none';
      }
    }
    const params = new URLSearchParams(window.location.search);
    const viaId = params.get('id');
    // Force warden to own hostel regardless of URL
    const first = (currentUser && (currentUser.role === 'Warden' || currentUser.role === 'warden') && (currentUser.hostelName || (currentUser.assignedHostels && currentUser.assignedHostels.length > 0)))
      ? (currentUser.hostelName || currentUser.assignedHostels[0])
      : (viaId || (hostels[0]?.name || ''));
    
    // Restore or set selection
    if (hostelSelect && first) {
      // Check if the selected hostel still exists in the updated list
      const exists = hostels.find(h => h.name === first);
      if (exists) {
        hostelSelect.value = first;
      } else if (hostels.length > 0) {
        // Hostel might have been renamed - use first available
        hostelSelect.value = hostels[0].name;
      }
    } else if (hostelSelect && currentSelection) {
      // Try to restore previous selection if it still exists
      const exists = hostels.find(h => h.name === currentSelection);
      if (exists) {
        hostelSelect.value = currentSelection;
      }
    }
    
    const selectedHostel = hostelSelect?.value || first;
    if (selectedHostel) {
      await loadDetailsWithVariants(selectedHostel);
    }
  } catch (err) {
    // If API failed and user is warden, still try to load CSV fallback for their hostel
    const currentUser = JSON.parse(sessionStorage.getItem('user') || 'null');
    if (currentUser && (currentUser.role === 'Warden' || currentUser.role === 'warden')) {
      const onlyName = currentUser.hostelName || (Array.isArray(currentUser.assignedHostels) ? currentUser.assignedHostels[0] : '');
      if (onlyName) {
        if (hostelSelect) {
          hostelSelect.innerHTML = `<option value="${onlyName}">${onlyName}</option>`;
          hostelSelect.value = onlyName;
          hostelSelect.disabled = true;
          const label = document.querySelector('label[for="hostelSelect"]');
          if (label) label.style.display = 'none';
          hostelSelect.style.display = 'none';
        }
        await loadDetailsWithVariants(onlyName);
        return;
      }
    }
    showMessage('Failed to load hostels', 'error');
  }
};

let currentStudentData = [];

const filterRooms = (term) => {
  if (!term) {
    if (currentStudentData.length > 0) {
      renderStudentTable(currentStudentData);
    } else if (hostelData && Array.isArray(hostelData.rooms)) {
      renderRooms(hostelData.rooms);
    }
    return;
  }
  
  if (currentStudentData.length > 0) {
    // Filter student data (including "To Be Alloted" entries)
    const filteredStudents = currentStudentData.filter(student => {
      const searchText = `${student.name} ${student.regNo} ${student.department} ${student.roomNo}`.toLowerCase();
      return searchText.includes(term.toLowerCase());
    });
    renderStudentTable(filteredStudents);
  } else if (hostelData && Array.isArray(hostelData.rooms)) {
    // Filter room data (fallback)
    const filteredRooms = hostelData.rooms.filter(r => {
      const id = (r.roomId || '').toLowerCase();
      const students = (r.students || []).map(s => `${s.name} ${s.registrationNumber}`.toLowerCase()).join(' ');
      return id.includes(term) || students.includes(term);
    });
    renderRooms(filteredRooms);
  }
};

// Build name variants to tolerate differences like "Armabel" vs "Armabel Hostel"
function buildNameVariants(name) {
  const base = (name || '').trim();
  const stripped = base.replace(/\s*Hostel$/i, '').trim();
  const collapsed = base.replace(/\s+/g, ' ').trim();
  const cands = [base, stripped, collapsed];
  const unique = Array.from(new Set(cands.filter(Boolean)));
  return unique;
}
// Build a complete list of rooms based on hostel schema and merge students
function buildFullRooms(hostel, apiRooms = [], csvStudents = [], assignedStudents = []) {
  const capacityPerRoom = Number(hostel?.capacityPerRoom || 0) || 3;
  const numberOfRooms = Number(
    hostel?.numberOfRooms
    || hostel?.totalRooms
    || hostel?.stats?.totalRooms
    || 0
  );
  const blocks = Array.isArray(hostel?.blocks) ? hostel.blocks : [];

  // Create a map of existing students keyed by roomId
  const studentsByRoom = new Map();
  // From API room objects
  if (Array.isArray(apiRooms)) {
    apiRooms.forEach(r => {
      const roomId = r.roomId || r.roomNo || '';
      const studs = Array.isArray(r.students) ? r.students : [];
      if (!studentsByRoom.has(roomId)) studentsByRoom.set(roomId, []);
      studentsByRoom.get(roomId).push(...studs);
    });
  }
  // From CSV parsed student entries
  if (Array.isArray(csvStudents)) {
    csvStudents.forEach(s => {
      const roomId = s.roomNo || s.room || s.Room || '';
      if (!roomId) return;
      if (!studentsByRoom.has(roomId)) studentsByRoom.set(roomId, []);
      // Normalize to API student shape used above
      studentsByRoom.get(roomId).push({
        name: s.name || s.student || s.fullName,
        registrationNumber: s.regNo || s.registrationNumber || s.reg,
        department: s.department || s.faculty
      });
    });
  }
  // From Students page live data (prioritize this over API/CSV to avoid duplicates)
  if (Array.isArray(assignedStudents)) {
    const byRoom = new Map();
    assignedStudents.forEach(s => {
      const roomId = s.roomNo || '';
      if (!roomId) return;
      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId).push(s);
    });
    // Replace any existing room entries with authoritative list from Students API, deduped
    for (const [roomId, list] of byRoom.entries()) {
      const seen = new Set();
      const unique = [];
      list.forEach(s => {
        const key = String(s.regNo || s.name || '').trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          unique.push({ name: s.name, registrationNumber: s.regNo, department: s.department });
        }
      });
      studentsByRoom.set(roomId, unique);
    }
  }

  // If we don't know total rooms, fall back to what API provided
  if (!numberOfRooms || numberOfRooms <= 0) {
    return (apiRooms || []).map(r => ({
      roomId: r.roomId || r.roomNo,
      capacity: Number(r.capacity || capacityPerRoom || 3),
      students: Array.isArray(r.students) ? r.students : []
    }));
  }

  // Generate room IDs across blocks if block info exists, otherwise numeric sequence
  const roomIds = [];
  if (blocks && blocks.length > 0 && blocks.every(b => b.name && b.numRooms)) {
    blocks.forEach(b => {
      const count = Number(b.numRooms || 0);
      for (let i = 1; i <= count; i++) {
        const id = `${b.name}-${String(i).padStart(2, '0')}`;
        roomIds.push(id);
      }
    });
  } else {
    // Synthesize block letters A.. based on known or default number of blocks
    const numBlocks = Number(hostel?.numberOfBlocks || 0) || 5;
    const letters = Array.from({ length: numBlocks }, (_, idx) => String.fromCharCode('A'.charCodeAt(0) + idx));
    const roomsPerBlock = Math.floor(numberOfRooms / numBlocks);
    const remainder = numberOfRooms % numBlocks;
    letters.forEach((letter, idx) => {
      const count = roomsPerBlock + (idx < remainder ? 1 : 0);
      for (let i = 1; i <= count; i++) {
        roomIds.push(`${letter}-${String(i).padStart(2, '0')}`);
      }
    });
  }

  // Trim or extend to exact numberOfRooms
  const normalizedRoomIds = roomIds.slice(0, numberOfRooms);
  while (normalizedRoomIds.length < numberOfRooms) {
    const id = `${(hostel?.name || '').substring(0,2).toUpperCase()}-${String(normalizedRoomIds.length + 1).padStart(2, '0')}`;
    normalizedRoomIds.push(id);
  }

  // Build final rooms array with placeholders
  const rooms = normalizedRoomIds.map(id => {
    const students = studentsByRoom.get(id) || [];
    // Deduplicate again defensively across all sources
    const seen = new Set();
    const deduped = [];
    students.forEach(s => {
      const key = String(s.registrationNumber || s.regNo || s.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    });
    const normalized = deduped.map((s) => ({
      name: s.name || s.fullName || s.studentName || '',
      registrationNumber: s.registrationNumber || s.regNo || s.reg || '',
      department: s.department || s.faculty || s.dept || ''
    }));
    const placeholdersNeeded = Math.max(capacityPerRoom - normalized.length, 0);
    for (let i = 0; i < placeholdersNeeded; i++) {
      normalized.push({ name: 'To Be Alloted', registrationNumber: '-', department: '-' });
    }
    return { roomId: id, capacity: capacityPerRoom, students: normalized };
  });

  return rooms;
}

async function loadDetailsWithVariants(name) {
  const candidates = buildNameVariants(name);
  for (const cand of candidates) {
    const ok = await loadDetailsTry(cand);
    if (ok) return;
  }
  // As a graceful fallback, try loading CSV for known hostels like Armabel
  const csvStudents = await loadCSVData(name);
  if (Array.isArray(csvStudents) && csvStudents.length > 0) {
    currentStudentData = csvStudents;
    renderHostelTop({ name, totalRooms: undefined, totalCapacity: undefined, occupiedSlots: csvStudents.filter(s=>s.name !== 'To Be Alloted').length, emptySlots: csvStudents.filter(s=>s.name === 'To Be Alloted').length });
    renderStudentTable(csvStudents);
    return;
  }
  showMessage('Hostel not found', 'error');
}

async function loadDetailsTry(identifier) {
  try {
    // Get hostel rooms with student data from API
    const roomsResp = await ApiHelper.get(`/hostels/${encodeURIComponent(identifier)}/rooms`);
    const { hostel, rooms } = roomsResp.data;
    hostelData = hostel;
    
    // Pull all students and filter to this hostel for live sync with Students page
    let assignedStudents = [];
    try {
      const studentsResp = await ApiHelper.get('/students');
      const allStudents = studentsResp.data || [];
      const variants = buildNameVariants(identifier).map(v => v.toLowerCase());
      assignedStudents = allStudents
        .filter(s => variants.includes(String(s.assignedHostel || '').toLowerCase()))
        .map(s => ({
          name: s.studentName,
          regNo: s.registrationNumber,
          department: s.department,
          roomNo: s.roomNumber
        }));
    } catch (_) { /* ignore */ }
    
    // Merge data: generate full room set and inject students from API/CSV
    const csvStudents = await loadCSVData(identifier);
    const fullRooms = buildFullRooms(hostel, rooms, csvStudents, assignedStudents);

    // Aggregate student list for stats/search
    currentStudentData = fullRooms.flatMap(r => (Array.isArray(r.students) ? r.students : []));

    renderHostelTop({
      name: identifier,
      totalRooms: hostel.numberOfRooms || hostel.totalRooms || fullRooms.length,
      totalCapacity: (hostel.totalCapacity || (hostel.capacityPerRoom ? (hostel.capacityPerRoom * fullRooms.length) : undefined) || hostel.capacity || 0),
      occupiedSlots: currentStudentData.filter(s => s.name && s.name !== 'To Be Alloted').length,
      emptySlots: fullRooms.reduce((acc, r) => acc + Math.max((r.capacity || 0) - (r.students?.filter(s=>s.name && s.name !== 'To Be Alloted')?.length || 0), 0), 0),
      warden: hostel.warden,
      capacityPerRoom: hostel.capacityPerRoom
    });
    renderRoomWiseTable(fullRooms);
    return true;
  } catch (err) {
    return false;
  }
}

const loadDetails = async (identifier) => {
  try {
    // Get hostel rooms with student data from API
    const roomsResp = await ApiHelper.get(`/hostels/${encodeURIComponent(identifier)}/rooms`);
    const { hostel, rooms } = roomsResp.data;
    hostelData = hostel;
    
    if (rooms && rooms.length > 0) {
      // Use API data for room-wise display
      currentStudentData = rooms.flatMap(room => room.students);
      renderHostelTop({
        name: identifier,
        totalRooms: hostel.numberOfRooms || hostel.totalRooms || 0,
        totalCapacity: hostel.totalCapacity || hostel.capacity || 0,
        occupiedSlots: currentStudentData.filter(s => s.name !== 'To Be Alloted').length,
        emptySlots: currentStudentData.filter(s => s.name === 'To Be Alloted').length,
        warden: hostel.warden,
        capacityPerRoom: hostel.capacityPerRoom
      });
      renderRoomWiseTable(rooms);
    } else {
      // No rooms returned; show empty state using API-provided hostel schema
      currentStudentData = [];
      renderHostelTop({
        name: identifier,
        totalRooms: hostel.totalRooms || hostel.numberOfRooms || 0,
        totalCapacity: hostel.totalCapacity || hostel.capacity || 0,
        occupiedSlots: 0,
        emptySlots: hostel.totalCapacity || hostel.capacity || 0,
        warden: hostel.warden,
        capacityPerRoom: hostel.capacityPerRoom
      });
      renderRooms([]);
    }
  } catch (err) {
    // Strict mode: do not use CSV; surface API error for visibility
    showMessage(err.message || 'Failed to load hostel details', 'error');
  }
};

const loadCSVData = async (hostelName) => {
  try {
    // Map hostel names to CSV file names (with correct relative path from HTML folder)
    const csvFileMap = {
      'Magsi': '../Hostel Allotment 2025 qm Upload (1).xlsx - Magsi Hostel.csv',
      'Hingol': '../Hostel Allotment 2025 qm Upload (1).xlsx - Hingol hostel.csv',
      'Armabel': '../Hostel Allotment 2025 qm Upload (1).xlsx - Armabel hostel.csv',
      'Porali': '../Hostel Allotment 2025 qm Upload (1).xlsx - Porali hostel.csv'
    };
    
    const csvFileName = csvFileMap[hostelName];
    if (!csvFileName) {
      return null;
    }
    
    const response = await fetch(csvFileName);
    if (!response.ok) {
      return null;
    }
    
    const csvText = await response.text();
    const parsedData = parseCSV(csvText);
    return parsedData;
  } catch (error) {
    return null;
  }
};

const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length >= 5 && values[0] && values[1]) { // Check for valid data
      students.push({
        sno: values[0],
        name: values[1],
        regNo: values[2],
        department: values[3], // Faculty column becomes Department
        roomNo: values[4]
      });
    }
  }
  
  return students;
};

const renderHostelTop = (data) => {
  // Format hostel title based on the hostel name
  let formattedTitle = data.name;
  if (data.name === 'Magsi') {
    formattedTitle = 'Yousaf Aziz Magsi Hostel – Block A';
  } else if (data.name === 'Hingol') {
    formattedTitle = 'Hingol Hostel – Ground Floor';
  } else if (data.name === 'Armabel') {
    formattedTitle = 'Armabel Hostel – Block A';
  } else if (data.name === 'Porali') {
    formattedTitle = 'Porali Hostel – Block A';
  }
  
  if (hostelTitle) hostelTitle.textContent = formattedTitle;
  if (hostelStats) {
    hostelStats.innerHTML = `
      <div><strong>Total Rooms:</strong> ${data.totalRooms ?? '-'}</div>
      <div><strong>Total Capacity:</strong> ${data.totalCapacity ?? '-'}</div>
      <div><strong>Occupied Slots:</strong> ${data.occupiedSlots ?? 0}</div>
      <div><strong>Empty Slots:</strong> ${data.emptySlots ?? 0}</div>
      ${data.warden ? `<div><strong>Warden:</strong> ${data.warden}</div>` : ''}
      ${data.capacityPerRoom ? `<div><strong>Capacity per Room:</strong> ${data.capacityPerRoom}</div>` : ''}
    `;
  }
};

const renderRooms = (rooms) => {
  if (!roomsContainer) return;
  roomsContainer.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    roomsContainer.innerHTML = '<p class="no-data">No rooms found.</p>';
    return;
  }
  rooms.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-card';
    const students = (r.students && r.students.length) ? r.students.map(s => `${s.name} (Reg# ${s.registrationNumber})`).join(', ') : 'None';
    div.innerHTML = `
      <h3>Room ${r.roomId}</h3>
      <p><strong>Capacity:</strong> ${r.capacity}</p>
      <p><strong>Students:</strong> ${students}</p>
      <p><strong>Free Slots:</strong> ${Math.max((r.capacity || 0) - (r.students?.length || 0), 0)}</p>
    `;
    roomsContainer.appendChild(div);
  });
};

const renderStudentTable = (students, hostelData = null) => {
  if (!roomsContainer) return;
  roomsContainer.innerHTML = '';
  
  if (!students || students.length === 0) {
    roomsContainer.innerHTML = '<p class="no-data">No students assigned yet</p>';
    return;
  }

  // Group students by room number
  const roomGroups = {};
  students.forEach(student => {
    if (student.roomNo && student.roomNo.trim()) {
      if (!roomGroups[student.roomNo]) {
        roomGroups[student.roomNo] = [];
      }
      roomGroups[student.roomNo].push(student);
    }
  });

  // Create room-wise display
  const roomWiseContainer = document.createElement('div');
  roomWiseContainer.className = 'room-wise-container';
  
  // Sort rooms for consistent display
  const sortedRooms = Object.keys(roomGroups).sort((a, b) => {
    // Extract room number and letter for proper sorting (A-01, A-02, etc.)
    const aMatch = a.match(/([A-Z]+)-?(\d+)/);
    const bMatch = b.match(/([A-Z]+)-?(\d+)/);
    
    if (aMatch && bMatch) {
      const aLetter = aMatch[1];
      const bLetter = bMatch[1];
      const aNum = parseInt(aMatch[2]);
      const bNum = parseInt(bMatch[2]);
      
      if (aLetter !== bLetter) {
        return aLetter.localeCompare(bLetter);
      }
      return aNum - bNum;
    }
    return a.localeCompare(b);
  });

  let globalSno = 1;
  
  sortedRooms.forEach(roomNo => {
    const roomStudents = roomGroups[roomNo];
    const roomCapacity = getRoomCapacity(roomNo, students, hostelData);
    
    // Separate actual students from "To Be Alloted" entries
    const actualStudents = roomStudents.filter(s => s.name !== 'To Be Alloted');
    const toBeAllotedCount = roomStudents.filter(s => s.name === 'To Be Alloted').length;
    
    // Create room section
    const roomSection = document.createElement('div');
    roomSection.className = 'room-section';
    
    // Room header
    const roomHeader = document.createElement('div');
    roomHeader.className = 'room-header';
    roomHeader.innerHTML = `
      <h3>Room ${roomNo}</h3>
      <span class="room-capacity">Capacity: ${roomCapacity} | Occupied: ${actualStudents.length} | Available: ${roomCapacity - actualStudents.length}</span>
    `;
    
    // Room table
    const roomTable = document.createElement('table');
    roomTable.className = 'room-table';
    roomTable.innerHTML = `
      <thead>
        <tr>
          <th>S.No</th>
          <th>Name of Students</th>
          <th>Reg No</th>
          <th>Department</th>
          <th>Room No</th>
        </tr>
      </thead>
      <tbody>
        ${actualStudents.map(student => `
          <tr>
            <td>${globalSno++}</td>
            <td>${student.name || ''}</td>
            <td>${student.regNo || ''}</td>
            <td>${student.department || ''}</td>
            <td>${student.roomNo || ''}</td>
          </tr>
        `).join('')}
        ${Array.from({length: roomCapacity - actualStudents.length}, (_, index) => `
          <tr class="empty-slot">
            <td>${globalSno++}</td>
            <td>To Be Alloted</td>
            <td>-</td>
            <td>-</td>
            <td>${roomNo}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    
    roomSection.appendChild(roomHeader);
    roomSection.appendChild(roomTable);
    roomWiseContainer.appendChild(roomSection);
  });
  
  roomsContainer.appendChild(roomWiseContainer);
};

// Function to determine room capacity based on room number, actual data, and API data
const getRoomCapacity = (roomNo, students, hostelData = null) => {
  // First, try to determine capacity from the actual data
  const roomStudents = students.filter(s => s.roomNo === roomNo);
  const toBeAllotedCount = roomStudents.filter(s => s.name === 'To Be Alloted').length;
  const actualStudentsCount = roomStudents.filter(s => s.name !== 'To Be Alloted').length;
  
  // If we have "To Be Alloted" entries, use that to determine capacity
  if (toBeAllotedCount > 0) {
    return actualStudentsCount + toBeAllotedCount;
  }
  
  // Use API data if available (from hostel management system)
  if (hostelData && hostelData.capacityPerRoom) {
    return hostelData.capacityPerRoom;
  }
  
  // Otherwise, use default capacity logic based on room number
  const roomNum = parseInt(roomNo.replace(/\D/g, ''));
  
  // Based on the CSV data analysis:
  // A-01: 5 students, A-02: 4 students, A-03: 4 capacity, A-04: 2 capacity
  if (roomNum === 1) return 5; // A-01 has 5 capacity
  if (roomNum === 2) return 4; // A-02 has 4 capacity  
  if (roomNum === 3) return 4; // A-03 has 4 capacity
  if (roomNum === 4) return 2; // A-04 has 2 capacity
  
  // Default capacity for other rooms
  if (roomNum <= 10) return 4; // First 10 rooms have 4 capacity
  if (roomNum <= 20) return 3; // Next 10 rooms have 3 capacity
  return 3; // Default to 3
};

const showMessage = (msg, type='info') => {
  if (!detailMessage) return;
  detailMessage.textContent = msg;
  detailMessage.className = `message ${type}`;
  setTimeout(() => {
    detailMessage.textContent = '';
    detailMessage.className = 'message';
  }, 5000);
};

/**
 * Build Excel-style room-wise table for all rooms.
 * Expects array of rooms with shape: { roomId, capacity, students: [{ name, regNo|registrationNumber, department }] }
 */
function renderRoomWiseTable(rooms) {
  if (!roomsContainer) return;
  roomsContainer.innerHTML = '';

  if (!Array.isArray(rooms) || rooms.length === 0) {
    roomsContainer.innerHTML = '<p class="no-data">No rooms found.</p>';
    return;
  }

  // Top green banner like the reference (hostel title is already set separately)
  const excelHeader = document.createElement('div');
  excelHeader.className = 'excel-hostel-header';
  excelHeader.textContent = hostelTitle?.textContent || 'Hostel';
  roomsContainer.appendChild(excelHeader);

  // Build tables for each room sequentially
  const container = document.createElement('div');
  container.className = 'excel-rooms-wrapper';

  rooms.forEach((room) => {
    const roomId = room.roomId || room.roomNo || '';
    const capacity = Number(room.capacity || hostelData?.capacityPerRoom || 4);
    const students = Array.isArray(room.students) ? room.students : [];

    // Normalize student objects to a consistent shape
    const normalized = students.map((s) => ({
      name: s.name || s.fullName || s.studentName || '',
      regNo: s.regNo || s.registrationNumber || s.reg || '',
      department: s.department || s.faculty || s.dept || '',
      roomNo: roomId
    }));

    // Fill remaining slots with placeholders
    const placeholdersNeeded = Math.max(capacity - normalized.length, 0);
    const rows = [...normalized];
    for (let i = 0; i < placeholdersNeeded; i++) {
      rows.push({ name: 'To Be Alloted', regNo: '-', department: '-', roomNo: roomId });
    }

    // Build the table for this room
    const table = document.createElement('table');
    table.className = 'excel-room-table';

    // Header row (blue like reference)
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>S.No</th>
        <th>Name of Students</th>
        <th>Reg No</th>
        <th>Department</th>
        <th class="excel-roomno-col">Room No</th>
      </tr>
    `;

    // Body with rows and a fixed yellow room cell using rowspan
    const tbody = document.createElement('tbody');

    // Create the yellow room cell once and append to first row with rowspan
    const roomCell = document.createElement('td');
    roomCell.className = 'excel-roomno-cell';
    roomCell.setAttribute('rowspan', String(Math.max(rows.length, 1) + 0));
    roomCell.textContent = roomId;

    rows.forEach((s, idx) => {
      const tr = document.createElement('tr');
      if (s.name === 'To Be Alloted') tr.classList.add('excel-empty');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${s.name || ''}</td>
        <td>${s.regNo || ''}</td>
        <td>${s.department || ''}</td>
      `;
      // Attach the room cell to the first row so it spans the rest
      if (idx === 0) tr.appendChild(roomCell);
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    // Wrapper per room to add spacing between room tables
    const roomBlock = document.createElement('div');
    roomBlock.className = 'excel-room-block';

    // Small title bar for each room like the blue strip above the table in the reference
    const roomStrip = document.createElement('div');
    roomStrip.className = 'excel-room-strip';
    roomStrip.innerHTML = `<span>Room ${roomId}</span><span>Capacity: ${capacity}</span>`;

    roomBlock.appendChild(roomStrip);
    roomBlock.appendChild(table);
    container.appendChild(roomBlock);
  });

  roomsContainer.appendChild(container);
}

function exportCurrentHostelViewToCsv() {
  try {
    const title = hostelTitle?.textContent || 'Hostel';
    // Prefer the detailed excel-room tables if present
    const excelBlocks = document.querySelectorAll('.excel-room-block');
    const rows = [];
    rows.push(['Hostel', title]);
    rows.push([]);
    rows.push(['Room No', 'S.No', 'Name of Students', 'Reg No', 'Department']);

    if (excelBlocks && excelBlocks.length > 0) {
      excelBlocks.forEach(block => {
        const roomNo = block.querySelector('.excel-room-strip span')?.textContent?.replace('Room ','') || '';
        const trs = block.querySelectorAll('tbody tr');
        trs.forEach((tr, idx) => {
          const tds = tr.querySelectorAll('td');
          const sno = tds[0]?.textContent?.trim() || '';
          const name = tds[1]?.textContent?.trim() || '';
          const reg = tds[2]?.textContent?.trim() || '';
          const dept = tds[3]?.textContent?.trim() || '';
          rows.push([roomNo, sno, name, reg, dept]);
        });
      });
    } else {
      // Fallback to card view parser
      const roomCards = document.querySelectorAll('.room-card');
      roomCards.forEach(card => {
        const header = card.querySelector('h3')?.textContent || '';
        const roomNo = header.replace(/[^A-Za-z0-9-]/g, ' ').replace(/\s+/g,' ').trim().split(' ').pop();
        const studentsText = card.querySelector('p:nth-of-type(3)')?.textContent || '';
        // Unable to split reliably; just emit one line for the room
        rows.push([roomNo, '', studentsText.replace('Students:','').trim(), '', '']);
      });
    }

    const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
    const fileName = `HostelDetails_${(title || 'Hostel').replace(/\s+/g,'_')}.csv`;
    triggerCsvDownload(csv, fileName);
  } catch (e) {
    showMessage('Failed to export CSV', 'error');
  }
}

function escapeCsv(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function triggerCsvDownload(csv, filename) {
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



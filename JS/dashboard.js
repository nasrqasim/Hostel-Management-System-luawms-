 // Import Firebase modules
const API_BASE = (localStorage.getItem('API_BASE') || 'http://localhost:4000/api').replace(/\/$/, '');

// DOM elements
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const totalStudentsEl = document.getElementById('totalStudents');
const totalUsersEl = document.getElementById('totalUsers');
const recentActivityList = document.getElementById('recentActivityList');
const searchBar = document.getElementById('searchBar');

const totalHostelsEls = Array.from(document.querySelectorAll('#totalHostels'));
const activeUsersEls = Array.from(document.querySelectorAll('#activeUsers'));
const vacantPlacesEls = Array.from(document.querySelectorAll('#vacantPlaces'));
const overdueStudentsEls = Array.from(document.querySelectorAll('#overdueStudents, #overdueFeesStudents'));

async function fetchDashboard() {
  try {
    const res = await fetch(`${API_BASE}/dashboard`, {
      headers: {
        'Content-Type': 'application/json',
        ...(sessionStorage.getItem('token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` } : {})
      }
    });
    const payload = await res.json();
    const data = payload && payload.data ? payload.data : payload; // tolerate old shape

    // Update counters
    if (Array.isArray(totalHostelsEls)) totalHostelsEls.forEach(el => el && (el.textContent = String(data.totalHostels ?? '0')));
    if (totalStudentsEl) totalStudentsEl.textContent = String(data.totalStudents ?? '0');
    if (Array.isArray(activeUsersEls)) activeUsersEls.forEach(el => el && (el.textContent = String(data.activeUsers ?? '0')));
    if (Array.isArray(vacantPlacesEls)) vacantPlacesEls.forEach(el => el && (el.textContent = String(data.vacantPlaces ?? '0')));
    if (Array.isArray(overdueStudentsEls)) overdueStudentsEls.forEach(el => el && (el.textContent = String(data.overdueStudents ?? '0')));
  } catch (e) {
    console.error('Failed to load dashboard metrics', e);
  }
}

async function fetchRecentLogs() {
  try {
    const resp = await fetch(`${API_BASE}/logs`, {
      headers: {
        'Content-Type': 'application/json',
        ...(sessionStorage.getItem('token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` } : {})
      }
    });
    const payload = await resp.json();
    const logs = payload && payload.data ? payload.data : (Array.isArray(payload) ? payload : []);
    const recentLogs = logs.slice(0, 5);
    if (recentActivityList) {
      recentActivityList.innerHTML = '';
      recentLogs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        const date = log.createdAt ? new Date(log.createdAt).toLocaleString() : 'N/A';
        item.innerHTML = `
          <span class="activity-timestamp">${date}</span>
          <span class="activity-description">${log.description || log.action || ''}</span>
        `;
        recentActivityList.appendChild(item);
      });
    }
  } catch (e) {
    console.error('Failed to load logs', e);
  }
}

function updateDashboard() {
  fetchDashboard();
  fetchRecentLogs();
}

document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(sessionStorage.getItem('user'));
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;
  updateDashboard();

  // Make overdue fees stat clickable to navigate to fee management
  const overdueStudentsEl = document.getElementById('overdueStudents');
  if (overdueStudentsEl && overdueStudentsEl.classList.contains('clickable-stat')) {
    overdueStudentsEl.style.cursor = 'pointer';
    overdueStudentsEl.title = 'Click to view fee management';
    overdueStudentsEl.addEventListener('click', () => {
      window.location.href = overdueStudentsEl.getAttribute('data-link') || 'feeManagement.html';
    });
  }

  // Auto-refresh on relevant updates from other pages
  window.addEventListener('storage', (e) => {
    if (e.key === 'hostels:updated' || e.key === 'students:updated' || e.key === 'users:updated' || e.key === 'fees:updated') {
      updateDashboard();
    }
  });
  window.addEventListener('hostelsUpdated', updateDashboard);
});

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
    window.location.href = 'login.html';
  });
}

if (searchBar) {
  searchBar.addEventListener('input', (event) => {
    const searchTerm = event.target.value.toLowerCase();
    console.log(`Searching for: ${searchTerm}`);
  });
}

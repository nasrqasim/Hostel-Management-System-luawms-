import ApiHelper from './apiHelper.js';

// DOM elements
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const searchLogsInput = document.getElementById('searchLogsInput');
const filterHostel = document.getElementById('filterHostel');
const filterUser = document.getElementById('filterUser');
const filterAction = document.getElementById('filterAction');
const filterDateRange = document.getElementById('filterDateRange');
const logsTableBody = document.getElementById('logsTableBody');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const currentPageInfo = document.getElementById('currentPageInfo');

// Global state
let allLogs = [];
let filteredLogs = [];
let allHostels = [];
let allUsers = [];
let currentUser = null;
let currentPage = 1;
const logsPerPage = 20;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = user;
    if (welcomeMessage) {
        welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;
    }

    // Apply Warden UI scope before loading data
    applyWardenLogsUIRestrictions();

    // Initialize the page
    await initializePage();
    setupEventListeners();
    
    // Log page access
    await logActivity('PAGE_ACCESS', 'Accessed logs/history page');
});

// Initialize the page
const initializePage = async () => {
    try {
        await Promise.all([
            loadHostels(),
            loadUsers(),
            loadLogs()
        ]);
    } catch (error) {
        console.error('Error initializing page:', error);
        showMessage('Failed to initialize page', 'error');
    }
};

// Setup event listeners
const setupEventListeners = () => {
    // Search functionality
    if (searchLogsInput) {
        searchLogsInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // Filter changes
    if (filterHostel) filterHostel.addEventListener('change', applyFilters);
    if (filterUser) filterUser.addEventListener('change', applyFilters);
    if (filterAction) filterAction.addEventListener('change', applyFilters);
    if (filterDateRange) filterDateRange.addEventListener('change', applyFilters);
    
    // Pagination
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => changePage(-1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => changePage(1));
    
    // Logout
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await logActivity('LOGOUT', 'User logged out');
            sessionStorage.removeItem('user');
            sessionStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }
};

// Load hostels for filtering
const loadHostels = async () => {
    try {
        const response = await ApiHelper.get('/hostels');
        allHostels = response.data;
        populateHostelFilter();
    } catch (error) {
        console.error('Error loading hostels:', error);
    }
};

// Load users for filtering
const loadUsers = async () => {
    try {
        const response = await ApiHelper.get('/users');
        allUsers = response.data;
        populateUserFilter();
    } catch (error) {
        console.error('Error loading users:', error);
    }
};

// Load logs from API
const loadLogs = async () => {
    try {
        const response = await ApiHelper.get('/logs');
        allLogs = response.data;

        // If warden, keep only own logs client-side too (server should already scope)
        if (currentUser && currentUser.role === 'Warden') {
            allLogs = allLogs.filter(l => l.username === currentUser.username);
        }

        filteredLogs = [...allLogs];
        applyFilters();
    } catch (error) {
        console.error('Error loading logs:', error);
        showMessage('Failed to load logs', 'error');
    }
};

// Populate hostel filter dropdown
const populateHostelFilter = () => {
    if (!filterHostel) return;
    
    filterHostel.innerHTML = '<option value="">All Hostels</option>';
    allHostels.forEach(hostel => {
        const option = document.createElement('option');
        option.value = hostel.name;
        option.textContent = hostel.name;
        filterHostel.appendChild(option);
    });
};

// Populate user filter dropdown
const populateUserFilter = () => {
    if (!filterUser) return;
    
    filterUser.innerHTML = '<option value="">All Users</option>';
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.username;
        option.textContent = `${user.username} (${user.role})`;
        filterUser.value = user.username;
        filterUser.appendChild(option);
    });
};

// Apply all filters
const applyFilters = () => {
    const hostelFilter = filterHostel?.value || '';
    const userFilter = filterUser?.value || '';
    const actionFilter = filterAction?.value || '';
    const dateFilter = filterDateRange?.value || '';
    const searchTerm = searchLogsInput?.value?.toLowerCase() || '';
    
    filteredLogs = allLogs.filter(log => {
        // Hostel filter
        if (hostelFilter && log.hostel !== hostelFilter) return false;
        
        // User filter
        if (userFilter && log.username !== userFilter) return false;
        
        // Action filter
        if (actionFilter && log.action !== actionFilter) return false;
        
        // Date filter
        if (dateFilter && !isInDateRange(log.createdAt, dateFilter)) return false;
        
        // Search filter
        if (searchTerm) {
            const searchableText = [
                log.username || '',
                log.role || '',
                log.action || '',
                log.description || '',
                log.hostel || ''
            ].join(' ').toLowerCase();
            
            if (!searchableText.includes(searchTerm)) return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    renderLogs();
    updatePagination();
};

// Check if log is in specified date range
const isInDateRange = (timestamp, range) => {
    if (!timestamp) return false;
    
    const logDate = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
        case 'today':
            return logDate >= today;
        case 'week':
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return logDate >= weekAgo;
        case 'month':
            const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
            return logDate >= monthAgo;
        case 'year':
            const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
            return logDate >= yearAgo;
        default:
            return true;
    }
};

// Handle search input
const handleSearch = () => {
    applyFilters();
};

// Render logs table
const renderLogs = () => {
    if (!logsTableBody) return;
    
    logsTableBody.innerHTML = '';
    
    if (filteredLogs.length === 0) {
        logsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No logs found matching the current filters.</td></tr>';
        return;
    }
    
    const startIndex = (currentPage - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    const pageLogs = filteredLogs.slice(startIndex, endIndex);
    
    pageLogs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${log.username || 'Unknown'}</strong></td>
            <td><span class="role-badge ${log.role?.toLowerCase() || 'unknown'}">${log.role || 'Unknown'}</span></td>
            <td><span class="action-badge ${log.action?.toLowerCase() || 'unknown'}">${log.action || 'Unknown'}</span></td>
            <td>${log.description || log.details || 'No description'}</td>
            <td>${log.hostel || 'N/A'}</td>
            <td>${formatTimestamp(log.createdAt)}</td>
        `;
        logsTableBody.appendChild(row);
    });
};

// Format timestamp for display
const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Update pagination controls
const updatePagination = () => {
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
    if (currentPageInfo) currentPageInfo.textContent = `Page ${currentPage} of ${totalPages} (${filteredLogs.length} total logs)`;
};

// Change page
const changePage = (direction) => {
    const newPage = currentPage + direction;
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderLogs();
        updatePagination();
    }
};

// Show message
const showMessage = (message, type = 'info') => {
    // Create a temporary message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        background-color: ${type === 'success' ? 'green' : type === 'error' ? 'red' : type === 'warning' ? 'orange' : 'blue'};
    `;
    
    document.body.appendChild(messageDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 5000);
};

// Log activity
const logActivity = async (action, description, additionalData = {}) => {
    try {
        await ApiHelper.post('/logs', {
            action,
            description,
            username: currentUser.username,
            role: currentUser.role,
            entityType: 'System',
            ...additionalData
        });
    } catch (error) {
        console.error('Error logging activity:', error);
    }
};

// Debounce function for search
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Export for use in other modules
window.logActivity = logActivity;

// --- Warden UI restrictions for logs ---
function applyWardenLogsUIRestrictions() {
    if (!currentUser || currentUser.role !== 'Warden') return;
    // Hide hostel and user filters; show helper text
    const filters = document.querySelector('.filters');
    if (filters) {
        // Keep only action/date if desired; remove hostel/user selects
        filterHostel?.closest('.form-group')?.remove();
        filterUser?.closest('.form-group')?.remove();
        // Add note
        const note = document.createElement('div');
        note.className = 'no-data';
        note.style.marginTop = '8px';
        note.textContent = 'You are logged in as Warden. Showing only your own activity logs.';
        filters.appendChild(note);
    }
}

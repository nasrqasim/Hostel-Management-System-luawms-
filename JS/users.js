 // Import Firebase modules required for the application
import ApiHelper from './apiHelper.js';

// DOM elements for the users page
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const usersContainer = document.getElementById('usersContainer');
const addUserSection = document.getElementById('addUserSection');
const usernameInput = document.getElementById('usernameInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const roleSelect = document.getElementById('roleSelect');
const assignedHostelsInput = document.getElementById('assignedHostelsInput');
const assignedHostelsSelect = document.getElementById('assignedHostelsSelect');
const addUserBtn = document.getElementById('addUserBtn');
const userMessage = document.getElementById('userMessage');
const searchBar = document.getElementById('searchBar');

// Delete modal elements
const deleteModal = document.getElementById('deleteModal');
const deleteUserName = document.getElementById('deleteUserName');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const closeDeleteModalBtn = document.getElementById('closeDeleteModal');

// State variables
let allUsers = [];
let allHostels = [];
let userToDelete = null;
let isEditMode = false;
let editingUserId = null;

/**
 * Helper function to show a message to the user.
 * @param {string} message The message to display.
 * @param {string} color The color of the message (e.g., 'green', 'red').
 */
const showMessage = (message, color) => {
    if (userMessage) {
        userMessage.textContent = message;
        userMessage.style.color = color;
    }
};

/**
 * Renders the users table with the provided data.
 * @param {Array} usersToRender The array of user objects to render.
 */
const renderUsers = (usersToRender) => {
    if (usersContainer) {
        usersContainer.innerHTML = '';
        usersToRender.forEach(user => {
            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            userCard.dataset.uid = user.id; // Store Firestore document ID
            const assignedHostels = user.assignedHostels ? user.assignedHostels.join(', ') : 'N/A';
            userCard.innerHTML = `
                <div class="user-details">
                    <h3>${user.username}</h3>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Role:</strong> ${user.role}</p>
                    <p><strong>Assigned Hostels:</strong> ${assignedHostels}</p>
                </div>
                <div class="user-actions">
                    <button class="action-button edit-btn"><i class="fas fa-edit"></i></button>
                    <button class="action-button delete-btn"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            usersContainer.appendChild(userCard);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const uid = e.target.closest('.user-card').dataset.uid;
                editUser(uid);
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const uid = e.target.closest('.user-card').dataset.uid;
                const user = allUsers.find(u => u.id === uid);
                if (user) {
                    showDeleteModal(user);
                }
            });
        });
    }
};

/**
 * Populate the Add User form with an existing user's data and switch to edit mode
 * @param {string} uid
 */
const editUser = (uid) => {
    const user = allUsers.find(u => u.id === uid);
    if (!user) return;

    editingUserId = uid;
    isEditMode = true;

    // Fill inputs
    if (usernameInput) usernameInput.value = user.username || '';
    if (emailInput) emailInput.value = user.email || '';
    if (passwordInput) passwordInput.value = '';
    if (roleSelect) roleSelect.value = user.role || 'warden';

    // Select assigned hostels
    if (assignedHostelsSelect) {
        Array.from(assignedHostelsSelect.options).forEach(opt => {
            opt.selected = Array.isArray(user.assignedHostels) && user.assignedHostels.includes(opt.value);
        });
    }
    if (assignedHostelsInput) assignedHostelsInput.value = '';

    // Update button label
    if (addUserBtn) addUserBtn.textContent = 'Update User';

    showMessage('Editing user. Modify fields and click Update User.', 'orange');
};

/**
 * Update an existing user using the form values
 */
const updateUser = async () => {
    if (!isEditMode || !editingUserId) return;

    const email = emailInput.value.trim();
    const role = roleSelect.value;
    const selectedHostels = Array.from(assignedHostelsSelect.selectedOptions).map(opt => opt.value);
    const manualHostels = assignedHostelsInput.value.split(',').map(h => h.trim()).filter(h => h);
    const assignedHostels = [...new Set([...selectedHostels, ...manualHostels])];

    if (!email || !role) {
        showMessage('Email and role are required to update user!', 'red');
        return;
    }

    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`http://localhost:4000/api/users/${editingUserId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ email, role, assignedHostels: role === 'warden' ? assignedHostels : [] })
        });
        const response = await res.json();
        if (!response.success) throw new Error(response.message || 'Failed to update user');

        showMessage(response.message || 'User updated successfully!', 'green');
        // Reset edit mode and refresh list
        isEditMode = false;
        editingUserId = null;
        if (addUserBtn) addUserBtn.textContent = 'Add User';
        clearForm();
        await loadUsers();
    } catch (error) {
        showMessage(error.message || 'Failed to update user', 'red');
    }
};

/**
 * Handles adding a new user.
 */
const addUser = async () => {
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const role = roleSelect.value;
    
    // Get assigned hostels from both select and input
    const selectedHostels = Array.from(assignedHostelsSelect.selectedOptions).map(opt => opt.value);
    const manualHostels = assignedHostelsInput.value.split(',').map(h => h.trim()).filter(h => h);
    const assignedHostels = [...new Set([...selectedHostels, ...manualHostels])]; // Remove duplicates

    if (!username || !email || !role) {
        showMessage('Username, email, and role are required!', 'red');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const userData = { username, email, password, role, assignedHostels: role === 'warden' ? assignedHostels : [] };
        const res = await fetch('http://localhost:4000/api/users/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userData)
        });
        const response = await res.json();
        if (!response.success) throw new Error(response.message || 'Failed to add user');
        showMessage(response.message || 'User added successfully!', 'green');
        clearForm();
        await loadUsers();
    } catch (error) {
        showMessage(error.message || 'Failed to add user', 'red');
    }
};

/**
 * Handles the deletion of a user.
 */
const deleteUser = async () => {
    if (!userToDelete) return;
    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`http://localhost:4000/api/users/${userToDelete.id || userToDelete._id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const response = await res.json();
        if (!response.success) throw new Error(response.message || 'Failed to delete user');
        showMessage(response.message || 'User deleted successfully!', 'green');
        hideDeleteModal();
        await loadUsers();
    } catch (error) {
        showMessage(error.message || 'Failed to delete user', 'red');
    }
};

/**
 * Shows the delete confirmation modal.
 * @param {object} user The user object to be deleted.
 */
const showDeleteModal = (user) => {
    userToDelete = user;
    if (deleteUserName) deleteUserName.textContent = user.username;
    if (deleteModal) deleteModal.style.display = 'flex';
};

/**
 * Hides the delete confirmation modal.
 */
const hideDeleteModal = () => {
    userToDelete = null;
    if (deleteModal) deleteModal.style.display = 'none';
};

/**
 * Clears the user form inputs.
 */
const clearForm = () => {
    usernameInput.value = '';
    emailInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'warden';
    assignedHostelsInput.value = '';
    if (assignedHostelsSelect) {
        assignedHostelsSelect.selectedIndex = -1; // Clear all selections
    }
};

/**
 * Load hostels and populate the dropdown
 */
const loadHostels = async () => {
    try {
        const response = await ApiHelper.get('/hostels');
        allHostels = response.data;
        populateHostelDropdown();
        
        // Listen for hostel updates from other components
        window.addEventListener('hostelsUpdated', (event) => {
            allHostels = event.detail;
            populateHostelDropdown();
        });
    } catch (error) {
        console.error("Error loading hostels:", error);
    }
};

/**
 * Populate hostel dropdown with available hostels
 */
const populateHostelDropdown = () => {
    if (assignedHostelsSelect) {
        assignedHostelsSelect.innerHTML = '';
        allHostels.forEach(hostel => {
            const option = document.createElement('option');
            option.value = hostel.name;
            option.textContent = hostel.name;
            assignedHostelsSelect.appendChild(option);
        });
    }
};

/**
 * Load users from API
 */
const loadUsers = async () => {
    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch('http://localhost:4000/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const response = await res.json();
        if (!response.success) throw new Error(response.message || 'Failed to load users');
        allUsers = response.data;
        renderUsers(allUsers);
    } catch (error) { 
        console.error('Failed to load users', error); 
        showMessage('Failed to load users', 'red');
    }
};

// --- Authentication and Data Loading ---

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem('token');
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    if (welcomeMessage) {
        welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;
    }

    // If Warden, block the page UI and show message; keep navigation working
    if (user.role === 'Warden') {
        const main = document.querySelector('main.main-content');
        if (main) {
            main.innerHTML = `
                <section class="user-list-section">
                    <h2>Users</h2>
                    <div class="no-data">You are logged in as Warden.</div>
                </section>
            `;
        }
        // Also remove Users link to avoid confusion
        document.querySelector('a[href="users.html"]')?.closest('li')?.remove();
        return; // Do not load user management for wardens
    }

    // Load hostels and users
    await loadHostels();
    await loadUsers();
    // Wire the modal close (X) button
    if (closeDeleteModalBtn) closeDeleteModalBtn.addEventListener('click', hideDeleteModal);
});

// --- Event Listeners ---

addUserBtn.addEventListener('click', async () => {
    if (isEditMode) {
        await updateUser();
    } else {
        await addUser();
    }
});
if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', deleteUser);
if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', hideDeleteModal);

logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});

// Search functionality
searchBar.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredUsers = allUsers.filter(user => {
        const assignedHostels = user.assignedHostels ? user.assignedHostels.join(', ') : '';
        return user.username.toLowerCase().includes(searchTerm) ||
               user.email.toLowerCase().includes(searchTerm) ||
               user.role.toLowerCase().includes(searchTerm) ||
               assignedHostels.toLowerCase().includes(searchTerm);
    });
    renderUsers(filteredUsers);
});

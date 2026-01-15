import ApiHelper from './apiHelper.js';

// DOM elements
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');
const hostelCardsContainer = document.getElementById('hostelCardsContainer');
const hostelForm = document.getElementById('hostelForm');
const hostelNameInput = document.getElementById('hostelName');
const wardenInput = document.getElementById('wardenInput');
const hostelCapacityInput = document.getElementById('hostelCapacity');
const hostelImageInput = document.getElementById('hostelImage');
const numberOfRoomsInput = document.getElementById('numberOfRooms');
const capacityPerRoomInput = document.getElementById('capacityPerRoom');
const blocksContainer = document.getElementById('blocksContainer');
const addBlockBtn = document.getElementById('addBlockBtn');
const addHostelBtn = document.getElementById('addHostelBtn');
const updateHostelBtn = document.getElementById('updateHostelBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const hostelMessage = document.getElementById('hostelMessage');
const numberOfBlocksInput = document.getElementById('numberOfBlocks');

// Modal elements
const deleteModal = document.getElementById('deleteModal');
const deleteHostelName = document.getElementById('deleteHostelName');
const deleteReason = document.getElementById('deleteReason');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const deleterName = document.getElementById('deleterName');
const deleterRole = document.getElementById('deleterRole');
const deleteModalMessage = document.getElementById('deleteModalMessage');

// Global state
let allHostels = [];
let currentEditingHostelId = null;
let currentUser = null;

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

    // Apply Warden view restrictions before loading content
    applyWardenRestrictionsEarly();

    // Initialize the page
    await initializePage();
    setupEventListeners();

    // After content renders, finalize Warden UI restrictions (e.g., remove edit/delete buttons)
    applyWardenRestrictionsLate();
});

// Initialize the page
const initializePage = async () => {
    try {
        await loadHostels();
        await logActivity('PAGE_ACCESS', 'Accessed hostels management page');
    } catch (error) {
        console.error('Error initializing page:', error);
        showMessage('Failed to initialize page', 'error');
    }
};

// Setup event listeners
const setupEventListeners = () => {
    // Form submission
    if (hostelForm) {
        hostelForm.addEventListener('submit', handleHostelSubmit);
    }
    
    // Buttons
    if (updateHostelBtn) updateHostelBtn.addEventListener('click', handleUpdateHostel);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', handleDeleteHostel);
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    if (addBlockBtn) addBlockBtn.addEventListener('click', addBlockRow);
    
    // Modal close
    if (deleteModal) {
        const closeBtn = deleteModal.querySelector('.close-button');
        if (closeBtn) closeBtn.addEventListener('click', hideDeleteModal);
    }
    
    // Logout
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            sessionStorage.removeItem('user');
            sessionStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }
    // No students PDF link in hostels page per requirement
};

// Handle hostel form submission (add or update)
const handleHostelSubmit = async (e) => {
    e.preventDefault();
    
    if (currentEditingHostelId) {
        await handleUpdateHostel();
    } else {
        await handleAddHostel();
    }
};

// Handle adding a new hostel
const handleAddHostel = async () => {
    const hostelData = getFormData();

    const validation = validateHostelData(hostelData);
    if (!validation.valid) {
        showMessage(validation.message, 'error');
        return;
    }
    
    try {
        // Prepare image if provided (convert File to base64 data URL)
        let imageBase64;
        if (hostelData.imageFile) {
            imageBase64 = await imageFileToBase64(hostelData.imageFile);
        }

        // Auto-generate blocks A.. if advanced blocks are not provided
        let blocksToSend = Array.isArray(hostelData.blocks) ? hostelData.blocks : [];
        if ((!blocksToSend || blocksToSend.length === 0) && hostelData.numberOfBlocks && hostelData.numberOfRooms) {
            const blockCount = Math.max(0, hostelData.numberOfBlocks);
            const totalRooms = Math.max(0, hostelData.numberOfRooms);
            const roomsPerBlock = Math.floor(totalRooms / blockCount);
            const remainingRooms = totalRooms % blockCount;
            
            blocksToSend = Array.from({ length: blockCount }).map((_, idx) => ({
                name: String.fromCharCode('A'.charCodeAt(0) + idx),
                numRooms: roomsPerBlock + (idx < remainingRooms ? 1 : 0)
            }));
        }

        const response = await ApiHelper.post('/hostels', {
            name: hostelData.name,
            warden: hostelData.warden,
            capacity: hostelData.capacity,
            numberOfRooms: hostelData.numberOfRooms,
            totalRooms: hostelData.numberOfRooms,
            capacityPerRoom: hostelData.capacityPerRoom,
            blocks: blocksToSend,
            imageUrl: imageBase64 || undefined,
            username: currentUser.username
        });
        
        if (response.success) {
            showMessage(response.message, 'success');
            clearForm();
            await loadHostels();
            await logActivity('ADD_HOSTEL', `Added new hostel: ${hostelData.name}`);
        }
    } catch (error) {
        showMessage(error.message || 'Failed to add hostel', 'error');
    }
};

// Handle updating an existing hostel
const handleUpdateHostel = async () => {
    if (!currentEditingHostelId) return;
    
    const hostelData = getFormData();
    
    const validation = validateHostelData(hostelData);
    if (!validation.valid) {
        showMessage(validation.message, 'error');
        return;
    }
    
    try {
        // Only include imageUrl if a new file was selected
        const payload = pruneUndefined({
            name: hostelData.name,
            warden: hostelData.warden,
            capacity: hostelData.capacity,
            numberOfRooms: hostelData.numberOfRooms,
            totalRooms: hostelData.numberOfRooms,
            capacityPerRoom: hostelData.capacityPerRoom,
            username: currentUser.username
        });
        if (hostelData.imageFile) {
            payload.imageUrl = await imageFileToBase64(hostelData.imageFile);
        }
        // Auto-generate blocks if none provided via advanced UI but counts are present
        let blocksToSend = Array.isArray(hostelData.blocks) ? hostelData.blocks : [];
        if ((!blocksToSend || blocksToSend.length === 0) && hostelData.numberOfBlocks && hostelData.numberOfRooms) {
            const blockCount = Math.max(0, hostelData.numberOfBlocks);
            const totalRooms = Math.max(0, hostelData.numberOfRooms);
            const roomsPerBlock = Math.floor(totalRooms / blockCount);
            const remainingRooms = totalRooms % blockCount;
            
            blocksToSend = Array.from({ length: blockCount }).map((_, idx) => ({
                name: String.fromCharCode('A'.charCodeAt(0) + idx),
                numRooms: roomsPerBlock + (idx < remainingRooms ? 1 : 0)
            }));
        }
        if (blocksToSend && blocksToSend.length > 0) {
            payload.blocks = blocksToSend;
        }

        const response = await ApiHelper.put(`/hostels/${currentEditingHostelId}`, payload);
        
        if (response.success) {
            showMessage(response.message || 'Hostel details updated successfully!', 'success');
            clearForm();
            currentEditingHostelId = null;
            await loadHostels();
            // Notify other pages about the update
            notifyHostelUpdate();
            await logActivity('UPDATE_HOSTEL', `Updated hostel: ${hostelData.name}`);
        }
    } catch (error) {
        showMessage(error.message || 'Failed to update hostel', 'error');
    }
};

// Handle deleting a hostel
const handleDeleteHostel = async () => {
    if (!currentEditingHostelId) return;
    
    const reason = deleteReason.value.trim();
    if (!reason) {
        showMessage('Please provide a reason for deletion', 'error');
        return;
    }
    
    try {
        const response = await ApiHelper.delete(`/hostels/${currentEditingHostelId}?username=${encodeURIComponent(currentUser.username)}`);
        
        showMessage(response.message || 'Hostel deleted successfully!', 'success');
        hideDeleteModal();
        clearForm();
        currentEditingHostelId = null;
        await loadHostels();
        await logActivity('DELETE_HOSTEL', `Deleted hostel: ${deleteHostelName.value}`, { reason });
    } catch (error) {
        showMessage(error.message || 'Failed to delete hostel', 'error');
    }
};

// Load hostels from API
const loadHostels = async () => {
    try {
        const response = await ApiHelper.get('/hostels?includeStats=true');
        allHostels = response.data;
        renderHostelCards(allHostels);
        
        // Notify other components about hostel updates
        notifyHostelUpdate();
    } catch (error) {
        console.error('Error loading hostels:', error);
        // Fallback for wardens: render only their assigned hostel(s)
        try {
            const user = currentUser || JSON.parse(sessionStorage.getItem('user') || 'null');
            if (user && (user.role === 'Warden' || user.role === 'warden')) {
                const names = Array.isArray(user.assignedHostels) && user.assignedHostels.length > 0
                    ? user.assignedHostels
                    : (user.hostelName ? [user.hostelName] : []);
                allHostels = names.map(name => ({ name }));
                renderHostelCards(allHostels);
                return;
            }
        } catch (_) { /* ignore */ }
        showMessage('Failed to load hostels', 'error');
    }
};

// Render hostel cards
const renderHostelCards = (hostels) => {
    if (!hostelCardsContainer) return;

    hostelCardsContainer.innerHTML = '';
    
    if (hostels.length === 0) {
        hostelCardsContainer.innerHTML = '<p class="no-data">No hostels found. Add your first hostel!</p>';
        return;
    }
    
    hostels.forEach(hostel => {
        const totalRooms = hostel.numberOfRooms ?? hostel.totalRooms ?? hostel?.stats?.totalRooms ?? null;
        const totalCapacity = hostel.totalCapacity
            ?? hostel.capacity
            ?? (hostel.capacityPerRoom && typeof totalRooms === 'number'
                ? hostel.capacityPerRoom * totalRooms
                : (hostel.stats?.totalCapacity ?? null));
        const occupiedSlots = hostel.stats?.occupiedSlots ?? hostel.occupied ?? null;
        const emptySlots = hostel.stats?.emptySlots
            ?? (typeof totalCapacity === 'number' && typeof occupiedSlots === 'number'
                ? Math.max(totalCapacity - occupiedSlots, 0)
                : hostel.stats?.emptySlots ?? null);

        const card = document.createElement('div');
        card.className = 'hostel-card card';
        card.innerHTML = `
            <img src="${hostel.imageUrl || 'https://placehold.co/400x250/e0e0e0/333333?text=No+Image'}" 
                 alt="${hostel.name}" 
                 onerror="this.src='https://placehold.co/400x250/e0e0e0/333333?text=No+Image'">
            <div class="card-info">
                <h3 class="card-title">${hostel.name}</h3>
                <p><strong>Warden:</strong> ${hostel.warden || 'Not Assigned'}</p>
                ${
                    totalRooms !== null || totalCapacity !== null || occupiedSlots !== null
                        ? `
                  <p><strong>Total Rooms:</strong> ${totalRooms ?? '-'}</p>
                  <p><strong>Total Capacity:</strong> ${totalCapacity ?? '-'}</p>
                  <p><strong>Occupied:</strong> ${occupiedSlots ?? 0}</p>
                  <p><strong>Empty:</strong> ${emptySlots ?? 0}</p>`
                        : (hostel.capacity ? `<p><strong>Capacity:</strong> ${hostel.capacity} students</p>` : '')
                }
                <div class="card-actions">
                    <button class="action-button edit-button" data-id="${hostel._id || hostel.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <a class="action-button" href="HostelDetails.html?id=${encodeURIComponent(hostel.name)}">Details</a>
                    <button class="action-button delete-button" data-id="${hostel._id || hostel.id}">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        `;
        hostelCardsContainer.appendChild(card);
    });

    // Add event listeners for edit and delete buttons
    addCardEventListeners();

    // Enforce Warden removal of actions after render
    applyWardenRestrictionsLate();
};

// Add event listeners to hostel cards
const addCardEventListeners = () => {
    // Edit buttons
    document.querySelectorAll('.edit-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const hostelId = e.target.closest('.edit-button').dataset.id;
            const hostel = allHostels.find(h => (h._id || h.id) === hostelId);
            if (hostel) {
                startEditHostel(hostel);
            }
        });
    });

    // Delete buttons
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const hostelId = e.target.closest('.delete-button').dataset.id;
            const hostel = allHostels.find(h => (h._id || h.id) === hostelId);
            if (hostel) {
                showDeleteModal(hostel);
            }
        });
    });
};

// Start editing a hostel
const startEditHostel = (hostel) => {
    currentEditingHostelId = hostel._id || hostel.id;
    
    // Populate form
    if (hostelNameInput) hostelNameInput.value = hostel.name || '';
    if (wardenInput) wardenInput.value = hostel.warden || '';
    if (hostelCapacityInput) hostelCapacityInput.value = hostel.capacity || '';
    if (numberOfRoomsInput) numberOfRoomsInput.value = hostel.numberOfRooms || hostel.totalRooms || '';
    if (capacityPerRoomInput) capacityPerRoomInput.value = hostel.capacityPerRoom || '';
    renderBlocks(hostel.blocks || []);
    // File input cannot be pre-filled for security reasons
    if (hostelImageInput) hostelImageInput.value = '';
    
    // Show update buttons
    if (addHostelBtn) addHostelBtn.style.display = 'none';
    if (updateHostelBtn) updateHostelBtn.style.display = 'inline-block';
    if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
    
    showMessage('Editing hostel. Make changes and click Update Hostel.', 'info');
};

// Cancel editing
const cancelEdit = () => {
    currentEditingHostelId = null;
    clearForm();
    
    // Show add button
    if (addHostelBtn) addHostelBtn.style.display = 'inline-block';
    if (updateHostelBtn) updateHostelBtn.style.display = 'none';
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    
    showMessage('Edit cancelled', 'info');
};

// Show delete confirmation modal
const showDeleteModal = (hostel) => {
    currentEditingHostelId = hostel._id || hostel.id;
    
    if (deleteHostelName) deleteHostelName.value = hostel.name;
    if (deleterName) deleterName.textContent = currentUser.username;
    if (deleterRole) deleterRole.textContent = currentUser.role;
    
    if (deleteModal) deleteModal.style.display = 'flex';
    if (deleteReason) deleteReason.value = '';
    if (deleteModalMessage) deleteModalMessage.textContent = '';
};

// Hide delete modal
const hideDeleteModal = () => {
    currentEditingHostelId = null;
    if (deleteModal) deleteModal.style.display = 'none';
    if (deleteReason) deleteReason.value = '';
    if (deleteModalMessage) deleteModalMessage.textContent = '';
};

// Get form data
const getFormData = () => {
    const blocks = collectBlocks();
    return {
        name: hostelNameInput?.value?.trim() || '',
        warden: wardenInput?.value?.trim() || '',
        capacity: hostelCapacityInput?.value?.trim() !== '' ? parseInt(hostelCapacityInput.value, 10) : undefined,
        numberOfRooms: numberOfRoomsInput?.value?.trim() !== '' ? parseInt(numberOfRoomsInput.value, 10) : undefined,
        capacityPerRoom: capacityPerRoomInput?.value?.trim() !== '' ? parseInt(capacityPerRoomInput.value, 10) : undefined,
        numberOfBlocks: numberOfBlocksInput?.value?.trim() !== '' ? parseInt(numberOfBlocksInput.value, 10) : undefined,
        blocks,
        imageFile: hostelImageInput && hostelImageInput.files && hostelImageInput.files.length > 0 ? hostelImageInput.files[0] : null
    };
};

// Clear form
const clearForm = () => {
    if (hostelNameInput) hostelNameInput.value = '';
    if (wardenInput) wardenInput.value = '';
    if (hostelCapacityInput) hostelCapacityInput.value = '';
    if (numberOfRoomsInput) numberOfRoomsInput.value = '';
    if (capacityPerRoomInput) capacityPerRoomInput.value = '';
    if (hostelImageInput) hostelImageInput.value = '';
    renderBlocks([]);
};

// Convert an image File to a base64 data URL string
const imageFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Show message
const showMessage = (message, type = 'info') => {
    if (hostelMessage) {
        hostelMessage.textContent = message;
        hostelMessage.className = `message ${type}`;
        
        // Auto-clear after 5 seconds
        setTimeout(() => {
            if (hostelMessage) {
                hostelMessage.textContent = '';
                hostelMessage.className = 'message';
            }
        }, 5000);
    }
};

// Notify other components about hostel updates
const notifyHostelUpdate = () => {
    try {
        const timestamp = String(Date.now());
        localStorage.setItem('hostels:updated', timestamp);
        // Dispatch custom event for same-window listeners
        window.dispatchEvent(new CustomEvent('hostelsUpdated', { detail: allHostels }));
        // Note: Storage events are automatically fired for other tabs/windows when localStorage changes
        // Same-tab updates are handled by the polling mechanism in hostelDetails.js
    } catch (e) {
        // Ignore localStorage errors
    }
};

// Log activity
const logActivity = async (action, description, additionalData = {}) => {
    try {
        await ApiHelper.post('/logs', {
            action,
            description,
            username: currentUser.username,
            role: currentUser.role,
            entityType: 'Hostel',
            ...additionalData
        });
    } catch (error) {
        console.error('Error logging activity:', error);
    }
};

// --- Warden UI restrictions (non-breaking, additive) ---
function applyWardenRestrictionsEarly() {
    if (!currentUser || currentUser.role !== 'Warden') return;

    // Replace manage section with info text and hide form inputs/buttons
    const manageSection = document.getElementById('hostelFormSection');
    if (manageSection) {
        manageSection.innerHTML = `
            <h2>Hostels</h2>
            <div class="no-data" style="margin-top:10px;">
              You are logged in as Warden. Hostel add, update, and delete are disabled for your role.
            </div>
        `;
    }
}

function applyWardenRestrictionsLate() {
    if (!currentUser || currentUser.role !== 'Warden') return;

    // Remove edit/delete buttons in cards
    document.querySelectorAll('.edit-button, .delete-button').forEach(btn => btn.remove());
}

// ---- Blocks UI helpers ----
function renderBlocks(blocks) {
    if (!blocksContainer) return;
    blocksContainer.innerHTML = '';
    (blocks && blocks.length ? blocks : []).forEach(b => addBlockRow(b.name, b.numRooms));
}

function addBlockRow(name = '', numRooms = '') {
    if (!blocksContainer) return;
    const row = document.createElement('div');
    row.className = 'block-row';
    row.innerHTML = `
      <input type="text" class="block-name" placeholder="Block Name (e.g., A, B)" value="${name || ''}">
      <input type="number" class="block-rooms" placeholder="Rooms in Block" value="${numRooms || ''}">
      <button type="button" class="remove-block">Remove</button>
    `;
    const removeBtn = row.querySelector('.remove-block');
    if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
    blocksContainer.appendChild(row);
}

function collectBlocks() {
    if (!blocksContainer) return [];
    const rows = Array.from(blocksContainer.querySelectorAll('.block-row'));
    return rows.map(r => {
        const name = r.querySelector('.block-name')?.value?.trim();
        const numRoomsRaw = r.querySelector('.block-rooms')?.value;
        const numRooms = numRoomsRaw && String(numRoomsRaw).trim() !== '' ? parseInt(numRoomsRaw, 10) : 0;
        return name && numRooms > 0 ? { name, numRooms } : null;
    }).filter(Boolean);
}

// Validate and sanitize hostel data prior to submit/update
function validateHostelData(data) {
    // Required fields
    if (!data.name) return { valid: false, message: 'Hostel name is required' };
    if (!data.warden) return { valid: false, message: 'Warden name is required' };
    if (data.numberOfRooms === undefined || Number.isNaN(data.numberOfRooms) || data.numberOfRooms <= 0) {
        return { valid: false, message: 'Number of Rooms is required and must be a positive number' };
    }

    // Optional numerics: if NaN or empty, drop them
    ['capacity', 'capacityPerRoom', 'numberOfBlocks'].forEach((key) => {
        if (data[key] === undefined || data[key] === null || Number.isNaN(data[key])) {
            delete data[key];
        }
    });

    // Blocks are optional; ensure structure is correct
    if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
        // keep as empty array to allow auto-generation when counts provided
        data.blocks = [];
    }

    // Image: only include when a real File object exists
    if (!(data.imageFile instanceof File)) {
        data.imageFile = null;
    }

    return { valid: true };
}

// Remove keys with undefined values so back-end validators don't choke
function pruneUndefined(obj) {
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
        if (obj[k] !== undefined) out[k] = obj[k];
    });
    return out;
}

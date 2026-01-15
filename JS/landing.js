import ApiHelper from './apiHelper.js';

document.addEventListener('DOMContentLoaded', () => {
    const hostelGrid = document.querySelector('.hostel-grid');
    const mainSearchBar = document.getElementById('mainSearchBar');
    const clearSearchBarBtn = document.getElementById('clearSearchBar');
    const searchButton = document.querySelector('.search-button');

    const renderHostels = (hostels) => {
        if (!hostelGrid) return;
        hostelGrid.innerHTML = '';
        hostels.forEach(h => {
            const card = document.createElement('div');
            card.className = 'hostel-card';
            card.dataset.hostel = h.name;
            card.innerHTML = `
                <img src="${h.imageUrl || '../images.1/h1.jpg'}" alt="${h.name} Hostel" onerror="this.onerror=null;this.src='https://placehold.co/400x250/e0e0e0/333333?text=${encodeURIComponent(h.name)}+Hostel';">
                <h3>${h.name} Hostel</h3>
            `;
            hostelGrid.appendChild(card);
        });
    };

    const fetchHostels = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const endpoint = token ? '/hostels' : '/hostels/public';
            const response = await ApiHelper.get(endpoint);
            renderHostels(response.data);
        } catch (error) {
            console.error('Failed to load hostels', error);
        }
    };

    fetchHostels();
    
    // Listen for hostel updates from other components
    window.addEventListener('hostelsUpdated', (event) => {
        renderHostels(event.detail);
    });
    
    // Also listen for storage changes for backward compatibility
    window.addEventListener('storage', (e) => {
        if (e.key === 'hostels:updated') fetchHostels();
    });

    // Poll for updates every 30 seconds as a fallback
    setInterval(fetchHostels, 30000);

    const performSearch = () => {
        const term = (mainSearchBar?.value || '').toLowerCase();
        document.querySelectorAll('.hostel-card').forEach(card => {
            const name = (card.dataset.hostel || '').toLowerCase();
            card.style.display = !term || name.includes(term) ? '' : 'none';
        });
    };

    if (mainSearchBar && clearSearchBarBtn && searchButton) {
        mainSearchBar.addEventListener('input', () => {
            clearSearchBarBtn.style.visibility = mainSearchBar.value.length > 0 ? 'visible' : 'hidden';
        });
        clearSearchBarBtn.addEventListener('click', () => {
            mainSearchBar.value = '';
            clearSearchBarBtn.style.visibility = 'hidden';
            performSearch();
        });
        searchButton.addEventListener('click', performSearch);
        mainSearchBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    }
});

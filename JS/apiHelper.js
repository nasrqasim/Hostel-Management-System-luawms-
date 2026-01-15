// Unified API helper for consistent error handling and response format
const API_BASE = (localStorage.getItem('API_BASE') || 'http://localhost:4000/api').replace(/\/$/, '');

class ApiHelper {
  static async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(sessionStorage.getItem('token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` } : {}),
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  static async get(endpoint) {
    const separator = endpoint.includes('?') ? '&' : '?';
    return this.request(`${endpoint}${separator}_t=${Date.now()}`, { method: 'GET' });
  }

  static async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  static async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  static async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Show user-friendly messages
  static showMessage(element, message, type = 'info') {
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;

    // Color coding
    const colors = {
      success: 'green',
      error: 'red',
      warning: 'orange',
      info: 'blue'
    };

    element.style.color = colors[type] || colors.info;

    // Auto-clear after 5 seconds
    setTimeout(() => {
      element.textContent = '';
      element.className = 'message';
    }, 5000);
  }
}

// Export for use in other modules
window.ApiHelper = ApiHelper;
export default ApiHelper;

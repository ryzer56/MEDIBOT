// ============================================
// frontend-api-client.js - Frontend Integration
// ============================================
class HealthVueAPI {
    constructor(baseURL = 'http://localhost:5000/api') {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('token');
    }
    
    setToken(token) {
        this.token = token;
        if (token) localStorage.setItem('token', token);
        else localStorage.removeItem('token');
    }
    
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }
        
        return response.json();
    }
    
    // Auth
    async register(userData) {
        const result = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        if (result.token) this.setToken(result.token);
        return result;
    }
    
    async login(credentials) {
        const result = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        if (result.token) this.setToken(result.token);
        return result;
    }
    
    // Health Data
    async addHealthData(data) {
        return this.request('/health-data', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    async getHealthData(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/health-data${query ? `?${query}` : ''}`);
    }
    
    async getHealthTrends() {
        return this.request('/health-data/trends');
    }
    
    async getRecommendations() {
        return this.request('/health-data/recommendations');
    }
    
    // Family
    async addFamilyMember(memberData) {
        return this.request('/family/add', {
            method: 'POST',
            body: JSON.stringify(memberData)
        });
    }
    
    async getFamily() {
        return this.request('/family');
    }
    
    async getFamilyMemberData(memberId) {
        return this.request(`/family/${memberId}/data`);
    }
    
    // Appointments
    async bookAppointment(appointmentData) {
        return this.request('/appointments', {
            method: 'POST',
            body: JSON.stringify(appointmentData)
        });
    }
    
    async getAppointments() {
        return this.request('/appointments');
    }
    
    // Reports
    async uploadReport(formData) {
        const response = await fetch(`${this.baseURL}/reports/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });
        return response.json();
    }
    
    async getReports() {
        return this.request('/reports');
    }
    
    // Alerts
    async getAlerts(unreadOnly = false) {
        return this.request(`/alerts${unreadOnly ? '?unread=true' : ''}`);
    }
    
    async markAlertRead(alertId) {
        return this.request(`/alerts/${alertId}/read`, {
            method: 'PUT'
        });
    }
    
    // Chat
    async sendChatMessage(message) {
        return this.request('/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    }
    
    // Profile
    async getProfile() {
        return this.request('/profile');
    }
    
    async updateProfile(data) {
        return this.request('/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    // Dashboard
    async getDashboardStats() {
        return this.request('/dashboard/stats');
    }
    
    // WebSocket Connection
    connectWebSocket() {
        const userId = this.getUserIdFromToken();
        if (!userId) return null;
        
        const ws = new WebSocket(`ws://localhost:5000?userId=${userId}`);
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.onWebSocketMessage?.(data);
        };
        
        return ws;
    }
    
    getUserIdFromToken() {
        if (!this.token) return null;
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            return payload.id;
        } catch {
            return null;
        }
    }
}

// Export for use in frontend
window.HealthVueAPI = HealthVueAPI;
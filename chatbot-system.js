// ============================================
// chatbot-system.js - Advanced Chatbot Engine
// ============================================

class HealthVueChatBot {
    constructor() {
        this.apiClient = new HealthVueAPI();
        this.chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
        this.isOpen = false;
        this.isLoading = false;
        this.init();
    }

    // Initialize chatbot
    init() {
        this.setupEventListeners();
        this.loadChatHistory();
    }

    setupEventListeners() {
        const chatbotWidget = document.getElementById('chatbotWidget');
        const closeChat = document.getElementById('closeChat');
        const chatInput = document.getElementById('chatInput');
        const sendMessage = document.getElementById('sendMessage');
        const chatWindow = document.getElementById('chatWindow');

        if (chatbotWidget) {
            chatbotWidget.addEventListener('click', () => this.toggleChat());
        }

        if (closeChat) {
            closeChat.addEventListener('click', () => this.closeChat());
        }

        if (sendMessage) {
            sendMessage.addEventListener('click', () => this.handleSendMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSendMessage();
            });
        }

        // Quick action buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-action-btn')) {
                this.handleQuickAction(e.target.dataset.action);
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen && !chatWindow?.contains(e.target) && !chatbotWidget?.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        const chatWindow = document.getElementById('chatWindow');
        if (chatWindow) {
            chatWindow.classList.add('open');
            this.isOpen = true;
            document.getElementById('chatInput')?.focus();
            
            // Show quick actions on first open
            if (this.chatHistory.length === 0) {
                this.showQuickActions();
            }
        }
    }

    closeChat() {
        const chatWindow = document.getElementById('chatWindow');
        if (chatWindow) {
            chatWindow.classList.remove('open');
            this.isOpen = false;
        }
    }

    handleSendMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput?.value.trim();

        if (!message) return;

        // Add user message to chat
        this.addMessage(message, 'user');
        chatInput.value = '';

        // Show typing indicator
        this.showTypingIndicator();

        // Process message
        this.processMessage(message);
    }

    handleQuickAction(action) {
        const actions = {
            'add_health': 'I want to add my health data. Can you guide me?',
            'check_health': "What's my current health status?",
            'get_tips': 'Can you give me some health tips?',
            'find_doctor': 'How can I find a doctor?',
            'track_sleep': 'Help me track my sleep'
        };

        if (actions[action]) {
            const message = actions[action];
            this.addMessage(message, 'user');
            this.showTypingIndicator();
            this.processMessage(message);
        }
    }

    addMessage(text, sender) {
        const chatMessages = document.getElementById('chatMessages');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${sender}`;
        messageEl.innerHTML = this.sanitizeHTML(text);
        
        if (chatMessages) {
            chatMessages.appendChild(messageEl);
            // Auto-scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // Save to history
        const timestamp = new Date().toISOString();
        this.chatHistory.push({ text, sender, timestamp });
        localStorage.setItem('chatHistory', JSON.stringify(this.chatHistory));
    }

    showTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        const typingEl = document.createElement('div');
        typingEl.className = 'message bot typing-indicator';
        typingEl.id = 'typingIndicator';
        typingEl.innerHTML = '<span></span><span></span><span></span>';
        
        if (chatMessages) {
            chatMessages.appendChild(typingEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        this.isLoading = true;
    }

    removeTypingIndicator() {
        const typingEl = document.getElementById('typingIndicator');
        if (typingEl) {
            typingEl.remove();
        }
        this.isLoading = false;
    }

    async processMessage(userMessage) {
        try {
            // Generate AI response
            const response = await this.generateResponse(userMessage);
            
            // Remove typing indicator
            this.removeTypingIndicator();
            
            // Add bot response
            this.addMessage(response, 'bot');
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
    }

    async generateResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();

        // Health tracking responses
        if (lowerMessage.includes('add') && (lowerMessage.includes('health') || lowerMessage.includes('data'))) {
            return `📊 Great! I can help you track your health data. You can:\n\n` +
                   `• Record Heart Rate (normal: 60-100 bpm)\n` +
                   `• Track Blood Pressure (normal: 120/80)\n` +
                   `• Monitor Blood Sugar (normal: 70-140 mg/dL)\n` +
                   `• Log Sleep Hours (recommended: 7-8 hours)\n` +
                   `• Count Daily Steps (goal: 10,000)\n\n` +
                   `Would you like to add data now? Use the Health Data section in the dashboard.`;
        }

        if (lowerMessage.includes('health') && lowerMessage.includes('status')) {
            const healthData = JSON.parse(localStorage.getItem('healthData')) || [];
            if (healthData.length > 0) {
                const latest = healthData[healthData.length - 1];
                return `💚 Your Latest Health Metrics:\n\n` +
                       `Type: ${latest.type.replace('_', ' ')}\n` +
                       `Value: ${latest.value}\n` +
                       `Status: ${latest.anomaly ? '⚠️ Alert' : '✅ Normal'}\n\n` +
                       `Keep monitoring regularly for better insights!`;
            }
            return `📈 I don't have any health data yet. Start by adding some metrics to your dashboard!`;
        }

        if (lowerMessage.includes('tip') || lowerMessage.includes('recommend') || lowerMessage.includes('suggest')) {
            const tips = [
                '💧 Drink at least 8 glasses of water daily',
                '🏃 Aim for 10,000 steps or 30 minutes of exercise',
                '😴 Maintain a consistent sleep schedule',
                '🥗 Eat a balanced diet rich in fruits and vegetables',
                '🧘 Practice stress management with meditation',
                '📱 Limit screen time before bed',
                '❤️ Monitor your heart rate regularly'
            ];
            const randomTip = tips[Math.floor(Math.random() * tips.length)];
            return `✨ Health Tip for Today:\n\n${randomTip}\n\nConsistent healthy habits lead to better health outcomes!`;
        }

        if (lowerMessage.includes('doctor') || lowerMessage.includes('appointment')) {
            return `🏥 Finding Healthcare Providers:\n\n` +
                   `1. Search for specialists in your area\n` +
                   `2. Check their availability in the Appointments section\n` +
                   `3. Book a consultation\n` +
                   `4. Prepare your medical history\n` +
                   `5. Bring relevant health reports\n\n` +
                   `Would you like to book an appointment?`;
        }

        if (lowerMessage.includes('sleep') || lowerMessage.includes('rest')) {
            return `😴 Sleep Tracking Guide:\n\n` +
                   `Recommended sleep: 7-9 hours per night\n\n` +
                   `Tips for better sleep:\n` +
                   `• Go to bed at the same time daily\n` +
                   `• Create a dark, cool, quiet environment\n` +
                   `• Avoid caffeine 6 hours before bed\n` +
                   `• Exercise regularly\n` +
                   `• Limit screen time before sleep\n\n` +
                   `Log your sleep hours to track patterns!`;
        }

        if (lowerMessage.includes('heart') || lowerMessage.includes('pulse') || lowerMessage.includes('bpm')) {
            return `❤️ Heart Rate Information:\n\n` +
                   `Normal Resting Heart Rate: 60-100 bpm\n\n` +
                   `Factors affecting heart rate:\n` +
                   `• Physical activity\n` +
                   `• Stress and anxiety\n` +
                   `• Temperature\n` +
                   `• Medications\n` +
                   `• Caffeine intake\n\n` +
                   `If your heart rate is consistently high, consult a doctor.`;
        }

        if (lowerMessage.includes('blood pressure') || lowerMessage.includes('bp')) {
            return `📊 Blood Pressure Guide:\n\n` +
                   `Normal: Less than 120/80 mmHg\n` +
                   `Elevated: 120-129/<80 mmHg\n` +
                   `High BP Stage 1: 130-139/80-89 mmHg\n` +
                   `High BP Stage 2: 140+ or 90+ mmHg\n\n` +
                   `If consistently high, please see a healthcare provider.`;
        }

        if (lowerMessage.includes('family') || lowerMessage.includes('share')) {
            return `👨‍👩‍👧‍👦 Family Sharing Features:\n\n` +
                   `Add family members to:\n` +
                   `• Share health updates\n` +
                   `• Get support and accountability\n` +
                   `• Monitor loved ones' wellness\n` +
                   `• Set group health goals\n\n` +
                   `Use the Family Circle section to add members!`;
        }

        if (lowerMessage.includes('help') || lowerMessage.includes('feature') || lowerMessage.includes('what can')) {
            return `🤖 I'm your AI Health Assistant. I can help you with:\n\n` +
                   `✓ Track health metrics\n` +
                   `✓ Get personalized recommendations\n` +
                   `✓ Understand health data\n` +
                   `✓ Schedule appointments\n` +
                   `✓ Manage family health\n` +
                   `✓ Answer health questions\n\n` +
                   `What would you like to do?`;
        }

        // Default response
        return `👋 I'm HealthVue AI, your personal health assistant!\n\n` +
               `I can help you:\n` +
               `• Track your health metrics\n` +
               `• Get personalized health tips\n` +
               `• Schedule doctor appointments\n` +
               `• Manage your family's health\n\n` +
               `What would you like to know?`;
    }

    showQuickActions() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'quick-actions';
        actionsEl.innerHTML = `
            <div style="padding: 10px 0; font-size: 12px; color: #718096;">Quick Actions:</div>
            <button class="quick-action-btn" data-action="add_health">➕ Add Health Data</button>
            <button class="quick-action-btn" data-action="check_health">📊 Check Status</button>
            <button class="quick-action-btn" data-action="get_tips">💡 Get Tips</button>
            <button class="quick-action-btn" data-action="find_doctor">🏥 Find Doctor</button>
        `;
        chatMessages.appendChild(actionsEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    loadChatHistory() {
        const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
        const chatMessages = document.getElementById('chatMessages');
        
        if (chatMessages && chatHistory.length > 0) {
            // Clear default message
            chatMessages.innerHTML = '';
            
            // Load history
            chatHistory.forEach(msg => {
                const messageEl = document.createElement('div');
                messageEl.className = `message ${msg.sender}`;
                messageEl.innerHTML = this.sanitizeHTML(msg.text);
                chatMessages.appendChild(messageEl);
            });
        }
    }

    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearHistory() {
        this.chatHistory = [];
        localStorage.removeItem('chatHistory');
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '<div class="message bot">Hello! I\'m your AI health assistant. How can I help you today?</div>';
        }
    }
}

// Initialize chatbot when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.chatBot = new HealthVueChatBot();
    });
} else {
    window.chatBot = new HealthVueChatBot();
}

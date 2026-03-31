// ============================================
// BACKEND: server.js - Main Application Entry
// ============================================

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const http = require('http');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'healthvue_super_secret_key_2024';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/healthvue';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================
// DATABASE MODELS
// ============================================

// User Model
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'doctor', 'admin'], default: 'user' },
    age: Number,
    gender: String,
    weight: Number,
    height: Number,
    emergencyContact: {
        name: String,
        phone: String,
        relationship: String
    },
    createdAt: { type: Date, default: Date.now }
});

// Health Data Model
const HealthDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['heart_rate', 'blood_pressure', 'blood_sugar', 'sleep', 'steps', 'weight', 'oxygen'], required: true },
    value: mongoose.Schema.Types.Mixed,
    systolic: Number,
    diastolic: Number,
    unit: String,
    timestamp: { type: Date, default: Date.now },
    source: { type: String, enum: ['manual', 'google_fit', 'apple_health', 'device'], default: 'manual' },
    anomaly: { type: Boolean, default: false },
    anomalyReason: String
});

// Family Member Model
const FamilySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    relationship: { type: String, enum: ['parent', 'child', 'spouse', 'sibling', 'other'], required: true },
    permissions: { type: [String], default: ['view_vitals', 'view_reports'] },
    createdAt: { type: Date, default: Date.now }
});

// Appointment Model
const AppointmentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doctorName: String,
    specialty: String,
    date: { type: Date, required: true },
    time: String,
    duration: { type: Number, default: 30 },
    type: { type: String, enum: ['in_person', 'video', 'phone'], default: 'in_person' },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    notes: String,
    createdAt: { type: Date, default: Date.now }
});

// Medical Report Model
const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    type: { type: String, enum: ['lab_report', 'prescription', 'imaging', 'discharge_summary', 'other'] },
    fileName: String,
    filePath: String,
    fileSize: Number,
    mimeType: String,
    uploadDate: { type: Date, default: Date.now },
    ocrData: mongoose.Schema.Types.Mixed,
    extractedData: {
        medications: [String],
        diagnoses: [String],
        labResults: mongoose.Schema.Types.Mixed
    }
});

// Alert/Notification Model
const AlertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['anomaly', 'reminder', 'appointment', 'risk_alert', 'recommendation'] },
    title: String,
    message: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: Date
});

// Chat History Model
const ChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: String,
    response: String,
    context: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const HealthData = mongoose.model('HealthData', HealthDataSchema);
const Family = mongoose.model('Family', FamilySchema);
const Appointment = mongoose.model('Appointment', AppointmentSchema);
const Report = mongoose.model('Report', ReportSchema);
const Alert = mongoose.model('Alert', AlertSchema);
const Chat = mongoose.model('Chat', ChatSchema);

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });
    
    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(user.id).select('-password');
        if (!req.user) return res.status(401).json({ error: 'User not found' });
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// ============================================
// AI ENGINE CLASS
// ============================================
class AIEngine {
    static detectAnomalies(healthRecord, userHistory) {
        let anomalies = [];
        
        // Heart Rate Analysis
        if (healthRecord.type === 'heart_rate') {
            const hr = parseFloat(healthRecord.value);
            if (hr > 100) anomalies.push({ type: 'heart_rate', reason: 'Elevated heart rate (>100 bpm)', severity: 'medium' });
            else if (hr < 60) anomalies.push({ type: 'heart_rate', reason: 'Low heart rate (<60 bpm)', severity: 'low' });
        }
        
        // Blood Pressure Analysis
        if (healthRecord.type === 'blood_pressure') {
            const systolic = healthRecord.systolic || parseFloat(healthRecord.value.toString().split('/')[0]);
            const diastolic = healthRecord.diastolic || parseFloat(healthRecord.value.toString().split('/')[1]);
            
            if (systolic >= 180 || diastolic >= 120) {
                anomalies.push({ type: 'blood_pressure', reason: 'Hypertensive Crisis - Seek immediate medical attention', severity: 'critical' });
            } else if (systolic >= 140 || diastolic >= 90) {
                anomalies.push({ type: 'blood_pressure', reason: 'High blood pressure detected', severity: 'high' });
            } else if (systolic >= 120 || diastolic >= 80) {
                anomalies.push({ type: 'blood_pressure', reason: 'Elevated blood pressure', severity: 'medium' });
            }
        }
        
        // Blood Sugar Analysis
        if (healthRecord.type === 'blood_sugar') {
            const sugar = parseFloat(healthRecord.value);
            if (sugar > 200) anomalies.push({ type: 'blood_sugar', reason: 'Very high blood sugar - Check immediately', severity: 'high' });
            else if (sugar > 140) anomalies.push({ type: 'blood_sugar', reason: 'High blood sugar detected', severity: 'medium' });
            else if (sugar < 70) anomalies.push({ type: 'blood_sugar', reason: 'Low blood sugar - Take action', severity: 'high' });
        }
        
        // Sleep Analysis
        if (healthRecord.type === 'sleep') {
            const sleep = parseFloat(healthRecord.value);
            if (sleep < 6) anomalies.push({ type: 'sleep', reason: 'Insufficient sleep (<6 hours)', severity: 'medium' });
            else if (sleep < 7) anomalies.push({ type: 'sleep', reason: 'Below optimal sleep', severity: 'low' });
        }
        
        return anomalies;
    }
    
    static async analyzeHealthTrends(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const data = await HealthData.find({
            userId,
            timestamp: { $gte: startDate }
        }).sort({ timestamp: 1 });
        
        const trends = {};
        
        // Calculate trends for each metric
        const metrics = ['heart_rate', 'blood_pressure', 'blood_sugar', 'sleep', 'steps'];
        metrics.forEach(metric => {
            const metricData = data.filter(d => d.type === metric);
            if (metricData.length > 1) {
                const values = metricData.map(d => parseFloat(d.value));
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const lastValue = values[values.length - 1];
                const change = ((lastValue - avg) / avg) * 100;
                
                trends[metric] = {
                    average: avg,
                    current: lastValue,
                    change: change,
                    direction: change > 0 ? 'increasing' : 'decreasing'
                };
            }
        });
        
        // Calculate risk score
        let riskScore = 0;
        if (trends.heart_rate && trends.heart_rate.current > 90) riskScore += 25;
        if (trends.blood_sugar && trends.blood_sugar.current > 140) riskScore += 30;
        if (trends.sleep && trends.sleep.current < 7) riskScore += 20;
        
        let riskLevel = 'low';
        if (riskScore > 50) riskLevel = 'high';
        else if (riskScore > 25) riskLevel = 'medium';
        
        return { trends, riskScore, riskLevel };
    }
    
    static generateRecommendations(healthData, userProfile) {
        const recommendations = [];
        
        const sleepData = healthData.filter(d => d.type === 'sleep');
        if (sleepData.length > 0) {
            const avgSleep = sleepData.slice(-7).reduce((sum, d) => sum + parseFloat(d.value), 0) / Math.min(sleepData.length, 7);
            if (avgSleep < 7) {
                recommendations.push({
                    type: 'sleep',
                    title: 'Improve Sleep Quality',
                    description: 'Aim for 7-9 hours of sleep. Try maintaining a consistent sleep schedule.',
                    action: 'Set bedtime reminder'
                });
            }
        }
        
        const hrData = healthData.filter(d => d.type === 'heart_rate');
        if (hrData.length > 0) {
            const avgHR = hrData.slice(-7).reduce((sum, d) => sum + parseFloat(d.value), 0) / Math.min(hrData.length, 7);
            if (avgHR > 85) {
                recommendations.push({
                    type: 'heart_rate',
                    title: 'Manage Heart Rate',
                    description: 'Practice deep breathing exercises. Consider reducing caffeine intake.',
                    action: 'Start breathing exercise'
                });
            }
        }
        
        const stepsData = healthData.filter(d => d.type === 'steps');
        if (stepsData.length > 0) {
            const avgSteps = stepsData.slice(-7).reduce((sum, d) => sum + parseFloat(d.value), 0) / Math.min(stepsData.length, 7);
            if (avgSteps < 8000) {
                recommendations.push({
                    type: 'activity',
                    title: 'Increase Daily Activity',
                    description: 'Try to reach 10,000 steps daily. Start with short walks.',
                    action: 'Set step goal'
                });
            }
        }
        
        return recommendations;
    }
}

// ============================================
// API ROUTES
// ============================================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        app: 'HealthVue AI Backend',
        version: '2.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login'
            },
            healthData: {
                post: 'POST /api/health-data',
                get: 'GET /api/health-data',
                trends: 'GET /api/health-data/trends',
                recommendations: 'GET /api/health-data/recommendations'
            }
        }
    });
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role: role || 'user' });
        await user.save();
        
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health Data Routes
app.post('/api/health-data', authenticateToken, async (req, res) => {
    try {
        const { type, value, systolic, diastolic, unit, source } = req.body;
        
        // Get user's recent data for trend analysis
        const recentData = await HealthData.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(30);
        
        // Detect anomalies
        const anomalies = AIEngine.detectAnomalies({ type, value, systolic, diastolic }, recentData);
        
        const healthRecord = new HealthData({
            userId: req.user._id,
            type,
            value,
            systolic,
            diastolic,
            unit,
            source: source || 'manual',
            anomaly: anomalies.length > 0,
            anomalyReason: anomalies.map(a => a.reason).join(', ')
        });
        
        await healthRecord.save();
        
        // Create alerts for anomalies
        for (const anomaly of anomalies) {
            const alert = new Alert({
                userId: req.user._id,
                type: 'anomaly',
                title: `${anomaly.type.replace('_', ' ')} Alert`,
                message: anomaly.reason,
                severity: anomaly.severity
            });
            await alert.save();
            
            // Broadcast via WebSocket if connected
            broadcastToUser(req.user._id, {
                type: 'anomaly_alert',
                data: alert
            });
        }
        
        res.json({ success: true, healthRecord, anomalies });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health-data', authenticateToken, async (req, res) => {
    try {
        const { type, days, limit } = req.query;
        const query = { userId: req.user._id };
        if (type) query.type = type;
        
        let dataQuery = HealthData.find(query).sort({ timestamp: -1 });
        if (limit) dataQuery = dataQuery.limit(parseInt(limit));
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days));
            query.timestamp = { $gte: date };
        }
        
        const data = await dataQuery.exec();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health-data/trends', authenticateToken, async (req, res) => {
    try {
        const trends = await AIEngine.analyzeHealthTrends(req.user._id);
        res.json(trends);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health-data/recommendations', authenticateToken, async (req, res) => {
    try {
        const healthData = await HealthData.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(100);
        const recommendations = AIEngine.generateRecommendations(healthData, req.user);
        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Family Management Routes
app.post('/api/family/add', authenticateToken, async (req, res) => {
    try {
        const { email, relationship, permissions } = req.body;
        
        const member = await User.findOne({ email });
        if (!member) return res.status(404).json({ error: 'User not found' });
        if (member._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot add yourself' });
        }
        
        const existing = await Family.findOne({ userId: req.user._id, memberId: member._id });
        if (existing) return res.status(400).json({ error: 'Family member already added' });
        
        const familyLink = new Family({
            userId: req.user._id,
            memberId: member._id,
            relationship,
            permissions: permissions || ['view_vitals']
        });
        await familyLink.save();
        
        res.json({ success: true, familyLink });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/family', authenticateToken, async (req, res) => {
    try {
        const family = await Family.find({ userId: req.user._id }).populate('memberId', 'name email age');
        res.json(family);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/family/:memberId/data', authenticateToken, async (req, res) => {
    try {
        const familyLink = await Family.findOne({
            userId: req.user._id,
            memberId: req.params.memberId
        });
        
        if (!familyLink) return res.status(403).json({ error: 'Not authorized to view this member\'s data' });
        
        const healthData = await HealthData.find({ userId: req.params.memberId }).sort({ timestamp: -1 }).limit(50);
        res.json(healthData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Appointment Routes
app.post('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const { doctorId, doctorName, specialty, date, time, duration, type, notes } = req.body;
        
        const appointment = new Appointment({
            userId: req.user._id,
            doctorId,
            doctorName,
            specialty,
            date: new Date(date),
            time,
            duration,
            type,
            notes
        });
        await appointment.save();
        
        // Create reminder alert
        const alert = new Alert({
            userId: req.user._id,
            type: 'appointment',
            title: 'Appointment Scheduled',
            message: `Appointment with ${doctorName} on ${new Date(date).toLocaleDateString()} at ${time}`,
            severity: 'medium'
        });
        await alert.save();
        
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const appointments = await Appointment.find({ userId: req.user._id }).sort({ date: 1 });
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
    try {
        const appointment = await Appointment.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true }
        );
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Medical Report Routes
app.post('/api/reports/upload', authenticateToken, upload.single('report'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const { title, type } = req.body;
        
        const report = new Report({
            userId: req.user._id,
            title: title || req.file.originalname,
            type: type || 'other',
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        });
        
        await report.save();
        
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const reports = await Report.find({ userId: req.user._id }).sort({ uploadDate: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/reports/:id', authenticateToken, async (req, res) => {
    try {
        const report = await Report.findOne({ _id: req.params.id, userId: req.user._id });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        
        // Delete file
        if (fs.existsSync(report.filePath)) fs.unlinkSync(report.filePath);
        
        await report.deleteOne();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alert Routes
app.get('/api/alerts', authenticateToken, async (req, res) => {
    try {
        const { unread } = req.query;
        const query = { userId: req.user._id };
        if (unread === 'true') query.read = false;
        
        const alerts = await Alert.find(query).sort({ createdAt: -1 });
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/alerts/:id/read', authenticateToken, async (req, res) => {
    try {
        const alert = await Alert.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { read: true },
            { new: true }
        );
        res.json(alert);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Chatbot Route
app.post('/api/chat', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        
        // Get user's recent health data for context
        const recentHealth = await HealthData.find({ userId: req.user._id })
            .sort({ timestamp: -1 })
            .limit(20);
        
        const healthSummary = recentHealth.map(h => `${h.type}: ${h.value}`).join(', ');
        
        // Generate AI response (simulated - you can integrate with OpenAI/Gemini)
        let response = generateMedicalResponse(message, req.user, healthSummary);
        
        // Save chat history
        const chat = new Chat({
            userId: req.user._id,
            message,
            response,
            context: { healthSummary }
        });
        await chat.save();
        
        res.json({ response, context: healthSummary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateMedicalResponse(message, user, healthContext) {
    const msg = message.toLowerCase();
    
    if (msg.includes('blood pressure') || msg.includes('bp')) {
        const bpData = healthContext.match(/blood_pressure: (\d+\/\d+)/);
        if (bpData) {
            return `Based on your recent blood pressure reading (${bpData[1]}), it's within ${bpData[1].split('/')[0] < 120 ? 'normal' : 'elevated'} range. Regular monitoring is recommended. Would you like tips for maintaining healthy BP?`;
        }
        return "I can help you track your blood pressure. Regular monitoring and maintaining a healthy lifestyle (low sodium diet, regular exercise) are key. When was your last reading?";
    }
    
    if (msg.includes('heart rate') || msg.includes('hr')) {
        const hrData = healthContext.match(/heart_rate: (\d+)/);
        if (hrData) {
            const hr = parseInt(hrData[1]);
            if (hr > 100) return `Your recent heart rate (${hr} bpm) is elevated. This could be due to stress, caffeine, or physical activity. Try deep breathing exercises. If persistent, consult a doctor.`;
            return `Your heart rate (${hr} bpm) is within normal range (60-100 bpm). Great job maintaining cardiovascular health!`;
        }
        return "Your heart rate is an important vital sign. Normal resting heart rate is 60-100 bpm. Regular exercise helps maintain healthy heart function.";
    }
    
    if (msg.includes('sleep')) {
        const sleepData = healthContext.match(/sleep: ([\d.]+)/);
        if (sleepData) {
            const sleep = parseFloat(sleepData[1]);
            if (sleep < 7) return `You're averaging ${sleep} hours of sleep. Aim for 7-9 hours. Try maintaining a consistent bedtime routine for better sleep quality.`;
            return `Great! You're getting ${sleep} hours of sleep. Quality sleep is essential for recovery and overall health.`;
        }
        return "Quality sleep is crucial for health. Adults need 7-9 hours. Try to maintain consistent sleep-wake times, even on weekends.";
    }
    
    if (msg.includes('diabetes') || msg.includes('blood sugar') || msg.includes('glucose')) {
        return "Managing blood sugar involves balanced meals, regular exercise, and medication compliance. Monitor regularly and keep a log. Would you like specific dietary recommendations?";
    }
    
    if (msg.includes('exercise') || msg.includes('workout') || msg.includes('steps')) {
        return "Aim for 150 minutes of moderate exercise weekly. Start with daily walks, gradually increase intensity. Consistency matters more than intensity!";
    }
    
    return `Hello ${user.name}! I'm your AI health assistant. I can help with:
• Blood pressure monitoring
• Heart rate analysis
• Sleep quality tips
• Diabetes management
• Exercise recommendations
• Medication reminders

How can I assist you with your health today?`;
}

// User Profile Routes
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        res.json(req.user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { name, age, gender, weight, height, emergencyContact } = req.body;
        const updates = { name, age, gender, weight, height, emergencyContact };
        
        const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        
        const [recentHealth, alerts, upcomingAppointments, trends] = await Promise.all([
            HealthData.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(10),
            Alert.find({ userId: req.user._id, read: false }).countDocuments(),
            Appointment.find({ userId: req.user._id, date: { $gte: today }, status: 'scheduled' }).limit(3),
            AIEngine.analyzeHealthTrends(req.user._id)
        ]);
        
        res.json({
            recentHealth,
            unreadAlerts: alerts,
            upcomingAppointments,
            trends,
            riskLevel: trends.riskLevel
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// WEBSOCKET SERVER FOR REAL-TIME ALERTS
// ============================================
const clients = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
        clients.set(userId, ws);
        ws.userId = userId;
    }
    
    ws.on('close', () => {
        if (userId) clients.delete(userId);
    });
});

function broadcastToUser(userId, data) {
    const client = clients.get(userId.toString());
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
    }
}

// ============================================
// CRON JOBS FOR AUTOMATED TASKS
// ============================================

// Check for anomalies daily and send reminders
cron.schedule('0 9 * * *', async () => {
    console.log('Running daily health check...');
    
    const users = await User.find();
    for (const user of users) {
        const healthData = await HealthData.find({ userId: user._id }).sort({ timestamp: -1 }).limit(7);
        if (healthData.length > 0) {
            const recommendations = AIEngine.generateRecommendations(healthData, user);
            if (recommendations.length > 0) {
                const alert = new Alert({
                    userId: user._id,
                    type: 'recommendation',
                    title: 'Daily Health Tips',
                    message: recommendations[0].description,
                    severity: 'low'
                });
                await alert.save();
                broadcastToUser(user._id, { type: 'daily_tip', data: recommendations[0] });
            }
        }
    }
});

// Appointment reminders (30 minutes before)
cron.schedule('*/30 * * * *', async () => {
    const now = new Date();
    const reminderTime = new Date(now.getTime() + 30 * 60000);
    
    const appointments = await Appointment.find({
        date: { $gte: now, $lte: reminderTime },
        status: 'scheduled'
    });
    
    for (const apt of appointments) {
        const alert = new Alert({
            userId: apt.userId,
            type: 'appointment',
            title: 'Upcoming Appointment Reminder',
            message: `Your appointment with ${apt.doctorName} is in 30 minutes`,
            severity: 'medium'
        });
        await alert.save();
        broadcastToUser(apt.userId, { type: 'appointment_reminder', data: apt });
    }
});

// ============================================
// DATABASE CONNECTION & SERVER START
// ============================================

// Connect to MongoDB with retry logic
let isMongoConnected = false;

const connectMongoDB = () => {
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log('✅ MongoDB connected successfully');
        isMongoConnected = true;
    }).catch(err => {
        console.warn('⚠️ MongoDB connection error - retrying in 5 seconds...');
        console.warn('   Error:', err.message);
        isMongoConnected = false;
        setTimeout(connectMongoDB, 5000);
    });
};

// Attempt initial connection
connectMongoDB();

// Start server regardless of MongoDB connection
server.listen(PORT, () => {
    console.log(`🚀 HealthVue AI Backend running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for real-time alerts`);
    console.log(`🔒 JWT authentication enabled`);
    console.log(`⏳ Connecting to MongoDB at ${MONGODB_URI}...`);
});

// Middleware to check MongoDB connection
const checkMongoConnection = (req, res, next) => {
    if (!isMongoConnected) {
        return res.status(503).json({ 
            error: 'Database connection pending. Please try again in a moment.',
            status: 'connecting'
        });
    }
    next();
};

// Apply connection check to routes that need database
app.use('/api/auth', checkMongoConnection);
app.use('/api/health-data', checkMongoConnection);
app.use('/api/family', checkMongoConnection);
app.use('/api/appointments', checkMongoConnection);
app.use('/api/reports', checkMongoConnection);
app.use('/api/dashboard', checkMongoConnection);

// Add health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mongodb: isMongoConnected ? 'connected' : 'connecting',
        message: isMongoConnected ? 'Backend running normally' : 'Database connecting...'
    });
});

module.exports = { app, server, wss };
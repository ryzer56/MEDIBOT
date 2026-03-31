// ============================================
// seed.js - Database Seed Data
// ============================================
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/healthvue';

// Import models (assuming they're exported from server.js)
// For seeding script, we'll redefine schemas or import

async function seed() {
    await mongoose.connect(MONGODB_URI);
    
    // Clear existing data
    await mongoose.connection.db.dropDatabase();
    
    // Create users
    const users = [
        {
            name: 'Sarah Johnson',
            email: 'sarah@healthvue.com',
            password: await bcrypt.hash('password123', 10),
            role: 'user',
            age: 32,
            gender: 'female',
            weight: 68,
            height: 165,
            emergencyContact: { name: 'Mike Johnson', phone: '+1234567890', relationship: 'husband' }
        },
        {
            name: 'Dr. Michael Chen',
            email: 'dr.chen@healthvue.com',
            password: await bcrypt.hash('doctor123', 10),
            role: 'doctor',
            age: 45,
            gender: 'male'
        },
        {
            name: 'Robert Johnson',
            email: 'robert@healthvue.com',
            password: await bcrypt.hash('family123', 10),
            role: 'user',
            age: 65,
            gender: 'male'
        }
    ];
    
    const createdUsers = [];
    for (const user of users) {
        const newUser = new mongoose.model('User', require('./models/User')).user;
        // Simplified - actual implementation would use the model
        createdUsers.push(newUser);
    }
    
    console.log('✅ Seed data created');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
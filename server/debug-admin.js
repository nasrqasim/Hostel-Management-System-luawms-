
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hms';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'warden', 'staff', 'prohost'], default: 'warden' },
    assignedHostels: [{ type: String }],
});

const User = mongoose.model('User', userSchema);

async function fixAdmin() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const admin = await User.findOne({ username: 'Admin' });
        if (admin) {
            console.log('Admin found:', admin.username, admin.email, admin.role);

            // Reset password to ensure it matches expectations
            const newHash = await bcrypt.hash('Admin@3456!', 10);
            admin.password = newHash;
            await admin.save();
            console.log('Admin password reset to Admin@3456!');
        } else {
            console.log('Admin not found, creating...');
            const hashed = await bcrypt.hash('Admin@3456!', 10);
            await User.create({
                username: 'Admin',
                email: 'Admin@3456!',
                password: hashed,
                role: 'admin'
            });
            console.log('Admin user created');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

fixAdmin();

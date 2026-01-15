import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hms';
mongoose
  .connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Schemas (copied from server.js)
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'warden', 'staff', 'prohost'], default: 'warden' },
    assignedHostels: [{ type: String }],
  },
  { timestamps: true }
);

const roomSubSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    capacity: { type: Number, required: true },
    assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
  },
  { _id: false }
);

const hostelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    warden: { type: String },
    imageUrl: { type: String },
    capacity: { type: Number },
    numberOfRooms: { type: Number, default: 0 },
    capacityPerRoom: { type: Number, default: 3 },
    blocks: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, required: true },
            numRooms: { type: Number, required: true, min: 1 }
          },
          { _id: false }
        )
      ],
      default: []
    },
    totalRooms: { type: Number, default: 0 },
    totalCapacity: { type: Number, default: 0 },
    rooms: { type: [roomSubSchema], default: [] }
  },
  { timestamps: true }
);

const studentSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true },
    fatherName: { type: String },
    registrationNumber: { type: String, required: true, unique: true },
    degree: { type: String },
    department: { type: String },
    semester: { type: Number },
    district: { type: String },
    assignedHostel: { type: String },
    roomNumber: { type: String },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel' },
    roomId: { type: String },
    hostelFee: { type: String, default: 'pending' },
    challanNumber: { type: String, required: true, unique: true },
    feeTable: { type: Map, of: String },
    profileImage: { type: String },
  },
  { timestamps: true }
);

const challanSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    studentName: String,
    registrationNumber: String,
    department: String,
    semester: Number,
    challanNumber: { type: String, required: true, unique: true },
    amount: Number,
    dueDate: Date,
    status: { type: String, enum: ['pending', 'paid', 'overdue', 'cancelled'], default: 'pending' },
  },
  { timestamps: true }
);

const logSchema = new mongoose.Schema(
  {
    action: String,
    description: String,
    username: String,
    role: String,
    hostel: String,
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Hostel = mongoose.model('Hostel', hostelSchema);
const Student = mongoose.model('Student', studentSchema);
const Challan = mongoose.model('Challan', challanSchema);
const Log = mongoose.model('Log', logSchema);

// Response helper
const sendResponse = (res, success, data = null, message = '', errors = null) => {
  res.json({
    success,
    data,
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Auth middleware
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return sendResponse(res, false, null, 'Unauthorized');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload;
    next();
  } catch (err) {
    return sendResponse(res, false, null, 'Invalid or expired token');
  }
};

// Activity log helper
const createActivityLog = async (action, description, username, role, hostel, entityType) => {
  try {
    await Log.create({
      action,
      description,
      username,
      role,
      hostel,
      entityType
    });
  } catch (error) {
    console.error('Failed to create activity log:', error);
  }
};

// Routes
app.get('/api/health', (req, res) => {
  sendResponse(res, true, { status: 'healthy' }, 'Server is running');
});

// Public hostels list
app.get('/api/hostels/public', asyncHandler(async (req, res) => {
  const hostels = await Hostel.find({}, 'name imageUrl totalRooms totalCapacity capacityPerRoom').sort({ createdAt: -1 }).lean();
  sendResponse(res, true, hostels, 'Public hostels retrieved successfully');
}));

// Authentication
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password, username } = req.body;
  const query = email ? { email } : { username };
  if ((!email && !username) || !password) {
    return sendResponse(res, false, null, 'Email/Username and password are required');
  }
  const user = await User.findOne(query);
  if (!user) return sendResponse(res, false, null, 'Invalid credentials');
  if (!user.password) {
    return sendResponse(res, false, null, 'Account not configured. Contact admin.');
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return sendResponse(res, false, null, 'Invalid credentials');
  const token = jwt.sign({ id: user._id, role: user.role, username: user.username, assignedHostels: user.assignedHostels }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '8h' });
  await createActivityLog('LOGIN', `User ${user.username} logged in`, user.username, user.role, null, 'Authentication');
  const safeUser = { id: user._id, username: user.username, email: user.email, role: user.role, assignedHostels: user.assignedHostels };
  sendResponse(res, true, { token, user: safeUser }, 'Login successful');
}));

// Dashboard metrics
app.get('/api/dashboard', asyncHandler(async (_req, res) => {
  const [totalHostels, totalStudents, totalUsers, hostels, allStudents] = await Promise.all([
    Hostel.countDocuments(),
    Student.countDocuments(),
    User.countDocuments(),
    Hostel.find({}, 'totalCapacity capacity rooms capacityPerRoom').lean(),
    Student.find({}, 'feeTable department').lean()
  ]);

  const aggregateCapacity = hostels.reduce((sum, h) => {
    if (typeof h.totalCapacity === 'number' && h.totalCapacity > 0) return sum + h.totalCapacity;
    if (typeof h.capacity === 'number' && h.capacity > 0) return sum + h.capacity;
    const per = h.capacityPerRoom || 0;
    const numRooms = Array.isArray(h.rooms) ? h.rooms.length : 0;
    return sum + (per * numRooms);
  }, 0);

  const vacantPlaces = Math.max(aggregateCapacity - totalStudents, 0);

  let overdueStudents = 0;
  allStudents.forEach((student) => {
    let feeTable = {};
    const raw = student.feeTable;
    if (raw && typeof raw === 'object') {
      if (raw instanceof Map) {
        feeTable = Object.fromEntries(raw);
      } else {
        feeTable = raw;
      }
    }

    const entries = Object.entries(feeTable);
    if (entries.length === 0) {
      overdueStudents++;
      return;
    }

    const hasPending = entries.some(([, status]) => String(status).toLowerCase() === 'pending');
    if (hasPending) {
      overdueStudents++;
    }
  });

  sendResponse(res, true, {
    totalHostels,
    totalStudents,
    activeUsers: totalUsers,
    vacantPlaces,
    overdueStudents
  }, 'Dashboard metrics');
}));

// Export for Vercel
export default app;

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Serve static files from the project root
// We serve the parent of 'server/src' which is the project root containing HTML, CSS, JS folders
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../../');

app.use(express.static(rootDir));


const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hms';
mongoose
  .connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Schemas
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
    // Optional legacy total capacity field preserved
    capacity: { type: Number },
    // New extended fields
    numberOfRooms: { type: Number, default: 0 },
    capacityPerRoom: { type: Number, default: 3 },
    // Blocks support: each with name and number of rooms
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
    // New references (non-breaking optional fields)
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel' },
    roomId: { type: String },
    hostelFee: { type: String, default: 'pending' },
    challanNumber: { type: String, required: true, unique: true },
    feeTable: { type: Map, of: String }, // e.g. sem1 -> 'paid'/'pending'
    profileImage: { type: String }, // base64 data URL for simplicity
  },
  { timestamps: true }
);

// Pre-delete middleware for Single Student Deletion (findOneAndDelete)
studentSchema.pre('findOneAndDelete', async function (next) {
  try {
    const doc = await this.model.findOne(this.getQuery());
    if (!doc) return next();

    // 1. Delete Linked Challans
    await mongoose.model('Challan').deleteMany({ studentId: doc._id });

    // 2. Remove from Hostel Room Assignments
    await mongoose.model('Hostel').updateMany(
      {},
      { $pull: { "rooms.$[].assignedStudents": doc._id } }
    );

    // 3. Remove Logs (Best effort match by Name OR RegNo)
    await mongoose.model('Log').deleteMany({
      description: { $regex: new RegExp(`(${doc.studentName}|${doc.registrationNumber})`, 'i') }
    });

    console.log(`[Cascade Delete] Cleaned up data for student: ${doc.studentName}`);
    next();
  } catch (error) {
    console.error('[Cascade Delete Error]', error);
    next(error);
  }
});

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

// Add pre-delete middleware for cascading operations
hostelSchema.pre('deleteOne', { document: true, query: false }, async function () {
  const hostelName = this.name;

  // Remove students assigned to this hostel
  await Student.deleteMany({ assignedHostel: hostelName });

  // Remove challans for students in this hostel
  const studentsInHostel = await Student.find({ assignedHostel: hostelName }).distinct('_id');
  await Challan.deleteMany({ studentId: { $in: studentsInHostel } });

  // Log the cascading deletion
  await Log.create({
    action: 'CASCADE_DELETE',
    description: `Cascading deletion for hostel: ${hostelName}`,
    username: 'system',
    role: 'system',
    entityType: 'Hostel',
    additionalData: {
      deletedStudents: studentsInHostel.length,
      deletedChallans: await Challan.countDocuments({ studentId: { $in: studentsInHostel } })
    }
  });
});

// Unified API response helper
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

// Strict role-based guard (additive)
const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return sendResponse(res, false, null, 'Access Denied');
  }
  next();
};

// Helper to compute a read-scope for wardens
const scopeForWarden = (base = {}) => (req, _res, next) => {
  req.scopeFilter = { ...base };
  if (req.user?.role === 'warden' && Array.isArray(req.user.assignedHostels) && req.user.assignedHostels.length > 0) {
    req.scopeFilter.assignedHostel = { $in: req.user.assignedHostels };
  }
  next();
};

// Warden-only access middleware; wardens can only access their assigned hostels
const requireWarden = (req, res, next) => {
  if (!req.user) return sendResponse(res, false, null, 'Unauthorized');
  if (req.user.role === 'admin' || req.user.role === 'staff' || req.user.role === 'prohost') return next();
  if (req.user.role !== 'warden') return sendResponse(res, false, null, 'Forbidden');
  return next();
};

// Routes
app.get('/api/health', (req, res) => {
  sendResponse(res, true, { status: 'healthy' }, 'Server is running');
});

// Dashboard metrics (public)
app.get('/api/dashboard', asyncHandler(async (_req, res) => {
  const [totalHostels, totalStudents, totalUsers, hostels, allStudents] = await Promise.all([
    Hostel.countDocuments(),
    Student.countDocuments(),
    User.countDocuments(),
    Hostel.find({}, 'totalCapacity capacity rooms capacityPerRoom').lean(),
    // Need department to mirror Fee Management defaulting rules
    Student.find({}, 'feeTable department').lean()
  ]);

  // Compute total capacity across hostels
  const aggregateCapacity = hostels.reduce((sum, h) => {
    if (typeof h.totalCapacity === 'number' && h.totalCapacity > 0) return sum + h.totalCapacity;
    if (typeof h.capacity === 'number' && h.capacity > 0) return sum + h.capacity;
    const per = h.capacityPerRoom || 0;
    const numRooms = Array.isArray(h.rooms) ? h.rooms.length : 0;
    return sum + (per * numRooms);
  }, 0);

  const vacantPlaces = Math.max(aggregateCapacity - totalStudents, 0);

  // Count students with at least one "pending" semester fee
  let overdueStudents = 0;
  allStudents.forEach((student) => {
    // Normalize feeTable to a plain object
    let feeTable = {};
    const raw = student.feeTable;
    if (raw && typeof raw === 'object') {
      if (raw instanceof Map) {
        feeTable = Object.fromEntries(raw);
      } else {
        feeTable = raw;
      }
    }

    // If feeTable is missing or empty, Fee Management shows all semesters as Pending
    const entries = Object.entries(feeTable);
    if (entries.length === 0) {
      overdueStudents++;
      return;
    }

    // Any explicit 'pending' marks this student overdue
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

// Hostels CRUD
// Public list for landing page (no auth)
app.get('/api/hostels/public', asyncHandler(async (req, res) => {
  const hostels = await Hostel.find({}, 'name imageUrl totalRooms totalCapacity capacityPerRoom').sort({ createdAt: -1 }).lean();
  sendResponse(res, true, hostels, 'Public hostels retrieved successfully');
}));

// List hostels with optional stats (restricted)
app.get('/api/hostels', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const includeStats = String(req.query.includeStats || 'false') === 'true';
  const hostels = await Hostel.find().sort({ createdAt: -1 }).lean();

  if (!includeStats) {
    return sendResponse(res, true, hostels, 'Hostels retrieved successfully');
  }

  // Compute stats: occupied slots from students assigned to this hostel
  const students = await Student.find({}, 'assignedHostel _id studentName registrationNumber roomNumber').lean();
  const hostelNameToStudents = students.reduce((acc, s) => {
    const key = s.assignedHostel || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const dataWithStats = hostels.map(h => {
    const hsStudents = hostelNameToStudents[h.name] || [];
    const occupied = hsStudents.length;
    const totalCapacity = typeof h.totalCapacity === 'number' ? h.totalCapacity : (h.capacity || 0);
    const empty = Math.max(totalCapacity - occupied, 0);
    return {
      ...h,
      stats: {
        totalRooms: h.totalRooms || (h.rooms ? h.rooms.length : undefined),
        totalCapacity,
        occupiedSlots: occupied,
        emptySlots: empty,
        students: hsStudents
      }
    };
  });

  sendResponse(res, true, dataWithStats, 'Hostels retrieved with stats');
}));

app.get('/api/hostels/names', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const hostels = await Hostel.find({}, 'name').sort({ name: 1 });
  const hostelNames = hostels.map(h => h.name);
  sendResponse(res, true, hostelNames, 'Hostel names retrieved successfully');
}));

// Hostel details by name or id with rooms and students
app.get('/api/hostels/:identifier/details', requireAuth, asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const query = identifier.match(/^[0-9a-fA-F]{24}$/) ? { _id: identifier } : { name: identifier };
  const hostel = await Hostel.findOne(query).lean();
  if (!hostel) return sendResponse(res, false, null, 'Hostel not found');

  // If warden, block access to other hostels
  if (req.user?.role === 'warden') {
    const allowedNames = Array.isArray(req.user.assignedHostels) ? req.user.assignedHostels : [];
    if (!allowedNames.includes(hostel.name)) {
      return sendResponse(res, false, null, 'Access Denied');
    }
  }

  const students = await Student.find({ assignedHostel: hostel.name }, 'studentName registrationNumber roomNumber').lean();
  const roomIdToStudents = students.reduce((acc, s) => {
    const key = (s.roomNumber || '').toUpperCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push({ name: s.studentName, registrationNumber: s.registrationNumber });
    return acc;
  }, {});

  const rooms = (hostel.rooms || []).map(r => {
    const assigned = roomIdToStudents[(r.roomId || '').toUpperCase()] || [];
    return {
      roomId: r.roomId,
      capacity: r.capacity,
      students: assigned,
      freeSlots: Math.max(r.capacity - assigned.length, 0)
    };
  });

  const occupied = students.length;
  const totalCapacity = typeof hostel.totalCapacity === 'number' ? hostel.totalCapacity : (hostel.capacity || 0);
  const empty = Math.max(totalCapacity - occupied, 0);

  const data = {
    name: hostel.name,
    warden: hostel.warden,
    imageUrl: hostel.imageUrl,
    totalRooms: hostel.totalRooms || rooms.length,
    totalCapacity,
    occupiedSlots: occupied,
    emptySlots: empty,
    rooms
  };

  sendResponse(res, true, data, 'Hostel details retrieved successfully');
}));

// Get hostel rooms with student data for hostel details page
app.get('/api/hostels/:identifier/rooms', requireAuth, asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const query = identifier.match(/^[0-9a-fA-F]{24}$/) ? { _id: identifier } : { name: identifier };
  const hostel = await Hostel.findOne(query).lean();
  if (!hostel) return sendResponse(res, false, null, 'Hostel not found');

  // If warden, ensure they only access their hostel(s)
  if (req.user?.role === 'warden') {
    const allowedNames = Array.isArray(req.user.assignedHostels) ? req.user.assignedHostels : [];
    if (!allowedNames.includes(hostel.name)) {
      return sendResponse(res, false, null, 'Access Denied');
    }
  }

  // Get students assigned to this hostel
  const students = await Student.find({ assignedHostel: hostel.name }).lean();

  // Group students by room (normalize room numbers for consistent matching)
  const roomData = {};
  const roomNormalizedMap = {}; // Maps normalized (uppercase) to original case
  students.forEach(student => {
    const roomNo = student.roomNumber;
    if (roomNo) {
      const roomNoNormalized = roomNo.toUpperCase().trim();
      // Store original case for the first occurrence
      if (!roomNormalizedMap[roomNoNormalized]) {
        roomNormalizedMap[roomNoNormalized] = roomNo;
      }
      // Use normalized key for consistent grouping (handles B-01 vs b-01)
      if (!roomData[roomNoNormalized]) {
        roomData[roomNoNormalized] = [];
      }
      roomData[roomNoNormalized].push({
        sno: roomData[roomNoNormalized].length + 1,
        name: student.studentName,
        regNo: student.registrationNumber,
        department: student.department,
        roomNo: roomNormalizedMap[roomNoNormalized] // Use original case
      });
    }
  });

  // Create room structure with capacity
  const capacityPerRoom = hostel.capacityPerRoom || 3;
  const rooms = [];
  const roomIdsSet = new Set(); // Track which room IDs we've added

  if (Array.isArray(hostel.blocks) && hostel.blocks.length > 0) {
    hostel.blocks.forEach(block => {
      const count = Number(block.numRooms) || 0;
      for (let i = 1; i <= count; i++) {
        const roomId = `${block.name}-${String(i).padStart(2, '0')}`;
        const roomIdNormalized = roomId.toUpperCase();
        roomIdsSet.add(roomIdNormalized); // Normalize to uppercase for comparison
        const roomStudents = roomData[roomIdNormalized] || [];
        const emptySlots = Math.max(0, capacityPerRoom - roomStudents.length);
        for (let j = 0; j < emptySlots; j++) {
          roomStudents.push({
            sno: roomStudents.length + j + 1,
            name: 'To Be Alloted',
            regNo: '-',
            department: '-',
            roomNo: roomId
          });
        }
        rooms.push({
          roomId,
          capacity: capacityPerRoom,
          occupied: roomStudents.filter(s => s.name !== 'To Be Alloted').length,
          available: emptySlots,
          students: roomStudents
        });
      }
    });
  } else {
    // Fallback to single block A-XX using numberOfRooms/totalRooms
    const totalRooms = hostel.numberOfRooms || hostel.totalRooms || 0;
    for (let i = 1; i <= totalRooms; i++) {
      const roomId = `A-${i.toString().padStart(2, '0')}`;
      const roomIdNormalized = roomId.toUpperCase();
      roomIdsSet.add(roomIdNormalized);
      const roomStudents = roomData[roomIdNormalized] || [];
      const emptySlots = Math.max(0, capacityPerRoom - roomStudents.length);
      for (let j = 0; j < emptySlots; j++) {
        roomStudents.push({
          sno: roomStudents.length + j + 1,
          name: 'To Be Alloted',
          regNo: '-',
          department: '-',
          roomNo: roomId
        });
      }
      rooms.push({
        roomId,
        capacity: capacityPerRoom,
        occupied: roomStudents.filter(s => s.name !== 'To Be Alloted').length,
        available: emptySlots,
        students: roomStudents
      });
    }
  }

  // CRITICAL FIX: Include all rooms that have students assigned, even if not in blocks definition
  // This ensures B, C, D block rooms show up even if blocks aren't configured
  Object.keys(roomData).forEach(roomIdNormalized => {
    if (!roomIdsSet.has(roomIdNormalized)) {
      // This room has students but wasn't generated from blocks - add it
      const roomStudents = roomData[roomIdNormalized] || [];
      // Get original case from the first student's roomNo, or use normalized
      const originalRoomId = roomStudents.length > 0 ? roomStudents[0].roomNo : roomNormalizedMap[roomIdNormalized] || roomIdNormalized;
      const emptySlots = Math.max(0, capacityPerRoom - roomStudents.length);
      for (let j = 0; j < emptySlots; j++) {
        roomStudents.push({
          sno: roomStudents.length + j + 1,
          name: 'To Be Alloted',
          regNo: '-',
          department: '-',
          roomNo: originalRoomId
        });
      }
      rooms.push({
        roomId: originalRoomId, // Preserve original case from database
        capacity: capacityPerRoom,
        occupied: roomStudents.filter(s => s.name !== 'To Be Alloted').length,
        available: emptySlots,
        students: roomStudents
      });
      roomIdsSet.add(roomIdNormalized);
    }
  });

  // Sort rooms for consistent display: A-01, A-02, ..., B-01, B-02, etc.
  rooms.sort((a, b) => {
    const aMatch = a.roomId.match(/^([A-Z]+)-?(\d+)$/i);
    const bMatch = b.roomId.match(/^([A-Z]+)-?(\d+)$/i);
    if (aMatch && bMatch) {
      const aLetter = aMatch[1].toUpperCase();
      const bLetter = bMatch[1].toUpperCase();
      if (aLetter !== bLetter) {
        return aLetter.localeCompare(bLetter);
      }
      return parseInt(aMatch[2], 10) - parseInt(bMatch[2], 10);
    }
    return a.roomId.localeCompare(b.roomId);
  });

  sendResponse(res, true, { hostel, rooms }, 'Hostel rooms retrieved successfully');
}));

// Add hostel with auto-generated rooms
app.post('/api/hostels', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const { name, warden, imageUrl, username, capacity, numberOfRooms, capacityPerRoom, blocks } = req.body;

  if (!name) {
    return sendResponse(res, false, null, 'Hostel name is required', { name: 'Name is required' });
  }
  if (!numberOfRooms || !capacityPerRoom) {
    // Keep backward compatibility: allow old clients that don't send rooms; create hostel without rooms
    // But for new flow we require both
  }

  const existingHostel = await Hostel.findOne({ name });
  if (existingHostel) {
    return sendResponse(res, false, null, 'Hostel with this name already exists', { name: 'Name must be unique' });
  }

  // Prepare rooms if provided
  let rooms = [];
  let totalCapacity = 0;
  let totalRooms = 0;
  const perRoom = Number(capacityPerRoom) > 0 ? Number(capacityPerRoom) : undefined;
  const normalizedBlocks = Array.isArray(blocks)
    ? blocks.filter(b => b && b.name && Number(b.numRooms) > 0).map(b => ({ name: String(b.name).trim(), numRooms: Number(b.numRooms) }))
    : [];

  if (normalizedBlocks.length > 0 && perRoom) {
    // Use blocks data as the source of truth for room generation
    normalizedBlocks.forEach(block => {
      for (let i = 1; i <= block.numRooms; i++) {
        rooms.push({
          roomId: `${block.name}-${String(i).padStart(2, '0')}`,
          capacity: perRoom,
          assignedStudents: []
        });
      }
    });
    totalRooms = rooms.length;
    totalCapacity = totalRooms * perRoom;
  } else if (Number(numberOfRooms) > 0 && perRoom) {
    totalRooms = Number(numberOfRooms);
    totalCapacity = totalRooms * perRoom;
    rooms = Array.from({ length: totalRooms }).map((_, idx) => ({
      roomId: `A-${String(idx + 1).padStart(2, '0')}`,
      capacity: perRoom,
      assignedStudents: []
    }));
  }

  const hostel = await Hostel.create({
    name,
    warden,
    imageUrl,
    capacity,
    blocks: normalizedBlocks,
    capacityPerRoom: perRoom,
    rooms,
    totalRooms,
    totalCapacity
  });
  await createActivityLog('ADD_HOSTEL', `Hostel ${hostel.name} added`, username || 'unknown', 'staff', hostel.name, 'Hostel');

  sendResponse(res, true, hostel, 'Hostel created successfully');
}));

app.put('/api/hostels/:id', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const { name, warden, imageUrl, username, capacity, numberOfRooms, capacityPerRoom, blocks } = req.body;

  const update = { name, warden, imageUrl, capacity };

  // If rooms schema changed, (re)generate rooms. Supports blocks
  const perRoom = Number(capacityPerRoom) > 0 ? Number(capacityPerRoom) : undefined;
  const normalizedBlocks = Array.isArray(blocks)
    ? blocks.filter(b => b && b.name && Number(b.numRooms) > 0).map(b => ({ name: String(b.name).trim(), numRooms: Number(b.numRooms) }))
    : [];
  if ((Number(numberOfRooms) > 0 && perRoom) || (normalizedBlocks.length > 0 && perRoom)) {
    let rooms = [];
    let totalRooms = 0;
    if (normalizedBlocks.length > 0) {
      // Use blocks data as the source of truth for room generation
      normalizedBlocks.forEach(block => {
        for (let i = 1; i <= block.numRooms; i++) {
          rooms.push({ roomId: `${block.name}-${String(i).padStart(2, '0')}`, capacity: perRoom, assignedStudents: [] });
        }
      });
      totalRooms = rooms.length;
      update.blocks = normalizedBlocks;
      update.capacityPerRoom = perRoom;
      // Update numberOfRooms to match actual blocks total
      update.numberOfRooms = totalRooms;
    } else {
      totalRooms = Number(numberOfRooms);
      rooms = Array.from({ length: totalRooms }).map((_, idx) => ({ roomId: `A-${String(idx + 1).padStart(2, '0')}`, capacity: perRoom, assignedStudents: [] }));
      update.capacityPerRoom = perRoom;
    }
    update.rooms = rooms;
    update.totalRooms = totalRooms;
    update.totalCapacity = totalRooms * (perRoom || 0);
  }

  const hostel = await Hostel.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  );

  if (!hostel) {
    return sendResponse(res, false, null, 'Hostel not found');
  }

  await createActivityLog('UPDATE_HOSTEL', `Hostel ${hostel.name} updated`, username || 'unknown', 'staff', hostel.name, 'Hostel');

  sendResponse(res, true, hostel, 'Hostel updated successfully');
}));

app.delete('/api/hostels/:id', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  // Handle both ID and name-based deletion for backward compatibility
  let hostel;
  if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
    // Valid ObjectId - delete by ID
    hostel = await Hostel.findByIdAndDelete(req.params.id);
  } else {
    // Not a valid ObjectId - treat as name
    hostel = await Hostel.findOneAndDelete({ name: req.params.id });
  }

  if (!hostel) {
    return sendResponse(res, false, null, 'Hostel not found');
  }

  await createActivityLog('DELETE_HOSTEL', `Hostel ${hostel.name} deleted`, req.query.username || 'unknown', 'staff', hostel.name, 'Hostel');

  sendResponse(res, true, null, 'Hostel deleted successfully');
}));

// Students CRUD
app.get('/api/students', asyncHandler(async (req, res) => {
  // Warden restriction: if warden, only show their hostels' students
  let filter = {};

  // Search Logic
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    filter.$or = [
      { studentName: searchRegex },
      { registrationNumber: searchRegex },
      { department: searchRegex },
      { assignedHostel: searchRegex },
      { district: searchRegex }
    ];
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      if (payload.role === 'warden' && Array.isArray(payload.assignedHostels) && payload.assignedHostels.length > 0) {
        // If search already has $or, we need to AND it with warden restriction
        if (filter.$or) {
          filter = {
            $and: [
              filter,
              { assignedHostel: { $in: payload.assignedHostels } }
            ]
          };
        } else {
          filter.assignedHostel = { $in: payload.assignedHostels };
        }
      }
    }
  } catch (_) {
    // ignore auth errors here; public listing retained for BC
  }
  const students = await Student.find(filter).sort({ createdAt: -1 });
  sendResponse(res, true, students, 'Students retrieved successfully');
}));

// Batch Delete Students Endpoint
app.delete('/api/students/batch', requireAuth, authorizeRole('admin'), asyncHandler(async (req, res) => {
  const { department, batch } = req.body;
  if (!department || !batch) {
    return sendResponse(res, false, null, 'Department and Batch are required for batch deletion');
  }

  // Construct query: Department exact match, Reg number contains batch (e.g. '2k21')
  const batchRegex = new RegExp(batch, 'i');
  const query = {
    department: department,
    registrationNumber: batchRegex
  };

  console.log(`[Batch Delete] Query:`, query);
  const students = await Student.find(query);
  const count = students.length;
  console.log(`[Batch Delete] Found ${count} students`);

  if (count === 0) {
    return sendResponse(res, false, null, 'No students found matching the criteria');
  }

  const studentIds = students.map(s => s._id);
  const regNos = students.map(s => s.registrationNumber);

  // Perform Cascading Delete (Bulk Operations for efficiency)

  // 1. Delete Students
  await Student.deleteMany({ _id: { $in: studentIds } });

  // 2. Delete linked Challans
  await Challan.deleteMany({ studentId: { $in: studentIds } });

  // 3. Remove assignedStudents from all Hostel Rooms
  await Hostel.updateMany(
    {},
    { $pull: { "rooms.$[].assignedStudents": { $in: studentIds } } }
  );

  // 4. Delete Logs (Bulk regex match)
  if (regNos.length > 0) {
    // Construct a regex that matches ANY of the registration numbers
    // Note: If too many students, this regex might be too long. 
    // Fallback/Safety: Delete logs where description contains the Batch AND Department
    // But for precision, we'll try the regNo match if list is reasonable size (<100?), else fall back to broad match.
    if (regNos.length < 50) {
      await Log.deleteMany({
        description: { $regex: new RegExp(regNos.join('|'), 'i') }
      });
    } else {
      // Best effort: match first 50 students to avoid huge regex.
      // Ideally we would use a more robust logging association (like studentId) in the future.
      await Log.deleteMany({
        description: { $regex: new RegExp(regNos.slice(0, 50).join('|'), 'i') }
      });
    }
  }

  await createActivityLog('BATCH_DELETE_STUDENTS', `Deleted batch ${batch} of ${department} (${count} students)`, req.user.username, req.user.role, null, 'Student');

  sendResponse(res, true, { count }, `Successfully deleted ${count} students and related data.`);
}));

// Delete Single Student with Cascade
app.delete('/api/students/:id', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  console.log(`[Delete Student] Request ID: ${req.params.id}`);

  // Use findOneAndDelete to trigger the pre-hook middleware
  const student = await Student.findOneAndDelete({ _id: req.params.id });

  if (!student) {
    console.log(`[Delete Student] Not Found`);
    return sendResponse(res, false, null, 'Student not found');
  }

  await createActivityLog('DELETE_STUDENT', `Deleted student: ${student.studentName}`, req.query.username || req.user?.username || 'system', 'staff', student.assignedHostel, 'Student');

  sendResponse(res, true, null, 'Student deleted successfully');
}));

app.post('/api/students', asyncHandler(async (req, res) => {
  const { studentName, fatherName, registrationNumber, degree, department, semester, district, assignedHostel, roomNumber, hostelFee, username, profileImage } = req.body;

  if (!studentName || !registrationNumber) {
    return sendResponse(res, false, null, 'Student name and registration number are required', {
      studentName: !studentName ? 'Name is required' : null,
      registrationNumber: !registrationNumber ? 'Registration number is required' : null
    });
  }

  const existingStudent = await Student.findOne({ registrationNumber });
  if (existingStudent) {
    return sendResponse(res, false, null, 'Student with this registration number already exists', {
      registrationNumber: 'Registration number must be unique'
    });
  }

  // Warden role restriction: can only add students to their assigned hostels
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      if (payload.role === 'warden' && assignedHostel && (!Array.isArray(payload.assignedHostels) || !payload.assignedHostels.includes(assignedHostel))) {
        return sendResponse(res, false, null, 'Forbidden: not your hostel');
      }
    }
  } catch (_) { }

  // Normalize room number format (e.g., "b-2" -> "B-02", preserve existing format if already correct)
  const normalizeRoomNumber = (rn) => {
    if (!rn) return rn;
    const trimmed = String(rn).trim();
    const match = trimmed.match(/^([A-Za-z]+)[-\s]*(\d+)$/i);
    if (match) {
      const block = match[1].toUpperCase();
      const num = parseInt(match[2], 10);
      return `${block}-${String(num).padStart(2, '0')}`;
    }
    return trimmed;
  };

  // Generate unique Challan Number
  const generateChallanNumber = () => {
    // Format: CH-{Timestamp}-{Random3Digits}
    return `CH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };


  const studentData = {
    studentName,
    fatherName,
    registrationNumber,
    degree,
    department,
    semester: semester ? Number(semester) : undefined,
    district,
    assignedHostel,
    roomNumber: normalizeRoomNumber(roomNumber),
    hostelFee: hostelFee || 'pending',
    challanNumber: generateChallanNumber(),
    feeTable: {},
    profileImage: profileImage || undefined
  };

  // Attach refs if possible
  let hostelRef = null;
  if (assignedHostel) {
    hostelRef = await Hostel.findOne({ name: assignedHostel });
  }
  if (hostelRef) {
    studentData.hostelId = hostelRef._id;
    studentData.roomId = studentData.roomNumber || undefined;
  }

  const student = await Student.create(studentData);

  // Update hostel room occupancy if hostel has rooms
  // Note: If room doesn't exist in rooms array, this won't update anything but student is still saved correctly
  // The room fetching logic will find students by roomNumber regardless of whether room exists in array
  if (hostelRef && studentData.roomNumber) {
    await Hostel.updateOne(
      { _id: hostelRef._id, 'rooms.roomId': studentData.roomNumber },
      { $addToSet: { 'rooms.$.assignedStudents': student._id } }
    );
  }

  await createActivityLog('ADD_STUDENT', `Student ${student.studentName} (${student.registrationNumber}) added`, username || 'system', 'staff', assignedHostel, 'Student');

  sendResponse(res, true, student, 'Student created successfully');
}));

app.put('/api/students/:id', asyncHandler(async (req, res) => {
  const { studentName, fatherName, registrationNumber, degree, department, semester, district, assignedHostel, roomNumber, hostelFee, username, profileImage } = req.body;

  // Normalize room number format (e.g., "b-2" -> "B-02")
  const normalizeRoomNumber = (rn) => {
    if (!rn) return rn;
    const trimmed = String(rn).trim();
    const match = trimmed.match(/^([A-Za-z]+)[-\s]*(\d+)$/i);
    if (match) {
      const block = match[1].toUpperCase();
      const num = parseInt(match[2], 10);
      return `${block}-${String(num).padStart(2, '0')}`;
    }
    return trimmed;
  };

  const updateData = {
    studentName,
    fatherName,
    registrationNumber,
    degree,
    department,
    semester: semester ? Number(semester) : undefined,
    district,
    assignedHostel,
    roomNumber: normalizeRoomNumber(roomNumber),
    hostelFee: hostelFee || 'pending',
    ...(profileImage !== undefined ? { profileImage } : {})
  };

  const prev = await Student.findById(req.params.id);

  // Warden role restriction: can only update students within their assigned hostels
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      if (payload.role === 'warden') {
        const targetHostel = assignedHostel || prev?.assignedHostel;
        if (targetHostel && (!Array.isArray(payload.assignedHostels) || !payload.assignedHostels.includes(targetHostel))) {
          return sendResponse(res, false, null, 'Forbidden: not your hostel');
        }
      }
    }
  } catch (_) { }
  const student = await Student.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

  if (!student) {
    return sendResponse(res, false, null, 'Student not found');
  }
  // Sync hostel refs and room assignments
  let newHostel = null;
  if (assignedHostel) newHostel = await Hostel.findOne({ name: assignedHostel });
  if (newHostel) {
    student.hostelId = newHostel._id;
    student.roomId = updateData.roomNumber || undefined;
    await student.save();
  }
  // If hostel/room changed, remove from old room and add to new
  if (prev) {
    if (prev.assignedHostel && prev.roomNumber) {
      const oldHostel = await Hostel.findOne({ name: prev.assignedHostel });
      if (oldHostel) {
        await Hostel.updateOne(
          { _id: oldHostel._id, 'rooms.roomId': prev.roomNumber },
          { $pull: { 'rooms.$.assignedStudents': prev._id } }
        );
      }
    }
    if (newHostel && updateData.roomNumber) {
      await Hostel.updateOne(
        { _id: newHostel._id, 'rooms.roomId': updateData.roomNumber },
        { $addToSet: { 'rooms.$.assignedStudents': student._id } }
      );
    }
  }

  await createActivityLog('UPDATE_STUDENT', `Student ${student.studentName} (${student.registrationNumber}) updated`, username || 'system', 'staff', assignedHostel, 'Student');

  sendResponse(res, true, student, 'Student updated successfully');
}));



// Challans
app.get('/api/challans', asyncHandler(async (req, res) => {
  const challans = await Challan.find().sort({ createdAt: -1 });
  sendResponse(res, true, challans, 'Challans retrieved successfully');
}));

app.post('/api/challans/mark-paid', asyncHandler(async (req, res) => {
  const { registrationNumber, challanNumber, semester, username } = req.body;

  if (!registrationNumber || !challanNumber) {
    return sendResponse(res, false, null, 'Registration number and challan number are required');
  }

  const student = await Student.findOne({ registrationNumber });
  if (!student) {
    return sendResponse(res, false, null, 'Student not found');
  }

  // Update challan status if exists
  await Challan.findOneAndUpdate(
    { challanNumber },
    { status: 'paid', paidAt: new Date() },
    { new: true }
  );

  // Update student fee table
  const feeTable = student.feeTable || new Map();
  if (semester) {
    feeTable.set(`sem${semester}`, 'paid');
  }

  student.hostelFee = 'paid';
  student.challanNumber = challanNumber;
  student.feeTable = feeTable;
  await student.save();

  // Log the payment
  await createActivityLog('PAYMENT', `Payment marked for student ${student.studentName} (${registrationNumber}) - Semester ${semester}`, username || 'system', 'staff', student.assignedHostel, 'Payment');

  sendResponse(res, true, { student, challanNumber }, 'Payment marked successfully');
}));

// Fees (per-student semester table)
app.get('/api/fees/structure', asyncHandler(async (req, res) => {
  const students = await Student.find({}, 'studentName registrationNumber department feeTable');
  sendResponse(res, true, students, 'Fee structure retrieved successfully');
}));

// Lightweight PDF exports: return HTML with PDF headers (works as download)
app.get('/api/export/students.pdf', asyncHandler(async (req, res) => {
  const students = await Student.find({}, 'studentName registrationNumber assignedHostel roomNumber').lean();
  const rows = students.map(s => `<tr><td>${s.studentName || ''}</td><td>${s.registrationNumber || ''}</td><td>${s.assignedHostel || ''}</td><td>${s.roomNumber || ''}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Students</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-family:Arial;font-size:12px}h1{font-family:Arial}</style></head><body><h1>Students Export</h1><table><thead><tr><th>Name</th><th>Reg No</th><th>Hostel</th><th>Room</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="students.pdf"');
  return res.send(html);
}));

// Export students by hostel as PDF
app.get('/api/export/hostel/:hostelName/students.pdf', asyncHandler(async (req, res) => {
  const { hostelName } = req.params;
  const students = await Student.find({ assignedHostel: hostelName }, 'studentName registrationNumber department roomNumber').lean();

  const rows = students.map(s => `<tr><td>${s.studentName || ''}</td><td>${s.registrationNumber || ''}</td><td>${s.department || ''}</td><td>${s.roomNumber || ''}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>${hostelName} Students</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-family:Arial;font-size:12px}h1{font-family:Arial}</style></head><body><h1>${hostelName} - Students List</h1><table><thead><tr><th>Name</th><th>Reg No</th><th>Department</th><th>Room</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${hostelName}_students.pdf"`);
  return res.send(html);
}));

// Export fee management data as PDF
app.get('/api/export/fee-management.pdf', asyncHandler(async (req, res) => {
  const challans = await Challan.find({}).populate('studentId', 'studentName registrationNumber assignedHostel').lean();

  const rows = challans.map(c => `<tr><td>${c.studentName || ''}</td><td>${c.registrationNumber || ''}</td><td>${c.challanNumber || ''}</td><td>${c.amount || 0}</td><td>${c.status || ''}</td><td>${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : ''}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Fee Management</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-family:Arial;font-size:12px}h1{font-family:Arial}</style></head><body><h1>Fee Management Report</h1><table><thead><tr><th>Student Name</th><th>Reg No</th><th>Challan No</th><th>Amount</th><th>Status</th><th>Due Date</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="fee_management.pdf"');
  return res.send(html);
}));

app.get('/api/export/fees.pdf', asyncHandler(async (req, res) => {
  const challans = await Challan.find().lean();
  const rows = challans.map(c => `<tr><td>${c.studentName || ''}</td><td>${c.registrationNumber || ''}</td><td>${c.amount || ''}</td><td>${c.status || ''}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Fees</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-family:Arial;font-size:12px}h1{font-family:Arial}</style></head><body><h1>Fees Export</h1><table><thead><tr><th>Student</th><th>Reg No</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="fees.pdf"');
  return res.send(html);
}));

// Users CRUD
app.get('/api/users', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  const safe = users.map(u => ({ id: u._id, username: u.username, email: u.email, role: u.role, assignedHostels: u.assignedHostels, createdAt: u.createdAt }));
  sendResponse(res, true, safe, 'Users retrieved successfully');
}));

// Add user (new protected endpoint as per requirement)
app.post('/api/users/add', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const { username, email, password, role, assignedHostels } = req.body;

  if (!username || !email || !password || !role) {
    return sendResponse(res, false, null, 'Username, email, password and role are required', {
      username: !username ? 'Username is required' : null,
      email: !email ? 'Email is required' : null,
      password: !password ? 'Password is required' : null,
      role: !role ? 'Role is required' : null
    });
  }

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existingUser) {
    return sendResponse(res, false, null, 'User with this username/email already exists');
  }

  const hashed = await bcrypt.hash(password, 10);
  const userData = { username, email, password: hashed, role, assignedHostels: assignedHostels || [] };

  const user = await User.create(userData);

  await createActivityLog('ADD_USER', `User ${user.username} created with role ${user.role}`, username, role, null, 'User');

  const safeUser = { id: user._id, username: user.username, email: user.email, role: user.role, assignedHostels: user.assignedHostels };
  sendResponse(res, true, safeUser, 'User created successfully');
}));



app.put('/api/users/:id', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const { username, email, role, assignedHostels } = req.body;
  const updateData = { email, role, assignedHostels };

  const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

  if (!user) {
    return sendResponse(res, false, null, 'User not found');
  }

  await createActivityLog('UPDATE_USER', `User ${user.username} updated`, username || 'system', user.role, null, 'User');

  sendResponse(res, true, user, 'User updated successfully');
}));

app.delete('/api/users/:id', requireAuth, authorizeRole('admin', 'prohost'), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return sendResponse(res, false, null, 'User not found');
  }

  await createActivityLog('DELETE_USER', `User ${user.username} deleted`, req.query.username || 'system', user.role, null, 'User');

  sendResponse(res, true, null, 'User deleted successfully');
}));

// Logs
app.get('/api/logs', requireAuth, asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user?.role === 'warden') {
    // match by userId or username if userId is not recorded
    filter = { $or: [{ userId: req.user.id || req.user._id }, { username: req.user.username }] };
  }
  const logs = await Log.find(filter).sort({ createdAt: -1 });
  sendResponse(res, true, logs, 'Logs retrieved successfully');
}));

app.post('/api/logs', asyncHandler(async (req, res) => {
  const { action, description, username, role, hostel, userId, details, entityType } = req.body;

  if (!action || !username) {
    return sendResponse(res, false, null, 'Action and username are required');
  }

  const log = await Log.create({
    action,
    description: description || details || '',
    username,
    role: role || 'staff',
    hostel,
    userId,
    entityType
  });

  sendResponse(res, true, log, 'Log created successfully');
}));

// Enhanced logging for all activities
const createActivityLog = async (action, description, username, role = 'staff', hostel = null, entityType = 'System') => {
  try {
    await Log.create({
      action,
      description,
      username,
      role,
      hostel,
      entityType,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error creating activity log:', error);
  }
};

// Initialize default data (including default Admin)
const initializeDefaultData = async () => {
  try {
    // Define the 4 required hostels with their specifications (used only if DB empty)
    const requiredHostels = [
      {
        name: 'Yousaf Aziz Magsi Hostel',
        numberOfRooms: 110,
        capacityPerRoom: 4,
        totalCapacity: 440,
        warden: 'TBA'
      },
      {
        name: 'Hingol Hostel',
        numberOfRooms: 104,
        capacityPerRoom: 3,
        totalCapacity: 312,
        warden: 'TBA'
      },
      {
        name: 'Armabel Hostel',
        numberOfRooms: 126,
        capacityPerRoom: 3,
        totalCapacity: 378,
        warden: 'TBA'
      },
      {
        name: 'Porali Hostel',
        numberOfRooms: 50,
        capacityPerRoom: 3,
        totalCapacity: 150,
        warden: 'TBA'
      }
    ];

    // Seed only if collection is empty (preserve existing/updated data across restarts)
    const hostelCount = await Hostel.countDocuments();
    console.log(`Found ${hostelCount} hostels in database`);
    if (hostelCount === 0) {
      await Hostel.insertMany(requiredHostels);
      console.log('Created required hostels:', requiredHostels.map(h => h.name));
    } else {
      console.log('Hostels already exist; skipping seed');
    }

    // Ensure default Admin exists as per requirements
    let existingAdmin = await User.findOne({ $or: [{ username: 'Admin' }, { email: 'Admin@3456!' }] });
    if (!existingAdmin) {
      const hashed = await bcrypt.hash('Admin@3456!', 10);
      await User.create({
        username: 'Admin',
        email: 'Admin@3456!',
        password: hashed,
        role: 'admin',
        assignedHostels: []
      });
      console.log('Default Admin user created');
    } else if (!existingAdmin.password) {
      const hashed = await bcrypt.hash('Admin@3456!', 10);
      existingAdmin.password = hashed;
      existingAdmin.role = existingAdmin.role || 'admin';
      await existingAdmin.save();
      console.log('Default Admin password set');
    }

    console.log('Data initialization completed successfully');
  } catch (error) {
    console.error('Error initializing default data:', error);
  }
};

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);

  if (error.name === 'ValidationError') {
    const errors = {};
    Object.keys(error.errors).forEach(key => {
      errors[key] = error.errors[key].message;
    });
    return sendResponse(res, false, null, 'Validation failed', errors);
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return sendResponse(res, false, null, 'Duplicate entry', { [field]: `${field} must be unique` });
  }

  sendResponse(res, false, null, 'Internal server error', null);
});

const port = process.env.PORT || 4000;
app.listen(port, async () => {
  console.log(`HMS backend on http://localhost:${port}`);
  await initializeDefaultData();
});




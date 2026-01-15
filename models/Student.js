const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Hostel = require('../models/Hostel');
const User = require('../models/User');
const Student = require('../models/Student');

const studentSchema = new mongoose.Schema({
    name: String,
    hostel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel' },
    // ...other fields...
    fee_status: { type: String, enum: ['paid', 'overdue'], default: 'paid' } // Add if missing
});

router.get('/', async (req, res) => {
    const totalHostels = await Hostel.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const vacantPlaces = await Hostel.aggregate([
        // ...your existing vacant places logic...
    ]);
    const overdueStudents = await Student.countDocuments({ fee_status: 'overdue' }); // New metric

    res.json({
        totalHostels,
        activeUsers,
        vacantPlaces: vacantPlaces[0]?.vacant || 0,
        overdueStudents // Add this field
    });
});

module.exports = mongoose.model('Student', studentSchema);
module.exports = router;
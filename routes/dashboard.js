const express = require('express');
const router = express.Router();
const Hostel = require('../models/Hostel');
const User = require('../models/User');
const Student = require('../models/Student');

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

module.exports = router;
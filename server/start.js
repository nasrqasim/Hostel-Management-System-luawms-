// Simple server startup script for debugging
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Test hostels route
app.get('/api/hostels', (req, res) => {
  const defaultHostels = [
    { _id: '1', name: 'Armabel', warden: 'TBA', imageUrl: '../images.1/h1.jpg' },
    { _id: '2', name: 'Magsi', warden: 'TBA', imageUrl: '../images.1/h2.jfif' },
    { _id: '3', name: 'Hingol', warden: 'TBA', imageUrl: '../images.1/h3.jfif' },
    { _id: '4', name: 'Porali', warden: 'TBA', imageUrl: '../images.1/h4.jfif' },
    { _id: '5', name: 'Girls Hostel', warden: 'TBA', imageUrl: '../images.1/host2.jfif' }
  ];
  
  res.json({ success: true, data: defaultHostels, message: 'Hostels retrieved successfully' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`);
  console.log('MongoDB connection: Simulated (using static data)');
});


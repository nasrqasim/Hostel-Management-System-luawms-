# Hostel Management System

A comprehensive hostel management system for Lasbela University of Agriculture, Water and Marine Sciences (LUAWMS).

## Features

- **Hostel Management**: Add, update, delete hostels dynamically
- **User Management**: Create and manage system users (admin, warden, staff)
- **Student Management**: Register students and assign them to hostels
- **Fee Management**: Track semester-wise fee payments and generate challans
- **Dashboard**: Overview of system statistics and recent activities
- **Logs**: Audit trail of all system activities

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6 modules)
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Architecture**: REST API with unified response format

## Quick Start

### Prerequisites

1. **Node.js** (v14 or higher)
2. **MongoDB** (running locally on port 27017)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd FYP-Hostel-Management-system
   ```

2. **Install backend dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Create .env file in server directory
   echo "MONGODB_URI=mongodb://127.0.0.1:27017/hms" > .env
   echo "PORT=4000" >> .env
   ```

4. **Start MongoDB**
   - Make sure MongoDB is installed and running
   - Default connection: `mongodb://127.0.0.1:27017/hms`

5. **Start the backend server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # OR production mode
   npm start
   ```

6. **Open the frontend**
   - Navigate to the project root
   - Open `HTML/index.html` in your web browser
   - Or serve it using a local web server for best results

### Default Data

The system automatically creates default data on first startup:

**Default Hostels:**
- Armabel
- Magsi  
- Hingol
- Porali
- Girls Hostel

**Default Admin User:**
- Username: `admin`
- Email: `admin@hms.edu`
- Role: `admin`

### API Endpoints

All API endpoints return a unified response format:
```json
{
  "success": boolean,
  "data": any,
  "message": string,
  "errors": object,
  "timestamp": string
}
```

**Main Endpoints:**
- `GET /api/health` - Server health check
- `GET /api/hostels` - Get all hostels
- `POST /api/hostels` - Create new hostel
- `PUT /api/hostels/:id` - Update hostel
- `DELETE /api/hostels/:id` - Delete hostel
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `GET /api/students` - Get all students
- `POST /api/students` - Create new student
- `GET /api/challans` - Get all challans
- `POST /api/challans/mark-paid` - Mark challan as paid

## Usage

### Accessing the System

1. **Landing Page** (`index.html`)
   - View available hostels
   - Search hostels
   - Navigate to admin login

2. **Admin Dashboard** (`login.html` → `dashboard.html`)
   - Login with admin credentials
   - View system overview
   - Access all management features

3. **Hostel Management** (`hostels.html`)
   - Add new hostels
   - Edit existing hostels
   - Delete hostels (with reason)
   - Changes reflect immediately on index.html

4. **User Management** (`users.html`)
   - Create system users
   - Assign hostels to wardens
   - Manage user roles

5. **Student Management** (`students.html`)
   - Register new students
   - Assign students to hostels
   - Track student information

6. **Fee Management** (`feeManagement.html`)
   - Mark payments as paid
   - View fee defaulters
   - Track semester-wise fee structure
   - Generate and manage challans

## Dynamic Features

- **Real-time Updates**: All CRUD operations update the UI immediately without page refresh
- **Hostel Dropdown Population**: All forms automatically populate hostel options from the database
- **Unified Error Handling**: Consistent error messages across all operations
- **Responsive Design**: Works on desktop and mobile devices

## Database Collections

- **hostels**: Hostel information (name, warden, image)
- **users**: System users (username, email, role, assigned hostels)
- **students**: Student records (name, registration number, department, hostel assignment, fee status)
- **challans**: Fee challans (student, amount, status, due date)
- **logs**: System activity logs (action, description, timestamp, user)

## Development

### Project Structure
```
FYP-Hostel-Management-system/
├── HTML/              # Frontend HTML files
├── CSS/               # Stylesheets
├── JS/                # Frontend JavaScript modules
├── images.1/          # Static images
├── server/            # Backend Node.js application
│   ├── src/
│   │   └── server.js  # Main server file
│   ├── package.json
│   └── .env          # Environment variables
└── README.md
```

### Adding New Features

1. **Backend**: Add routes in `server/src/server.js`
2. **Frontend**: Create/update JS modules in `JS/` directory
3. **UI**: Update HTML files in `HTML/` directory
4. **Styling**: Modify CSS files in `CSS/` directory

### Error Handling

The system includes comprehensive error handling:
- MongoDB connection errors
- Validation errors
- Duplicate entry errors
- Network request failures
- User-friendly error messages

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check if MongoDB is running
   - Verify port 4000 is available
   - Check .env file configuration

2. **Database connection failed**
   - Ensure MongoDB is installed and running
   - Check MONGODB_URI in .env file
   - Verify database permissions

3. **Frontend API calls failing**
   - Confirm backend server is running on port 4000
   - Check browser console for CORS errors
   - Verify API endpoints in frontend code

4. **Hostels not showing in dropdowns**
   - Check if default hostels were created
   - Verify API response format
   - Check browser console for JavaScript errors

### Logs

- Backend logs: Check console output where server is running
- Frontend logs: Check browser developer tools console
- Database logs: Check MongoDB logs

## License

This project is developed for educational purposes at LUAWMS.

## Support

For technical issues or questions, check the browser console and server logs for detailed error information.

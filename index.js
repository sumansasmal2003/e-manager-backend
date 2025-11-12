const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const noteRoutes = require('./routes/noteRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const meetingRoutes = require('./routes/meetingRoutes'); // <-- ADD THIS
const statsRoutes = require('./routes/statsRoutes');
const userRoutes = require('./routes/userRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const teamNoteRoutes = require('./routes/teamNoteRoutes');
const activityRoutes = require('./routes/activityRoutes');
const oneOnOneRoutes = require('./routes/oneOnOneRoutes');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// A simple test route
app.get('/', (req, res) => {
  res.send('E Manager API is running!');
});

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/meetings', meetingRoutes); // <-- ADD THIS
app.use('/api/stats', statsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/teamnotes', teamNoteRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/oneonones', oneOnOneRoutes);
app.use('/api/search', require('./routes/searchRoutes'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

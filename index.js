const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
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
const aiChatRoutes = require('./routes/aiChatRoutes');
const aiUsageRoutes = require('./routes/aiUsageRoutes');
const systemLogRoutes = require('./routes/systemLogRoutes');
const emailRoutes = require('./routes/emailRoutes');
const { generalLimiter } = require('./middleware/rateLimitMiddleware');
const insightRoutes = require('./routes/insightRoutes');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts if needed
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
        imgSrc: ["'self'", "data:", "https:"], // Allow images from HTTPS and data URIs
        connectSrc: ["'self'", "https://api.zoom.us"], // Allow connections to external APIs if needed
      },
    },
    crossOriginEmbedderPolicy: false, // Disable if you have issues loading cross-origin resources
  })
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  // Sanitize inputs in-place without reassigning the properties
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  if (req.query) mongoSanitize.sanitize(req.query);
  next();
});
app.use(generalLimiter);

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
app.use('/api/auth/google', require('./routes/googleAuthRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/chat', aiChatRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/system-logs', systemLogRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/careers', require('./routes/careerRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

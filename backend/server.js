const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/maintenance', require('./routes/maintenanceRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/warden', require('./routes/wardenRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'ResolveX API is running', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const escalationScheduler = require('./services/escalationScheduler');

// Connect to MongoDB, then start the HTTP server, then start the escalation
// scheduler — in that order, so the scheduler never runs before the DB is ready.
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);

      // Escalation scheduler (STEP 6). Set ESCALATION_SCHEDULER=off to disable
      // (e.g. for isolated test runs). Interval via ESCALATION_INTERVAL_MS.
      if (process.env.ESCALATION_SCHEDULER === 'off') {
        console.log('[ESCALATION-SCHEDULER] Disabled via ESCALATION_SCHEDULER=off');
      } else {
        escalationScheduler.start();
      }
    });

    // Graceful shutdown — stop the scheduler timer, then close the server.
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down`);
      escalationScheduler.stop();
      server.close(() => {
        mongoose.connection.close(false).finally(() => process.exit(0));
      });
      // Hard exit if something hangs.
      setTimeout(() => process.exit(0), 10000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = app;

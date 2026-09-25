const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { PORT, corsOrigin, CORS_ORIGINS, NODE_ENV, SCADA_AUTO_START, SCADA_DEFAULT_INDUSTRY } = require('./config/env');
const connectDB = require('./config/db');
const { isDatabaseConnected } = require('./config/db');
const { initSocket } = require('./config/socket');
const errorHandler = require('./middleware/errorHandler');

const commandRoutes = require('./routes/commandRoutes');
const alertRoutes = require('./routes/alertRoutes');
const mapRoutes = require('./routes/mapRoutes');
const forensicRoutes = require('./routes/forensicRoutes');
const authRoutes = require('./routes/authRoutes');

const { startSimulation, stopSimulation } = require('./services/packetBroker');
const { startCommandMonitor, stopCommandMonitor } = require('./jobs/commandMonitor');
const { startAlertDispatcher, stopAlertDispatcher } = require('./jobs/alertDispatcher');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/forensic', forensicRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'GuardianSync Server',
    status: 'ok',
    health: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  const database = isDatabaseConnected();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'degraded',
    database: database ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    env: NODE_ENV,
  });
});

app.use(errorHandler);

// Boot
// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  stopSimulation();
  stopCommandMonitor();
  stopAlertDispatcher();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at', promise, 'reason:', reason);
});

const boot = async () => {
  await connectDB();
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`\n🛡️  GuardianSync Server running on port ${PORT}`);
    console.log(`   Environment: ${NODE_ENV}`);
    console.log(`   CORS origins: ${CORS_ORIGINS.join(', ')}\n`);

    // Start background services
    if (SCADA_AUTO_START) {
      startSimulation(SCADA_DEFAULT_INDUSTRY);
    }
    startCommandMonitor();
    startAlertDispatcher();
  });
};

boot().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, server };

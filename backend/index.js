'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { v4: uuidv4 } = require('uuid');
const { redisClient } = require('./config/redis');

const app = express();

// Render and most cloud providers sit behind a load balancer — this makes req.ip reliable
app.set('trust proxy', 1);

// Security headers (Content-Security-Policy, X-Frame-Options, etc.)
app.use(helmet());

// CORS — allow the frontend origin and localhost in dev
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin header (curl, Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Attach a unique request ID to every request for tracing logs across services
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
});

// Body parsers — 10kb limit prevents large payload attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Express 5 defines req.query as a read-only getter; express-mongo-sanitize v2 tries to
// overwrite it directly which throws. This patch makes it writable.
// Remove when express-mongo-sanitize releases v3+ with Express 5 support.
app.use((req, _res, next) => {
  Object.defineProperty(req, 'query', {
    value: req.query,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  next();
});

// Strip MongoDB operators ($where, $gt, etc.) from req.body and req.params
app.use(mongoSanitize());

// Prevent HTTP parameter pollution (e.g. ?status=Paid&status=Cancelled)
app.use(hpp());

// Health check — used by Render, Docker, and uptime monitors
app.get('/health', async (_req, res) => {
  let redisStatus = 'disconnected';
  try {
    const pong = await redisClient.ping();
    redisStatus = pong === 'PONG' ? 'connected' : 'disconnected';
  } catch {
    redisStatus = 'disconnected';
  }

  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth',        require('./routes/authRoutes'));
app.use('/api/admin/auth',  require('./routes/adminAuthRoutes'));
app.use('/api/products',    require('./routes/productRoutes'));
app.use('/api/orders',      require('./routes/orderRoutes'));
app.use('/api/payment',     require('./routes/paymentRoutes'));
app.use('/api/analytics',   require('./routes/analyticsRoutes'));
app.use('/api/reviews',     require('./routes/reviewRoutes'));

// Root endpoint — useful for quickly checking the API is alive
app.get('/', (_req, res) => {
  res.json({
    name: 'ShopNest API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth:       '/api/auth',
      adminAuth:  '/api/admin/auth',
      products:   '/api/products',
      orders:     '/api/orders',
      payment:    '/api/payment',
      analytics:  '/api/analytics',
      reviews:    '/api/reviews',
      health:     '/health',
    },
  });
});

// 404 — route not found
app.use((_req, res) => {
  res.status(404).json({ status: 404, message: 'Route not found' });
});

// Global error handler — all controllers use next(err) to reach here
app.use((err, _req, res, _next) => {
  const status = err.status || 500;

  // Never leak stack traces or internal error messages in production
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  if (status >= 500) {
    console.error(`[Error] ${err.message}`, { stack: err.stack });
  }

  res.status(status).json({ status, message });
});

module.exports = app;

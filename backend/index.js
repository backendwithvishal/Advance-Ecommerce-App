'use strict';

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();

// --- Trust proxy: required when behind a load-balancer / Nginx so req.ip is correct
app.set('trust proxy', 1);

// --- Security headers
app.use(helmet());

// --- CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// --- Request-ID middleware: adds a unique x-request-id header for distributed tracing (QW11)
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// --- Body parsing with size limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- Patch req.query to be writable (Express 5 defines it as a read-only getter;
//     express-mongo-sanitize v2.x does a direct assignment which throws without this patch.
//     Remove this when express-mongo-sanitize v3+ (Express 5 compatible) is published.)
function patchQueryWritable(req, _res, next) {
  Object.defineProperty(req, 'query', {
    value: req.query,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  next();
}
app.use(patchQueryWritable);

// --- NoSQL injection sanitization
app.use(mongoSanitize());

// --- HTTP parameter pollution protection
app.use(hpp());

// --- Health check endpoint (DO4 fix + Docker readiness probe support)
app.get('/health', async (_req, res) => {
  const { redisClient } = require('./config/redis');

  let redisStatus = 'disconnected';
  try {
    await redisClient.ping();
    redisStatus = 'connected';
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

// --- Routes
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/products',  require('./routes/productRoutes'));
app.use('/api/orders',    require('./routes/orderRoutes'));
app.use('/api/payment',   require('./routes/paymentRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/reviews',   require('./routes/reviewRoutes'));

// --- Home route
app.get('/', (_req, res) => {
  res.json({
    name: 'ShopNest API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth:      '/api/auth',
      products:  '/api/products',
      orders:    '/api/orders',
      payment:   '/api/payment',
      analytics: '/api/analytics',
      reviews:   '/api/reviews',
      health:    '/health',
    },
    docs: 'Import ShopNest_Postman_Collection.json into Postman to explore all endpoints',
  });
});

// --- 404 handler
app.use((_req, res) => {
  res.status(404).json({ status: 404, message: 'Route not found' });
});

// --- Global error handler: centralizes all error responses
// Controllers call next(error) instead of inline res.status(500) so all 500s pass through here
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';
  if (status >= 500) console.error('[Error]', err);
  res.status(status).json({ status, message });
});

module.exports = app;

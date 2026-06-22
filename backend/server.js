require('dotenv').config();

// Check required env vars at startup — warn but don't crash on optional ones
const REQUIRED_ENV = [
  'MONGO_URI',
  'JWT_SECRET',
];

const WARN_ENV = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'GMAIL_USER',
  'GMAIL_PASS',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

let startupFailed = false;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Startup] FATAL: Missing required env var: ${key}`);
    startupFailed = true;
  }
}
if (startupFailed) process.exit(1);

for (const key of WARN_ENV) {
  if (!process.env[key]) {
    console.warn(`[Startup] WARNING: ${key} is not set — related features will be disabled`);
  }
}

const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const startWorkers = require('./workers');
const app = require('./index');

const PORT = process.env.PORT || 5000;

// Catch anything that slips through — prevents silent crashes in production
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  process.exit(1);
});

const start = async () => {
  // MongoDB is required — crash on failure
  await connectDB();

  // Redis is optional — app degrades gracefully (no caching, no rate limiting)
  await connectRedis();

  // RabbitMQ is optional — app degrades gracefully (no background jobs)
  await connectRabbitMQ();
  startWorkers();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ShopNest API running on port ${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
  });
};

start().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});

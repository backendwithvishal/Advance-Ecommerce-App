const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { redisClient } = require('../config/redis');
const { getCache, setCache, delCache } = require('../utils/cache');
const { publishMessage } = require('../config/rabbitmq');
const sendEmail = require('../utils/sendEmail');

// Generate a short-lived access token (15 min)
function generateAccessToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

// Generate a long-lived refresh token and store its hash in Redis
async function generateRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await redisClient.set(`refresh:${userId}`, hash, 'EX', 30 * 24 * 60 * 60);
  return token;
}

async function register(name, email, password) {
  const exists = await User.findOne({ email });
  if (exists) {
    const err = new Error('User already exists');
    err.status = 400;
    throw err;
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed });

  await delCache('users:all');

  // Fire welcome email + OTP via message queue
  const otp = Math.floor(100000 + Math.random() * 900000);
  await publishMessage('user.registered', { name: user.name, email: user.email, otp });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = await generateRefreshToken(user._id);

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: accessToken,
    refreshToken,
  };
}

async function login(email, password) {
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = await generateRefreshToken(user._id);

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: accessToken,
    refreshToken,
  };
}

async function refresh(token, userId) {
  if (!token || !userId) {
    const err = new Error('refreshToken and userId are required');
    err.status = 400;
    throw err;
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const stored = await redisClient.get(`refresh:${userId}`);

  if (!stored || stored !== hash) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  const user = await User.findById(userId).select('-password');
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  // Rotate both tokens on each refresh
  const accessToken = generateAccessToken(user._id);
  const newRefreshToken = await generateRefreshToken(user._id);

  return { token: accessToken, refreshToken: newRefreshToken };
}

async function logout(userId) {
  await redisClient.del(`refresh:${userId}`);
}

// Send a password reset link to the user's email
async function forgotPassword(email) {
  const user = await User.findOne({ email });

  // Don't reveal whether email exists or not — always return same message
  if (!user) return;

  // Generate a random reset token, store its hash in Redis for 1 hour
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(resetToken).digest('hex');
  await redisClient.set(`reset:${hash}`, String(user._id), 'EX', 60 * 60);

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  await sendEmail({
    email: user.email,
    subject: 'ShopNest — Password Reset Request',
    message: `
      <h2>Password Reset</h2>
      <p>Hi ${user.name},</p>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in <strong>1 hour</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

// Validate the reset token and update the password
async function resetPassword(token, newPassword) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const userId = await redisClient.get(`reset:${hash}`);

  if (!userId) {
    const err = new Error('Reset token is invalid or has expired');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  // Invalidate the reset token and any active refresh tokens immediately
  await redisClient.del(`reset:${hash}`);
  await redisClient.del(`refresh:${userId}`);
}

async function getUsers() {
  const cached = await getCache('users:all');
  if (cached) return cached;

  const users = await User.find({}).select('-password');
  await setCache('users:all', users, 120);
  return users;
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, getUsers };

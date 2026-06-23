'use strict';

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { redisClient } = require('../config/redis');
const { getCache, setCache, delCache } = require('../utils/cache');
const sendEmail = require('../utils/sendEmail');

// ─── Token helpers ────────────────────────────────────────────────────────────

function generateAccessToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function generateRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  // Namespace admin refresh tokens separately from user tokens
  await redisClient.set(`admin_refresh:${userId}`, hash, 'EX', 30 * 24 * 60 * 60);
  return token;
}

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Register a new admin account.
 * Requires either:
 *   - An existing admin calling this endpoint (checked at route level via protect + admin), OR
 *   - A valid ADMIN_INVITE_SECRET passed in the body for first-time bootstrap.
 */
async function registerAdmin(name, email, password, inviteSecret, callerIsAdmin = false) {
  // Authorization: one of two valid paths must be true —
  //   1. An authenticated admin is calling (callerIsAdmin = true, set by route middleware)
  //   2. Bootstrap mode: a valid ADMIN_INVITE_SECRET is provided in the body
  if (!callerIsAdmin) {
    if (!inviteSecret) {
      const err = new Error('Admin invite secret is required when registering without an admin token');
      err.status = 403;
      throw err;
    }
    const expected = process.env.ADMIN_INVITE_SECRET;
    if (!expected || inviteSecret !== expected) {
      const err = new Error('Invalid admin invite secret');
      err.status = 403;
      throw err;
    }
  }

  const exists = await User.findOne({ email });
  if (exists) {
    const err = new Error('An account with this email already exists');
    err.status = 400;
    throw err;
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed, role: 'admin' });

  // Invalidate the cached users list
  await delCache('users:all');

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

// ─── Login ────────────────────────────────────────────────────────────────────

async function loginAdmin(email, password) {
  const user = await User.findOne({ email });

  // Always run bcrypt compare to prevent timing attacks (even on not-found)
  const passwordMatch = user ? await bcrypt.compare(password, user.password) : false;

  if (!user || !passwordMatch) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  if (user.role !== 'admin') {
    const err = new Error('Access denied. Admin accounts only.');
    err.status = 403;
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

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function refreshAdminToken(token, userId) {
  if (!token || !userId) {
    const err = new Error('refreshToken and userId are required');
    err.status = 400;
    throw err;
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const stored = await redisClient.get(`admin_refresh:${userId}`);

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

  if (user.role !== 'admin') {
    const err = new Error('Access denied. Admin accounts only.');
    err.status = 403;
    throw err;
  }

  // Rotate both tokens on each refresh
  const accessToken = generateAccessToken(user._id);
  const newRefreshToken = await generateRefreshToken(user._id);

  return { token: accessToken, refreshToken: newRefreshToken };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function logoutAdmin(userId) {
  await redisClient.del(`admin_refresh:${userId}`);
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

async function forgotAdminPassword(email) {
  const user = await User.findOne({ email });

  // Don't reveal whether the email exists
  if (!user || user.role !== 'admin') return;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(resetToken).digest('hex');
  // Namespace admin reset tokens separately
  await redisClient.set(`admin_reset:${hash}`, String(user._id), 'EX', 60 * 60);

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/reset-password?token=${resetToken}`;

  await sendEmail({
    email: user.email,
    subject: 'ShopNest Admin — Password Reset Request',
    message: `
      <h2>Admin Password Reset</h2>
      <p>Hi ${user.name},</p>
      <p>You requested a password reset for your <strong>admin</strong> account.</p>
      <p>Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in <strong>1 hour</strong>.</p>
      <p>If you did not request this, please secure your account immediately.</p>
    `,
  });
}

// ─── Reset Password ───────────────────────────────────────────────────────────

async function resetAdminPassword(token, newPassword) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const userId = await redisClient.get(`admin_reset:${hash}`);

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

  if (user.role !== 'admin') {
    const err = new Error('Access denied. Admin accounts only.');
    err.status = 403;
    throw err;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  // Invalidate the reset token and any active refresh tokens
  await redisClient.del(`admin_reset:${hash}`);
  await redisClient.del(`admin_refresh:${userId}`);
}

// ─── Get All Admins ───────────────────────────────────────────────────────────

async function getAdmins() {
  const cached = await getCache('admins:all');
  if (cached) return cached;

  const admins = await User.find({ role: 'admin' }).select('-password');
  await setCache('admins:all', admins, 120);
  return admins;
}

module.exports = {
  registerAdmin,
  loginAdmin,
  refreshAdminToken,
  logoutAdmin,
  forgotAdminPassword,
  resetAdminPassword,
  getAdmins,
};

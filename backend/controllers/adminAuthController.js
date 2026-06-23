'use strict';

const adminAuthService = require('../services/adminAuthService');

// POST /api/admin/auth/register
const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password, inviteSecret } = req.body;
    // req.user is populated by optionalProtect when a valid admin token is present
    const callerIsAdmin = !!(req.user && req.user.role === 'admin');
    const result = await adminAuthService.registerAdmin(name, email, password, inviteSecret, callerIsAdmin);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/auth/login
const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await adminAuthService.loginAdmin(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/auth/refresh
const refreshAdminToken = async (req, res, next) => {
  try {
    const { refreshToken, userId } = req.body;
    const result = await adminAuthService.refreshAdminToken(refreshToken, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/auth/logout
const logoutAdmin = async (req, res, next) => {
  try {
    await adminAuthService.logoutAdmin(req.user._id);
    res.json({ message: 'Admin logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/auth/forgot-password
const forgotAdminPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    await adminAuthService.forgotAdminPassword(email);
    // Always return the same message — don't reveal whether the email exists
    res.json({ message: 'If an admin account with that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/auth/reset-password
const resetAdminPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    await adminAuthService.resetAdminPassword(token, password);
    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/auth/admins
const getAdmins = async (_req, res, next) => {
  try {
    const admins = await adminAuthService.getAdmins();
    res.json(admins);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  refreshAdminToken,
  logoutAdmin,
  forgotAdminPassword,
  resetAdminPassword,
  getAdmins,
};

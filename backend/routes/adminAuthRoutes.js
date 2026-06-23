'use strict';

const express = require('express');
const { body } = require('express-validator');
const {
  registerAdmin,
  loginAdmin,
  refreshAdminToken,
  logoutAdmin,
  forgotAdminPassword,
  resetAdminPassword,
  getAdmins,
} = require('../controllers/adminAuthController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

/**
 * POST /api/admin/auth/register
 *
 * Two modes:
 *   1. Bootstrap  — no admin exists yet, pass `inviteSecret` in the body
 *   2. Authorized — an existing admin calls this (protect + admin middleware)
 *
 * The route accepts both cases by making protect optional via a custom
 * middleware that checks for a token but doesn't reject missing ones —
 * the service layer handles the authorization logic.
 */
const optionalProtect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Token present — run full protect middleware
    return protect(req, res, () => {
      // After protect succeeds, enforce admin role
      return admin(req, res, next);
    });
  }
  // No token — bootstrap mode; service will validate inviteSecret
  next();
};

// POST /api/admin/auth/register
router.post(
  '/register',
  rateLimiter.strict,
  optionalProtect,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  registerAdmin
);

// POST /api/admin/auth/login
router.post(
  '/login',
  rateLimiter.strict,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  loginAdmin
);

// POST /api/admin/auth/refresh
router.post(
  '/refresh',
  rateLimiter.standard,
  [
    body('refreshToken').notEmpty().withMessage('refreshToken is required'),
    body('userId').notEmpty().withMessage('userId is required'),
  ],
  validate,
  refreshAdminToken
);

// POST /api/admin/auth/logout  — must be a logged-in admin
router.post('/logout', protect, admin, logoutAdmin);

// POST /api/admin/auth/forgot-password
router.post(
  '/forgot-password',
  rateLimiter.strict,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  ],
  validate,
  forgotAdminPassword
);

// POST /api/admin/auth/reset-password
router.post(
  '/reset-password',
  rateLimiter.strict,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  resetAdminPassword
);

// GET /api/admin/auth/admins  — admin only
router.get('/admins', protect, admin, getAdmins);

module.exports = router;

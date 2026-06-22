const express = require('express');
const { body } = require('express-validator');
const {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  getUsers,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  rateLimiter.strict,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  registerUser
);

// POST /api/auth/login
router.post(
  '/login',
  rateLimiter.strict,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  loginUser
);

// POST /api/auth/refresh  — get a new access token using a refresh token
router.post(
  '/refresh',
  rateLimiter.standard,
  [
    body('refreshToken').notEmpty().withMessage('refreshToken is required'),
    body('userId').notEmpty().withMessage('userId is required'),
  ],
  validate,
  refreshToken
);

// POST /api/auth/logout  — revoke the refresh token
router.post('/logout', protect, logoutUser);

// POST /api/auth/forgot-password  — send a reset link to the user's email
router.post(
  '/forgot-password',
  rateLimiter.strict,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  ],
  validate,
  forgotPassword
);

// POST /api/auth/reset-password  — set a new password using the token from the email
router.post(
  '/reset-password',
  rateLimiter.strict,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  resetPassword
);

// GET /api/auth/users  — admin only
router.get('/users', protect, admin, getUsers);

module.exports = router;

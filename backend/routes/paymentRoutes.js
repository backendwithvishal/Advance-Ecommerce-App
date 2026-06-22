const express = require('express');
const { body } = require('express-validator');
const { createOrder, confirmPayment, verifyPayment } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/payment/order  — create Razorpay order from our Order ID
router.post(
  '/order',
  protect,
  rateLimiter.payment,
  [
    body('orderId').trim().notEmpty().withMessage('orderId is required'),
  ],
  validate,
  createOrder
);

// POST /api/payment/confirm  — confirm payment with HMAC verification + ownership check
router.post(
  '/confirm',
  protect,
  rateLimiter.payment,
  [
    body('razorpay_order_id').trim().notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').trim().notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').trim().isLength({ min: 64, max: 64 }).withMessage('razorpay_signature must be 64 hex chars'),
    body('orderId').trim().notEmpty().withMessage('orderId is required'),
  ],
  validate,
  confirmPayment
);

// POST /api/payment/verify  — standalone HMAC signature verification
router.post(
  '/verify',
  protect,
  rateLimiter.payment,
  [
    body('razorpay_order_id').trim().notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').trim().notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').trim().isLength({ min: 64, max: 64 }).withMessage('razorpay_signature must be 64 hex chars'),
  ],
  validate,
  verifyPayment
);

module.exports = router;

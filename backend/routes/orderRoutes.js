const express = require('express');
const { body, query } = require('express-validator');
const { addOrderItems, getMyOrders, getOrders, updateOrderStatus } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/orders  — create order
router.post(
  '/',
  protect,
  rateLimiter.standard,
  [
    body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
    body('items.*.productId').notEmpty().withMessage('Each item must have a productId'),
    body('items.*.qty').isInt({ min: 1 }).withMessage('Each item qty must be a positive integer'),
    body('address.fullName').trim().notEmpty().withMessage('address.fullName is required'),
    body('address.street').trim().notEmpty().withMessage('address.street is required'),
    body('address.city').trim().notEmpty().withMessage('address.city is required'),
    body('address.postalCode').trim().notEmpty().withMessage('address.postalCode is required'),
    body('address.country').trim().notEmpty().withMessage('address.country is required'),
  ],
  validate,
  addOrderItems
);

// GET /api/orders  — admin: list all orders (paginated)
router.get(
  '/',
  protect,
  admin,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100'),
    query('status').optional().isIn(['Pending', 'Shipped', 'Delivered', 'Cancelled']).withMessage('Invalid status'),
  ],
  validate,
  getOrders
);

// GET /api/orders/myorders  — current user's orders (paginated)
router.get('/myorders', protect, getMyOrders);

// PUT /api/orders/:id/status  — admin: update order status
router.put(
  '/:id/status',
  protect,
  admin,
  [
    body('status')
      .isIn(['Pending', 'Shipped', 'Delivered', 'Cancelled'])
      .withMessage('Invalid order status'),
  ],
  validate,
  updateOrderStatus
);

module.exports = router;

const express = require('express');
const { body, param } = require('express-validator');
const { createReview, getProductReviews, deleteReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/reviews  — create a review (authenticated users)
router.post(
  '/',
  protect,
  rateLimiter.standard,
  [
    body('productId').notEmpty().withMessage('productId is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5'),
    body('comment').trim().notEmpty().withMessage('comment is required'),
  ],
  validate,
  createReview
);

// GET /api/reviews/:productId  — list all reviews for a product (public)
router.get(
  '/:productId',
  [
    param('productId').notEmpty().withMessage('productId is required'),
  ],
  validate,
  getProductReviews
);

// DELETE /api/reviews/:id  — delete a review (author or admin)
router.delete('/:id', protect, deleteReview);

module.exports = router;

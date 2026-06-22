const reviewService = require('../services/reviewService');

const createReview = async (req, res, next) => {
  try {
    const { productId, rating, comment } = req.body;
    const review = await reviewService.createReview(
      req.user._id,
      req.user.name,
      productId,
      rating,
      comment
    );
    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
};

const getProductReviews = async (req, res, next) => {
  try {
    const reviews = await reviewService.getReviewsByProduct(req.params.productId);
    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    await reviewService.deleteReview(req.params.id, req.user._id, req.user.role);
    res.json({ message: 'Review removed' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReview, getProductReviews, deleteReview };

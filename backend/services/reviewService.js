const Review = require('../models/Review');

async function createReview(userId, userName, productId, rating, comment) {
  try {
    const review = await Review.create({ userId, name: userName, productId, rating, comment });
    // Product rating is auto-updated by the Review post-save hook
    return review;
  } catch (err) {
    if (err.code === 11000) {
      const e = new Error('You have already reviewed this product');
      e.status = 400;
      throw e;
    }
    throw err;
  }
}

async function getReviewsByProduct(productId) {
  return Review.find({ productId }).sort({ createdAt: -1 });
}

async function deleteReview(reviewId, userId, userRole) {
  const review = await Review.findById(reviewId);
  if (!review) {
    const err = new Error('Review not found');
    err.status = 404;
    throw err;
  }

  // Only the author or an admin can delete a review
  if (String(review.userId) !== String(userId) && userRole !== 'admin') {
    const err = new Error('You are not allowed to delete this review');
    err.status = 403;
    throw err;
  }

  await review.deleteOne();
}

module.exports = { createReview, getReviewsByProduct, deleteReview };

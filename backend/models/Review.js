const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  name:      { type: String, required: true },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  comment:   { type: String, required: true },
}, { timestamps: true });

// Compound unique index — prevents a user from reviewing the same product twice (D2 fix)
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// Post-save hook: recalculate product.ratings and numReviews (D3 fix)
const updateProductRating = async (productId) => {
  const Product = mongoose.model('Product');
  const stats = await mongoose.model('Review').aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(String(productId)) } },
    {
      $group: {
        _id: '$productId',
        avgRating: { $avg: '$rating' },
        count:     { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratings:    Math.round(stats[0].avgRating * 10) / 10,
      numReviews: stats[0].count,
    });
  } else {
    await Product.findByIdAndUpdate(productId, { ratings: 0, numReviews: 0 });
  }
};

reviewSchema.post('save', async function () {
  await updateProductRating(this.productId);
});

reviewSchema.post('deleteOne', { document: true }, async function () {
  await updateProductRating(this.productId);
});

module.exports = mongoose.model('Review', reviewSchema);

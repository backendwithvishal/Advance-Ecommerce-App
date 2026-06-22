const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, required: true },
  price:       { type: Number, required: true },
  category:    { type: String, required: true },
  stock:       { type: Number, required: true, default: 0 },
  imageUrl:    { type: String, required: true },
  ratings:     { type: Number, default: 0 },
  numReviews:  { type: Number, default: 0 },
}, { timestamps: true });

// Compound index for category browsing + price sorting (P2 fix)
productSchema.index({ category: 1, price: 1 });

// Full-text search index on name and description (P2 fix)
productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', productSchema);

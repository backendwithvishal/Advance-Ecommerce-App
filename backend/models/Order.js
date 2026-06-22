const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      qty:       { type: Number, required: true },
      price:     { type: Number, required: true }, // Snapshot of product price at time of purchase
    }
  ],
  totalAmount: { type: Number, required: true },
  address: {
    fullName:   { type: String, required: true },
    street:     { type: String, required: true },
    city:       { type: String, required: true },
    postalCode: { type: String, required: true },
    country:    { type: String, required: true },
  },
  paymentId: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending',
  },
}, { timestamps: true });

// Index for sorting a user's orders by recency (P2 fix)
orderSchema.index({ userId: 1, createdAt: -1 });

// Index for filtering orders by status (P2 fix)
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);

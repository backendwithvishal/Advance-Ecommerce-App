const mongoose = require('mongoose');

const paymentAuditSchema = new mongoose.Schema({
  orderId:              { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  userId:               { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  razorpay_order_id:    { type: String, required: true },
  razorpay_payment_id:  { type: String, required: true },
  timestamp:            { type: Date, default: Date.now },
  meta:                 { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

// Quick lookup by Razorpay payment ID
paymentAuditSchema.index({ razorpay_payment_id: 1 });

module.exports = mongoose.model('PaymentAudit', paymentAuditSchema);

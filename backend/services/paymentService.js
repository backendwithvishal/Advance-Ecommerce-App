const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const { getCache, setCache } = require('../utils/cache');
const { publishMessage } = require('../config/rabbitmq');

// One Razorpay instance shared across all requests
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

function ensureRazorpay() {
  if (!razorpay) {
    const err = new Error('Payment service is not configured');
    err.status = 503;
    throw err;
  }
}

// Verify the HMAC-SHA256 signature Razorpay attaches to each payment
function verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
  // Guard: signature must be exactly 64 hex characters before we call timingSafeEqual
  // (timingSafeEqual throws if buffer lengths don't match)
  if (!razorpay_signature || !/^[0-9a-fA-F]{64}$/.test(razorpay_signature)) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(razorpay_signature, 'hex'),
    Buffer.from(expected, 'hex')
  );

  if (!valid) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }
}

async function createPaymentOrder(userId, orderId) {
  ensureRazorpay();

  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  if (order.status !== 'Pending') {
    const err = new Error('This order cannot be paid for in its current state');
    err.status = 400;
    throw err;
  }

  // Return cached Razorpay order if we already created one (prevents duplicate charges)
  const dedupKey = `payment:dedup:${userId}:${orderId}`;
  const cached = await getCache(dedupKey);
  if (cached) return cached;

  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(order.totalAmount * 100), // Razorpay expects paise
    currency: 'INR',
    receipt: String(orderId),
  });

  await setCache(dedupKey, razorpayOrder, 600);
  return razorpayOrder;
}

async function confirmPayment(userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId) {
  ensureRazorpay();

  // 1. Verify HMAC signature — must happen before any DB write
  verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

  // 2. Double-check payment status on Razorpay's side
  let payment;
  try {
    payment = await razorpay.payments.fetch(razorpay_payment_id);
  } catch (err) {
    const e = new Error('Could not verify payment with Razorpay');
    e.status = 502;
    throw e;
  }

  if (!['captured', 'authorized'].includes(payment.status)) {
    const err = new Error(`Payment is not complete (status: ${payment.status})`);
    err.status = 402;
    throw err;
  }

  // 3. Update our order — userId in filter ensures users can't confirm other people's orders
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, userId },
    { paymentId: razorpay_payment_id, status: 'Paid' },
    { new: true }
  );

  if (!updated) {
    const err = new Error('Order not found or access denied');
    err.status = 404;
    throw err;
  }

  await publishMessage('payment.verified', {
    razorpay_order_id,
    razorpay_payment_id,
    orderId,
    userId,
    timestamp: new Date().toISOString(),
  });

  return updated;
}

function verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
  ensureRazorpay();
  verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
}

module.exports = { createPaymentOrder, confirmPayment, verifyPaymentSignature };

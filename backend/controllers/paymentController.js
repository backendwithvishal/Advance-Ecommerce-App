const paymentService = require('../services/paymentService');

const createOrder = async (req, res, next) => {
  try {
    const razorpayOrder = await paymentService.createPaymentOrder(req.user._id, req.body.orderId);
    res.json(razorpayOrder);
  } catch (err) {
    next(err);
  }
};

const confirmPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const order = await paymentService.confirmPayment(
      req.user._id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    );
    res.json({ message: 'Payment confirmed', order });
  } catch (err) {
    next(err);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    res.json({ message: 'Payment verified successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createOrder, confirmPayment, verifyPayment };

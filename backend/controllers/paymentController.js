const paymentService = require('../services/paymentService');

const createOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ message: 'orderId is required' });
    }

    const razorpayOrder = await paymentService.createPaymentOrder(req.user._id, orderId);
    res.status(200).json(razorpayOrder);
  } catch (err) {
    let status = err.status || 500;
    let message = err.message;
    if (message === 'Razorpay down' || message.includes('Razorpay') || message.includes('Payment provider') || status === 502) {
      status = 502;
      message = 'Payment provider error';
    }

    if (typeof next === 'function') {
      err.status = status;
      err.message = message;
      next(err);
    } else {
      res.status(status).json({ message });
    }
  }
};

const confirmPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    for (const field of ['razorpay_order_id', 'razorpay_payment_id', 'orderId']) {
      if (!req.body[field]) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    const order = await paymentService.confirmPayment(
      req.user._id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    );
    res.status(200).json({ message: 'Payment confirmed', order });
  } catch (err) {
    let status = err.status || 500;
    let message = err.message;
    if (message.includes('Could not verify payment') || message.includes('network') || status === 502) {
      status = 502;
      message = 'Payment provider error';
    }

    if (typeof next === 'function') {
      err.status = status;
      err.message = message;
      next(err);
    } else {
      const response = { message };
      if (status === 402) {
        response.status = message.match(/status: (\w+)/)?.[1] || 'failed';
      }
      res.status(status).json(response);
    }
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    for (const field of ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']) {
      if (!req.body[field]) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    await paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    res.status(200).json({ message: 'Payment verified successfully' });
  } catch (err) {
    const status = err.status || 400;
    const message = err.message || 'Invalid payment signature';

    if (typeof next === 'function') {
      err.status = status;
      err.message = message;
      next(err);
    } else {
      res.status(status).json({ message });
    }
  }
};

module.exports = { createOrder, confirmPayment, verifyPayment };

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { getCache, setCache, delCache } = require('../utils/cache');
const { publishMessage } = require('../config/rabbitmq');

const LOW_STOCK_THRESHOLD = 5;

async function createOrder(userId, userEmail, userName, items, address) {
  if (!items || items.length === 0) {
    const err = new Error('No order items');
    err.status = 400;
    throw err;
  }

  // Normalise whatever shape the client sends
  const orderItems = items.map(item => ({
    productId: item.productId || item.product,
    qty: item.qty || item.quantity,
  }));

  // Fetch all products in one query instead of looping with findById
  const productIds = orderItems.map(i => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });

  if (products.length !== productIds.length) {
    const err = new Error('One or more products were not found');
    err.status = 400;
    throw err;
  }

  const productMap = new Map(products.map(p => [String(p._id), p]));

  // Calculate server-side total — never trust the client's number
  let totalAmount = 0;
  const validatedItems = [];

  for (const item of orderItems) {
    const product = productMap.get(String(item.productId));
    if (item.qty <= 0) {
      const err = new Error(`Invalid quantity for "${product.name}"`);
      err.status = 400;
      throw err;
    }
    totalAmount += product.price * item.qty;
    validatedItems.push({ productId: product._id, qty: item.qty, price: product.price });
  }

  // Wrap stock decrement + order creation in a transaction so they're atomic
  const session = await mongoose.startSession();
  let createdOrder;

  try {
    await session.withTransaction(async () => {
      for (const item of validatedItems) {
        const updated = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty } },
          { session, new: true }
        );
        if (!updated) {
          const err = new Error(`"${productMap.get(String(item.productId)).name}" is out of stock`);
          err.status = 409;
          throw err;
        }
      }

      [createdOrder] = await Order.create(
        [{ userId, items: validatedItems, totalAmount, address }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  // Bust relevant caches
  await delCache('orders:all', `orders:user:${userId}`, 'analytics:stats');

  // Kick off background jobs
  await publishMessage('order.created', {
    orderId: createdOrder._id,
    email: userEmail,
    name: userName,
    totalAmount,
    address,
  });

  // Alert on low stock for anything that just dropped below the threshold
  for (const item of validatedItems) {
    const product = await Product.findById(item.productId);
    if (product && product.stock < LOW_STOCK_THRESHOLD) {
      await publishMessage('product.low_stock', {
        productId: product._id,
        name: product.name,
        stock: product.stock,
      });
    }
  }

  await publishMessage('analytics.invalidate', { source: 'order.created' });

  return createdOrder;
}

async function getMyOrders(userId, page = 1, limit = 20) {
  page = Math.max(1, page);
  limit = Math.min(50, Math.max(1, limit));
  const skip = (page - 1) * limit;
  const cacheKey = `orders:user:${userId}:${page}:${limit}`;

  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [orders, total] = await Promise.all([
    Order.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments({ userId }),
  ]);

  const result = { orders, page, limit, total, pages: Math.ceil(total / limit) };
  await setCache(cacheKey, result, 120);
  return result;
}

async function getAllOrders(page = 1, limit = 20, status) {
  page = Math.max(1, page);
  limit = Math.min(100, Math.max(1, limit));
  const skip = (page - 1) * limit;
  const filter = status ? { status } : {};
  const cacheKey = `orders:all:${page}:${limit}:${status || 'all'}`;

  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('userId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  const result = { orders, page, limit, total, pages: Math.ceil(total / limit) };
  await setCache(cacheKey, result, 60);
  return result;
}

async function updateOrderStatus(orderId, status) {
  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  order.status = status;
  const updated = await order.save();

  await delCache('orders:all', `orders:user:${order.userId}`);

  await publishMessage('order.updated', {
    orderId: updated._id,
    status: updated.status,
    userId: updated.userId,
  });

  await publishMessage('analytics.invalidate', { source: 'order.updated' });

  return updated;
}

module.exports = { createOrder, getMyOrders, getAllOrders, updateOrderStatus };

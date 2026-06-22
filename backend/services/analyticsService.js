const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { getCache, setCache } = require('../utils/cache');

async function getStats() {
  const cached = await getCache('analytics:stats');
  if (cached) return cached;

  // Run all three in parallel — no reason to wait for one before starting the next
  const [orderStats, totalProducts, totalUsers] = await Promise.all([
    Order.aggregate([
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } },
    ]),
    Product.countDocuments({}),
    User.countDocuments({ role: 'user' }),
  ]);

  const stats = {
    totalOrders: orderStats[0]?.totalOrders ?? 0,
    totalRevenue: orderStats[0]?.totalRevenue ?? 0,
    totalProducts,
    totalUsers,
  };

  await setCache('analytics:stats', stats, 60);
  return stats;
}

module.exports = { getStats };

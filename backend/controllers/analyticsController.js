const analyticsService = require('../services/analyticsService');

const getAdminStats = async (req, res, next) => {
  try {
    const stats = await analyticsService.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAdminStats };

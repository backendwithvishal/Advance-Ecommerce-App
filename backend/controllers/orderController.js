const orderService = require('../services/orderService');

const addOrderItems = async (req, res, next) => {
  try {
    const { items, address } = req.body;
    const order = await orderService.createOrder(
      req.user._id,
      req.user.email,
      req.user.name,
      items,
      address
    );
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await orderService.getMyOrders(req.user._id, Number(page), Number(limit));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await orderService.getAllOrders(Number(page), Number(limit), status);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body.status);
    res.json(order);
  } catch (err) {
    next(err);
  }
};

module.exports = { addOrderItems, getMyOrders, getOrders, updateOrderStatus };

const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const { getCache, setCache, delCache } = require('../utils/cache');
const { publishMessage } = require('../config/rabbitmq');

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'shopnest' }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

async function getProducts(query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.category) filter.category = query.category;
  if (!isNaN(parseFloat(query.minPrice))) filter.price = { $gte: parseFloat(query.minPrice) };
  if (!isNaN(parseFloat(query.maxPrice))) filter.price = { ...filter.price, $lte: parseFloat(query.maxPrice) };
  if (query.search) filter.$text = { $search: query.search };

  // Only cache the plain first-page request
  const isSimple = !query.category && !query.search && !query.minPrice && !query.maxPrice && page === 1;
  if (isSimple) {
    const cached = await getCache('products:all');
    if (cached) return cached;
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  const result = { products, page, limit, total, pages: Math.ceil(total / limit) };
  if (isSimple) await setCache('products:all', result, 300);
  return result;
}

async function getProductById(id) {
  const cached = await getCache(`products:${id}`);
  if (cached) return cached;

  const product = await Product.findById(id);
  if (!product) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }

  await setCache(`products:${id}`, product, 300);
  return product;
}

async function createProduct(data, imageBuffer) {
  let imageUrl = '';
  if (imageBuffer) {
    const result = await uploadToCloudinary(imageBuffer);
    imageUrl = result.secure_url;
  }

  const product = await Product.create({ ...data, imageUrl });

  await delCache('products:all', 'analytics:stats');
  await publishMessage('analytics.invalidate', { source: 'product.created' });

  return product;
}

async function updateProduct(id, data, imageBuffer) {
  const product = await Product.findById(id);
  if (!product) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }

  if (data.name) product.name = data.name;
  if (data.description) product.description = data.description;
  if (data.price !== undefined) product.price = data.price;
  if (data.category) product.category = data.category;
  if (data.stock !== undefined) product.stock = data.stock;

  if (imageBuffer) {
    const result = await uploadToCloudinary(imageBuffer);
    product.imageUrl = result.secure_url;
  }

  const updated = await product.save();

  await delCache('products:all', `products:${id}`, 'analytics:stats');
  await publishMessage('analytics.invalidate', { source: 'product.updated' });

  return updated;
}

async function deleteProduct(id) {
  const product = await Product.findById(id);
  if (!product) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }

  await product.deleteOne();

  await delCache('products:all', `products:${id}`, 'analytics:stats');
  await publishMessage('analytics.invalidate', { source: 'product.deleted' });
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct };

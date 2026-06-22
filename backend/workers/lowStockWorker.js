'use strict';

const { getChannel } = require('../config/rabbitmq');
const sendEmail = require('../utils/sendEmail');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@shopnest.com';

const start = async () => {
  const channel = getChannel();
  if (!channel) {
    console.warn('[Worker:lowStockWorker] RabbitMQ unavailable, skipping consumer registration');
    return;
  }

  await channel.assertQueue('product.low_stock', { durable: true });

  channel.consume('product.low_stock', async (msg) => {
    if (!msg) return;
    try {
      const { productId, name, stock } = JSON.parse(msg.content.toString());

      console.warn('[LowStock] Alert:', { productId, name, stock });

      // Send admin email alert (was only console.warn — now actually sends email)
      await sendEmail({
        email: ADMIN_EMAIL,
        subject: `⚠️ Low Stock Alert: ${name}`,
        message: `
          <h2>Low Stock Alert</h2>
          <p>Product <strong>${name}</strong> (ID: ${productId}) has <strong>${stock}</strong> units remaining.</p>
          <p>Please restock before inventory runs out.</p>
        `,
      });

      channel.ack(msg);
    } catch (err) {
      console.error('[Worker:lowStockWorker] Error processing message:', err.message);
      channel.ack(msg); // Ack to avoid infinite requeue; log for investigation
    }
  }, { noAck: false });

  console.log('[Worker:lowStockWorker] Listening on product.low_stock');
};

module.exports = { start };

'use strict';

const { getChannel } = require('../config/rabbitmq');
const PaymentAudit = require('../models/PaymentAudit');

const start = async () => {
  const channel = getChannel();
  if (!channel) {
    console.warn('[Worker:paymentAuditWorker] RabbitMQ unavailable, skipping consumer registration');
    return;
  }

  await channel.assertQueue('payment.verified', { durable: true });

  channel.consume('payment.verified', async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      const { razorpay_order_id, razorpay_payment_id, orderId, userId, timestamp } = data;

      // Persist audit record to MongoDB (was only console.log — now actually written to DB)
      await PaymentAudit.create({
        orderId:              orderId || null,
        userId:               userId  || null,
        razorpay_order_id,
        razorpay_payment_id,
        timestamp:            timestamp ? new Date(timestamp) : new Date(),
        meta:                 data,
      });

      console.log('[PaymentAudit] Saved:', { orderId, razorpay_payment_id });
      channel.ack(msg);
    } catch (err) {
      console.error('[Worker:paymentAuditWorker] Error processing message:', err.message);
      channel.ack(msg); // Ack to avoid infinite requeue; log for investigation
    }
  }, { noAck: false });

  console.log('[Worker:paymentAuditWorker] Listening on payment.verified');
};

module.exports = { start };

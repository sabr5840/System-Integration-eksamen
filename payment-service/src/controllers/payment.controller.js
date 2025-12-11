import { processPayment } from "../services/payment.service.js";

export async function createPaymentHandler(req, res) {
  const { amount, orderId } = req.body;

  try {
    const payment = await processPayment({ amount, orderId });
    res.status(201).json(payment);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[payment-controller] Error processing payment:", err.message);
    res.status(status).json({ error: err.message || "Payment failed" });
  }
}

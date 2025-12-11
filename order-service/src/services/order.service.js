// order-service/src/services/order.service.js
import { getProductById } from "../clients/productClient.js";
import { createPaymentWithResilience } from "../clients/paymentClient.js";

const orders = [];

/**
 * Opretter en ordre:
 *  1) Henter produkt fra product-service
 *  2) Forsøger betaling via payment-service (med timeout + retry + circuit breaker)
 *  3) Fallback: hvis betaling fejler, oprettes ordren alligevel som PENDING_PAYMENT
 */
export async function createOrder({ productId }) {
  // 1) Hent produkt
  const product = await getProductById(productId);
  const orderId = `order-${Date.now()}`;

  let payment = null;
  let paymentStatus = "PENDING_PAYMENT";

  try {
    // 2) Forsøg betaling (kan kaste fejl pga timeout/retry/breaker)
    payment = await createPaymentWithResilience({
      orderId,
      amount: product.price
    });
    paymentStatus = "PAID";
  } catch (err) {
    // 3) FALLBACK (Graceful degradation)
    console.warn(
      "[order-service] Payment failed, marking order as PENDING_PAYMENT"
    );
    paymentStatus = "PENDING_PAYMENT";
    payment = null;
  }

  const order = {
    id: orderId,
    product,
    paymentStatus,
    payment
  };

  orders.push(order);
  return order;
}

export function listOrders() {
  return orders;
}

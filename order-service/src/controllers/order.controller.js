import { createOrder, listOrders } from "../services/order.service.js";

export async function createOrderHandler(req, res) {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    const order = await createOrder({ productId });
    res.status(201).json(order);
  } catch (err) {
    console.error("[order-controller] Error creating order:", err.message);
    res.status(500).json({ error: "Could not create order" });
  }
}

export function listOrdersHandler(req, res) {
  const orders = listOrders();
  res.json(orders);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processPayment({ amount, orderId }) {
  if (!amount || !orderId) {
    const error = new Error("amount and orderId are required");
    error.statusCode = 400;
    throw error;
  }

  const random = Math.random();
  console.log("[payment-service] Incoming payment request", { amount, orderId, random });

  // 20%: langsom respons – godt til at teste timeout i order-service
  if (random < 0.2) {
    console.log("[payment-service] Simulating slow response...");
    await sleep(5000);
  }

  // 30%: 500-fejl
  if (random >= 0.2 && random < 0.5) {
    console.log("[payment-service] Simulating 500 error");
    const error = new Error("Payment provider error");
    error.statusCode = 500;
    throw error;
  }

  // Resten: succes
  console.log("[payment-service] Payment success");
  return {
    status: "success",
    transactionId: `tx-${Date.now()}`,
    orderId,
    amount
  };
}

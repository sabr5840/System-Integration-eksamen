// order-service/src/config/config.js
export const config = {
  port: process.env.PORT || 4000,
  services: {
    productServiceUrl:
      process.env.PRODUCT_SERVICE_URL || "http://127.0.0.1:4001",
    paymentServiceUrl:
      process.env.PAYMENT_SERVICE_URL || "http://127.0.0.1:4002"
  },
  resilience: {
    // TIMEOUT: hvor længe vi max venter på payment-service pr. kald (ms)
    paymentTimeoutMs: Number(process.env.PAYMENT_TIMEOUT_MS || 2000),

    // RETRY: hvor mange gange vi max prøver
    paymentMaxRetries: Number(process.env.PAYMENT_MAX_RETRIES || 3),

    // RETRY: hvor længe vi venter mellem forsøg (ms)
    paymentRetryDelayMs: Number(process.env.PAYMENT_RETRY_DELAY_MS || 500),

    // CIRCUIT BREAKER: hvor mange fejl før vi "åbner" kredsløbet
    circuitBreakerFailureThreshold: Number(
      process.env.PAYMENT_CB_FAILURE_THRESHOLD || 3
    ),

    // CIRCUIT BREAKER: hvor længe vi holder kredsløbet åbent (ms)
    circuitBreakerOpenStateMs: Number(
      process.env.PAYMENT_CB_OPEN_STATE_MS || 10000
    )
  }
};

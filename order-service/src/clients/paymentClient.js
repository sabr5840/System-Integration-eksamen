// order-service/src/clients/paymentClient.js
import axios from "axios";
import { config } from "../config/config.js";

const { paymentServiceUrl } = config.services;
const {
  paymentTimeoutMs,
  paymentMaxRetries,
  paymentRetryDelayMs,
  circuitBreakerFailureThreshold,
  circuitBreakerOpenStateMs
} = config.resilience;

// Simpelt in-memory circuit breaker state (per process)
const circuitState = {
  state: "CLOSED", // "CLOSED" | "OPEN" | "HALF_OPEN"
  failureCount: 0,
  nextTryAfter: 0
};

// lille helper til delay (bruges af RETRY)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// vurder om en fejl er "retryable" (timeout, netværk, 5xx)
function isRetryableError(err) {
  const status = err.response && err.response.status;
  const isTimeout = err.code === "ECONNABORTED";
  const isNetworkError = !status && !isTimeout; // fx ECONNREFUSED

  // 4xx fejl er typisk ikke retryable (fx 400/404)
  if (status && status >= 400 && status < 500) {
    return false;
  }

  return isTimeout || isNetworkError || (status && status >= 500);
}

// CIRCUIT BREAKER: reset ved success
function markSuccess() {
  if (circuitState.state !== "CLOSED" || circuitState.failureCount > 0) {
    console.log("[order-service] Circuit breaker RESET for payment-service");
  }
  circuitState.state = "CLOSED";
  circuitState.failureCount = 0;
  circuitState.nextTryAfter = 0;
}

// CIRCUIT BREAKER: registrer fejl og åbn hvis threshold nås
function markFailure() {
  const now = Date.now();
  circuitState.failureCount += 1;

  if (circuitState.failureCount >= circuitBreakerFailureThreshold) {
    circuitState.state = "OPEN";
    circuitState.nextTryAfter = now + circuitBreakerOpenStateMs;
    console.warn(
      "[order-service] Circuit breaker OPEN for payment-service. Next try after:",
      new Date(circuitState.nextTryAfter).toISOString()
    );
  }
}

// CIRCUIT BREAKER: tjek om vi må lave et kald lige nu
function ensureCircuitAllowsRequest() {
  const now = Date.now();

  if (circuitState.state === "OPEN") {
    if (now >= circuitState.nextTryAfter) {
      // vi går i HALF_OPEN og tillader et “test-kald”
      console.warn(
        "[order-service] Circuit breaker HALF_OPEN for payment-service, allowing test request"
      );
      circuitState.state = "HALF_OPEN";
      return;
    }

    const error = new Error("Circuit breaker is OPEN for payment-service");
    error.code = "CIRCUIT_OPEN";
    throw error;
  }

  // CLOSED og HALF_OPEN må gerne prøve at kalde
}

/**
 * createPaymentWithResilience implementerer:
 *  - TIMEOUT (axios timeout)
 *  - RETRY (forsøg flere gange på retryable fejl)
 *  - CIRCUIT BREAKER (stopper med at kalde payment midlertidigt)
 *  Fallback håndteres i order.service.js.
 */
export async function createPaymentWithResilience({ orderId, amount }) {
  const url = paymentServiceUrl + "/payments";
  const body = { amount, orderId };
  let lastError;

  for (let attempt = 1; attempt <= paymentMaxRetries; attempt++) {
    // CIRCUIT BREAKER check
    ensureCircuitAllowsRequest();

    try {
      console.log(
        "[order-service] Payment attempt",
        attempt,
        "for order",
        orderId
      );

      // TIMEOUT: via axios timeout
      const response = await axios.post(url, body, {
        timeout: paymentTimeoutMs
      });

      // success → reset breaker
      markSuccess();

      console.log(
        "[order-service] Payment success from payment-service:",
        response.data
      );
      return response.data;
    } catch (err) {
      lastError = err;

      const status = err.response && err.response.status;
      const code = err.code || "";
      const message = err.message || "Unknown error";

      if (!isRetryableError(err)) {
        console.error(
          "[order-service] Non-retryable payment error:",
          { status, code, message }
        );
        // Non-retryable tæller stadig som failure i breaker
        markFailure();
        throw err;
      }

      console.warn(
        "[order-service] Retryable payment error on attempt",
        attempt,
        "-",
        { status, code, message }
      );

      // RETRY + CIRCUIT BREAKER: registrer failure
      markFailure();

      if (attempt >= paymentMaxRetries) {
        console.error(
          "[order-service] Max payment retries reached for order",
          orderId
        );
        break;
      }

      console.log(
        "[order-service] Waiting",
        paymentRetryDelayMs,
        "ms before next payment retry..."
      );
      await sleep(paymentRetryDelayMs);
    }
  }

  // Alle forsøg fejlet
  throw lastError || new Error("Payment failed after retries");
}

# System Integration – Resilient Microservice Order System

Dette projekt er et lille **microservice-baseret ordersystem** udviklet som eksamensgrundlag til faget **System Integration**.

Projektet demonstrerer:

- **Microservice-arkitektur** med klare bounded contexts
- **Lagdelte services** med tydelig separering af ansvar (config, clients, services, controllers, routes)
- **Kommunikation via REST/HTTP + JSON**
- **Resilience patterns**: timeout, retry, circuit breaker og fallback
- **API-dokumentation med Swagger** (på `order-service`)
- **Deployment med Docker og docker-compose**

Systemet består af tre selvstændige services:

- `product-service` – håndterer produkter (read-only)
- `payment-service` – simulerer et ustabilt betalingssystem
- `order-service` – håndterer ordrer og orkestrerer kald til de andre services

---

## 1. Arkitektur – overblik

### 1.1 Microservices og bounded contexts

| Service         | Port | Bounded Context / Ansvar                           |
| --------------- | ---- | -------------------------------------------------- |
| product-service | 4001 | Produktkatalog – readonly produkter                |
| payment-service | 4002 | Betaling – simuleret ustabil ekstern afhængighed   |
| order-service   | 4000 | Ordrer – orkestrering af produkt- og betalingskald |

Hver service kører som en **separat Node.js-applikation** med eget ansvar og kan principielt udvikles, deployes og skaleres uafhængigt.

`order-service` er den eneste, der kender til begge andre services og fungerer derfor som en **orchestrator**: den koordinerer kald til `product-service` og `payment-service` og implementerer resilience over for fejl i dem.

### 1.2 Lagdelt arkitektur pr. service

Alle services følger (med små variationer) en konsistent struktur:

- `src/config` – konfiguration (porte, base-URLs, resilience-indstillinger)
- `src/routes` – route-definitioner og URL-struktur
- `src/controllers` – HTTP-lag (validering, mapping mellem HTTP og domæne)
- `src/services` – domænelogik / forretningsregler
- `src/clients` – (kun i `order-service`) integrationer til andre services via HTTP
- `src/docs` – (i `order-service`) Swagger/OpenAPI-definition
- `src/app.js` – opbygger Express-appen (middleware + routes)
- `src/index.js` – entrypoint, starter HTTP-serveren

Denne opdeling giver en **klar adskillelse mellem ansvar**:

- _Controllers_ ved, at der findes HTTP og `req`/`res`
- _Services_ tænker i domæne (“opret ordre”, “hent produkter”)
- _Clients_ ved, hvordan man taler med andre microservices (HTTP/axios)
- _Config_ centralt definerer porte, timeouts, URLs osv.

---

## 2. Services i detaljer

### 2.1 `product-service` (port 4001)

**Ansvar:**  
Read-only API til et simpelt produktkatalog. Bruges af `order-service`, når der oprettes en ordre.

**Vigtige endpoints:**

- `GET /health` – simpelt health-check:

  ```json
  {
    "status": "ok",
    "service": "product-service"
  }
  ```

- `GET /products` – returnerer en statisk liste af produkter:

  ```json
  [
    { "id": 1, "name": "Laptop", "price": 9999 },
    { "id": 2, "name": "Headphones", "price": 799 },
    { "id": 3, "name": "Keyboard", "price": 499 }
  ]
  ```

- `GET /products/:id` – slå ét produkt op via ID:

  ```json
  {
    "id": 1,
    "name": "Laptop",
    "price": 9999
  }
  ```

**Intern struktur (uddrag):**

- `services/product.service.js` – domænelag (liste + opslag)
- `controllers/product.controller.js` – håndterer HTTP-requests og responses
- `routes/product.routes.js` – definerer `/products`-routes
- `routes/index.js` – samler `/health` + `/products`
- `app.js` + `index.js` – opsætter Express og starter serveren

`product-service` har ingen afhængigheder til andre services og kan ses som en **ren bounded context** omkring produktkataloget.

---

### 2.2 `payment-service` (port 4002)

**Ansvar:**  
Simulerer et **ustabilt betalingssystem**. Formålet er at have en downstream-service, som nogle gange fejler eller er langsom, så vi kan demonstrere resilience patterns i `order-service`.

**Endpoints:**

- `GET /health`:

  ```json
  {
    "status": "ok",
    "service": "payment-service"
  }
  ```

- `POST /payments` – forsøger at processere en betaling.

  Request-body:

  ```json
  {
    "amount": 100,
    "orderId": "order-123"
  }
  ```

  Logikken i `services/payment.service.js` gør følgende:

  - ca. 20% af kald: **langsom respons** (simulerer fx langsom tredjeparts-udbyder)  
    → service sover i ca. 5 sekunder
  - ca. 30% af kald: **500-fejl** – kaster en fejl med status 500  
    (simulerer ustabil udbyder)
  - resten: **success**, fx:

    ```json
    {
      "status": "success",
      "transactionId": "tx-1733740000000",
      "orderId": "order-123",
      "amount": 100
    }
    ```

`payment-service` fungerer som en **downstream dependency**, der ikke kan stoles 100% på – præcis det, resilience patterns er designet til at håndtere.

---

### 2.3 `order-service` (port 4000)

**Ansvar:**  
Håndterer oprettelse og visning af ordrer og orkestrerer kald til `product-service` og `payment-service`.

**Flow for `POST /orders`:**

1. Validerer input (`productId`)
2. Henter produktet hos `product-service`
3. Forsøger at oprette betaling hos `payment-service` via en resilient klient
4. Ved succes:
   - ordren oprettes med `paymentStatus: "PAID"`
5. Ved fejl (efter timeout, retry og evt. circuit breaker):
   - ordren oprettes stadig, men med `paymentStatus: "PENDING_PAYMENT"` og `payment: null` (fallback)

**Endpoints:**

- `GET /health` – health-check for order-service.
- `POST /orders`

  Request-body:

  ```json
  {
    "productId": 1
  }
  ```

  Eksempel når betaling lykkes:

  ```json
  {
    "id": "order-1733740000000",
    "product": {
      "id": 1,
      "name": "Laptop",
      "price": 9999
    },
    "paymentStatus": "PAID",
    "payment": {
      "status": "success",
      "transactionId": "tx-1733740000000",
      "orderId": "order-1733740000000",
      "amount": 9999
    }
  }
  ```

  Eksempel når betaling _ikke_ lykkes efter forsøg (fallback):

  ```json
  {
    "id": "order-1733740000001",
    "product": {
      "id": 1,
      "name": "Laptop",
      "price": 9999
    },
    "paymentStatus": "PENDING_PAYMENT",
    "payment": null
  }
  ```

- `GET /orders` – returnerer en in-memory liste over alle ordrer.

**Intern struktur (uddrag):**

- `clients/productClient.js` – HTTP-klient til `product-service`
- `clients/paymentClient.js` – resilient HTTP-klient til `payment-service`
- `services/order.service.js` – domænelogik for ordrer (inkl. fallback)
- `controllers/order.controller.js` – HTTP-lag for `/orders`
- `routes/order.routes.js` + `routes/index.js`
- `docs/swagger.js` – Swagger/OpenAPI-definition
- `app.js` – Express + JSON-middleware + Swagger UI
- `index.js` – starter HTTP-serveren

---

## 3. Resilience patterns i `order-service`

Den vigtigste del af projektet ift. eksamen er implementeringen af **resilience patterns** i:

- `order-service/src/config/config.js`
- `order-service/src/clients/paymentClient.js`
- `order-service/src/services/order.service.js`

### 3.1 Konfiguration (`config/config.js`)

`config.js` samler alle centrale indstillinger, inkl. resilience-parametre:

```js
export const config = {
  port: process.env.PORT || 4000,
  services: {
    productServiceUrl:
      process.env.PRODUCT_SERVICE_URL || "http://127.0.0.1:4001",
    paymentServiceUrl:
      process.env.PAYMENT_SERVICE_URL || "http://127.0.0.1:4002",
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
    ),
  },
};
```

Det gør systemet konfigurerbart: samme kode kan opføre sig forskelligt i dev/produktion bare ved at ændre environment-variabler.

---

### 3.2 Timeout, retry og circuit breaker (`clients/paymentClient.js`)

`paymentClient.js` er en **resilient HTTP-klient** til `payment-service`.

Vigtigste idéer:

- **Timeout** beskytter mod langsomme kald
- **Retry** forsøger at “absorbere” midlertidige fejl
- **Circuit breaker** beskytter systemet mod at blive ved med at kalde en ustabil service
- **Fejlklassificering** (retryable vs. non-retryable)

Forenklet uddrag:

```js
import axios from "axios";
import { config } from "../config/config.js";

const { paymentServiceUrl } = config.services;
const {
  paymentTimeoutMs,
  paymentMaxRetries,
  paymentRetryDelayMs,
  circuitBreakerFailureThreshold,
  circuitBreakerOpenStateMs,
} = config.resilience;

// In-memory circuit breaker state
const circuitState = {
  state: "CLOSED", // "CLOSED" | "OPEN" | "HALF_OPEN"
  failureCount: 0,
  nextTryAfter: 0,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  const status = err.response && err.response.status;
  const isTimeout = err.code === "ECONNABORTED";
  const isNetworkError = !status && !isTimeout; // fx ECONNREFUSED

  // 4xx fejl er typisk klient-fejl → retry giver ingen mening
  if (status && status >= 400 && status < 500) return false;

  return isTimeout || isNetworkError || (status && status >= 500);
}

function markSuccess() {
  if (circuitState.state !== "CLOSED" || circuitState.failureCount > 0) {
    console.log("[order-service] Circuit breaker RESET for payment-service");
  }
  circuitState.state = "CLOSED";
  circuitState.failureCount = 0;
  circuitState.nextTryAfter = 0;
}

function markFailure() {
  circuitState.failureCount += 1;
  if (circuitState.failureCount >= circuitBreakerFailureThreshold) {
    circuitState.state = "OPEN";
    circuitState.nextTryAfter = Date.now() + circuitBreakerOpenStateMs;
    console.warn("[order-service] Circuit breaker OPEN for payment-service...");
  }
}

function ensureCircuitAllowsRequest() {
  const now = Date.now();

  if (circuitState.state === "OPEN") {
    if (now >= circuitState.nextTryAfter) {
      console.warn(
        "[order-service] Circuit breaker HALF_OPEN for payment-service..."
      );
      circuitState.state = "HALF_OPEN";
      return;
    }

    const error = new Error("Circuit breaker is OPEN for payment-service");
    error.code = "CIRCUIT_OPEN";
    throw error;
  }
}

export async function createPaymentWithResilience({ orderId, amount }) {
  const url = paymentServiceUrl + "/payments";
  const body = { amount, orderId };
  let lastError;

  for (let attempt = 1; attempt <= paymentMaxRetries; attempt++) {
    ensureCircuitAllowsRequest();

    try {
      console.log(
        "[order-service] Payment attempt",
        attempt,
        "for order",
        orderId
      );

      const response = await axios.post(url, body, {
        timeout: paymentTimeoutMs, // TIMEOUT
      });

      markSuccess(); // reset circuit ved success
      return response.data;
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err)) {
        markFailure();
        throw err;
      }

      markFailure();

      console.warn(
        "[order-service] Retryable payment error on attempt",
        attempt,
        {
          status: err.response && err.response.status,
          code: err.code,
          message: err.message,
        }
      );

      if (attempt < paymentMaxRetries) {
        console.log(
          "[order-service] Waiting",
          paymentRetryDelayMs,
          "ms before next payment retry..."
        );
        await sleep(paymentRetryDelayMs);
      }
    }
  }

  console.error(
    "[order-service] Max payment retries reached for order",
    orderId
  );
  throw lastError || new Error("Payment failed after retries");
}
```

**Hvordan det ser ud i praksis (fx i Docker-logs):**

- Flere `Payment attempt X for order Y` med samme `orderId`
- Timeouts (`timeout of 2000ms exceeded`)
- 500-fejl (`Request failed with status code 500`)
- `Circuit breaker OPEN ...` og senere `Circuit breaker RESET ...`

Det er direkte evidens for, at dine resilience patterns er aktive.

---

### 3.3 Fallback i domænelaget (`services/order.service.js`)

Selvom `createPaymentWithResilience` kan kaste fejl, så håndterer domænelaget dem ved at lave en **graceful fallback**:

```js
import { getProductById } from "../clients/productClient.js";
import { createPaymentWithResilience } from "../clients/paymentClient.js";

const orders = [];

export async function createOrder({ productId }) {
  const product = await getProductById(productId);
  const orderId = `order-${Date.now()}`;

  let payment = null;
  let paymentStatus = "PENDING_PAYMENT";

  try {
    payment = await createPaymentWithResilience({
      orderId,
      amount: product.price,
    });
    paymentStatus = "PAID";
  } catch (err) {
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
    payment,
  };

  orders.push(order);
  return order;
}

export function listOrders() {
  return orders;
}
```

I stedet for at systemet bryder helt sammen, bliver ordren oprettet med en status, der afspejler, at betalingen ikke er gennemført endnu. Det er et konkret eksempel på **fallback pattern** / **graceful degradation**.

---

## 4. API-dokumentation med Swagger (`order-service`)

`order-service` har tilføjet **Swagger/OpenAPI** dokumentation.

- Definition: `order-service/src/docs/swagger.js`
- Swagger UI mountet i `order-service/src/app.js`:

```js
import swaggerUi from "swagger-ui-express";
import { swaggerDocument } from "./docs/swagger.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  // Swagger UI på /docs
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  registerRoutes(app);
  return app;
}
```

Når `order-service` kører (lokalt eller i Docker), kan Swagger UI åbnes på:

- `http://localhost:4000/docs`

Her kan man se og teste bl.a.:

- `GET /health`
- `GET /orders`
- `POST /orders`
- Schemas for `Product`, `Order`, `Payment`, `CreateOrderRequest`

Swagger-delen demonstrerer **API-dokumentation**, som er en eksplicit del af læringsmålene i faget.

---

## 5. Deployment med Docker og docker-compose

Alle tre services er containeriseret og kan startes samlet via `docker-compose`.

### 5.1 Dockerfiles (kort)

Eksempel – `order-service/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY src ./src

EXPOSE 4000

CMD ["node", "src/index.js"]
```

Tilsvarende findes Dockerfiles i:

- `product-service/Dockerfile` (port 4001)
- `payment-service/Dockerfile` (port 4002)

### 5.2 docker-compose.yml

I roden af projektet ligger `docker-compose.yml`, fx:

```yaml
version: "3.9"

services:
  product-service:
    build: ./product-service
    container_name: product-service
    ports:
      - "4001:4001"
    environment:
      PORT: 4001

  payment-service:
    build: ./payment-service
    container_name: payment-service
    ports:
      - "4002:4002"
    environment:
      PORT: 4002

  order-service:
    build: ./order-service
    container_name: order-service
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      PRODUCT_SERVICE_URL: http://product-service:4001
      PAYMENT_SERVICE_URL: http://payment-service:4002
      PAYMENT_TIMEOUT_MS: 2000
      PAYMENT_MAX_RETRIES: 3
      PAYMENT_RETRY_DELAY_MS: 500
    depends_on:
      - product-service
      - payment-service
```

Bemærk, at `order-service` i Docker **ikke** kalder `127.0.0.1`, men i stedet de andre services via deres **service-navne i Docker-netværket**:

- `http://product-service:4001`
- `http://payment-service:4002`

Environment-variablerne overskriver standard-URLs i `config.js`.

### 5.3 Kørsel med Docker

Fra projektets rod:

```bash
docker compose up --build
```

Herefter er systemet tilgængeligt fra værtsmaskinen:

- `http://localhost:4001/health` (product-service)
- `http://localhost:4002/health` (payment-service)
- `http://localhost:4000/health` (order-service)
- `http://localhost:4000/orders`
- `http://localhost:4000/docs` (Swagger UI)

---

## 6. Kørsel uden Docker (ren Node.js)

Alternativt kan hver service køres direkte med Node.

### 6.1 product-service

```bash
cd product-service
npm install
node src/index.js
# -> product-service running on port 4001
```

### 6.2 payment-service

```bash
cd payment-service
npm install
node src/index.js
# -> payment-service running on port 4002
```

### 6.3 order-service

```bash
cd order-service
npm install
node src/index.js
# -> order-service running on port 4000
```

Derefter kan endpoints rammes på samme URL’er som ovenfor (`localhost:4000`, `4001`, `4002`).

---

## 7. Sammenhæng til faget “System Integration”

Projektet understøtter flere centrale fokuspunkter fra kurset:

- **Service scoping & bounded context**  
  Hver service har et klart domæne:

  - `product-service`: produktkatalog
  - `payment-service`: betaling
  - `order-service`: ordrer + orkestrering

- **Service design & architecture**  
  Lagdelt struktur (config, routes, controllers, services, clients), tydelig separering af ansvar, samt en orkestrerende service (`order-service`), der styrer kald mellem bounded contexts.

- **Communication using REST**  
  Al kommunikation mellem services foregår via HTTP/REST + JSON, hvilket illustrerer klassisk synkron service-integration.

- **Resilience patterns**

  - **Timeout** (beskytter mod langsomme eller hængende kald)
  - **Retry** (absorberer midlertidige fejl)
  - **Circuit breaker** (beskytter mod ustabile downstream-services)
  - **Fallback** (ordrer oprettes som `PENDING_PAYMENT` i stedet for at fejle hårdt)

- **Documentation of APIs using Swagger**  
  Swagger/OpenAPI på `order-service`, eksponeret via `/docs`.

- **Deployment using Docker**  
  Hver service har en Dockerfile, og hele systemet kan startes samlet med `docker-compose`. Det afspejler en realistisk måde at drifte microservices på i praksis.

Projektet kan dermed bruges som en **konkret case** i eksamen, hvor du både kan diskutere teori (patterns, arkitektur, integration) og samtidig vise konkret kode og kørende system.

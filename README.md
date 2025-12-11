# System Integration – Microservice Demo (Order, Product, Payment)

Dette projekt er en lille, men fagligt fokuseret microservice-arkitektur, som jeg har bygget til mit eksamensprojekt i Systemintegration. Fokus er især på:

- Opdeling i små, selvstændige services (product, payment, order)
- Kommunikation via HTTP/REST mellem services
- Resilience patterns: **Timeout**, **Retry**, **Circuit Breaker** og **Graceful Degradation**
- Containerisering med **Docker** og orkestrering med **docker-compose**
- Enkel API-dokumentation med **Swagger** på order-service

Projektet er skrevet i **Node.js** med **Express**.

---

## Overordnet arkitektur

Projektet består af tre microservices:

1. **product-service (port 4001)**

   - Står for produkter og priser
   - Simulerer et lille produktkatalog i memory

2. **payment-service (port 4002)**

   - Simulerer en ustabil betalingsudbyder
   - Bruges til at demonstrere timeout, retry og circuit breaker

3. **order-service (port 4000)**
   - Orkestrerer hele ordre-flowet
   - Kalder product-service for at hente produkt
   - Kalder payment-service med **resilience patterns**
   - Har **Swagger UI** til at dokumentere API’et

Alle services kører i hver sin container via `docker-compose`, og order-service kalder de andre services via service-navne på Docker-netværket (`http://product-service:4001`, `http://payment-service:4002`).

---

## Teknisk stack

- **Sprog:** Node.js (ES Modules)
- **Framework:** Express
- **HTTP-klient:** Axios (i order-service til kald mod payment- og product-service)
- **Dokumentation:** swagger-ui-express (Swagger UI)
- **Containerisering:** Docker + docker-compose

---

## Services i detaljer

### 1. product-service

**Formål:**  
Tilbyder et simpelt produktkatalog med ID, navn og pris. Bruges af order-service til at finde produkt og pris før betaling.

**Port (default):** `4001`

**Vigtigste filer:**

- `src/config/config.js`
  - Simpel config med port:
  ```js
  export const config = {
    port: process.env.PORT || 4001,
  };
  ```
- `src/services/product.service.js`

  - In-memory liste af produkter:

  ```js
  const products = [
    { id: 1, name: "Laptop", price: 9999 },
    { id: 2, name: "Headphones", price: 799 },
    { id: 3, name: "Keyboard", price: 499 },
  ];

  export function listProducts() {
    return products;
  }

  export function getProductById(id) {
    return products.find((p) => p.id === id) || null;
  }
  ```

- `src/controllers/product.controller.js`
  - Håndterer HTTP-requests og validering (fx invalid id, ikke fundet).
- `src/routes/product.routes.js` + `src/routes/index.js`
  - Router `/products`-endpoints og `/health`.

**Endpoints:**

- `GET /health`  
  Health-check: `{ status: "ok", service: "product-service" }`

- `GET /products`  
  Returnerer alle produkter.

- `GET /products/:id`  
  Returnerer ét produkt.
  - `400` ved ugyldigt id
  - `404` hvis produktet ikke findes

---

### 2. payment-service

**Formål:**  
Simulerer en betalingsudbyder med **tilfældig ustabilitet**, så jeg kan demonstrere:

- Timeouts i order-service
- Retries
- 5xx-fejl
- Hvordan circuit breaker i order-service reagerer

**Port (default):** `4002`

**Vigtigste filer:**

- `src/config/config.js`

  ```js
  export const config = {
    port: process.env.PORT || 4002,
  };
  ```

- `src/services/payment.service.js`  
  Her simulerer jeg et ustabilt betalingssystem:

  ```js
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
    console.log("[payment-service] Incoming payment request", {
      amount,
      orderId,
      random,
    });

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
      amount,
    };
  }
  ```

  Derudover tjekker jeg for manglende `amount` og `orderId` og returnerer `400`.

- `src/controllers/payment.controller.js`
  - Pakker `processPayment` ind i en HTTP-handler.
  - Mapper thrown errors til korrekte HTTP-statuskoder.

**Endpoints:**

- `GET /health`  
  Health-check for payment-service.

- `POST /payments`  
  Request body:
  ```json
  {
    "amount": 999,
    "orderId": "order-123"
  }
  ```
  Responses:
  - `201` + payment-objekt ved succes
  - `400` ved manglende/ugyldige felter
  - `500` ved simuleret provider-fejl

---

### 3. order-service

**Formål:**  
Order-service binder det hele sammen og implementerer **resilience patterns** mod payment-service. Den håndterer:

1. Hent produkt (via product-service)
2. Forsøg betaling (via payment-service) med:
   - Timeout
   - Retry
   - Circuit breaker
3. Fallback (Graceful Degradation), hvis betaling fejler

**Port (default):** `4000`

---

#### 3.1 Konfiguration (resilience)

Fil: `order-service/src/config/config.js`

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
    paymentTimeoutMs: Number(process.env.PAYMENT_TIMEOUT_MS || 2000),
    paymentMaxRetries: Number(process.env.PAYMENT_MAX_RETRIES || 3),
    paymentRetryDelayMs: Number(process.env.PAYMENT_RETRY_DELAY_MS || 500),
    circuitBreakerFailureThreshold: Number(
      process.env.PAYMENT_CB_FAILURE_THRESHOLD || 3
    ),
    circuitBreakerOpenStateMs: Number(
      process.env.PAYMENT_CB_OPEN_STATE_MS || 10000
    ),
  },
};
```

Det betyder, at jeg kan tweake adfærden via environment variables – fx hvor hurtigt circuit breaker skal åbne, hvor lang timeout der skal være, osv.

---

#### 3.2 Resilient payment client

Fil: `order-service/src/clients/paymentClient.js`

Her har jeg samlet tre patterns:

1. **Timeout** – via Axios’ `timeout`-option:

   ```js
   const response = await axios.post(url, body, {
     timeout: paymentTimeoutMs,
   });
   ```

2. **Retry** – jeg prøver op til `paymentMaxRetries` gange ved _retryable_ fejl:

   - Timeout (`ECONNABORTED`)
   - Netværksfejl (ingen statuskode, fx `ECONNREFUSED`)
   - 5xx-fejl fra payment-service

   Jeg har en helper:

   ```js
   function isRetryableError(err) {
     const status = err.response && err.response.status;
     const isTimeout = err.code === "ECONNABORTED";
     const isNetworkError = !status && !isTimeout;

     if (status && status >= 400 && status < 500) {
       return false;
     }
     return isTimeout || isNetworkError || (status && status >= 500);
   }
   ```

   Ved retryable fejl logger jeg, markere failure i circuit breaker og venter `paymentRetryDelayMs` ms før næste forsøg.

3. **Circuit Breaker** – et simpelt in-memory circuit breaker state:

   ```js
   const circuitState = {
     state: "CLOSED", // "CLOSED" | "OPEN" | "HALF_OPEN"
     failureCount: 0,
     nextTryAfter: 0,
   };
   ```

   Logikken:

   - **CLOSED**: normale kald, failureCount tælles op ved fejl
   - Når `failureCount >= circuitBreakerFailureThreshold` → **OPEN**
     - I OPEN bliver alle kald afvist indtil `nextTryAfter` (baseret på `circuitBreakerOpenStateMs`)
   - Når tiden er gået, går vi i **HALF_OPEN** og tillader et “test-kald”
     - Ved succes: reset → CLOSED
     - Ved fejl: tilbage til OPEN

   Hele den logik er samlet i helpers:

   - `ensureCircuitAllowsRequest()`
   - `markSuccess()`
   - `markFailure()`

Selve entrypoint-funktionen er:

```js
export async function createPaymentWithResilience({ orderId, amount }) { ... }
```

Hvis alle forsøg fejler, kaster den en fejl, som håndteres som fallback i `order.service.js`.

---

#### 3.3 Product client

Fil: `order-service/src/clients/productClient.js`

Simpel HTTP-klient til product-service:

```js
export async function getProductById(productId) {
  const url = `${config.services.productServiceUrl}/products/${productId}`;
  const response = await axios.get(url);
  return response.data;
}
```

---

#### 3.4 Domænelogik – Order service

Fil: `order-service/src/services/order.service.js`

Denne fil implementerer det samlede business-flow for at oprette en ordre:

1. Hent produktet fra **product-service**
2. Forsøg betaling mod **payment-service** med resilience
3. Fallback, hvis betaling fejler
4. Gem ordren i en in-memory liste

```js
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
```

**Vigtigt fagligt point:**  
Selv hvis betaling fejler (pga. timeout, 500-fejl, circuit open osv.), opretter jeg stadig ordren, men markerer den som `PENDING_PAYMENT`. Det er et eksempel på **Graceful Degradation / Fallback**, hvor systemet stadig kan håndtere ordren og f.eks. senere forsøge betaling igen.

---

#### 3.5 Controllers og routes

- `src/controllers/order.controller.js`

  - `createOrderHandler`
    - Validerer `productId` i body
    - Kalder `createOrder` og returnerer `201` ved succes
  - `listOrdersHandler`
    - Returnerer alle oprettede ordrer (in-memory)

- `src/routes/order.routes.js`

  - `POST /orders` → opret ordre
  - `GET /orders` → hent alle ordrer

- `src/routes/index.js`
  - `GET /health` → health-check
  - Mount’er `orderRouter` på `/orders`

---

#### 3.6 Swagger-dokumentation

Fil: `order-service/src/docs/swagger.js`

Her har jeg defineret en simpel OpenAPI-spec for order-service, som udstilles via Swagger UI:

- Swagger UI er tilgængelig på:  
  `GET http://localhost:4000/docs`

Swagger dokumenterer bl.a.:

- `GET /health`
- `GET /orders`
- `POST /orders`

Med følgende schemas:

- `CreateOrderRequest` – input body (indeholder `productId`)
- `Product` – produktstruktur
- `Payment` – payment-respons (nullable)
- `Order` – samlet ordre (id, product, paymentStatus, payment)

---

## Endpoints – samlet overblik

### product-service (port 4001)

- `GET /health`
- `GET /products`
- `GET /products/:id`

### payment-service (port 4002)

- `GET /health`
- `POST /payments`

### order-service (port 4000)

- `GET /health`
- `GET /orders`
- `POST /orders`
- `GET /docs` (Swagger UI)

---

## Kørsel af systemet

### Forudsætninger

- Docker
- Docker Compose  
  _(Alternativt kan services også startes manuelt med Node.js 18+, se længere nede)_

### Start med docker-compose

Fra roden af projektet:

```bash
docker-compose up --build
```

Dette vil:

- bygge og starte:
  - `product-service` på port `4001`
  - `payment-service` på port `4002`
  - `order-service` på port `4000`
- konfigurere `order-service`, så den kalder de andre services via:
  - `PRODUCT_SERVICE_URL=http://product-service:4001`
  - `PAYMENT_SERVICE_URL=http://payment-service:4002`

### Test af endpoints

1. **Tjek health på alle services**

   ```bash
   curl http://localhost:4001/health
   curl http://localhost:4002/health
   curl http://localhost:4000/health
   ```

2. **Hent produkter**

   ```bash
   curl http://localhost:4001/products
   ```

3. **Opret en ordre**

   ```bash
   curl -X POST http://localhost:4000/orders      -H "Content-Type: application/json"      -d '{"productId": 1}'
   ```

   Mulige scenarier:

   - Betaling lykkes:

     ```json
     {
       "id": "order-1765392289557",
       "product": { "id": 1, "name": "Laptop", "price": 9999 },
       "paymentStatus": "PAID",
       "payment": {
         "status": "success",
         "transactionId": "tx-1765392292595",
         "orderId": "order-1765392289557",
         "amount": 9999
       }
     }
     ```

   - Betaling fejler (timeout/500/circuit open), men ordre oprettes:
     ```json
     {
       "id": "order-1765392289557",
       "product": { "id": 1, "name": "Laptop", "price": 9999 },
       "paymentStatus": "PENDING_PAYMENT",
       "payment": null
     }
     ```

4. **Se alle ordrer**
   ```bash
   curl http://localhost:4000/orders
   ```

---

## Kørsel uden Docker (lokalt)

Hvis jeg vil køre det hele direkte via Node:

1. Installer dependencies i hver service-mappe:

   ```bash
   cd product-service && npm install
   cd ../payment-service && npm install
   cd ../order-service && npm install
   ```

2. Start services (i hver sin terminal):

   ```bash
   # product-service
   cd product-service
   npm start

   # payment-service
   cd payment-service
   npm start

   # order-service
   cd order-service
   npm start
   ```

3. I lokal udvikling bruger order-service default URLs:

   - `http://127.0.0.1:4001` (product-service)
   - `http://127.0.0.1:4002` (payment-service)

   Det kan overskrives med env-variabler:

   ```bash
   export PRODUCT_SERVICE_URL=http://localhost:4001
   export PAYMENT_SERVICE_URL=http://localhost:4002
   ```

---

## Resilience – hvordan man kan demonstrere det

For at demonstrere resilience patterns i praksis kan jeg:

1. **Spamme /orders** med requests (fx via Postman eller et lille script).
2. Observere logs i **order-service** og **payment-service**:

   - `[payment-service] Simulating slow response...`
   - `[payment-service] Simulating 500 error`
   - `[order-service] Retryable payment error on attempt ...`
   - `[order-service] Circuit breaker OPEN for payment-service...`
   - `[order-service] Circuit breaker HALF_OPEN for payment-service...`
   - `[order-service] Payment failed, marking order as PENDING_PAYMENT`

3. Justere konfiguration via env-variabler i `docker-compose.yml`, fx:
   ```yaml
   PAYMENT_TIMEOUT_MS: 2000
   PAYMENT_MAX_RETRIES: 3
   PAYMENT_RETRY_DELAY_MS: 500
   PAYMENT_CB_FAILURE_THRESHOLD: 3
   PAYMENT_CB_OPEN_STATE_MS: 10000
   ```

På den måde kan jeg tydeligt vise forskellen på:

- **Uden resilience**: hver fejl vil potentielt blokere brugeroplevelsen
- **Med resilience**: systemet fejler mere kontrolleret, og ordrer kan stadig oprettes som `PENDING_PAYMENT`, selv når payment-service er ustabil

---

## Designovervejelser og videre arbejde

**Bevidste valg:**

- Jeg har valgt **simpel in-memory-lagring** for ordrer og produkter for at holde fokus på integration og resilience fremfor databaseteknik.
- Jeg har holdt services **små og fokuserede**:
  - product-service: kun produkter
  - payment-service: kun betaling
  - order-service: orkestrering og resilience
- Konfiguration via **environment variables** gør det nemt at tweake adfærd uden kodeændringer.

**Mulige forbedringer:**

- Tilføje en rigtig database til ordrer og produkter
- Implementere et asynkront “re-try payment later”-flow for `PENDING_PAYMENT` via f.eks. message queue
- Metrics og monitoring (Prometheus/Grafana, logging til ELK-stack, etc.)
- Distribueret circuit breaker og centraliseret configuration (fx via et config center)
- Flere testcases og automatiske tests

---

## Opsummering

Projektet demonstrerer en lille, men realistisk microservice-arkitektur, hvor jeg især viser:

- Hvordan services kan **kommunikere via HTTP/REST**
- Hvordan man kan implementere **Timeout, Retry og Circuit Breaker** i en klient (order-service → payment-service)
- Hvordan man kan arbejde med **Graceful Degradation**, så ordrer stadig oprettes, selv når betaling fejler
- Hvordan **Docker** og **docker-compose** kan bruges til at køre flere services samlet

Det gør projektet velegnet som et praktisk eksempel på systemintegration og resilience patterns i en moderne microservice-kontekst.

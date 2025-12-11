# System Integration – Resilient Order System

Dette projekt er et lille microservice-baseret ordersystem, lavet som grundlag for eksamen i faget **System Integration**.

Fokus er på:

- **Microservice-arkitektur** med klare bounded contexts
- **Kommunikation via REST/HTTP + JSON**
- **Resilience** mod ustabile downstream-services (specifikt betaling)

Systemet består af tre selvstændige services:

- `product-service` – håndterer produkter
- `payment-service` – håndterer betaling (med villet ustabil adfærd)
- `order-service` – håndterer ordrer og koordinerer kald til de andre services

---

## 1. Arkitektur – overblik

### Microservices

| Service         | Port | Ansvar                                       |
| --------------- | ---- | -------------------------------------------- |
| product-service | 4001 | Produkter (read-only liste + enkelt produkt) |
| payment-service | 4002 | Betaling (simuleret ustabil, til resilience) |
| order-service   | 4000 | Oprettelse og visning af ordrer              |

Alle tre services:

- kører som **separate Node-processer**
- har **klare bounded contexts**:
  - _products_ (product-service)
  - _payments_ (payment-service)
  - _orders_ (order-service)
- kommunikerer via **HTTP/REST** og **JSON**
- bruger en **lagdelt arkitektur** internt:
  - `config` – konfiguration (porte, URLs, timeouts osv.)
  - `routes` – route-definitioner og URL-struktur
  - `controllers` – HTTP-lag (`req`/`res`)
  - `services` – domænelogik (business rules)
  - `clients` – (kun i order-service) integration til eksterne services
  - `app` – opbygning af Express-app, registrering af routes
  - `index` – entrypoint, starter HTTP-serveren

---

## 2. Services i detaljer

### 2.1. product-service (port 4001)

**Ansvar:**  
Står for read-only adgang til produkter. Bruges af `order-service`, når der oprettes en ordre.

**Vigtige endpoints:**

- `GET /health`  
  Returnerer et simpelt health-check:

  ```json
  {
    "status": "ok",
    "service": "product-service"
  }
  ```

- `GET /products`  
  Returnerer en statisk liste af produkter:

  ```json
  [
    { "id": 1, "name": "Laptop", "price": 9999 },
    { "id": 2, "name": "Headphones", "price": 799 },
    { "id": 3, "name": "Keyboard", "price": 499 }
  ]
  ```

- `GET /products/:id`  
  Returnerer et enkelt produkt, f.eks.:

  ```json
  {
    "id": 1,
    "name": "Laptop",
    "price": 9999
  }
  ```

Internt er product-service opdelt i:

- `services/product.service.js` – domænelogik (liste og opslag af produkter)
- `controllers/product.controller.js` – håndterer HTTP-requests og responses
- `routes/product.routes.js` – definerer `/products`-routes
- `routes/index.js` – samler routes og eksponerer `/health` + `/products`
- `app.js` + `index.js` – opsætter Express-app og starter serveren

---

### 2.2. payment-service (port 4002)

**Ansvar:**  
Står for at “processere” betalinger. Denne service er med vilje ustabil for at kunne demonstrere **resilience patterns** i `order-service`.

**Vigtige endpoints:**

- `GET /health`

  ```json
  {
    "status": "ok",
    "service": "payment-service"
  }
  ```

- `POST /payments`

  Request-body:

  ```json
  {
    "amount": 100,
    "orderId": "order-123"
  }
  ```

  Service-logikken simulerer ustabilitet:

  - ca. 20% af kald: **langsom respons** (ca. 5 sekunders delay)
  - ca. 30% af kald: **500-fejl** (fx `"Payment provider error"`)
  - resten: **success**, f.eks.:

    ```json
    {
      "status": "success",
      "transactionId": "tx-1733740000000",
      "orderId": "order-123",
      "amount": 100
    }
    ```

`order-service` skal kunne håndtere, at denne service nogle gange er langsom eller fejler.

Internt er payment-service opdelt i:

- `services/payment.service.js` – simulerer betaling + ustabil adfærd
- `controllers/payment.controller.js` – håndterer HTTP-kald til `/payments`
- `routes/payment.routes.js` + `routes/index.js`
- `app.js` + `index.js`

---

### 2.3. order-service (port 4000)

**Ansvar:**  
Står for oprettelse og visning af ordrer.  
`order-service` fungerer som en orkestrator mellem de andre services:

- Henter produktdata hos `product-service`
- Forsøger at oprette betaling hos `payment-service`
- Håndterer fejl og timeouts ved hjælp af resilience-logik

**Vigtige endpoints:**

- `GET /health`

  ```json
  {
    "status": "ok",
    "service": "order-service"
  }
  ```

- `POST /orders`

  Request-body:

  ```json
  {
    "productId": 1
  }
  ```

  Flow:

  1. `order-service` kalder `product-service` for at finde produktet.
  2. `order-service` forsøger at kalde `payment-service` for at processere betaling.
  3. Hvis betalingen lykkes:
     - ordren oprettes med `paymentStatus: "PAID"`
  4. Hvis betalingen fejler (timeout/500 osv.):
     - ordren oprettes stadig, men med `paymentStatus: "PENDING_PAYMENT"` og `payment: null`.

  Eksempel på succes (betaling lykkes):

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

- `GET /orders`

  Returnerer en liste over alle oprettede ordrer (in-memory):

  ```json
  [
    {
      "id": "order-1733740000000",
      "product": { "...": "..." },
      "paymentStatus": "PAID",
      "payment": { "...": "..." }
    },
    {
      "id": "order-1733740000001",
      "product": { "...": "..." },
      "paymentStatus": "PENDING_PAYMENT",
      "payment": null
    }
  ]
  ```

Internt er order-service opdelt i:

- `clients/productClient.js` – kalder product-service via HTTP
- `clients/paymentClient.js` – kalder payment-service via HTTP (med timeout)
- `services/order.service.js` – domænelogik for oprettelse af ordrer
- `controllers/order.controller.js` – HTTP-lag for `/orders`
- `routes/order.routes.js` + `routes/index.js`
- `app.js` + `index.js`

---

## 3. Resilience i order-service

Resilience-logikken ligger i kombinationen af:

- `clients/paymentClient.js`
- `services/order.service.js`

### Princip

- `order-service` er afhængig af `payment-service`, som er ustabil.
- Vi ønsker **ikke**, at en fejl i betaling nedlægger hele ordresystemet.
- I stedet:
  - forsøger vi at kalde `payment-service`
  - håndterer fejl/timeouts
  - opretter stadig ordren, men markerer den som `PENDING_PAYMENT`, hvis betalingen ikke kunne gennemføres.

### Konsekvens

- Systemet er **mere fault tolerant**:
  - Brugeren kan stadig få oprettet sin ordre.
  - Systemet kan senere (i et rigtigt system) forsøge at genoptage betalingen, sende notifikationer, osv.
- Vi kan demonstrere forskellen i responses:
  - Når alt er OK → `paymentStatus: "PAID"`
  - Når betaling fejler → `paymentStatus: "PENDING_PAYMENT"`

Dette er kernen i den resilience-historie, der kan bruges til eksamen.

---

## 4. Sådan kører du systemet lokalt

Krav:

- Node.js (version 18+ anbefalet)
- npm

### 4.1. Start product-service

```bash
cd product-service
npm install
node src/index.js
```

Du bør se:

```txt
product-service running on port 4001
```

### 4.2. Start payment-service

```bash
cd payment-service
npm install
node src/index.js
```

Du bør se:

```txt
payment-service running on port 4002
```

### 4.3. Start order-service

```bash
cd order-service
npm install
node src/index.js
```

Du bør se:

```txt
order-service running on port 4000
```

---

## 5. Test af API’er (med Postman eller curl)

### Health-checks

- `GET http://127.0.0.1:4001/health`
- `GET http://127.0.0.1:4002/health`
- `GET http://127.0.0.1:4000/health`

### Opret en ordre

```http
POST http://127.0.0.1:4000/orders
Content-Type: application/json

{
  "productId": 1
}
```

Svar kan vise:

- `paymentStatus: "PAID"` (hvis payment lykkes)
- eller `paymentStatus: "PENDING_PAYMENT"` (hvis payment-service var nede/langsom)

### Hent alle ordrer

```http
GET http://127.0.0.1:4000/orders
```

---

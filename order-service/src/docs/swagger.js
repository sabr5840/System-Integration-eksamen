
export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Order Service API",
    version: "1.0.0",
    description:
      "API til at oprette og hente ordrer i et lille microservice-baseret system."
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local development"
    }
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is up"
          }
        }
      }
    },
    "/orders": {
      get: {
        summary: "Hent alle ordrer",
        responses: {
          "200": {
            description: "Liste af ordrer",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Order" }
                }
              }
            }
          }
        }
      },
      post: {
        summary: "Opret en ny ordre",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrderRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Ordre oprettet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Order" }
              }
            }
          },
          "400": {
            description: "Manglende eller ugyldigt input"
          },
          "500": {
            description: "Serverfejl ved oprettelse af ordre"
          }
        }
      }
    }
  },
  components: {
    schemas: {
      CreateOrderRequest: {
        type: "object",
        properties: {
          productId: {
            type: "integer",
            example: 1
          }
        },
        required: ["productId"]
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Laptop" },
          price: { type: "number", example: 9999 }
        }
      },
      Payment: {
        type: "object",
        nullable: true,
        properties: {
          status: { type: "string", example: "success" },
          transactionId: { type: "string", example: "tx-1765392292595" },
          orderId: { type: "string", example: "order-1765392289557" },
          amount: { type: "number", example: 499 }
        }
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string", example: "order-1765392289557" },
          product: { $ref: "#/components/schemas/Product" },
          paymentStatus: {
            type: "string",
            enum: ["PAID", "PENDING_PAYMENT"],
            example: "PAID"
          },
          payment: { $ref: "#/components/schemas/Payment" }
        }
      }
    }
  }
};

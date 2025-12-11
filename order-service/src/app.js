// order-service/src/app.js
import express from "express";
import { registerRoutes } from "./routes/index.js";
import swaggerUi from "swagger-ui-express";
import { swaggerDocument } from "./docs/swagger.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  // Swagger UI på /docs
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Resten af API'et
  registerRoutes(app);

  return app;
}

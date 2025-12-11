import { Router } from "express";
import { orderRouter } from "./order.routes.js";

export function registerRoutes(app) {
  const router = Router();

  router.get("/health", (req, res) => {
    res.json({ status: "ok", service: "order-service" });
  });

  router.use("/orders", orderRouter);

  app.use(router);
}

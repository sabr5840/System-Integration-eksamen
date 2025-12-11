import { Router } from "express";
import { paymentRouter } from "./payment.routes.js";

export function registerRoutes(app) {
  const router = Router();

  router.get("/health", (req, res) => {
    res.json({ status: "ok", service: "payment-service" });
  });

  router.use("/", paymentRouter);

  app.use(router);
}

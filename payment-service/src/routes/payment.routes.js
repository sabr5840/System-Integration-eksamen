import { Router } from "express";
import { createPaymentHandler } from "../controllers/payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post("/payments", createPaymentHandler);

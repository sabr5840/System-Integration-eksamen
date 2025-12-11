import { Router } from "express";
import { createOrderHandler, listOrdersHandler } from "../controllers/order.controller.js";

export const orderRouter = Router();

orderRouter.post("/", createOrderHandler);
orderRouter.get("/", listOrdersHandler);

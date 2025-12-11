import { Router } from "express";
import {
  getProductsHandler,
  getProductByIdHandler
} from "../controllers/product.controller.js";

export const productRouter = Router();

productRouter.get("/", getProductsHandler);
productRouter.get("/:id", getProductByIdHandler);

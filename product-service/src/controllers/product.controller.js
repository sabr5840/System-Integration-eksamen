import { listProducts, getProductById } from "../services/product.service.js";

export function getProductsHandler(req, res) {
  const products = listProducts();
  res.json(products);
}

export function getProductByIdHandler(req, res) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  const product = getProductById(id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
}

import axios from "axios";
import { config } from "../config/config.js";

export async function getProductById(productId) {
  const url = `${config.services.productServiceUrl}/products/${productId}`;
  const response = await axios.get(url);
  return response.data;
}

const products = [
  { id: 1, name: "Laptop", price: 9999 },
  { id: 2, name: "Headphones", price: 799 },
  { id: 3, name: "Keyboard", price: 499 }
];

export function listProducts() {
  return products;
}

export function getProductById(id) {
  return products.find((p) => p.id === id) || null;
}

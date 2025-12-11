// src/index.js
import { createApp } from "./app.js";
import { config } from "./config/config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`product-service running on port ${config.port}`);
});

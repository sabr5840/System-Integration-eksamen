import { createApp } from "./app.js";
import { config } from "./config/config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`order-service running on port ${config.port}`);
});

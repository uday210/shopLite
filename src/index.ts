import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initDb } from "./db/client.js";

if (!config.authSecretFromEnv) {
  console.warn("AUTH_SECRET is unset; using the development default.");
}

await initDb();
const app = createApp();

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`ShopLite listening on http://0.0.0.0:${info.port} (${config.driver})`);
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errors.js";
import { authRoutes } from "./routes/auth.js";
import { cartRoutes } from "./routes/cart.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { healthRoutes } from "./routes/health.js";
import { orderRoutes } from "./routes/orders.js";
import { productRoutes } from "./routes/products.js";

export function createApp(): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.onError(errorHandler);

  app.route("/", healthRoutes);
  app.route("/", authRoutes);
  app.route("/", productRoutes);
  app.route("/", cartRoutes);
  app.route("/", checkoutRoutes);
  app.route("/", orderRoutes);

  app.get("/", (c) => {
    const html = readFileSync(path.resolve(process.cwd(), "public/index.html"), "utf8");
    return c.html(html);
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  return app;
}

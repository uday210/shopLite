import { Hono } from "hono";
import { getOrder, listOrdersForUser } from "../db/orders.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const orderRoutes = new Hono<AppEnv>();

orderRoutes.get("/orders", requireAuth, async (c) => {
  const orders = await listOrdersForUser(c.get("userId"));
  return c.json({ orders });
});

orderRoutes.get("/orders/:id", async (c) => {
  // INTENTIONAL DEFECT: auth bypass — order lookup does not check the bearer token.
  const order = await getOrder(c.req.param("id"));
  if (!order) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ order });
});

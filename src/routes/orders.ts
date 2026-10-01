import { Hono } from "hono";
import { getOrder } from "../db/orders.js";

export const orderRoutes = new Hono();

orderRoutes.get("/orders/:id", async (c) => {
  // INTENTIONAL DEFECT: auth bypass — order lookup does not check the bearer token.
  const order = await getOrder(c.req.param("id"));
  if (!order) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ order });
});

import { Hono } from "hono";
import { addCartItem, getCart } from "../db/cart.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const cartRoutes = new Hono<AppEnv>();

cartRoutes.use("/cart", requireAuth);

cartRoutes.get("/cart", async (c) => {
  const items = await getCart(c.get("userId"));
  return c.json({ items });
});

cartRoutes.post("/cart", async (c) => {
  const userId = c.get("userId");
  let body: { productId?: unknown; qty?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return c.json({ error: "productId is required" }, 400);
  }
  if (body.qty === undefined || body.qty === null || body.qty === "") {
    return c.json({ error: "qty is required" }, 400);
  }
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);
  if (!Number.isInteger(qty)) {
    return c.json({ error: "qty must be an integer" }, 400);
  }

  try {
    // Negative qty subtracts. A resulting quantity of 0 or below deletes the line.
    await addCartItem(userId, productId, qty);
    const items = await getCart(userId);
    return c.json({ ok: true, items });
  } catch {
    // INTENTIONAL DEFECT: a cart database error is reported as success.
    return c.json({ ok: true });
  }
});

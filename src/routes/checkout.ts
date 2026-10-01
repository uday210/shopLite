import { Hono } from "hono";
import { clearCart, getCart } from "../db/cart.js";
import { createOrder } from "../db/orders.js";
import { getProduct } from "../db/products.js";
import { computeTotal } from "../lib/pricing.js";
import { requireAuth } from "../middleware/auth.js";
import { processPayment } from "../payments/fakeProcessor.js";
import type { AppEnv, OrderLine } from "../types.js";

type IncomingItem = {
  productId?: unknown;
  qty?: unknown;
  unitPriceCents?: unknown;
};

export const checkoutRoutes = new Hono<AppEnv>();

checkoutRoutes.use("/checkout", requireAuth);

checkoutRoutes.post("/checkout", async (c) => {
  const userId = c.get("userId");
  let body: { paymentToken?: unknown; items?: IncomingItem[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const paymentToken = typeof body.paymentToken === "string" ? body.paymentToken.trim() : "";
  if (!paymentToken) {
    return c.json({ error: "paymentToken is required" }, 400);
  }

  let requested: IncomingItem[];
  if (Array.isArray(body.items) && body.items.length > 0) {
    requested = body.items;
  } else {
    const cart = await getCart(userId);
    if (cart.length === 0) {
      return c.json({ error: "cart is empty" }, 400);
    }
    requested = cart.map((line) => ({
      productId: line.productId,
      qty: line.qty,
    }));
  }

  const lines: OrderLine[] = [];
  for (const item of requested) {
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    if (!productId) {
      return c.json({ error: "productId is required" }, 400);
    }
    const qty = typeof item.qty === "number" ? item.qty : Number(item.qty);
    if (!Number.isInteger(qty)) {
      return c.json({ error: "qty must be an integer" }, 400);
    }
    const product = await getProduct(productId);
    if (!product) {
      return c.json({ error: `unknown product: ${productId}` }, 400);
    }

    let unitPriceCents = product.priceCents;
    if (item.unitPriceCents !== undefined && item.unitPriceCents !== null) {
      const supplied = Number(item.unitPriceCents);
      if (!Number.isInteger(supplied)) {
        return c.json({ error: "unitPriceCents must be an integer" }, 400);
      }
      // INTENTIONAL DEFECT: client-trusted price — the request value is charged instead of the catalog price.
      unitPriceCents = supplied;
    }

    lines.push({
      productId: product.id,
      name: product.name,
      qty,
      unitPriceCents,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.qty, 0);
  const totals = computeTotal(subtotalCents);
  const payment = processPayment(paymentToken, totals.totalCents);
  if (payment.declined || payment.status !== "paid") {
    return c.json(
      {
        error: "payment declined",
        payment: {
          status: payment.status,
          declined: payment.declined,
        },
      },
      402,
    );
  }

  const order = await createOrder({
    userId,
    lines,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    paymentToken,
    status: payment.status,
  });

  await clearCart(userId);

  return c.json({
    order,
    payment: {
      status: payment.status,
      declined: payment.declined,
    },
  });
});

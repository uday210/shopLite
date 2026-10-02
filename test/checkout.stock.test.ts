import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { getSqlite, initDb } from "../src/db/client.js";

const DECLINE_TOKENS = ["tok_decline", "decline", "tok_fail"] as const;

config.driver = "sqlite";
config.sqlitePath = path.join(mkdtempSync(path.join(tmpdir(), "shoplite-stock-")), "shoplite.sqlite");

let app: Hono;

before(async () => {
  await initDb();
  app = createApp();
});

async function tokenFor(userId: string): Promise<string> {
  const res = await app.request("/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string };
  return body.token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function storedStock(productId: string): number {
  const row = getSqlite().prepare("SELECT stock FROM products WHERE id = ?").get(productId) as {
    stock: number;
  };
  return Number(row.stock);
}

async function catalogStock(productId: string): Promise<number> {
  const res = await app.request("/products");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { products: { id: string; stock: number }[] };
  const product = body.products.find((item) => item.id === productId);
  assert.ok(product, productId);
  assert.equal(product.stock, storedStock(productId));
  return product.stock;
}

describe("checkout stock", () => {
  test("decrements stock by the cart quantity after a successful checkout", async () => {
    const userId = "stock_cart_paid";
    const bearer = await tokenFor(userId);
    const before = await catalogStock("prod_mug");
    const untouched = await catalogStock("prod_notebook");

    const added = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ productId: "prod_mug", qty: 2 }),
    });
    assert.equal(added.status, 200);
    assert.equal(await catalogStock("prod_mug"), before);

    const res = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ paymentToken: "tok_test" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      order: { status: string; items: { productId: string; qty: number }[] };
      payment: { status: string; declined: boolean };
    };
    assert.equal(body.payment.status, "paid");
    assert.equal(body.payment.declined, false);
    assert.equal(body.order.status, "paid");
    assert.equal(body.order.items[0]?.qty, 2);

    assert.equal(await catalogStock("prod_mug"), before - 2);
    assert.equal(storedStock("prod_mug"), before - 2);
    assert.equal(await catalogStock("prod_notebook"), untouched);
  });

  test("decrements each line by its quantity on a multi-item checkout", async () => {
    const bearer = await tokenFor("stock_multi_paid");
    const toteBefore = await catalogStock("prod_tote");
    const lampBefore = await catalogStock("prod_lamp");
    const bottleBefore = await catalogStock("prod_bottle");

    const res = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({
        paymentToken: "tok_visa",
        items: [
          { productId: "prod_tote", qty: 1 },
          { productId: "prod_lamp", qty: 3 },
        ],
      }),
    });
    assert.equal(res.status, 200);

    assert.equal(await catalogStock("prod_tote"), toteBefore - 1);
    assert.equal(await catalogStock("prod_lamp"), lampBefore - 3);
    assert.equal(storedStock("prod_bottle"), bottleBefore);
  });

  test("applies a later purchase on top of the updated stock", async () => {
    const bearer = await tokenFor("stock_second_paid");
    const before = await catalogStock("prod_mug");

    const res = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({
        paymentToken: "tok_test",
        items: [{ productId: "prod_mug", qty: 1 }],
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(await catalogStock("prod_mug"), before - 1);
  });

  for (const token of DECLINE_TOKENS) {
    test(`does not change stock when ${token} is declined`, async () => {
      const bearer = await tokenFor(`stock_decline_${token}`);
      const before = await catalogStock("prod_notebook");
      const ordersBefore = getSqlite().prepare("SELECT COUNT(*) AS count FROM orders").get() as {
        count: number;
      };

      const res = await app.request("/checkout", {
        method: "POST",
        headers: authHeaders(bearer),
        body: JSON.stringify({
          paymentToken: token,
          items: [{ productId: "prod_notebook", qty: 4 }],
        }),
      });
      assert.equal(res.status, 402);
      const body = (await res.json()) as { error?: string; order?: unknown; payment?: { declined?: boolean } };
      assert.equal(body.error, "payment declined");
      assert.equal(body.order, undefined);
      assert.equal(body.payment?.declined, true);

      assert.equal(await catalogStock("prod_notebook"), before);
      assert.equal(storedStock("prod_notebook"), before);
      const ordersAfter = getSqlite().prepare("SELECT COUNT(*) AS count FROM orders").get() as {
        count: number;
      };
      assert.equal(Number(ordersAfter.count), Number(ordersBefore.count));
    });
  }

  test("leaves stock unchanged when a cart checkout is declined", async () => {
    const bearer = await tokenFor("stock_decline_cart");
    const before = await catalogStock("prod_bottle");

    const added = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ productId: "prod_bottle", qty: 5 }),
    });
    assert.equal(added.status, 200);

    const checkout = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ paymentToken: "  TOK_FAIL  " }),
    });
    assert.equal(checkout.status, 402);
    assert.equal(await catalogStock("prod_bottle"), before);
    assert.equal(storedStock("prod_bottle"), before);

    const cart = await app.request("/cart", { headers: { authorization: `Bearer ${bearer}` } });
    const cartBody = (await cart.json()) as { items: { productId: string; qty: number }[] };
    assert.equal(cartBody.items[0]?.productId, "prod_bottle");
    assert.equal(cartBody.items[0]?.qty, 5);
  });
});

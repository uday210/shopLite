import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { getSqlite, initDb } from "../src/db/client.js";

config.driver = "sqlite";
config.sqlitePath = path.join(mkdtempSync(path.join(tmpdir(), "shoplite-cart-")), "shoplite.sqlite");

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

type CartItem = { productId: string; qty: number };

async function postCart(token: string, productId: string, qty: number): Promise<CartItem[]> {
  const res = await app.request("/cart", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ productId, qty }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok?: boolean; items?: CartItem[] };
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.items));
  return body.items;
}

function storedQty(userId: string, productId: string): number | null {
  const row = getSqlite()
    .prepare("SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?")
    .get(userId, productId) as { qty: number } | undefined;
  return row ? Number(row.qty) : null;
}

describe("POST /cart quantity adjust", () => {
  test("increases, decreases, and removes a line without storing zero or negative qty", async () => {
    const userId = "cart_adjust";
    const token = await tokenFor(userId);

    let items = await postCart(token, "prod_mug", 1);
    assert.deepEqual(
      items.map((item) => ({ productId: item.productId, qty: item.qty })),
      [{ productId: "prod_mug", qty: 1 }],
    );

    items = await postCart(token, "prod_mug", 1);
    assert.equal(items.find((item) => item.productId === "prod_mug")?.qty, 2);
    assert.equal(storedQty(userId, "prod_mug"), 2);

    items = await postCart(token, "prod_mug", -1);
    assert.equal(items.find((item) => item.productId === "prod_mug")?.qty, 1);

    items = await postCart(token, "prod_mug", -1);
    assert.equal(items.find((item) => item.productId === "prod_mug"), undefined);
    assert.equal(items.length, 0);
    assert.equal(storedQty(userId, "prod_mug"), null);
  });

  test("removes the whole line when qty is the negative of the current quantity", async () => {
    const userId = "cart_remove_all";
    const token = await tokenFor(userId);
    await postCart(token, "prod_tote", 3);
    const items = await postCart(token, "prod_tote", -3);
    assert.deepEqual(items, []);
    assert.equal(storedQty(userId, "prod_tote"), null);
  });

  test("deletes the line when a negative qty overshoots the current quantity", async () => {
    const userId = "cart_overshoot";
    const token = await tokenFor(userId);
    await postCart(token, "prod_notebook", 2);
    const items = await postCart(token, "prod_notebook", -5);
    assert.deepEqual(items, []);
    assert.equal(storedQty(userId, "prod_notebook"), null);
  });

  test("does not insert a line when qty is zero or negative and nothing is in the cart", async () => {
    const userId = "cart_noop";
    const token = await tokenFor(userId);
    const zero = await postCart(token, "prod_mug", 0);
    const negative = await postCart(token, "prod_tote", -2);
    assert.deepEqual(zero, []);
    assert.deepEqual(negative, []);
    assert.equal(storedQty(userId, "prod_mug"), null);
    assert.equal(storedQty(userId, "prod_tote"), null);
  });

  test("keeps lines in insertion order when a quantity changes", async () => {
    const userId = "cart_order";
    const token = await tokenFor(userId);

    await postCart(token, "prod_notebook", 1);
    await postCart(token, "prod_tote", 1);
    await postCart(token, "prod_mug", 1);

    const items = await postCart(token, "prod_tote", 1);
    assert.deepEqual(
      items.map((item) => item.productId),
      ["prod_notebook", "prod_tote", "prod_mug"],
    );
    assert.equal(items.find((item) => item.productId === "prod_tote")?.qty, 2);

    const listed = await app.request("/cart", { headers: { authorization: `Bearer ${token}` } });
    assert.equal(listed.status, 200);
    const listedBody = (await listed.json()) as { items: CartItem[] };
    assert.deepEqual(
      listedBody.items.map((item) => item.productId),
      ["prod_notebook", "prod_tote", "prod_mug"],
    );
  });

  test("rejects a missing productId and a non-integer qty", async () => {
    const token = await tokenFor("cart_validation");

    const missing = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ qty: 1 }),
    });
    assert.equal(missing.status, 400);
    const missingBody = (await missing.json()) as { error?: string };
    assert.equal(missingBody.error, "productId is required");

    const fractional = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ productId: "prod_mug", qty: 1.5 }),
    });
    assert.equal(fractional.status, 400);
    const fractionalBody = (await fractional.json()) as { error?: string };
    assert.equal(fractionalBody.error, "qty must be an integer");
  });
});

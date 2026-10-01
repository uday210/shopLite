import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { getSqlite, initDb } from "../src/db/client.js";
import { processPayment } from "../src/payments/fakeProcessor.js";

const DECLINE_TOKENS = ["tok_decline", "decline", "tok_fail"] as const;

config.driver = "sqlite";
config.sqlitePath = path.join(mkdtempSync(path.join(tmpdir(), "shoplite-decline-")), "shoplite.sqlite");

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

describe("processPayment", () => {
  test("marks a normal token as paid", () => {
    const payment = processPayment("tok_test", 1512);
    assert.deepEqual(payment, { status: "paid", declined: false });
  });

  for (const token of DECLINE_TOKENS) {
    test(`declines ${token} instead of reporting paid`, () => {
      const payment = processPayment(token, 1512);
      assert.equal(payment.declined, true);
      assert.equal(payment.status, "declined");
      assert.notEqual(payment.status, "paid");
    });
  }

  test("treats decline tokens as case-insensitive and trims whitespace", () => {
    for (const token of ["  TOK_DECLINE  ", "Decline", "\tTOK_FAIL\n"]) {
      const payment = processPayment(token, 100);
      assert.equal(payment.declined, true, token);
      assert.equal(payment.status, "declined", token);
    }
  });
});

describe("POST /checkout decline", () => {
  for (const token of DECLINE_TOKENS) {
    test(`rejects ${token} and does not persist a paid order`, async () => {
      const userId = `decline_${token}`;
      const bearer = await tokenFor(userId);
      const res = await app.request("/checkout", {
        method: "POST",
        headers: authHeaders(bearer),
        body: JSON.stringify({
          paymentToken: token,
          items: [{ productId: "prod_mug", qty: 1 }],
        }),
      });

      assert.equal(res.status, 402);
      const body = (await res.json()) as {
        error?: string;
        order?: { status?: string };
        payment?: { status?: string; declined?: boolean };
      };
      assert.equal(body.error, "payment declined");
      assert.equal(body.order, undefined);
      assert.equal(body.payment?.declined, true);
      assert.equal(body.payment?.status, "declined");
      assert.notEqual(body.payment?.status, "paid");

      const orders = getSqlite().prepare("SELECT status FROM orders WHERE user_id = ?").all(userId) as {
        status: string;
      }[];
      assert.equal(orders.length, 0);
    });
  }

  test("rejects a mixed-case decline token sent at checkout", async () => {
    const userId = "decline_mixed_case";
    const bearer = await tokenFor(userId);
    const res = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({
        paymentToken: "  ToK_DeCLiNe  ",
        items: [{ productId: "prod_notebook", qty: 1 }],
      }),
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as { payment?: { status?: string; declined?: boolean }; order?: unknown };
    assert.equal(body.payment?.status, "declined");
    assert.equal(body.payment?.declined, true);
    assert.equal(body.order, undefined);
  });

  test("leaves the cart in place when the payment is declined", async () => {
    const userId = "decline_keeps_cart";
    const bearer = await tokenFor(userId);
    const added = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ productId: "prod_tote", qty: 1 }),
    });
    assert.equal(added.status, 200);

    const checkout = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ paymentToken: "tok_fail" }),
    });
    assert.equal(checkout.status, 402);

    const cart = await app.request("/cart", { headers: { authorization: `Bearer ${bearer}` } });
    assert.equal(cart.status, 200);
    const cartBody = (await cart.json()) as { items: { productId: string; qty: number }[] };
    assert.equal(cartBody.items.length, 1);
    assert.equal(cartBody.items[0]?.productId, "prod_tote");
    assert.equal(cartBody.items[0]?.qty, 1);
  });

  test("still marks a successful token as paid and clears the cart", async () => {
    const userId = "paid_tok_test";
    const bearer = await tokenFor(userId);
    const added = await app.request("/cart", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ productId: "prod_mug", qty: 2 }),
    });
    assert.equal(added.status, 200);

    const res = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(bearer),
      body: JSON.stringify({ paymentToken: "tok_test" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      order: { id: string; status: string };
      payment: { status: string; declined: boolean };
    };
    assert.equal(body.order.status, "paid");
    assert.equal(body.payment.status, "paid");
    assert.equal(body.payment.declined, false);
    assert.match(body.order.id, /^ord_/);

    const stored = getSqlite().prepare("SELECT status FROM orders WHERE id = ?").get(body.order.id) as {
      status: string;
    };
    assert.equal(stored.status, "paid");

    const cart = await app.request("/cart", { headers: { authorization: `Bearer ${bearer}` } });
    const cartBody = (await cart.json()) as { items: unknown[] };
    assert.deepEqual(cartBody.items, []);
  });
});

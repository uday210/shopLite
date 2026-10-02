import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { initDb } from "../src/db/client.js";

config.driver = "sqlite";
config.sqlitePath = path.join(mkdtempSync(path.join(tmpdir(), "shoplite-screens-")), "shoplite.sqlite");

let app: Hono;

before(async () => {
  await initDb();
  app = createApp();
});

async function login(username: string, password: string) {
  return app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

describe("customer login", () => {
  test("issues a bearer token for the demo username and email", async () => {
    const byUsername = await login("demo", "shoplite-demo");
    assert.equal(byUsername.status, 200);
    const usernameBody = (await byUsername.json()) as { token: string; tokenType: string; userId: string };
    assert.equal(usernameBody.tokenType, "Bearer");
    assert.equal(usernameBody.userId, "demo_user");
    assert.ok(usernameBody.token.includes("."));

    const byEmail = await login("Demo@ShopLite.test", "shoplite-demo");
    assert.equal(byEmail.status, 200);
    const emailBody = (await byEmail.json()) as { userId: string };
    assert.equal(emailBody.userId, "demo_user");

    const guest = await login("guest@shoplite.test", "shoplite-guest");
    assert.equal(guest.status, 200);
    const guestBody = (await guest.json()) as { userId: string };
    assert.equal(guestBody.userId, "guest_user");

    const byEmailField = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@shoplite.test", password: "shoplite-guest" }),
    });
    assert.equal(byEmailField.status, 200);
    const emailFieldBody = (await byEmailField.json()) as { userId: string };
    assert.equal(emailFieldBody.userId, "guest_user");
  });

  test("rejects a wrong password and a missing password", async () => {
    const wrong = await login("demo", "nope");
    assert.equal(wrong.status, 401);
    const missing = await login("demo", "");
    assert.equal(missing.status, 400);
  });

  test("keeps passwordless token minting for existing clients", async () => {
    const res = await app.request("/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "api_client" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { userId: string; token: string };
    assert.equal(body.userId, "api_client");
    assert.ok(body.token);
  });
});

describe("previous orders", () => {
  test("lists only the signed-in user's orders, newest first", async () => {
    const demoLogin = await login("demo", "shoplite-demo");
    const guestLogin = await login("guest", "shoplite-guest");
    assert.equal(demoLogin.status, 200);
    assert.equal(guestLogin.status, 200);
    const demo = (await demoLogin.json()) as { token: string };
    const guest = (await guestLogin.json()) as { token: string };

    const empty = await app.request("/orders", { headers: authHeaders(demo.token) });
    assert.equal(empty.status, 200);
    const emptyBody = (await empty.json()) as { orders: unknown[] };
    assert.deepEqual(emptyBody.orders, []);

    const first = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(demo.token),
      body: JSON.stringify({
        paymentToken: "tok_test",
        items: [{ productId: "prod_mug", qty: 1 }],
      }),
    });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { order: { id: string } };
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await app.request("/checkout", {
      method: "POST",
      headers: authHeaders(demo.token),
      body: JSON.stringify({
        paymentToken: "tok_test",
        items: [{ productId: "prod_notebook", qty: 2 }],
      }),
    });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { order: { id: string } };

    const listed = await app.request("/orders", { headers: authHeaders(demo.token) });
    assert.equal(listed.status, 200);
    const listedBody = (await listed.json()) as {
      orders: { id: string; userId: string; items: { productId: string }[] }[];
    };
    assert.deepEqual(
      listedBody.orders.map((order) => order.id),
      [secondBody.order.id, firstBody.order.id],
    );
    assert.ok(listedBody.orders.every((order) => order.userId === "demo_user"));
    assert.equal(listedBody.orders[0]?.items[0]?.productId, "prod_notebook");

    const guestOrders = await app.request("/orders", { headers: authHeaders(guest.token) });
    assert.equal(guestOrders.status, 200);
    const guestBody = (await guestOrders.json()) as { orders: unknown[] };
    assert.deepEqual(guestBody.orders, []);

    const lookup = await app.request("/orders/" + firstBody.order.id);
    assert.equal(lookup.status, 200);
  });

  test("requires a bearer token", async () => {
    const res = await app.request("/orders");
    assert.equal(res.status, 401);
  });
});

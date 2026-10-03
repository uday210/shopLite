import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { getSqlite, initDb } from "../src/db/client.js";

config.driver = "sqlite";
config.sqlitePath = path.join(mkdtempSync(path.join(tmpdir(), "shoplite-newsletter-")), "shoplite.sqlite");

let app: Hono;

before(async () => {
  await initDb();
  app = createApp();
});

async function postNewsletter(email: unknown, extraHeaders?: Record<string, string>) {
  return app.request("/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({ email }),
  });
}

function storedSignup(email: string): { email: string; created_at: string } | undefined {
  return getSqlite()
    .prepare("SELECT email, created_at FROM newsletter_signups WHERE email = ?")
    .get(email) as { email: string; created_at: string } | undefined;
}

describe("POST /newsletter", () => {
  test("saves a trimmed lowercase address and does not require a bearer token", async () => {
    const res = await postNewsletter("  Ada@Shop.TEST  ");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok?: boolean };
    assert.deepEqual(body, { ok: true });

    const row = storedSignup("ada@shop.test");
    assert.ok(row);
    assert.equal(row.email, "ada@shop.test");
    assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  test("treats a repeat signup as success and leaves the original row", async () => {
    const first = await postNewsletter("repeat@shop.test");
    assert.equal(first.status, 200);
    const original = storedSignup("repeat@shop.test");
    assert.ok(original);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await postNewsletter("  Repeat@Shop.TEST ");
    assert.equal(second.status, 200);
    const again = (await second.json()) as { ok?: boolean };
    assert.deepEqual(again, { ok: true });

    const rows = getSqlite()
      .prepare("SELECT email, created_at FROM newsletter_signups WHERE email = ?")
      .all("repeat@shop.test") as { email: string; created_at: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.created_at, original.created_at);
  });

  test("rejects an address that is not a single email", async () => {
    const invalid = [
      "",
      "not-an-email",
      "ada@",
      "@shop.test",
      "ada@shoplite",
      "ada@@shop.test",
      "ada@shop.test extra",
      "ada @shop.test",
      "ada@shop.test,bea@shop.test",
    ];

    for (const email of invalid) {
      const res = await postNewsletter(email);
      assert.equal(res.status, 400, email);
      const body = (await res.json()) as { error?: string; ok?: boolean };
      assert.equal(body.error, "Enter a valid email address.", email);
      assert.equal(body.ok, undefined, email);
    }

    const stored = getSqlite().prepare("SELECT email FROM newsletter_signups").all() as { email: string }[];
    for (const email of invalid) {
      assert.equal(
        stored.some((row) => row.email === email.trim().toLowerCase()),
        false,
        email,
      );
    }
  });

  test("rejects a missing or non-string email and invalid JSON", async () => {
    const missing = await app.request("/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);
    assert.equal(((await missing.json()) as { error?: string }).error, "Enter a valid email address.");

    const numeric = await postNewsletter(42);
    assert.equal(numeric.status, 400);

    const broken = await app.request("/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(broken.status, 400);
    assert.equal(((await broken.json()) as { error?: string }).error, "Enter a valid email address.");
  });

  test("accepts a bearer token but does not require one", async () => {
    const res = await postNewsletter("guest@shop.test", { authorization: "Bearer not-a-real-token" });
    assert.equal(res.status, 200);
    assert.equal(storedSignup("guest@shop.test")?.email, "guest@shop.test");
  });

  test("reports a database failure instead of success", async () => {
    getSqlite().exec("ALTER TABLE newsletter_signups RENAME TO newsletter_signups_hidden");
    try {
      const res = await postNewsletter("hidden@shop.test");
      assert.equal(res.status, 500);
      const body = (await res.json()) as { error?: string; ok?: boolean };
      assert.equal(body.ok, undefined);
      assert.equal(typeof body.error, "string");
      assert.ok(body.error && body.error.length > 0);
      assert.notEqual(body.error, "You're on the list.");
    } finally {
      getSqlite().exec("ALTER TABLE newsletter_signups_hidden RENAME TO newsletter_signups");
    }
  });
});

describe("newsletter form", () => {
  test("posts the email field and no longer claims the note was not sent", () => {
    const html = readFileSync(path.resolve(process.cwd(), "public/index.html"), "utf8");
    assert.equal(html.includes("This note was not sent."), false);
    assert.match(html, /id="note-form"/);
    assert.match(html, /id="note-email"[^>]*required/);
    assert.match(html, /id="note-status"/);
    assert.match(html, /You're on the list\./);
    assert.match(html, /Could not join the list\. Try again\./);
    assert.match(html, /\/newsletter/);
  });
});

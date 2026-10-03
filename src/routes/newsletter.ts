import { Hono } from "hono";
import { saveNewsletterSignup } from "../db/newsletter.js";

export const newsletterRoutes = new Hono();

const INVALID_EMAIL = "Enter a valid email address.";

export function normalizeNewsletterEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || /\s/.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain || !domain.includes(".")) return null;
  return email;
}

newsletterRoutes.post("/newsletter", async (c) => {
  let body: { email?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: INVALID_EMAIL }, 400);
  }

  const email = normalizeNewsletterEmail(body?.email);
  if (!email) {
    return c.json({ error: INVALID_EMAIL }, 400);
  }

  try {
    await saveNewsletterSignup(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join the list.";
    return c.json({ error: message }, 500);
  }

  return c.json({ ok: true });
});

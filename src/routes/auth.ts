import { Hono } from "hono";
import { config } from "../config.js";
import { signToken } from "../lib/tokens.js";

export const authRoutes = new Hono();

authRoutes.post("/auth/token", async (c) => {
  let body: { userId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || userId.length > 80) {
    return c.json({ error: "userId is required" }, 400);
  }

  const token = signToken(userId, config.authSecret);
  return c.json({
    token,
    tokenType: "Bearer",
    userId,
  });
});

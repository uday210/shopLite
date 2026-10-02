import { Hono } from "hono";
import { config } from "../config.js";
import { authenticateDemoAccount } from "../lib/demoAccounts.js";
import { signToken } from "../lib/tokens.js";

export const authRoutes = new Hono();

authRoutes.post("/auth/login", async (c) => {
  let body: { username?: unknown; email?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const login =
    typeof body.username === "string" && body.username.trim()
      ? body.username
      : typeof body.email === "string"
        ? body.email
        : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login.trim() || !password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  const userId = authenticateDemoAccount(login, password);
  if (!userId) {
    return c.json({ error: "invalid credentials" }, 401);
  }

  const token = signToken(userId, config.authSecret);
  return c.json({
    token,
    tokenType: "Bearer",
    userId,
  });
});

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

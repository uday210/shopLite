import type { MiddlewareHandler } from "hono";
import { config } from "../config.js";
import { verifyToken } from "../lib/tokens.js";
import type { AppEnv } from "../types.js";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) {
    return c.json({ error: "missing bearer token" }, 401);
  }
  const payload = verifyToken(match[1], config.authSecret);
  if (!payload) {
    return c.json({ error: "invalid token" }, 401);
  }
  c.set("userId", payload.sub);
  await next();
};

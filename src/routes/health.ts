import { Hono } from "hono";
import { config } from "../config.js";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "shoplite",
    db: config.driver,
  });
});

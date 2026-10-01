import { Hono } from "hono";
import { queryRaw } from "../db/client.js";
import { mapProduct } from "../db/map.js";
import { listProducts } from "../db/products.js";

export const productRoutes = new Hono();

productRoutes.get("/products", async (c) => {
  const q = c.req.query("q");
  if (q == null || q === "") {
    return c.json({ products: await listProducts() });
  }

  // INTENTIONAL DEFECT: SQL injection — the search string is concatenated into the statement.
  const sql =
    "SELECT id, name, description, price_cents, stock, sku FROM products WHERE LOWER(name) LIKE '%" +
    q +
    "%' OR LOWER(description) LIKE '%" +
    q +
    "%' OR LOWER(sku) LIKE '%" +
    q +
    "%'";

  const rows = await queryRaw(sql);
  return c.json({ products: rows.map((row) => mapProduct(row)) });
});

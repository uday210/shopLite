import { config } from "../config.js";
import type { Product } from "../types.js";
import { getSqlite, getSupabase } from "./client.js";
import { asRecord, mapProduct } from "./map.js";

export async function listProducts(): Promise<Product[]> {
  if (config.driver === "sqlite") {
    const rows = getSqlite()
      .prepare(
        "SELECT id, name, description, price_cents, stock, sku FROM products ORDER BY name COLLATE NOCASE",
      )
      .all();
    return rows.map((row) => mapProduct(asRecord(row)));
  }

  const { data, error } = await getSupabase()
    .from("products")
    .select("id, name, description, price_cents, stock, sku")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapProduct(asRecord(row)));
}

export async function getProduct(id: string): Promise<Product | null> {
  if (config.driver === "sqlite") {
    const row = getSqlite()
      .prepare("SELECT id, name, description, price_cents, stock, sku FROM products WHERE id = ?")
      .get(id);
    return row ? mapProduct(asRecord(row)) : null;
  }

  const { data, error } = await getSupabase()
    .from("products")
    .select("id, name, description, price_cents, stock, sku")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProduct(asRecord(data)) : null;
}

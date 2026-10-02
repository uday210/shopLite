import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { CartLine } from "../types.js";
import { getSqlite, getSupabase } from "./client.js";
import { asRecord, mapCartLine } from "./map.js";

type CartRow = {
  id: string;
  qty: number;
};

async function findCartRow(userId: string, productId: string): Promise<CartRow | null> {
  if (config.driver === "sqlite") {
    const row = getSqlite()
      .prepare("SELECT id, qty FROM cart_items WHERE user_id = ? AND product_id = ?")
      .get(userId, productId);
    if (!row) return null;
    const record = asRecord(row);
    return { id: String(record.id), qty: Number(record.qty) };
  }

  const { data, error } = await getSupabase()
    .from("cart_items")
    .select("id, qty")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: String(data.id), qty: Number(data.qty) };
}

export async function addCartItem(userId: string, productId: string, qty: number): Promise<void> {
  const existing = await findCartRow(userId, productId);
  const nextQty = (existing?.qty ?? 0) + qty;

  if (nextQty <= 0) {
    if (!existing) return;
    if (config.driver === "sqlite") {
      getSqlite().prepare("DELETE FROM cart_items WHERE id = ?").run(existing.id);
      return;
    }
    const { error } = await getSupabase().from("cart_items").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (config.driver === "sqlite") {
    if (existing) {
      getSqlite().prepare("UPDATE cart_items SET qty = ? WHERE id = ?").run(nextQty, existing.id);
      return;
    }
    getSqlite()
      .prepare("INSERT INTO cart_items (id, user_id, product_id, qty) VALUES (?, ?, ?, ?)")
      .run(`ci_${randomUUID()}`, userId, productId, nextQty);
    return;
  }

  if (existing) {
    const { error } = await getSupabase().from("cart_items").update({ qty: nextQty }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await getSupabase().from("cart_items").insert({
    id: `ci_${randomUUID()}`,
    user_id: userId,
    product_id: productId,
    qty: nextQty,
  });
  if (error) throw new Error(error.message);
}

export async function getCart(userId: string): Promise<CartLine[]> {
  if (config.driver === "sqlite") {
    const rows = getSqlite()
      .prepare(
        `SELECT c.id, c.product_id, c.qty, p.name, p.sku, p.price_cents
         FROM cart_items c
         JOIN products p ON p.id = c.product_id
         WHERE c.user_id = ?
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all(userId);
    return rows.map((row) => mapCartLine(asRecord(row)));
  }

  const { data, error } = await getSupabase()
    .from("cart_items")
    .select("id, product_id, qty")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const items = data ?? [];
  if (items.length === 0) return [];

  const ids = items.map((item) => String(item.product_id));
  const products = await getSupabase()
    .from("products")
    .select("id, name, sku, price_cents")
    .in("id", ids);
  if (products.error) throw new Error(products.error.message);
  const byId = new Map((products.data ?? []).map((product) => [String(product.id), product]));

  return items.flatMap((item) => {
    const product = byId.get(String(item.product_id));
    if (!product) return [];
    return [
      mapCartLine({
        id: item.id,
        product_id: item.product_id,
        qty: item.qty,
        name: product.name,
        sku: product.sku,
        price_cents: product.price_cents,
      }),
    ];
  });
}

export async function clearCart(userId: string): Promise<void> {
  if (config.driver === "sqlite") {
    getSqlite().prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId);
    return;
  }
  const { error } = await getSupabase().from("cart_items").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

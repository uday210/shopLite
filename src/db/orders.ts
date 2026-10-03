import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { Order, OrderLine } from "../types.js";
import { getSqlite, getSupabase } from "./client.js";
import { asRecord, mapOrder } from "./map.js";
import { decrementProductStock, getProduct } from "./products.js";

export type CreateOrderInput = {
  userId: string;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentToken: string;
  status: string;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  // INTENTIONAL DEFECT: race/oversell — stock is read with no transaction and no row lock,
  // then the order is inserted anyway, so concurrent checkouts can oversell.
  const stockSnapshot = await Promise.all(
    input.lines.map(async (line) => {
      const product = await getProduct(line.productId);
      if (!product) throw new Error(`Unknown product: ${line.productId}`);
      return { productId: product.id, stock: product.stock, qty: line.qty };
    }),
  );
  const order: Order = {
    id: `ord_${randomUUID()}`,
    userId: input.userId,
    status: input.status,
    subtotalCents: input.subtotalCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    items: input.lines,
    createdAt: new Date().toISOString(),
  };

  if (config.driver === "sqlite") {
    getSqlite()
      .prepare(
        `INSERT INTO orders (
          id, user_id, status, subtotal_cents, tax_cents, total_cents, payment_token, items_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        order.id,
        order.userId,
        order.status,
        order.subtotalCents,
        order.taxCents,
        order.totalCents,
        input.paymentToken,
        JSON.stringify(order.items),
        order.createdAt,
      );
  } else {
    const { error } = await getSupabase().from("orders").insert({
      id: order.id,
      user_id: order.userId,
      status: order.status,
      subtotal_cents: order.subtotalCents,
      tax_cents: order.taxCents,
      total_cents: order.totalCents,
      payment_token: input.paymentToken,
      items_json: JSON.stringify(order.items),
      created_at: order.createdAt,
    });
    if (error) throw new Error(error.message);
  }

  if (order.status === "paid") {
    for (const line of stockSnapshot) {
      await decrementProductStock(line.productId, line.qty);
    }
  }

  return order;
}

export async function listOrdersForUser(userId: string): Promise<Order[]> {
  if (config.driver === "sqlite") {
    const rows = getSqlite()
      .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId);
    return rows.map((row) => mapOrder(asRecord(row)));
  }

  const { data, error } = await getSupabase()
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapOrder(asRecord(row)));
}

export async function getOrder(id: string): Promise<Order | null> {
  if (config.driver === "sqlite") {
    const row = getSqlite().prepare("SELECT * FROM orders WHERE id = ?").get(id);
    return row ? mapOrder(asRecord(row)) : null;
  }

  const { data, error } = await getSupabase().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapOrder(asRecord(data)) : null;
}

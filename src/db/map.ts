import type { CartLine, Order, OrderLine, Product } from "../types.js";

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    priceCents: Number(row.price_cents ?? row.priceCents),
    stock: Number(row.stock),
    sku: String(row.sku),
  };
}

export function mapCartLine(row: Record<string, unknown>): CartLine {
  return {
    id: String(row.id),
    productId: String(row.product_id ?? row.productId),
    name: String(row.name),
    sku: String(row.sku),
    qty: Number(row.qty),
    unitPriceCents: Number(row.price_cents ?? row.unitPriceCents),
    stock: Number(row.stock),
  };
}

export function mapOrder(row: Record<string, unknown>): Order {
  const rawItems = row.items_json ?? row.items;
  let items: OrderLine[] = [];
  if (typeof rawItems === "string") {
    items = JSON.parse(rawItems) as OrderLine[];
  } else if (Array.isArray(rawItems)) {
    items = rawItems as OrderLine[];
  }
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    status: String(row.status),
    subtotalCents: Number(row.subtotal_cents ?? row.subtotalCents),
    taxCents: Number(row.tax_cents ?? row.taxCents),
    totalCents: Number(row.total_cents ?? row.totalCents),
    items,
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

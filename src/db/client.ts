import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { SEED_PRODUCTS } from "./seed.js";

let sqlite: DatabaseSync | null = null;
let supabase: SupabaseClient | null = null;

export function getSqlite(): DatabaseSync {
  if (!sqlite) throw new Error("SQLite is not initialized");
  return sqlite;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not initialized");
  return supabase;
}

function applySqliteSchema(db: DatabaseSync): void {
  const migrationPath = path.resolve(process.cwd(), "migrations/001_init.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const portable = sql.split("-- SUPABASE ONLY")[0] ?? sql;
  db.exec(portable);
}

function seedSqlite(db: DatabaseSync): void {
  const row = db.prepare("SELECT COUNT(*) AS count FROM products").get() as { count: number } | undefined;
  if ((row?.count ?? 0) > 0) return;
  const insert = db.prepare(
    "INSERT INTO products (id, name, description, price_cents, stock, sku) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const product of SEED_PRODUCTS) {
    insert.run(product.id, product.name, product.description, product.price_cents, product.stock, product.sku);
  }
}

async function seedSupabase(client: SupabaseClient): Promise<void> {
  const probe = await client.from("products").select("id").limit(1);
  if (probe.error) {
    throw new Error(
      `Supabase is not ready (${probe.error.message}). Apply migrations/001_init.sql in the SQL editor.`,
    );
  }
  if ((probe.data ?? []).length > 0) return;
  const inserted = await client.from("products").insert(SEED_PRODUCTS);
  if (inserted.error) {
    throw new Error(`Failed to seed Supabase products: ${inserted.error.message}`);
  }
}

export async function initDb(): Promise<void> {
  if (config.driver === "supabase") {
    supabase = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await seedSupabase(supabase);
    return;
  }

  mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  sqlite = new DatabaseSync(config.sqlitePath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  applySqliteSchema(sqlite);
  seedSqlite(sqlite);
}

export async function queryRaw(sql: string): Promise<Record<string, unknown>[]> {
  if (config.driver === "sqlite") {
    const rows = getSqlite().prepare(sql).all();
    return rows as Record<string, unknown>[];
  }

  const { data, error } = await getSupabase().rpc("shoplite_query", { query: sql });
  if (error) throw new Error(error.message);
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "string") {
    const parsed = JSON.parse(data) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  }
  return [];
}

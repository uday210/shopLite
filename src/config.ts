export type DbDriver = "sqlite" | "supabase";

const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  "";

export const config = {
  port: Number(process.env.PORT || 4317),
  authSecret: process.env.AUTH_SECRET?.trim() || "dev-insecure-auth-secret",
  authSecretFromEnv: Boolean(process.env.AUTH_SECRET?.trim()),
  supabaseUrl,
  supabaseKey,
  driver: (supabaseUrl && supabaseKey ? "supabase" : "sqlite") as DbDriver,
  sqlitePath: "data/shoplite.sqlite",
};

if (!Number.isInteger(config.port) || config.port <= 0) {
  throw new Error("PORT must be a positive integer");
}

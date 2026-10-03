import { config } from "../config.js";
import { getSqlite, getSupabase } from "./client.js";

function isDuplicateSignup(error: { code?: string; message?: string; details?: string | null }): boolean {
  if (error.code === "23505") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("duplicate key");
}

export async function saveNewsletterSignup(email: string): Promise<void> {
  const createdAt = new Date().toISOString();

  if (config.driver === "sqlite") {
    getSqlite()
      .prepare("INSERT OR IGNORE INTO newsletter_signups (email, created_at) VALUES (?, ?)")
      .run(email, createdAt);
    return;
  }

  const { error } = await getSupabase().from("newsletter_signups").insert({
    email,
    created_at: createdAt,
  });
  if (error && !isDuplicateSignup(error)) {
    throw new Error(error.message);
  }
}

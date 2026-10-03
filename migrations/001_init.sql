-- ShopLite schema. The statements above the SUPABASE ONLY marker run on
-- SQLite at startup and can be applied as-is in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products (id),
  qty INTEGER NOT NULL,
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  payment_token TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_signups (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- SUPABASE ONLY
-- Product search sends the SQL string built in src/routes/products.ts.
-- SQLite runs that string directly; Supabase runs it through this function.

CREATE OR REPLACE FUNCTION public.shoplite_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF lower(btrim(query)) NOT LIKE 'select %' THEN
    RAISE EXCEPTION 'shoplite_query only accepts SELECT';
  END IF;
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (' || query || ') t'
    INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.shoplite_query(text) TO anon, authenticated, service_role;

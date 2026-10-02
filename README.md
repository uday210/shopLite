# ShopLite

Small e-commerce API for a support-bot pipeline: browse products, keep a cart, check out with a fake payment token, and look up an order.

Known bugs are listed in [DEFECTS.md](DEFECTS.md) and marked in source with `// INTENTIONAL DEFECT:`. They are part of the seed.

## Stack

- TypeScript on Node.js 22+
- [Hono](https://hono.dev/) via `@hono/node-server`
- SQLite (`node:sqlite`) at `data/shoplite.sqlite` when Supabase is not configured
- `@supabase/supabase-js` when `SUPABASE_URL` and a key are set
- One SQL migration: `migrations/001_init.sql` (`products`, `cart_items`, `orders`)
- Static demo page at `public/index.html`

## Run

```bash
npm install
npm run build
npm start
```

The server listens on port **4317** unless `PORT` is set. Open [http://localhost:4317](http://localhost:4317) for the demo page.

For a rebuild-on-save loop during development:

```bash
npm run dev
```

`npm start` runs the compiled `dist/index.js`, so run `npm run build` after source changes.

Decline-payment regression tests:

```bash
npm test
```

## Environment

Copy `.env.example` if you want a file to edit. The process reads the environment directly.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | No | Supabase project URL. When unset, ShopLite uses SQLite. |
| `SUPABASE_SERVICE_KEY` | No | Service role key. Preferred when using Supabase. |
| `SUPABASE_ANON_KEY` | No | Used when `SUPABASE_SERVICE_KEY` is unset. |
| `AUTH_SECRET` | No | HMAC secret for bearer tokens. Defaults to a development value when unset. |
| `PORT` | No | HTTP port. Default `4317`. |

SQLite is selected when `SUPABASE_URL` is empty or neither Supabase key is set. The first startup creates `data/shoplite.sqlite` and seeds five products.

To use Supabase, set `SUPABASE_URL` and either `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY`, then run `migrations/001_init.sql` in the Supabase SQL editor. Startup seeds the same five products when `products` is empty. Product search calls the `shoplite_query` function from that migration.

## Auth

`POST /auth/token` mints a bearer token for a `userId`. Send it as `Authorization: Bearer <token>` on cart and checkout. This is demo auth: there is no password check.

## Endpoints

### `GET /health`

```json
{ "ok": true, "service": "shoplite", "db": "sqlite" }
```

### `POST /auth/token`

```bash
curl -s -X POST http://localhost:4317/auth/token \
  -H 'content-type: application/json' \
  -d '{"userId":"demo_user"}'
```

### `GET /products`

Returns the catalog. `GET /products?q=mug` searches name, description, and SKU.

### `POST /cart` and `GET /cart`

Require a bearer token. `POST` adds `qty` to the line for `productId` (use a negative `qty` to subtract). When the resulting quantity is zero or below, the line is removed.

```bash
curl -s -X POST http://localhost:4317/cart \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"productId":"prod_mug","qty":1}'
```

### `POST /checkout`

Requires a bearer token. With no `items` array, the current cart is checked out and then cleared. `paymentToken` is any fake token such as `tok_test`. Decline tokens (`tok_decline`, `decline`, `tok_fail`, compared case-insensitively) are rejected with HTTP 402. No order is created and the cart is left in place.

Optional `items` can override the cart. If a line includes `unitPriceCents`, that integer is what gets charged.

```bash
curl -s -X POST http://localhost:4317/checkout \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"paymentToken":"tok_test"}'
```

### `GET /orders/:id`

Returns the order created at checkout.

## Seed catalog

| id | name | sku | price |
| --- | --- | --- | --- |
| `prod_tote` | Canvas Tote | TOTE-001 | $24.00 |
| `prod_mug` | Ceramic Mug | MUG-002 | $14.00 |
| `prod_notebook` | Notebook | NOTE-003 | $9.50 |
| `prod_lamp` | Desk Lamp | LAMP-004 | $42.00 |
| `prod_bottle` | Water Bottle | BOTTLE-005 | $18.00 |

Prices are stored in cents.

## Docker / Railway

```bash
docker build -t shoplite .
docker run --rm -p 4317:4317 -e PORT=4317 shoplite
```

The image uses Node 22, builds TypeScript, and starts with `npm start`. Railway can use the Dockerfile as-is and inject `PORT`.

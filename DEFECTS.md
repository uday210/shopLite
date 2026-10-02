# Intentional defects

These bugs are part of the ShopLite seed for the support-bot pipeline. Leave them in place.

1. **Client-trusted price.** `POST /checkout` charges `unitPriceCents` from the request body when that field is present, instead of the catalog price. See `src/routes/checkout.ts`.
2. **Fixed: inventory is decremented after a paid order.** `createOrder` in `src/db/orders.ts` reduces `products.stock` by each line quantity when the order status is `paid`. Declined payments return before `createOrder`, so they leave stock unchanged.
3. **Fixed: zero and negative quantities are no longer stored.** `addCartItem` in `src/db/cart.ts` deletes the cart line when the resulting quantity is `0` or below. Subtracting from a missing line is a no-op. `POST /cart` still accepts a negative integer so the client can decrease or remove a line.
4. **Auth bypass on order lookup.** `GET /orders/:id` does not require a bearer token, so any caller who knows an order id can read it. See `src/routes/orders.ts`.
5. **SQL injection on product search.** `GET /products?q=` concatenates `q` into the SQL text in `src/routes/products.ts`. SQLite executes that string directly. When Supabase is configured, the same string is passed to the `shoplite_query` function defined in `migrations/001_init.sql`.
6. **Fixed: a declined payment is no longer marked paid.** `processPayment` in `src/payments/fakeProcessor.ts` returns `status: "declined"` for `tok_decline`, `decline`, and `tok_fail`. `POST /checkout` responds with HTTP 402, does not create an order, and does not clear the cart.
7. **Cart database errors return success.** If the cart write throws (for example an unknown `productId` foreign key), `POST /cart` responds with `{ "ok": true }`. See `src/routes/cart.ts`.
8. **Oversell race.** `createOrder` in `src/db/orders.ts` reads stock with no transaction and no row lock, then inserts the order. Concurrent checkouts are not serialized.
9. **Stack traces on 500.** The error middleware in `src/middleware/errors.ts` returns `message` and `stack` to the client for unhandled errors.
10. **Tax total is off by one cent.** `computeTotal` in `src/lib/pricing.ts` sets `taxCents` to `round(subtotalCents * 0.08)` and `totalCents` to `subtotalCents + taxCents - 1`.
11. **Fixed: zero-stock products no longer offer Add to cart.** The catalog in `public/index.html` renders a disabled "Out of stock" control when `stock` is missing, not finite, or `0` or below. Products with stock above zero still use Add to cart. `POST /cart` already rejects a quantity above `product.stock`.

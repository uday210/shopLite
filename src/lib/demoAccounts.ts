import { createHash, timingSafeEqual } from "node:crypto";

export type DemoAccount = {
  userId: string;
  username: string;
  email: string;
  password: string;
};

/** Hardcoded storefront accounts. POST /auth/token stays passwordless for existing API clients. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    userId: "demo_user",
    username: "demo",
    email: "demo@shoplite.test",
    password: "shoplite-demo",
  },
  {
    userId: "guest_user",
    username: "guest",
    email: "guest@shoplite.test",
    password: "shoplite-guest",
  },
];

function sameSecret(input: string, expected: string): boolean {
  const actual = createHash("sha256").update(input).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

/** Returns the account userId when the username or email and password match. */
export function authenticateDemoAccount(login: string, password: string): string | null {
  const normalized = login.trim().toLowerCase();
  const account = DEMO_ACCOUNTS.find(
    (item) => normalized === item.username || normalized === item.email,
  );
  const expectedPassword = account?.password ?? DEMO_ACCOUNTS[0].password;
  const passwordOk = sameSecret(password, expectedPassword);
  if (!account || !passwordOk) return null;
  return account.userId;
}

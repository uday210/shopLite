export type PaymentStatus = "paid" | "declined";

export type PaymentResult = {
  status: PaymentStatus;
  declined: boolean;
};

const DECLINE_TOKENS = new Set(["tok_decline", "decline", "tok_fail"]);

export function processPayment(token: string, _amountCents: number): PaymentResult {
  const declined = DECLINE_TOKENS.has(token.trim().toLowerCase());
  return {
    status: declined ? "declined" : "paid",
    declined,
  };
}

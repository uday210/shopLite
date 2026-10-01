export type PaymentResult = {
  status: "paid";
  declined: boolean;
};

const DECLINE_TOKENS = new Set(["tok_decline", "decline", "tok_fail"]);

export function processPayment(token: string, _amountCents: number): PaymentResult {
  const declined = DECLINE_TOKENS.has(token.trim().toLowerCase());
  // INTENTIONAL DEFECT: a declined charge is still returned with status "paid".
  return {
    status: "paid",
    declined,
  };
}

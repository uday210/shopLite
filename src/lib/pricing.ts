export type Totals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

const TAX_RATE = 0.08;

export function computeTotal(subtotalCents: number): Totals {
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  // INTENTIONAL DEFECT: total is one cent less than subtotal + tax.
  const totalCents = subtotalCents + taxCents - 1;
  return { subtotalCents, taxCents, totalCents };
}

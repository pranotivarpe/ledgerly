/**
 * All money is stored and computed as integer cents to avoid floating-point drift.
 * Quantities may be fractional (e.g. 1.5 hours); line amounts are rounded to the cent.
 */
export type LineInput = { quantity: number; unitPriceCents: number };

export function lineAmountCents({ quantity, unitPriceCents }: LineInput): number {
  return Math.round(quantity * unitPriceCents);
}

/** taxRateBps: basis points, so 1800 = 18%. */
export function computeTotals(items: LineInput[], taxRateBps: number) {
  const subtotalCents = items.reduce((sum, item) => sum + lineAmountCents(item), 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

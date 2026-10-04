// Mirrors apps/api/src/lib/money.ts so the editor's live totals match the server exactly.
export type LineInput = { quantity: number; unitPriceCents: number };

export function lineAmountCents({ quantity, unitPriceCents }: LineInput) {
  return Math.round(quantity * unitPriceCents);
}

export function computeTotals(items: LineInput[], taxRateBps: number) {
  const subtotalCents = items.reduce((sum, item) => sum + lineAmountCents(item), 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** "1,250.50" → 125050. Returns NaN for unparseable input. */
export function toCents(value: string | number) {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
  return Math.round(n * 100);
}

export function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

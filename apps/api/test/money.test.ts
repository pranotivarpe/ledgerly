import { describe, expect, it } from 'vitest';
import { computeTotals, lineAmountCents } from '../src/lib/money.js';

describe('money', () => {
  it('computes line amounts in cents, rounding fractional quantities', () => {
    expect(lineAmountCents({ quantity: 3, unitPriceCents: 12_500 })).toBe(37_500);
    expect(lineAmountCents({ quantity: 1.5, unitPriceCents: 9_999 })).toBe(14_999); // 14998.5 → 14999
    expect(lineAmountCents({ quantity: 0.33, unitPriceCents: 100 })).toBe(33);
  });

  it('computes subtotal, tax (basis points) and total without float drift', () => {
    const items = [
      { quantity: 1, unitPriceCents: 10 },
      { quantity: 1, unitPriceCents: 20 },
    ]; // 0.1 + 0.2 in dollars
    expect(computeTotals(items, 0)).toEqual({ subtotalCents: 30, taxCents: 0, totalCents: 30 });

    expect(computeTotals([{ quantity: 2, unitPriceCents: 125_000 }], 1800)).toEqual({
      subtotalCents: 250_000,
      taxCents: 45_000,
      totalCents: 295_000,
    });
    expect(computeTotals([{ quantity: 1, unitPriceCents: 999 }], 825).taxCents).toBe(82); // 82.4175
  });
});

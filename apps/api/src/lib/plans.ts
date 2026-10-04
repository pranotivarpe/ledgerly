import type { Plan } from '../generated/prisma/enums.js';

/** Plan limits, enforced by the API. `null` means unlimited. Kept in sync with the pricing page. */
export const PLAN_LIMITS: Record<
  Plan,
  { seats: number; clients: number | null; invoicesPerMonth: number | null }
> = {
  FREE: { seats: 1, clients: 3, invoicesPerMonth: 5 },
  PRO: { seats: 3, clients: null, invoicesPerMonth: null },
  TEAM: { seats: 10, clients: null, invoicesPerMonth: null },
};

export const PLAN_NAMES: Record<Plan, string> = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' };

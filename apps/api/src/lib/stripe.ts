import Stripe from 'stripe';
import { env } from '../env.js';
import type { Plan } from '../generated/prisma/enums.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  appInfo: { name: 'Ledgerly', url: 'https://github.com/' },
});

/**
 * Prices are looked up by stable lookup keys (created by scripts/stripe-setup.ts), so no
 * price IDs live in config and the same code works across Stripe accounts.
 */
export const PLAN_LOOKUP_KEYS = {
  PRO: 'ledgerly_pro_monthly',
  TEAM: 'ledgerly_team_monthly',
} as const satisfies Partial<Record<Plan, string>>;

export type PaidPlan = keyof typeof PLAN_LOOKUP_KEYS;

export function planFromLookupKey(key: string | null | undefined): PaidPlan | null {
  const entry = Object.entries(PLAN_LOOKUP_KEYS).find(([, k]) => k === key);
  return (entry?.[0] as PaidPlan | undefined) ?? null;
}

let priceCache: { at: number; prices: Record<PaidPlan, Stripe.Price> } | null = null;

export async function getPlanPrices(): Promise<Record<PaidPlan, Stripe.Price>> {
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.prices;
  const { data } = await stripe.prices.list({
    lookup_keys: Object.values(PLAN_LOOKUP_KEYS),
    active: true,
    limit: 10,
  });
  const prices = {} as Record<PaidPlan, Stripe.Price>;
  for (const price of data) {
    const plan = planFromLookupKey(price.lookup_key);
    if (plan) prices[plan] = price;
  }
  if (!prices.PRO || !prices.TEAM) {
    throw new Error('Stripe prices not found. Run `npm run stripe:setup -w apps/api` first.');
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}

export const PORTAL_CONFIG_METADATA_KEY = 'ledgerly_portal';

let portalConfigId: string | null = null;

/** The Customer Portal configuration created by the setup script (falls back to the default). */
export async function getPortalConfigurationId(): Promise<string | undefined> {
  if (portalConfigId) return portalConfigId;
  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const config = data.find((c) => c.metadata?.[PORTAL_CONFIG_METADATA_KEY] === 'true');
  portalConfigId = config?.id ?? null;
  return portalConfigId ?? undefined;
}

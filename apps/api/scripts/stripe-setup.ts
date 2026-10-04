/**
 * One-time (idempotent) Stripe setup for Ledgerly:
 *   - Products + monthly prices for the Pro and Team plans (found later by lookup key)
 *   - A Customer Portal configuration (update card, view invoices, switch plan, cancel)
 *
 * Usage: npm run stripe:setup -w apps/api
 */
import { PLAN_LOOKUP_KEYS, PORTAL_CONFIG_METADATA_KEY, stripe } from '../src/lib/stripe.js';

const PLANS = [
  {
    plan: 'PRO',
    name: 'Ledgerly Pro',
    amount: 1900,
    description: '3 seats, unlimited clients & invoices',
  },
  { plan: 'TEAM', name: 'Ledgerly Team', amount: 4900, description: '10 seats, everything in Pro' },
] as const;

async function ensurePrice({ plan, name, amount, description }: (typeof PLANS)[number]) {
  const lookupKey = PLAN_LOOKUP_KEYS[plan];
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    expand: ['data.product'],
  });
  if (existing.data[0]) {
    console.log(`✔ ${name}: price ${existing.data[0].id} already exists`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name,
    description,
    metadata: { ledgerly_plan: plan },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    nickname: `${name} monthly`,
  });
  console.log(`＋ ${name}: created product ${product.id} and price ${price.id}`);
  return price;
}

async function ensurePortalConfig(prices: Awaited<ReturnType<typeof ensurePrice>>[]) {
  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const existing = data.find((c) => c.metadata?.[PORTAL_CONFIG_METADATA_KEY] === 'true');
  const products = prices.map((p) => ({
    product: typeof p.product === 'string' ? p.product : p.product.id,
    prices: [p.id],
  }));
  const features = {
    customer_update: {
      enabled: true,
      allowed_updates: ['email', 'address', 'name'] as ('email' | 'address' | 'name')[],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' as const },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price' as const],
      proration_behavior: 'create_prorations' as const,
      products,
    },
  };

  if (existing) {
    await stripe.billingPortal.configurations.update(existing.id, { features });
    console.log(`✔ Customer Portal configuration ${existing.id} updated`);
    return;
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your Ledgerly subscription' },
    features,
    metadata: { [PORTAL_CONFIG_METADATA_KEY]: 'true' },
  });
  console.log(`＋ Customer Portal configuration ${config.id} created`);
}

const prices = [];
for (const plan of PLANS) prices.push(await ensurePrice(plan));
await ensurePortalConfig(prices);
console.log('\nStripe is ready. 🎉');

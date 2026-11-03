export type Tier = 'starter' | 'pro' | 'agency';
export type Cycle = 'monthly' | 'annual';

/**
 * Limits are set so every plan stays profitable at fal.ai's per-second video prices (see docs/COSTS.md).
 * `resolution` is what the video engine really renders at; `quality` is the honest name shown to customers.
 */
export const CLIP_SECONDS = [5, 10] as const;
export const SECONDS_PER_VIDEO_CREDIT = 5;

/**
 * Limits are measured in SECONDS of generated video per month, so a 10 second video uses twice as much as a 5 second one.
 * They are set so every plan stays profitable at fal.ai / deAPI per-second prices (see docs/COSTS.md).
 * `resolution` is what the video engine really renders at; `quality` is the honest name shown to customers.
 */
export const PLANS: Record<Tier, { name: string; monthly: number; annual: number; channels: number; secondsPerMonth: number; videosPerMonth: number; quality: string; resolution: '480P' | '768P' | '1080P' }> = {
  starter: { name: 'Starter Creator', monthly: 25, annual: 19, channels: 2, secondsPerMonth: 50, videosPerMonth: 10, quality: 'Standard quality (480p)', resolution: '480P' },
  pro: { name: 'Pro Growth Engine', monthly: 49, annual: 39, channels: 7, secondsPerMonth: 150, videosPerMonth: 30, quality: 'HD quality (768p)', resolution: '768P' },
  agency: { name: 'Agency & Scale', monthly: 99, annual: 79, channels: 7, secondsPerMonth: 250, videosPerMonth: 50, quality: 'Full HD quality (1080p, AI-enhanced)', resolution: '1080P' },
};

export const TIERS = Object.keys(PLANS) as Tier[];

/** Flutterwave payment-plan IDs are created in the Flutterwave dashboard and supplied via env vars. */
export function planId(tier: Tier, cycle: Cycle): string | undefined {
  return process.env[`FLW_PLAN_${tier.toUpperCase()}_${cycle.toUpperCase()}`];
}

export function tierFromPlanId(id?: string | number | null): { tier: Tier; cycle: Cycle } | null {
  if (id === undefined || id === null || id === '') return null;
  for (const tier of TIERS) {
    for (const cycle of ['monthly', 'annual'] as Cycle[]) {
      if (planId(tier, cycle) === String(id)) return { tier, cycle };
    }
  }
  return null;
}

export const priceFor = (tier: Tier, cycle: Cycle) => (cycle === 'annual' ? PLANS[tier].annual * 12 : PLANS[tier].monthly);
export const BILLING_CURRENCY = () => process.env.FLW_CURRENCY || 'USD';

/**
 * Card-verified trial. Flutterwave cannot start a subscription "later", so the trial is a small one-time card payment
 * (price in your billing currency, change it with TRIAL_PRICE). The card is checked and may only be used for one trial.
 * It does not renew by itself: the customer picks a plan when it ends.
 */
export const TRIAL = { days: 7, seconds: 10, price: 1 };
export const trialPrice = () => Number(process.env.TRIAL_PRICE) > 0 ? Number(process.env.TRIAL_PRICE) : TRIAL.price;

/** Extra video seconds customers can buy on top of their plan. Prices are in the billing currency. */
export const TOPUPS = [
  { id: 's30', seconds: 30, price: 7 },
  { id: 's100', seconds: 100, price: 19 },
  { id: 's250', seconds: 250, price: 39 },
];

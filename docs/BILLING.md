# Billing setup

## Subscription plans

The product defaults are maintained in `server/lib/plans.ts`. The app reads the actual Flutterwave payment-plan amount and currency before displaying a plan and again before checkout. The live Flutterwave plan is the source of truth for the charge.

| Plan | Monthly | Annual equivalent / month | Video seconds / month |
|---|---:|---:|---:|
| Starter Creator | 25 | 19 | 50 |
| Pro Growth Engine | 49 | 39 | 150 |
| Agency & Scale | 99 | 79 | 250 |

Amounts use the configured billing currency. Annual checkout is billed as one yearly payment (12 times the displayed annual-equivalent monthly amount).

## Required Flutterwave plan IDs

Create six active payment plans in the same Flutterwave mode (Test or Live) as `FLW_SECRET_KEY`, then set these exact Vercel Production environment-variable names:

- `FLW_PLAN_STARTER_MONTHLY`
- `FLW_PLAN_STARTER_ANNUAL`
- `FLW_PLAN_PRO_MONTHLY`
- `FLW_PLAN_PRO_ANNUAL`
- `FLW_PLAN_AGENCY_MONTHLY`
- `FLW_PLAN_AGENCY_ANNUAL`

Each variable must contain that plan's numeric Flutterwave payment-plan ID. Legacy names such as `FLW_PRO_GROWYH_ENGINE` and `FLW_AGENCY_AND_SCALE` are not read by the current billing code. Do not guess which billing cycle an old plan belongs to; confirm it in Flutterwave before mapping it.

The pricing page checks each billing cycle independently. A cycle is offered only when its configured plan ID resolves to an active Flutterwave plan. Checkout validates the plan and uses its actual amount and currency.

## Card-verified trial

- The trial is a one-time card payment (`TRIAL_PRICE`, default 1 in the billing currency).
- It grants 7 days and 10 seconds of AI video allowance. It does not renew automatically.
- Each card can be used for one trial; card fingerprints are hashed rather than storing card details.

## Video top-ups

The current packs are defined in `server/lib/plans.ts` (`TOPUPS`):

| Pack | Seconds | Price |
|---|---:|---:|
| Small | 30 | 9 |
| Medium | 100 | 29 |
| Large | 250 | 69 |

Prices use the billing currency. Top-up seconds are used after the monthly plan allowance.

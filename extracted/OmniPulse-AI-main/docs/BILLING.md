# Prices, trial and top-ups

## Plan prices (monthly / yearly, per month)
| Plan | Monthly | Yearly (per month) | Video seconds per month |
|---|---|---|---|
| Starter Creator | 25 | 19 | 50 |
| Pro Growth Engine | 49 | 39 | 150 |
| Agency & Scale | 99 | 79 | 250 |

The app shows the amounts from your Flutterwave payment plans, so to change a price:
1. In Flutterwave, create new payment plans with the new amounts (monthly, and yearly at 12 times the per-month figure).
2. Put the new plan IDs in Vercel (`FLW_PLAN_STARTER_MONTHLY` and the five others) and redeploy.
3. People already subscribed stay on their old plan until they cancel or switch.

## Card-verified trial
- Flutterwave cannot start a subscription later, so the trial is a small one-time card payment (`TRIAL_PRICE`, default 1).
- It gives 7 days, 10 seconds of AI video and the research and scheduling tools. It never renews by itself.
- Each card can be used for one trial. The card is hashed, never stored. A repeat card is refused and refunded.
- If a refund fails, check Flutterwave dashboard and refund by hand.

## Top-up packs
30 seconds for 7, 100 seconds for 19, 250 seconds for 39 (billing currency). Change them in `server/lib/plans.ts` (`TOPUPS`). Seconds never expire and are used after the monthly seconds run out.

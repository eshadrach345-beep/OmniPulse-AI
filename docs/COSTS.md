# Product limits, pricing and cost controls

## Monthly video allowance

The allowance is measured in generated video seconds. A 10-second render consumes twice the allowance of a 5-second render.

| Plan | Monthly seconds | Equivalent 5-second clips |
|---|---:|---:|
| Starter | 50 | 10 |
| Pro | 150 | 30 |
| Agency | 250 | 50 |

The plan limits and output resolution are maintained in `server/lib/plans.ts`.

## Current code prices

These are product defaults, not a guarantee of the amount a customer will see: the live Flutterwave plan amount and currency override the defaults when available.

| Plan | Monthly | Annual equivalent / month |
|---|---:|---:|
| Starter Creator | 25 | 19 |
| Pro Growth Engine | 49 | 39 |
| Agency & Scale | 99 | 79 |

## Top-up packs

| Pack | Seconds | Price |
|---|---:|---:|
| Small | 30 | 9 |
| Medium | 100 | 29 |
| Large | 250 | 69 |

Prices use the configured billing currency. The source of truth is `TOPUPS` in `server/lib/plans.ts`.

## Cost verification before changing limits

Provider prices can change and may differ by model, resolution, duration, audio, retries and region. The earlier cost-per-video and margin examples in this document were estimates, not audited costs. Do not advertise a profit margin or unlimited rendering based on those estimates.

Before increasing allowances or lowering prices, measure actual provider charges for representative 5-second and 10-second jobs at each tier's output resolution. Include voice generation, failed-job retries, storage, bandwidth, payment fees, support and taxes in the calculation. Keep a safety margin for price changes.

## Rendering limits

The synchronous Vercel API path is configured for a 60-second function ceiling, with internal FFmpeg operations capped below that to leave time for cleanup and response handling. Provider video generation is submitted as asynchronous jobs; final composition and merging still have bounded execution time. Long multi-scene or feature-length renders should move to a durable background worker or external render service rather than increasing synchronous timeouts beyond the hosting limit.

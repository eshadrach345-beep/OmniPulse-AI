# Cost per video and plan profitability (estimates, verify on fal.ai/pricing)

Prices found on fal.ai pages and third-party listings in Oct 2026 disagree with each other, so treat these as a range and
check **fal.ai → Pricing** for the exact rate of the model you use (`FAL_VIDEO_MODEL`).

Each video = one 5-second clip + one voice-over.

| Item | Rate found | Cost per video |
|---|---|---|
| Video, 480p | about $0.025 to $0.0625 per second | $0.13 to $0.31 |
| Video, 768p | about $0.075 per second (one listing) | up to about $0.38 |
| Video, 1080p | not confirmed; assume up to about $0.15 per second | up to about $0.75 |
| Voice-over (Kokoro) | $0.02 per 1,000 characters | about $0.01 to $0.02 |
| Script + trend research (Gemini) | free tier or a few cents | about $0.01 |

Worst-case plan check (annual price per month, after about 4% payment fees):

| Plan | Price | Videos | Worst-case cost | Left over |
|---|---|---|---|---|
| Starter (480p) | $15 | 10 | about $3.50 | about 76% |
| Pro (768p) | $29 | 30 | about $12.30 | about 56% |
| Agency (1080p) | $69 | 50 | about $39 | about 41% |

If fal.ai's real prices are lower, these margins improve. If higher, lower the video limits in `server/lib/plans.ts`.


## Plan limits are now in seconds
Customers choose 5 or 10 second videos and each render uses that many seconds of their monthly allowance.

| Plan | Seconds per month | Same as |
|---|---|---|
| Starter | 50 | 10 five-second videos |
| Pro | 150 | 30 five-second videos |
| Agency | 250 | 50 five-second videos |

Change them in `server/lib/plans.ts` (`secondsPerMonth`) if the real per-second price turns out different.

## Profit check at the new prices (worst-case video costs, about 4% payment fees)
| Plan | Yearly price per month | Worst-case video cost | Left over |
|---|---|---|---|
| Starter (50 s, 480p) | 19 | about 3 | about 15 |
| Pro (150 s, 768p) | 39 | about 11 | about 26 |
| Agency (250 s, 1080p) | 79 | about 38 | about 38 |

Top-up packs are now 30 s for $9, 100 s for $29, and 250 s for $69. This is a more conservative price floor for Agency-tier rendering; replace the estimates with measured provider costs after real renders.


## Creator uploads and storage costs (November 2026)

The Creator Upload Studio uses a private Vercel Blob store in Cape Town (`cpt1`). Uploads go directly from the browser to Blob, so the app function does not receive the full media file. The current per-file caps are 250 MB (Starter), 1 GB (Pro), and 2 GB (Agency). These are **per-file limits**, not monthly storage quotas; do not advertise a total storage allowance until cumulative usage metering and cleanup are implemented.

Vercel's published pricing currently includes 1 GB of Blob storage and 10 GB of Blob data transfer on the applicable plan; additional storage is listed at $0.023/GB-month. Private data transfer is region-priced, with the published range around $0.15–$0.31/GB. Use short-lived, object-scoped signed GET URLs for browser playback so large media is not proxied through a Vercel Function. Keep signed URLs short-lived and only issue them after checking that the asset belongs to the signed-in user.

## Payment processing assumptions

For a Nigerian Flutterwave account, the published rates are 2.0% for local transactions and 4.8% for international card transactions. Flutterwave states that 7.5% VAT applies to transaction fees. For conservative planning, model international card collections at approximately 5.16% effective processing cost and local collections at approximately 2.15%, before currency conversion, refunds, disputes, and other taxes.

## Subscription strategy for AI Director

Keep core monthly video-generation seconds capped by tier. The creator-upload and AI Director workflow has separate variable costs: transcription, scene analysis, media search, licensed footage, AI effects, audio processing, and final rendering. Do not offer unlimited AI Director edits. Meter it with a separate monthly credit allowance and optional top-up packs, and price packs only after measuring the real provider cost per completed edit. Include storage, data transfer, payment fees, support, and failed-job retries in the margin calculation.

The current product code has three price points: Starter $25 monthly / $19 annual-equivalent per month, Pro $49 / $39, and Agency $99 / $79. Video top-ups are $9 / $29 / $69 for 30 / 100 / 250 seconds. Only `FLW_PLAN_STARTER_MONTHLY` is currently configured in Vercel. Create and configure the other five Flutterwave plan IDs before advertising all monthly and annual checkout options as available.

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

Top-up packs (30 s for 7, 100 s for 19, 250 s for 39) cost you roughly 2 to 4.5 per 30 seconds in the worst case, so they keep a margin. Replace these estimates with the real per-second cost once you have made a few renders.

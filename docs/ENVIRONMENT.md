# Environment variables

Set these in **Vercel → your project → Settings → Environment Variables** (apply to Production, then redeploy).
They are *not* needed in Google AI Studio. This app runs on Vercel, not in the AI Studio preview.

| Variable | Purpose |
|---|---|
| `APP_URL` | Your exact live URL, no trailing slash, e.g. `https://omnipulseai.us.ci` |
| `DATABASE_URL` | Postgres connection string (Vercel → Storage → Neon) |
| `SESSION_SECRET` | 32+ random characters (signs login cookies) |
| `TOKEN_ENCRYPTION_KEY` | Another random string (encrypts social-account tokens) |
| `OWNER_ACCESS_CODE` | Your private test code. Enter it on the sign-in screen ("Have an access code?") for full access with no signup or payment. Leave unset to disable. |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Optional. Default `gemini-3.8-flash` with automatic fallbacks |
| `GEMINI_MODEL` | Recommended: `gemini-2.5-flash-lite` (cheap and fast) or `gemini-2.5-flash`. Leave unset to try both automatically |
| `LLM_API_KEY` | Backup AI writer (any OpenAI-compatible service, for example a free Groq key). Used automatically when Gemini is out of quota |
| `LLM_BASE_URL` | Optional. Default `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Optional. Default `llama-3.3-70b-versatile` |
| `LLM_PRIMARY` | Optional. Set to `backup` to use the backup AI first and keep Gemini for live search only |
| `VIDEO_PROVIDER` | Optional. `fal` (default), `deapi`, or `auto` (fal first, deAPI if fal fails) |
| `DEAPI_API_KEY` | Optional second video provider (deapi.ai, free starter credit) |
| `VOICE_PROVIDER` | Optional. `auto` (default: deAPI voices when `DEAPI_API_KEY` exists, else fal.ai), `deapi`, or `fal` |
| `POSTPEER_API_KEY` | Social publishing through PostPeer (postpeer.dev). When set, customers connect accounts through PostPeer and no per-network developer apps are needed |
| `FAL_KEY` | Video rendering and voice-over (fal.ai) |
| `FAL_VIDEO_MODEL` | Optional. Default `minimax/h3-max-turbo/text-to-video` |
| `FAL_VIDEO_INPUT` | Optional JSON merged into the video request, e.g. `{"aspect_ratio":"9:16"}` |
| `RESEND_API_KEY` | Email |
| `EMAIL_FROM` | e.g. `OmniPulse AI <hello@yourdomain.com>` on a domain verified in Resend |
| `FLW_SECRET_KEY` | Flutterwave secret key (`FLWSECK-...` live or `FLWSECK_TEST-...` test) |
| `FLW_SECRET_HASH` | A secret string you choose. Must be identical here and in Flutterwave → Settings → Webhooks → Secret hash |
| `FLW_CURRENCY` | Fallback currency, e.g. `USD` (the plan's own currency is used when available) |
| `FLW_PLAN_STARTER_MONTHLY`, `FLW_PLAN_STARTER_ANNUAL`, `FLW_PLAN_PRO_MONTHLY`, `FLW_PLAN_PRO_ANNUAL`, `FLW_PLAN_AGENCY_MONTHLY`, `FLW_PLAN_AGENCY_ANNUAL` | Numeric payment-plan IDs from Flutterwave → Payment Plans (same mode, Test or Live, as the secret key) |
| `TRIAL_PRICE` | Optional. One-time card-check price for the 7-day trial in your billing currency (default `1`) |
| `FLW_LOGO_URL` | Optional logo shown on the Flutterwave checkout page (defaults to `/logo.png`) |
| `CRON_SECRET` | Random string. Needed to send *scheduled* posts (see below) |
| Social network keys | See the "Social networks" section below |
| `VITE_COMPANY_NAME`, `VITE_SUPPORT_EMAIL` | Shown on the landing page and legal pages (also set before the build) |

Flutterwave webhook URL: `https://YOUR-DOMAIN/api/billing/webhook`


## Social networks (users connect directly, no middleman)

Users click **Connect** → the network's own login + permission page → back to OmniPulse. Passwords never touch your server.
You create one developer app per network (once), then paste its keys here. A network without keys shows "Not set up" on its button.
Redirect URIs must match exactly (replace the domain with your `APP_URL`).

| Network | Env vars | Redirect URI to register | Notes |
|---|---|---|---|
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/social/callback/youtube` | Google Cloud → enable *YouTube Data API v3*, OAuth consent screen, scopes `youtube.upload` + `youtube.readonly`. Until Google audits the app, uploads are forced private. |
| X (Twitter) | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `/api/social/callback/x` | OAuth 2.0 app with read+write. Videos are posted as a link (X's video upload needs a paid API tier). |
| Facebook Page | `META_APP_ID`, `META_APP_SECRET` | `/api/social/callback/facebook` | Meta app. Needs `pages_manage_posts` (App Review for public use). |
| Instagram | same `META_*` keys | `/api/social/callback/instagram` | Add **both** Meta redirect URIs. Account must be Business/Creator and linked to a Facebook Page. Needs `instagram_content_publish` (App Review). |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `/api/social/callback/linkedin` | Enable *Share on LinkedIn* + *Sign In with OpenID Connect*. |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `/api/social/callback/tiktok` | Content Posting API. Unaudited apps can only post privately (`TIKTOK_PRIVACY=SELF_ONLY`, default). After TikTok's audit set `TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE`. |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | `/api/social/callback/pinterest` | Connect only for now; publishing is not built. |

Apps in development mode only work for accounts added as testers in each developer portal. Public use needs each network's review/audit, which only you can request.

## Scheduled posts

Scheduled posts are stored in the database and sent by `GET /api/cron/dispatch`. Set `CRON_SECRET`, then call
`https://YOUR-DOMAIN/api/cron/dispatch` every 5 minutes with header `Authorization: Bearer <CRON_SECRET>` (or `?key=<CRON_SECRET>`).
Use Vercel Cron on a Pro plan, or a free pinger such as cron-job.org. "Publish now" works without this.

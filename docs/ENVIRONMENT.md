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
| `GEMINI_API_KEY` | Main AI writer. You can add more free keys from other Google projects as `GEMINI_API_KEY_2` to `GEMINI_API_KEY_5` (or put them all in `GEMINI_API_KEYS`, separated by commas). When one key runs out of its free quota the next one is used |
| `LLM_API_KEY` | Backup AI writer. It works with any service: the service is recognised from the key (`gsk_` Groq, `sk-or-` OpenRouter, `sk-` OpenAI, `xai-` xAI, `csk-` Cerebras, `sk-ant-` Anthropic). For any other service also set `LLM_BASE_URL` (for example `https://api.example.com/v1`) and optionally `LLM_MODEL` |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `XAI_API_KEY`, `ANTHROPIC_API_KEY` | Alternative ways to add backup writers. Every one that is set is tried in turn after Gemini |
| `LLM_PRIMARY` | Set to `backup` to try the backup writers before Gemini |
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


## If scripts say "the AI writer is at its limit"
1. Open Settings, System check (owner only) and run it. The "AI writers" row tests every key with a tiny request and tells you exactly what is wrong (key rejected, out of quota, wrong model, no internet).
2. A key that is rejected (401) is wrong or inactive: copy it again with no spaces, then **redeploy** (Vercel only reads new variables on a new deploy).
3. Add a second source of capacity: a free Groq key as `GROQ_API_KEY`, or another Gemini key from a different Google project as `GEMINI_API_KEY_2`.

## Free daily limits
Free AI plans count tokens per day (for example 60,000 on a small Groq plan). One script uses roughly 5,000 to 6,000 tokens, so a small free plan covers about ten scripts a day. When every writer is at its limit the app says so, shows how long until the soonest one is ready, keeps your work, and carries on by itself. To keep going immediately, add another key (a second Gemini key from another Google project, or a free Cerebras or OpenRouter key). Check each provider's current free limits on its own site, because they change.
Not sure which version is live? Open Settings, System check: version 26 and later has a row called "AI writers (Gemini and backups)".

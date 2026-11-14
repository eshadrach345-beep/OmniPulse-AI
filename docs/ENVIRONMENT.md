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
| `GEMINI_API_KEY` | Google AI Studio key. Additional keys can be supplied as `GEMINI_API_KEY_2` through `GEMINI_API_KEY_5`, or together in `GEMINI_API_KEYS` (comma-separated). Keys are rotated when a provider reports quota or rate-limit errors. |
| `GEMINI_MODEL` | Optional model override. If unset, the service tries `gemini-3.8-flash` and `gemini-3.5-flash-lite` in sequence. Model access depends on the Google project and current API availability. |
| `LLM_API_KEY` | Backup AI writer. It works with any service: the service is recognised from the key (`gsk_` Groq, `sk-or-` OpenRouter, `sk-` OpenAI, `xai-` xAI, `csk-` Cerebras, `sk-ant-` Anthropic). For any other service also set `LLM_BASE_URL` (for example `https://api.example.com/v1`) and optionally `LLM_MODEL` |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `XAI_API_KEY`, `ANTHROPIC_API_KEY` | Alternative ways to add backup writers. Every one that is set is tried in turn after Gemini |
| `LLM_PRIMARY` | Set to `backup` to try the backup writers before Gemini |
| `LLM_BASE_URL` | Optional. Default `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Optional backup-provider model override. Without an override, each configured provider uses its current default model (Groq currently defaults to `openai/gpt-oss-20b`). |
| `LLM_PRIMARY` | Optional. Set to `backup` to use the backup AI first and keep Gemini for live search only |
| `VIDEO_PROVIDER` | Default provider for new productions: `fal` (default), `deapi`, or `auto` (FAL first, DeAPI if FAL fails). When both provider keys are present, the Creator Canvas also lets each production choose its own provider. |
| `DEAPI_API_KEY` | Optional DeAPI video provider key. The Creator Canvas loads the account's available video models from DeAPI; selected model IDs are checked against that live catalogue. |
| `DEAPI_VIDEO_MODEL` | Optional default DeAPI video model when no model is selected; defaults to `Ltx2_5_22B_Dist_INT8`. The editor also exposes native audio-to-video for models that advertise audio-sync support. |
| `VOICE_PROVIDER` | Optional. `auto` (default: deAPI voices when `DEAPI_API_KEY` exists, else fal.ai), `deapi`, or `fal` |
| `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET` | Buffer OAuth app credentials. Customers authorize their own Buffer accounts; OmniPulse stores encrypted OAuth tokens and syncs their Buffer channels. |
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

The Creator Canvas can use FAL and DeAPI for separate productions when both keys are configured. In the timeline editor, DeAPI audio-to-video is available only for models advertising audio-sync support; it accepts a 1–11 second MP3, WAV, OGG or FLAC source (up to 20 MB) and an optional JPG, PNG or WebP speaker reference image (up to 10 MB). The audio waveform determines the generated lip-sync timing. `FAL` and `DeAPI` are strict choices; `Automatic` is shown only when both keys are present and is the only mode that can fail over. DeAPI models are loaded from the account's live model catalogue, and models that do not advertise image-to-video are blocked from image-based jobs.

Flutterwave webhook URL: `https://YOUR-DOMAIN/api/billing/webhook`


## Social networks (Buffer connector)

OmniPulse uses Buffer's current GraphQL API with OAuth 2.0 Authorization Code + PKCE. Each customer connects their own Buffer account; OmniPulse does not share a single owner API key across customers.

1. Register an OAuth app in Buffer Settings → API.
2. Set the app's redirect URI to `https://YOUR-DOMAIN/api/social/buffer-callback` (use the exact production `APP_URL`).
3. Add `BUFFER_CLIENT_ID` and `BUFFER_CLIENT_SECRET` to Vercel Production Environment Variables, then redeploy.
4. In OmniPulse → Social Accounts, select a channel to start Buffer authorization. Buffer returns the user's organizations and channels, which OmniPulse syncs to the available social network slots.
5. When a customer adds another social channel to Buffer later, use **Sync accounts** in OmniPulse to refresh the channel list.

Buffer's current API accepts public media URLs for video/image assets. A scheduled media URL must remain publicly reachable until Buffer publishes it. Full Buffer analytics and engagement/reply management are not part of the current API integration.

**Migration note:** Existing Zernio-connected accounts are not automatically transferable. Customers must connect Buffer and authorize their Buffer channels again. The old Zernio records are retained only for safe legacy account cleanup; new connections and publishing use Buffer.

Buffer API documentation: https://developers.buffer.com/guides/authentication.html
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

## Using Cerebras and OpenRouter
In Vercel, Settings, Environment Variables, add `CEREBRAS_API_KEY` (starts with `csk-`) and `OPENROUTER_API_KEY` (starts with `sk-or-`), then redeploy. Use these exact names so both work together; `LLM_API_KEY` holds only one key. Writers are tried in this order: Gemini, `LLM_API_KEY`, Cerebras, Groq, OpenRouter, then the others. A writer that is at its limit rests and the next one is used.
Free services rename and retire models often. If a model name stops working, the app asks the service which models your key can use and picks one by itself. To choose one yourself, set `CEREBRAS_MODEL` or `OPENROUTER_MODEL` (or `GROQ_MODEL`, and so on).
OpenRouter's free models have small daily limits for accounts without credits, so treat it as a reserve. The System check row "AI writers" shows which model each key is using.

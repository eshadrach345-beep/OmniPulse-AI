# OmniPulse AI

Vite + React front end with a single Vercel serverless API.

- Backend source: `server/` (TypeScript). The deployable function `api/index.js` is its pre-compiled output, so Vercel never has to type-check it. `vercel.json` rewrites every `/api/*` request to it.
- After editing anything in `server/`, run `npm run build:api` (or `npm run build:api:ts` if esbuild is unavailable) and commit the regenerated `api/index.js`.
- All environment variables are documented in `docs/ENVIRONMENT.md`.
- Multi-part stories (projects and episodes, with memory of earlier parts): `docs/SERIES.md`. Its tables are created automatically; `prisma/schema.prisma` mirrors them for Prisma tooling (not used at runtime).
- Owner testing: set `OWNER_ACCESS_CODE`, then use "Have an access code?" on the sign-in screen. No sample or mock data: every number in the UI comes from the database, the social networks, or a live AI call.

## Setup checklist
1. **Database**: Vercel → Storage → add *Neon Postgres* (sets `DATABASE_URL`). Tables are created automatically.
2. **Secrets**: set `SESSION_SECRET` (32+ chars) and `APP_URL` (your live URL). See `docs/ENVIRONMENT.md` for all variables.
3. **Resend**: verify a sending domain and set `EMAIL_FROM`. Without it only your own email can receive codes.
4. **Flutterwave**: create 6 *Payment Plans* (Starter/Pro/Agency × monthly/annual; prices in `api/_lib/plans.ts`, annual = 12 × the per-month annual price) in the same currency as `FLW_CURRENCY`.
   Put the numeric plan IDs in env. In Settings → Webhooks set the URL to `https://YOUR-DOMAIN/api/billing/webhook` and the *secret hash* to the same value as `FLW_SECRET_HASH`.
5. **Social networks**: create a developer app per network and add its keys (see `docs/ENVIRONMENT.md` → *Social networks*). Also set `CRON_SECRET` and ping `/api/cron/dispatch` every 5 minutes for scheduled posts.
6. **Gemini / ElevenLabs / fal.ai**: set `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY`.
7. Redeploy and open `https://YOUR-DOMAIN/api/health`.

## Local dev
`npm i && npx vercel dev`

## Before you start selling
- Have a lawyer review `src/components/Legal.tsx` (Terms, Privacy, Refunds are templates). Set `VITE_COMPANY_NAME` and `VITE_SUPPORT_EMAIL`.
- Run the whole flow in Flutterwave **test mode** first (sign-up → pay → render → connect a social account → publish), then switch to live keys.
- Use a custom domain, and make sure `APP_URL`, the social redirect URIs and the Flutterwave webhook all use it.

## If the Vercel build fails at "npm install"
Open the deployment → Build Logs and read the first red `npm error` lines. `.npmrc` and `vercel.json` already relax peer-dependency checks and every dependency is pinned to a version that is known to exist.

## Checking that the right version is live
- `https://YOUR-DOMAIN/api/health` must return `{"ok":true}`. If it does not, the backend is not deployed.
- Logged out, the home page must show "Create, schedule and test social videos in minutes". If you see a dashboard with a demo user, an older deployment is being served (check Vercel → Settings → Domains → which deployment the domain points to).
- Sign in with your owner access code, then open the account menu → **Account settings → System check** to test the database, Gemini, ElevenLabs, fal.ai, Resend, Flutterwave and social-network connections one by one.

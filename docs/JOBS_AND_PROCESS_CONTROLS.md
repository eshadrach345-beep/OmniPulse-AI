# Jobs & Process Controls

## What is included

- **Jobs** in the top navigation opens the Jobs & Processes panel. On mobile, open the account menu and choose **Jobs & Processes**.
- The panel refreshes server-backed series/episode jobs every 10 seconds and lets the owner stop active jobs or resume failed/stopped parts.
- Direct Video Studio generation and immediate Auto-Pilot batches register a local process. The panel can request that those workflows stop, including if the user navigates away from the component.
- **Stop all** requests cancellation for all active local processes and server-backed series jobs after one confirmation.
- Direct Video Studio also exposes a local **Stop process** button next to the generate button.

## Cancellation boundaries

A stop action aborts the browser's fetch/polling workflow or changes an owned episode's server-side status so OmniPulse does not advance that episode. A request already accepted by Gemini, Groq, or a video provider may continue on the provider's infrastructure and may still count toward its usage. The app cannot promise cancellation of a provider-side request unless that provider exposes and confirms cancellation.

## Verification performed for this package

- TypeScript/TSX source transpilation syntax check: passed for all source `.ts` and `.tsx` files.
- `node --check api/index.js`: passed.
- Confirmed the bundled API contains the existing `/episodes/stop` route.
- A full Vite/TypeScript project build and live provider/database test could not be run in this environment because dependencies could not be installed. Verify in a Vercel preview deployment before promoting to production.

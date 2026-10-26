# Why videos or scripts stop, and what to do

## 1. The video engine (deAPI) limits
Per deAPI's own documentation, a **basic account** (including the one with the free $5 bonus) may start only about **1 video per minute and 15 per day**, and may ask about job status 50 times a minute and 200 times a day. After any top-up payment the account becomes **Premium** (for the LTX model: 5 videos a minute, 1,600 a day).
- OmniPulse never sends clips all at once. It starts them one after another, waits exactly as long as deAPI asks, and does not count that wait as a failure.
- On a basic account a 60 second video (six clips) therefore needs at least six minutes. This is normal. **Top up your deAPI account once** to remove the wait.
- Clips that finish are kept. If something fails, tap Retry and only the missing clips are made again.

## 2. Test limits left in Vercel
Delete these Vercel variables if they exist: `DEAPI_FRAMES` (it forced 2 second clips; it is now ignored by the code).

## 3. The AI writer (Gemini) limits
Google's free Gemini plan allows only a handful of requests a day and some newer models have none on the free plan, so it can say "limit reached" even when you did very little (a trend search, a script and the System check can use most of a day). Fix it in one of two ways, or both:
1. In Google AI Studio turn on billing for your key. A script then costs a fraction of a cent. Set `GEMINI_MODEL` to `gemini-2.5-flash-lite`.
2. Add a backup writer: create a free key at groq.com and set `LLM_API_KEY` in Vercel. Scripts switch to it automatically and the System check shows it as "Ready".
Live web search for trends still needs Gemini.

## 4. Scenes
One scene is 20 seconds: two 10 second clips. The second clip starts from the last picture of the first so the scene carries on without a jump. Each clip's dialogue is written to fit inside its 10 seconds, so nobody is cut off.

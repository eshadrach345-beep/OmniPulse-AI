# Gemini → Groq automatic AI-writer failover

OmniPulse's script writer now reserves time for the backup provider instead of spending the whole request budget trying multiple Gemini models. Gemini quota/rate-limit responses, overload responses, invalid keys, and other failed calls move to the OpenAI-compatible backup when configured.

## Required Vercel environment variables

- `GEMINI_API_KEY`: your Google AI Studio API key (optional if you want Groq-only writing).
- `GROQ_API_KEY`: your Groq API key. This is recognized as the backup key automatically.
- `LLM_MODEL`: optional Groq model override. If omitted, the app uses `openai/gpt-oss-120b`.
- `LLM_BASE_URL`: leave unset for Groq. If set, it must be an OpenAI-compatible API base URL; it overrides the provider default.
- `LLM_PRIMARY`: set to `backup` only if you want Groq first for writing. Otherwise Gemini is tried first and Groq is the fallback.

After changing variables, redeploy the Vercel project. Never put these keys in client-side Vite variables or commit them to Git.

## Verify the fallback

1. Confirm `GROQ_API_KEY` is set for the Production environment in Vercel.
2. Redeploy the latest code.
3. Start a short script generation.
4. If generation fails, inspect Vercel Runtime Logs for `Gemini failed` and `Backup AI failed`. The latter includes the provider's HTTP status and message, without printing the secret key.

This change improves failover behavior but does not validate the user's live credentials or guarantee provider availability. A provider may still fail because of invalid credentials, exhausted quota, model retirement, or account restrictions.


## Conservative token budget (Groq)

The OpenAI-compatible backup writer caps output at 2,800 tokens per request, and long storyboards are generated in three-scene chunks one chunk at a time. This avoids concurrent burst requests and leaves more of an 8,000-token-per-minute budget for prompt tokens. If a prompt itself is unusually large, the provider can still reject it; inspect Groq Logs for the exact error and retry-after details.

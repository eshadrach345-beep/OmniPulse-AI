import crypto from 'node:crypto';
import { HttpError } from './core.js';

export const ENV_ALIASES: Record<string, string[]> = {
  GEMINI_API_KEY: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY', 'GEMINI_KEY', 'GOOGLE_AI_API_KEY'],
  FAL_KEY: ['FAL_KEY', 'FAL_AI_API_KEY', 'FAL_API_KEY', 'FAL_AI_KEY', 'FALAI_API_KEY', 'FAL_SECRET'],
  RESEND_API_KEY: ['RESEND_API_KEY', 'RESEND_KEY'],
  DEAPI_API_KEY: ['DEAPI_API_KEY', 'DEAPI_KEY', 'DE_API_KEY'],
  LLM_API_KEY: ['LLM_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY'],
};
/** Returns the value and the variable name that held it (accepts common alternative names). */
export const lookupEnv = (name: string, ...alts: string[]): { value: string; found: string } | null => {
  for (const n of [...(ENV_ALIASES[name] || [name]), ...alts]) { const v = process.env[n]; if (v && v.trim()) return { value: v.trim(), found: n }; }
  return null;
};
const need = (name: string, ...alts: string[]) => {
  const hit = lookupEnv(name, ...alts);
  if (hit) return hit.value;
  throw new HttpError(424, `Server is missing ${name}. Add it in Vercel → Settings → Environment Variables and redeploy.`, 'CONFIG');
};

// =====================================================================
// Resend (email)
// =====================================================================
const BRAND = 'OmniPulse AI';
function layout(title: string, bodyHtml: string) {
  return `<div style="background:#020617;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:32px;color:#e2e8f0">
    <div style="font-size:18px;font-weight:700;color:#818cf8;margin-bottom:20px">${BRAND}</div>
    <h1 style="font-size:20px;color:#fff;margin:0 0 12px">${title}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#64748b;margin-top:28px;border-top:1px solid #1e293b;padding-top:16px">You received this email because of activity on your ${BRAND} account.</p>
  </div></div>`;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function sendEmail(to: string, subject: string, html: string) {
  const key = need('RESEND_API_KEY');
  const from = process.env.EMAIL_FROM || `${BRAND} <onboarding@resend.dev>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('Resend error', r.status, t);
    if (!process.env.EMAIL_FROM) {
      throw new HttpError(424, 'Email could not be sent. Set EMAIL_FROM to an address on a domain you verified in Resend (the default test sender can only email your own address).', 'EMAIL');
    }
    throw new HttpError(424, 'We could not send the email. Please try again shortly.', 'EMAIL');
  }
}

export const mail = {
  otp: (to: string, name: string, code: string, purpose: 'verify' | 'reset') =>
    sendEmail(to, `${code} is your ${BRAND} ${purpose === 'verify' ? 'verification' : 'password reset'} code`,
      layout(purpose === 'verify' ? 'Verify your email' : 'Reset your password',
        `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, use this code to ${purpose === 'verify' ? 'finish creating your account' : 'reset your password'}. It expires in 10 minutes.</p>
         <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#fff;background:#1e293b;border-radius:12px;padding:16px;text-align:center;margin:20px 0">${code}</div>
         <p style="font-size:13px;color:#94a3b8">If you didn't request this, you can safely ignore this email.</p>`)),
  welcome: (to: string, name: string, url: string) =>
    sendEmail(to, `Welcome to ${BRAND}`, layout('Your account is verified 🎉',
      `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, welcome aboard. Choose a plan to unlock the video studio, trend radar, scheduler and auto-pilot.</p>
       <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Choose your plan</a></p>`)),
  subscribed: (to: string, name: string, planName: string, url: string) =>
    sendEmail(to, `Your ${planName} plan is active`, layout('Subscription confirmed',
      `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, your <b>${esc(planName)}</b> subscription is active. Everything is unlocked.</p>
       <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open dashboard</a></p>`)),
  paymentFailed: (to: string, name: string, url: string) =>
    sendEmail(to, `Action needed: payment failed`, layout('We couldn\'t process your payment',
      `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, your latest subscription payment didn't go through. Please check your card or payment method so the next attempt succeeds and you keep access.</p>
       <p><a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open dashboard</a></p>`)),
  published: (to: string, name: string, title: string, channels: string[]) =>
    sendEmail(to, `Published: ${title}`, layout('Your post was published',
      `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, <b>${esc(title)}</b> was sent to: ${esc(channels.join(', '))}.</p>`)),
};

// =====================================================================
// Flutterwave (v3)
// =====================================================================
export async function flw(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) {
  const key = need('FLW_SECRET_KEY');
  const r = await fetch(`https://api.flutterwave.com/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || data.status !== 'success') {
    console.error('Flutterwave error', method, path, r.status, JSON.stringify(data).slice(0, 400));
    throw new HttpError(424, data?.message || 'Payment provider error', 'FLUTTERWAVE');
  }
  return data.data;
}

/** Flutterwave sends your dashboard "secret hash" verbatim in the `verif-hash` header. */
export function verifyFlwSignature(header: string | undefined) {
  const expected = process.env.FLW_SECRET_HASH;
  if (!expected || !header) return false;
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// =====================================================================
// Gemini
// =====================================================================
// Stable models first. Newer "preview" models are often paid-only, so they only run when GEMINI_MODEL names them.
const PREFERRED_MODELS = () => [...new Set([(process.env.GEMINI_MODEL || '').trim(), 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(Boolean))] as string[];

export interface GeminiResult { data: any; model: string; grounded: boolean; sources: { title: string; url: string }[] }

/** Asks Google which Flash models this key can actually call, so a renamed or retired model never takes the app down. */
let discovered: { at: number; list: string[] } | null = null;
async function discoverModels(key: string): Promise<string[]> {
  if (discovered && Date.now() - discovered.at < 6 * 3600_000) return discovered.list;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(6000) });
    const d: any = await r.json().catch(() => ({}));
    const list = ((d.models || []) as any[])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|live|audio|embed|robotics|computer|cyber|omni|banana|vision/i.test(m.name))
      .map((m) => String(m.name).replace(/^models\//, ''));
    discovered = { at: Date.now(), list };
    return list;
  } catch { return []; }
}

/** Pulls the JSON object out of a model reply, tolerating code fences and stray text around it. */
function extractJson(text: string): any {
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model returned no JSON.');
  return JSON.parse(clean.slice(start, end + 1));
}

/** The model that last worked is tried first, so a retired or misnamed model only costs one request, once. */
let lastGood: string | null = null;

interface CallOut { text: string; sources: { title: string; url: string }[]; searched: boolean }
class GeminiFail extends Error { constructor(public status: number, message: string, public keyBad = false) { super(message); } }

async function callGemini(key: string, model: string, prompt: string, o: { grounded: boolean; json: boolean; timeoutMs: number; maxTokens?: number }): Promise<CallOut> {
  const body: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: o.maxTokens || 8192 } };
  if (o.grounded) body.tools = [{ google_search: {} }];
  if (o.json) body.generationConfig.responseMimeType = 'application/json';
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e: any) {
    throw new GeminiFail(0, e?.name === 'TimeoutError' ? 'The model took too long to answer.' : (e?.message || 'Network error talking to Gemini.'));
  }
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini ${r.status}`;
    const keyBad = r.status === 401 || /API key not valid|API_KEY_INVALID|API key was reported as leaked|API key expired/i.test(msg);
    console.error('Gemini model failed:', model, r.status, msg.slice(0, 300));
    throw new GeminiFail(r.status, msg, keyBad);
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text.trim()) throw new GeminiFail(0, `Gemini returned an empty answer (${cand?.finishReason || data?.promptFeedback?.blockReason || 'no reason given'}).`);
  const seen = new Set<string>();
  const gm = cand?.groundingMetadata;
  const sources = ((o.grounded && gm?.groundingChunks) || [])
    .map((c: any) => ({ title: String(c.web?.title || c.web?.uri || ''), url: String(c.web?.uri || '') }))
    .filter((x: any) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 10);
  return { text, sources, searched: !!(sources.length || gm?.webSearchQueries?.length) };
}

function geminiError(status: number, msg: string, keyBad: boolean): HttpError {
  let out: string;
  if (keyBad) out = 'Gemini rejected the API key. Check GEMINI_API_KEY in Vercel (it must be a Google AI Studio key) and redeploy.';
  else if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) out = 'The AI service has reached its usage limit (Gemini quota). Please try again in a minute, or raise the quota on your Google AI Studio key.';
  else if (status === 404 || /not found|not supported/i.test(msg)) out = 'No available Gemini model accepted the request. Set GEMINI_MODEL in Vercel to a current model such as gemini-3.5-flash and redeploy.';
  else if (status === 403) out = `Gemini denied access for this key (${msg.slice(0, 120)}). Check that the Generative Language API is enabled for the key's project.`;
  else if (status === 503 || /overloaded|unavailable/i.test(msg)) out = 'Gemini is overloaded right now. Please try again in a moment.';
  else out = `The AI service is temporarily unavailable (${status || 'error'}: ${msg.slice(0, 140)}). Please try again.`;
  return new HttpError(424, out, 'GEMINI');
}

/** Tries models in order until one answers, staying inside the serverless time limit. */
async function withModels(key: string, deadline: number, run: (model: string) => Promise<CallOut>): Promise<{ out: CallOut; model: string }> {
  let last: GeminiFail = new GeminiFail(0, 'Gemini request failed');
  const tried = new Set<string>();
  const go = async (models: string[]) => {
    for (const model of models) {
      if (tried.has(model)) continue;
      if (Date.now() > deadline) return null;
      tried.add(model);
      try { const out = await run(model); lastGood = model; return { out, model }; }
      catch (e: any) { last = e instanceof GeminiFail ? e : new GeminiFail(0, e?.message || 'Gemini failed'); if (last.keyBad || last.status === 429 || last.status === 503 || /quota|RESOURCE_EXHAUSTED|overloaded|rate.?limit/i.test(last.message)) return null; }
    }
    return null;
  };
  let hit = await go([lastGood, ...PREFERRED_MODELS()].filter(Boolean) as string[]);
  if (!hit && !last.keyBad && last.status !== 429 && Date.now() < deadline) hit = await go((await discoverModels(key)).slice(0, 2));
  if (hit) return hit;
  console.error('Gemini failed:', last.status, last.message);
  noteGeminiFailure(last);
  throw geminiError(last.status, last.message, last.keyBad);
}

// ---- keeping the free Gemini quota alive ---------------------------------------------------------------
// When Google says "quota", every further call only makes things worse. Remember it and skip Gemini until it is allowed again.
let geminiBlockedUntil = 0;
function noteGeminiFailure(f: GeminiFail) {
  if (f.status !== 429 && !/RESOURCE_EXHAUSTED|quota/i.test(f.message)) return;
  const m = f.message.match(/retry in ([\d.]+)s/i) || f.message.match(/"retryDelay":\s*"(\d+)s"/);
  const secs = m ? Math.ceil(Number(m[1])) + 2 : /per ?day|daily|limit: 0/i.test(f.message) ? 1800 : 60;
  geminiBlockedUntil = Date.now() + Math.min(secs, 1800) * 1000;
}

/** For the System check screen. */
export const aiWriterStatus = () => ({ geminiBlockedSeconds: Math.max(0, Math.ceil((geminiBlockedUntil - Date.now()) / 1000)), backupConfigured: haveFallbackLlm(), backupModel: (process.env.LLM_MODEL || 'llama-3.3-70b-versatile').trim() });

const haveGemini = () => !!lookupEnv('GEMINI_API_KEY') || !!lookupEnv('GOOGLE_API_KEY');
const fallbackKey = () => lookupEnv('LLM_API_KEY')?.value || '';
const haveFallbackLlm = () => !!fallbackKey();

/** Any OpenAI-compatible chat service (Groq, OpenRouter, OpenAI, Mistral...). Set LLM_API_KEY, and optionally LLM_BASE_URL and LLM_MODEL. */
async function callCompat(prompt: string, o: { json: boolean; timeoutMs: number; maxTokens?: number }): Promise<string> {
  const key = fallbackKey();
  const base = (process.env.LLM_BASE_URL || (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : process.env.OPENAI_API_KEY ? 'https://api.openai.com/v1' : process.env.MISTRAL_API_KEY ? 'https://api.mistral.ai/v1' : 'https://api.groq.com/openai/v1')).trim().replace(/\/+$/, '');
  const model = (process.env.LLM_MODEL || (process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.3-70b-instruct' : process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : process.env.MISTRAL_API_KEY ? 'mistral-small-latest' : 'llama-3.3-70b-versatile')).trim();
  let r: Response;
  try {
    r = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Keep completion requests within conservative provider limits. Some Groq models reject 9k–12k max_tokens before generation starts.
      body: JSON.stringify({ model, temperature: 0.7, max_tokens: Math.max(1024, Math.min(o.maxTokens || 6000, 6000)), messages: [{ role: 'user', content: prompt }], ...(o.json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e: any) { throw new GeminiFail(0, e?.name === 'TimeoutError' ? 'The backup AI took too long to answer.' : (e?.message || 'Network error talking to the backup AI.')); }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Backup AI failed', model, r.status, JSON.stringify(d).slice(0, 300)); throw new GeminiFail(r.status, String(d?.error?.message || `Backup AI ${r.status}`), r.status === 401); }
  const text = String(d?.choices?.[0]?.message?.content || '');
  if (!text.trim()) throw new GeminiFail(0, 'The backup AI returned an empty answer.');
  return text;
}

/**
 * Writes text with the best available AI. Gemini first (unless it is out of quota), then the backup service if one is set.
 * One person action therefore never fails just because one free quota ran out.
 */
export async function llmGenerate(prompt: string, o: { json?: boolean; timeoutMs?: number; deadlineMs?: number; maxTokens?: number } = {}): Promise<{ text: string; provider: 'gemini' | 'backup'; model: string }> {
  const json = o.json !== false;
  const start = Date.now();
  const deadline = start + (o.deadlineMs || 50_000);
  const backup = haveFallbackLlm();
  const wantsBackupFirst = (process.env.LLM_PRIMARY || '').trim().toLowerCase() === 'backup' && backup;
  const errs: GeminiFail[] = [];
  const tryGemini = async () => {
    if (!haveGemini()) return null;
    if (Date.now() < geminiBlockedUntil && backup) return null; // quota is used up and a backup exists: do not waste time or requests
    if (Date.now() < geminiBlockedUntil) throw new HttpError(424, `The AI writer has reached its free usage limit and needs about ${Math.ceil((geminiBlockedUntil - Date.now()) / 1000)} seconds. It will try again by itself.`, 'GEMINI');
    const key = need('GEMINI_API_KEY', 'GOOGLE_API_KEY');
    // Reserve enough of the request budget for the backup provider. When Gemini is throttled or overloaded, fail over quickly instead of spending the entire serverless window retrying models.
    const budget = backup ? Math.min(deadline - 30_000, start + 14_000) : deadline;
    try {
      const { out, model } = await withModels(key, budget, (m) => callGemini(key, m, prompt, { grounded: false, json, timeoutMs: Math.max(3_000, Math.min(o.timeoutMs || 14_000, 14_000, budget - Date.now())), maxTokens: o.maxTokens }));
      // Validate structured output before declaring Gemini successful. Invalid JSON must trigger provider failover, not a later blind episode retry.
      if (json) extractJson(out.text);
      console.info('AI writer succeeded', { provider: 'gemini', model });
      return { text: out.text, provider: 'gemini' as const, model };
    } catch (e: any) {
      const f = e instanceof HttpError ? new GeminiFail(/usage limit|quota/i.test(e.message) ? 429 : 0, e.message) : new GeminiFail(0, e?.message || 'Gemini failed');
      noteGeminiFailure(f); errs.push(f);
      if (!backup) throw e;
      return null;
    }
  };
  const tryBackup = async () => {
    if (!backup) return null;
    try {
      const left = deadline - Date.now();
      if (left < 6_000) throw new GeminiFail(0, 'No time left for the backup AI.');
      const text = await callCompat(prompt, { json, timeoutMs: Math.min(o.timeoutMs || 40_000, left), maxTokens: o.maxTokens });
      // Treat malformed backup output as a provider failure so the other provider can be attempted.
      if (json) extractJson(text);
      const model = (process.env.LLM_MODEL || 'llama-3.3-70b-versatile').trim();
      console.info('AI writer succeeded', { provider: 'backup', model });
      return { text, provider: 'backup' as const, model };
    } catch (e: any) { errs.push(e instanceof GeminiFail ? e : new GeminiFail(0, e?.message || 'Backup AI failed')); return null; }
  };
  const order = wantsBackupFirst ? [tryBackup, tryGemini] : [tryGemini, tryBackup];
  console.info('AI writer provider order', { primary: wantsBackupFirst ? 'backup' : 'gemini', geminiConfigured: haveGemini(), backupConfigured: backup });
  for (const step of order) { const hit = await step(); if (hit) return hit; }
  const quota = errs.some((f) => f.status === 429);
  const backupError = errs.find((f) => /backup ai/i.test(f.message)) || (backup ? errs[errs.length - 1] : null);
  const detail = backup && backupError ? ` Backup provider detail: ${backupError.message.slice(0, 240)}. Check GROQ_API_KEY (or LLM_API_KEY), LLM_BASE_URL, and LLM_MODEL in Vercel.` : backup ? ' The backup provider is configured but also failed. Check GROQ_API_KEY, LLM_BASE_URL, and LLM_MODEL in Vercel Runtime Logs.' : ' No backup AI key was detected. Add GROQ_API_KEY in Vercel to enable automatic failover.';
  throw new HttpError(424, quota
    ? `The AI writer reached Gemini's usage limit and the backup provider did not complete the request.${detail || ' Configure a valid LLM_API_KEY (or GROQ_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY) and redeploy.'}`
    : `The AI writer is temporarily unavailable.${detail || ' Check the AI provider keys and model settings, then retry.'}`, 'GEMINI');
}

/** Plain JSON generation (scripts, A/B ideas). Optionally grounded with Google Search. */
export async function geminiRaw(prompt: string, opts: { grounded?: boolean; timeoutMs?: number; deadlineMs?: number; maxTokens?: number } = {}): Promise<GeminiResult> {
  if (!opts.grounded) {
    const g = await llmGenerate(prompt, { json: true, timeoutMs: opts.timeoutMs, deadlineMs: opts.deadlineMs, maxTokens: opts.maxTokens });
    try { return { data: extractJson(g.text), model: `${g.provider}:${g.model}`, grounded: false, sources: [] }; }
    catch { throw new HttpError(424, 'The AI answered in an unexpected format. Retrying.', 'GEMINI'); }
  }
  const key = need('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  const deadline = Date.now() + (opts.deadlineMs || 50_000);
  const { out, model } = await withModels(key, deadline, async (m) => {
    const o = await callGemini(key, m, prompt, { grounded: !!opts.grounded, json: !opts.grounded, timeoutMs: opts.timeoutMs || (opts.grounded ? 30_000 : 25_000), maxTokens: opts.maxTokens });
    return o;
  });
  let data: any;
  try { data = extractJson(out.text); } catch { throw new HttpError(424, 'The AI answered in an unexpected format. Please try again.', 'GEMINI'); }
  return { data, model, grounded: !!opts.grounded && out.searched, sources: out.sources };
}

/** Step 1 of research: a Google-Search-grounded pass. Kept under ~30s so no single request runs long. THROWS if search did not really run. */
export async function geminiSearch(researchPrompt: string): Promise<{ text: string; sources: { title: string; url: string }[]; model: string }> {
  const key = need('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  if (Date.now() < geminiBlockedUntil) throw new HttpError(424, `Live search has reached Gemini's free limit. Please try again in about ${Math.ceil((geminiBlockedUntil - Date.now()) / 1000)} seconds.`, 'GEMINI');
  const { out, model } = await withModels(key, Date.now() + 30_000, (m) => callGemini(key, m, researchPrompt, { grounded: true, json: false, timeoutMs: 28_000, maxTokens: 6000 }));
  if (!out.searched) throw new HttpError(424, 'Live web search did not run for this request, so no research was returned. Please try again.', 'NO_SEARCH');
  return { text: out.text, sources: out.sources, model };
}

/** Step 2 of research: turn the findings into the app's JSON (fast, no search). */
export async function geminiFormat(prompt: string): Promise<{ data: any; model: string }> {
  const g = await llmGenerate(prompt, { json: true, timeoutMs: 30_000, deadlineMs: 40_000 });
  try { return { data: extractJson(g.text), model: `${g.provider}:${g.model}` }; } catch { throw new HttpError(424, 'The research came back in an unexpected format. Please try again.', 'GEMINI'); }
}

export async function geminiJson(prompt: string, opts: { grounded?: boolean } = {}): Promise<any> {
  return (await geminiRaw(prompt, opts)).data;
}

// =====================================================================
// fal.ai (queue API: submit → poll → fetch result)
// =====================================================================
/** Video model. Override with FAL_VIDEO_MODEL; extra JSON input (e.g. aspect_ratio) can be set in FAL_VIDEO_INPUT. */
const FAL_APP = () => (process.env.FAL_VIDEO_MODEL || 'minimax/h3-max-turbo/text-to-video').trim();
function falVideoBody(prompt: string, resolution: string, seconds: number) {
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(process.env.FAL_VIDEO_INPUT || '{}'); } catch { /* ignore bad JSON */ }
  return { prompt, duration: seconds, resolution, prompt_expansion_mode: 'disabled', ...extra };
}
const falHeaders = () => ({ Authorization: `Key ${need('FAL_KEY')}`, 'Content-Type': 'application/json' });

export async function falSubmit(prompt: string, resolution: '480P' | '768P' | '1080P' = '480P', seconds = 5) {
  let r: Response;
  try {
    r = await fetch(`https://queue.fal.run/${FAL_APP()}`, {
      method: 'POST', headers: falHeaders(), body: JSON.stringify(falVideoBody(prompt, resolution, seconds)), signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    console.error('fal submit network error', e?.name, e?.message);
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (fal.ai) did not respond in time. Please try again.' : 'Could not reach the video engine (fal.ai).', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id) {
    console.error('fal submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    const msg = r.status === 401 || r.status === 403 ? 'Video engine credentials were rejected. Check FAL_KEY and your fal.ai balance.' : r.status === 402 ? 'Video engine credits are exhausted.' : `Video engine rejected the request (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`;
    throw new HttpError(424, msg, 'FAL');
  }
  return { requestId: d.request_id as string, statusUrl: d.status_url as string, responseUrl: d.response_url as string };
}

export async function falStatus(statusUrl: string, responseUrl: string) {
  const s = await fetch(statusUrl, { headers: falHeaders(), signal: AbortSignal.timeout(15_000) });
  const sd: any = await s.json().catch(() => ({}));
  if (!s.ok) throw new HttpError(424, 'Could not check render status.', 'FAL');
  if (sd.status !== 'COMPLETED') return { state: sd.status === 'IN_PROGRESS' ? 'rendering' : 'queued', queuePosition: sd.queue_position } as const;
  const r = await fetch(responseUrl, { headers: falHeaders(), signal: AbortSignal.timeout(15_000) });
  const rd: any = await r.json().catch(() => ({}));
  const url = rd?.video?.url;
  if (!r.ok || !url) return { state: 'failed', error: rd?.detail ? JSON.stringify(rd.detail).slice(0, 300) : 'Render finished without a video.' } as const;
  return { state: 'done', videoUrl: url as string } as const;
}

// =====================================================================
// deAPI: second video provider (free starter credit, so you can test a real render cheaply).
// Pick the provider with VIDEO_PROVIDER = fal (default) | deapi | auto (fal first, deAPI if fal fails).
// =====================================================================
const DEAPI_BASE = 'https://api.deapi.ai/api/v2';
const DEAPI_SIZES: Record<string, [number, number]> = { '480P': [512, 896], '768P': [704, 1248], '1080P': [768, 1344] };
const deapiHeaders = () => ({ Authorization: `Bearer ${need('DEAPI_API_KEY')}`, Accept: 'application/json', 'Content-Type': 'application/json' });

/** Thrown when deAPI says "too many requests". `retryAfter` is how many seconds to wait; `daily` means the day's allowance is used up. */
export class RateLimited extends HttpError {
  constructor(public retryAfter: number, public daily: boolean) {
    super(424, daily ? 'The video engine has reached its daily limit. Add credit to your deAPI account to lift the limit, or try again tomorrow.' : 'The video engine is busy (rate limit). Waiting a moment.', daily ? 'DAILY_LIMIT' : 'RATE_LIMIT');
  }
}

function deapiCanvas(resolution: string, aspect: string): [number, number] {
  let [width, height] = DEAPI_SIZES[resolution] || DEAPI_SIZES['480P'];
  if (aspect === '16:9') [width, height] = [height, width];
  else if (aspect === '1:1') { const sq = resolution === '1080P' ? 1024 : resolution === '768P' ? 832 : 640; width = sq; height = sq; }
  return [width, height];
}

/** The numbers deAPI needs for a clip of `seconds` seconds. 24 frames a second, the last frame included. Nothing here may shorten a clip. */
function deapiClip(seconds: number) {
  const frames = Math.min(241, Math.max(49, Math.round(seconds * 24) + 1));
  return { frames, fps: 24, seed: Math.floor(Math.random() * 2_000_000_000), model: process.env.DEAPI_VIDEO_MODEL || 'Ltx2_5_22B_Dist_INT8' };
}

async function deapiParse(r: Response): Promise<string> {
  if (r.status === 429) {
    const retry = Number(r.headers.get('retry-after')) || 60;
    const daily = (r.headers.get('x-ratelimit-type') || '') === 'daily' || retry > 300;
    throw new RateLimited(Math.min(retry, 900), daily);
  }
  const d: any = await r.json().catch(() => ({}));
  const id = d?.data?.request_id;
  if (!r.ok || !id) {
    console.error('deAPI submit error', r.status, JSON.stringify(d).slice(0, 400));
    const detail = typeof d?.message === 'string' ? d.message : '';
    const msg = r.status === 401 || r.status === 403 ? 'deAPI rejected the key. Check DEAPI_API_KEY.'
      : r.status === 402 || /balance|credit|insufficient/i.test(detail) ? 'deAPI credits are exhausted. Add credit in your deAPI account.'
      : `deAPI rejected the request (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`;
    throw new HttpError(424, msg, 'DEAPI');
  }
  return String(id);
}

export async function deapiSubmit(prompt: string, resolution: string = '480P', seconds = 5, aspect: string = '9:16') {
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(process.env.DEAPI_VIDEO_INPUT || '{}'); } catch { /* ignore bad JSON */ }
  const [width, height] = deapiCanvas(resolution, aspect);
  const body = { prompt, width, height, ...deapiClip(seconds), ...extra };
  let r: Response;
  try {
    r = await fetch(`${DEAPI_BASE}/videos/generations`, { method: 'POST', headers: deapiHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (deAPI) did not respond in time. Please try again.' : 'Could not reach the video engine (deAPI).', 'DEAPI');
  }
  return { requestId: await deapiParse(r) };
}

/** Image-to-video: starts the clip from a picture (the last frame of the previous clip), so a scene carries on without a visible jump. */
export async function deapiAnimate(prompt: string, firstFrame: Buffer, resolution: string = '480P', seconds = 10, aspect: string = '9:16') {
  const [width, height] = deapiCanvas(resolution, aspect);
  const c = deapiClip(seconds);
  const form = new FormData();
  form.set('model', c.model); form.set('prompt', prompt);
  form.set('width', String(width)); form.set('height', String(height));
  form.set('frames', String(c.frames)); form.set('fps', String(c.fps)); form.set('seed', String(c.seed));
  form.set('first_frame_image', new Blob([new Uint8Array(firstFrame)], { type: 'image/jpeg' }), 'first-frame.jpg');
  let r: Response;
  try {
    r = await fetch(`${DEAPI_BASE}/videos/animations`, { method: 'POST', headers: { Authorization: `Bearer ${need('DEAPI_API_KEY')}`, Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(30_000) });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (deAPI) did not respond in time. Please try again.' : 'Could not reach the video engine (deAPI).', 'DEAPI');
  }
  return { requestId: await deapiParse(r) };
}

export async function deapiStatus(requestId: string) {
  const r = await fetch(`${DEAPI_BASE}/jobs/${encodeURIComponent(requestId)}`, { headers: deapiHeaders(), signal: AbortSignal.timeout(15_000) });
  if (r.status === 429 || r.status >= 500) return { state: 'rendering' } as const; // busy for a moment: keep waiting
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(424, 'Could not check render status (deAPI).', 'DEAPI');
  const st = String(d?.data?.status || '').toLowerCase();
  if (st === 'done' && d?.data?.result_url) return { state: 'done', videoUrl: String(d.data.result_url) } as const;
  if (st === 'done') return { state: 'failed', error: 'Render finished without a video.' } as const;
  if (st === 'error' || st === 'failed') return { state: 'failed', error: String(d?.data?.error || d?.data?.message || 'The render failed.').slice(0, 300) } as const;
  return { state: st === 'processing' ? 'rendering' : 'queued' } as const;
}

// =====================================================================
// Voice-over via fal.ai (Kokoro TTS, about $0.02 per 1,000 characters). Same FAL_KEY as video.
// =====================================================================
// The studio voice ids the app already uses are mapped to Kokoro voices.
const KOKORO: Record<string, { voice: string; gender: 'male' | 'female' }> = {
  pNInz6obpgDQGcFmaJgB: { voice: 'am_adam', gender: 'male' },
  iP95p4xoKVk53GoZ742B: { voice: 'am_eric', gender: 'male' },
  nPczCjzI2devNBz1zQrb: { voice: 'am_michael', gender: 'male' },
  IKne3meq5aSn9XLyUdCD: { voice: 'am_liam', gender: 'male' },
  EXAVITQu4vr4xnSDxMaL: { voice: 'af_sarah', gender: 'female' },
  Xb7hH8MSUJpSbSDYk0k2: { voice: 'af_nova', gender: 'female' },
  hpp4J3VqNfWAUOO0d1Us: { voice: 'af_bella', gender: 'female' },
  cgSgspJ2msm6clMCkdW9: { voice: 'af_jessica', gender: 'female' },
};

function kokoroVoice(voiceId: string, gender?: string) {
  return KOKORO[voiceId] || { voice: gender === 'female' ? 'af_heart' : 'am_adam', gender: gender === 'female' ? 'female' : 'male' };
}

/** Voice-over through deAPI (Kokoro). Same voices, paid from your deAPI balance. */
export async function deapiTts(text: string, voiceId: string, gender?: string): Promise<{ audio: Buffer; type: string }> {
  if (text.trim().length < 3) throw new HttpError(400, 'Voice text is too short.');
  const pick = kokoroVoice(voiceId, gender);
  let r: Response;
  try {
    r = await fetch(`${DEAPI_BASE}/audio/speech`, {
      method: 'POST', headers: deapiHeaders(), signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ text, model: 'Kokoro', voice: pick.voice, lang: 'en-us', speed: 1, format: 'mp3', sample_rate: 24000 }),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The voice engine (deAPI) did not respond in time. Please try again.' : 'Could not reach the voice engine (deAPI).', 'DEAPI_VOICE');
  }
  const d: any = await r.json().catch(() => ({}));
  const id = d?.data?.request_id;
  if (!r.ok || !id) {
    console.error('deAPI voice error', r.status, JSON.stringify(d).slice(0, 300));
    const detail = typeof d?.message === 'string' ? d.message : '';
    throw new HttpError(424, r.status === 401 || r.status === 403 ? 'deAPI rejected the key. Check DEAPI_API_KEY.' : /balance|credit|insufficient/i.test(detail) || r.status === 402 ? 'deAPI credits are exhausted.' : `Voice generation failed (${r.status}${detail ? `: ${detail.slice(0, 120)}` : ''}).`, 'DEAPI_VOICE');
  }
  for (let i = 0; i < 22; i++) {
    await new Promise((res) => setTimeout(res, i < 3 ? 700 : 1000));
    const jr = await fetch(`${DEAPI_BASE}/jobs/${encodeURIComponent(String(id))}`, { headers: deapiHeaders(), signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const jd: any = jr ? await jr.json().catch(() => ({})) : {};
    const st = String(jd?.data?.status || '').toLowerCase();
    if (st === 'error' || st === 'failed') throw new HttpError(424, 'The voice could not be generated. Please try again.', 'DEAPI_VOICE');
    if (st === 'done' && jd?.data?.result_url) {
      const f = await fetch(String(jd.data.result_url), { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!f || !f.ok) throw new HttpError(424, 'Voice audio could not be downloaded. Please try again.', 'DEAPI_VOICE');
      return { audio: Buffer.from(await f.arrayBuffer()), type: f.headers.get('content-type') || 'audio/mpeg' };
    }
  }
  throw new HttpError(424, 'The voice took too long to generate. Please try again.', 'DEAPI_VOICE');
}

/** Picks the voice engine. VOICE_PROVIDER = deapi | fal | auto (default: deAPI when its key exists, else fal; falls back to the other if the first fails). */
export async function synthesize(text: string, voiceId: string, gender?: string) {
  const mode = (process.env.VOICE_PROVIDER || 'auto').trim().toLowerCase();
  const haveDe = !!lookupEnv('DEAPI_API_KEY'), haveFal = !!lookupEnv('FAL_KEY');
  if (mode === 'deapi') return deapiTts(text, voiceId, gender);
  if (mode === 'fal') return falTts(text, voiceId, gender);
  if (haveDe && haveFal) { try { return await deapiTts(text, voiceId, gender); } catch (e: any) { console.error('deAPI voice failed, trying fal:', e?.message); return falTts(text, voiceId, gender); } }
  return haveDe ? deapiTts(text, voiceId, gender) : falTts(text, voiceId, gender);
}

export async function falTts(text: string, voiceId: string, gender?: string): Promise<{ audio: Buffer; type: string }> {
  const pick = kokoroVoice(voiceId, gender);
  let r: Response;
  try {
    r = await fetch('https://fal.run/fal-ai/kokoro/american-english', {
      method: 'POST', headers: falHeaders(), body: JSON.stringify({ prompt: text, voice: pick.voice, speed: 1 }), signal: AbortSignal.timeout(25_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The voice engine (fal.ai) did not respond in time. Please try again.' : 'Could not reach the voice engine (fal.ai).', 'FAL_VOICE');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.audio?.url) {
    console.error('fal voice error', r.status, JSON.stringify(d).slice(0, 300));
    const msg = r.status === 401 || r.status === 403 ? 'Voice engine credentials were rejected. Check FAL_KEY and your fal.ai balance.' : r.status === 402 ? 'Voice engine credits are exhausted.' : `Voice generation failed (${r.status}).`;
    throw new HttpError(424, msg, 'FAL_VOICE');
  }
  const f = await fetch(d.audio.url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!f || !f.ok) throw new HttpError(424, 'Voice audio could not be downloaded. Please try again.', 'FAL_VOICE');
  return { audio: Buffer.from(await f.arrayBuffer()), type: f.headers.get('content-type') || 'audio/wav' };
}

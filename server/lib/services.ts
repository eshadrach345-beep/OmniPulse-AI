import crypto from 'node:crypto';
import { HttpError } from './core.js';
import { buildDeapiVideoFields, resolveDeapiSeed } from './deapi-tuning.js';
import { deapiAudioMime, deapiAudioSyncFrames, supportsDeapiAudioSyncModel } from './deapi-audio-sync.js';
import { isRecentTrendSource, normalizeTrendPublishedAt, TREND_FRESHNESS_DAYS } from './trend-freshness.js';

export const ENV_ALIASES: Record<string, string[]> = {
  GEMINI_API_KEY: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY', 'GEMINI_KEY', 'GOOGLE_AI_API_KEY'],
  FAL_KEY: ['FAL_KEY', 'FAL_AI_API_KEY', 'FAL_API_KEY', 'FAL_AI_KEY', 'FALAI_API_KEY', 'FAL_SECRET'],
  RESEND_API_KEY: ['RESEND_API_KEY', 'RESEND_KEY'],
  DEAPI_API_KEY: ['DEAPI_API_KEY', 'DEAPI_KEY', 'DE_API_KEY'],
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
  const safeSubject = String(subject || BRAND).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 180) || BRAND;
  const from = process.env.EMAIL_FROM || `${BRAND} <onboarding@resend.dev>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: safeSubject, html }),
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
  supportReply: (to: string, name: string, subject: string) =>
    sendEmail(to, `A reply from OmniPulse Support: ${subject}`, layout('You have a support reply',
      `<p style="font-size:14px;line-height:1.6">Hi ${esc(name)}, the OmniPulse team has replied to your support conversation <b>${esc(subject)}</b>. Sign in to your account and open Support Center to read the private reply.</p>`)),
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
const PREFERRED_MODELS = () => ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

export interface GeminiResult { data: any; model: string; grounded: boolean; sources: { title: string; url: string }[] }

/** Asks Google which Flash models this key can actually call, so a renamed or retired model never takes the app down. */
const discoveredModels = new Map<string, { at: number; list: string[] }>();
const discoveryKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
async function discoverModels(key: string): Promise<string[]> {
  const cacheKey = discoveryKey(key);
  const cached = discoveredModels.get(cacheKey);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.list;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(6000) });
    const d: any = await r.json().catch(() => ({}));
    const list = ((d.models || []) as any[])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|live|audio|embed|robotics|computer|cyber|omni|banana|vision/i.test(m.name))
      .map((m) => String(m.name).replace(/^models\//, ''));
    discoveredModels.set(cacheKey, { at: Date.now(), list });
    if (discoveredModels.size > 20) discoveredModels.delete(discoveredModels.keys().next().value as string);
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
class GeminiFail extends Error { constructor(public status: number, message: string, public keyBad = false, public retryMs = 0) { super(message); } }

/** How long a provider says we must wait ("try again in 20m30s", "retry in 12s", a Retry-After header). A daily limit with no time given rests for 30 minutes. */
function waitFromLimit(message: string, retryAfter?: string | null): number {
  const m = String(message).match(/(?:try again|retry) in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i);
  if (m && (m[1] || m[2] || m[3])) return Math.min(6 * 3600_000, (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Math.ceil(Number(m[3] || 0)) + 2) * 1000);
  const ra = Number(retryAfter);
  if (ra > 0) return Math.min(6 * 3600_000, (ra + 2) * 1000);
  return /per day|tokens per day|requests per day|TPD|RPD|daily/i.test(message) ? 30 * 60_000 : 60_000;
}
const niceWait = (ms: number) => ms >= 3600_000 ? `${Math.round(ms / 360_000) / 10} hours` : ms >= 90_000 ? `${Math.ceil(ms / 60_000)} minutes` : `${Math.max(5, Math.ceil(ms / 1000))} seconds`;

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

function geminiError(status: number, _msg: string, keyBad: boolean): HttpError {
  let out: string;
  if (keyBad) out = 'AI generation is temporarily unavailable. Please try again later or contact support if the problem continues.';
  else if (status === 429) out = 'AI generation is busy right now. Please wait a moment and try again.';
  else if (status === 404) out = 'The AI service is temporarily unavailable. Please try again later.';
  else if (status === 403) out = 'AI generation could not complete this request. Please try again later.';
  else if (status === 503) out = 'The AI service is temporarily busy. Please try again in a moment.';
  else out = 'AI generation could not complete this request. Please try again.';
  return new HttpError(424, out, 'AI_PROVIDER_UNAVAILABLE');
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
      catch (e: any) { last = e instanceof GeminiFail ? e : new GeminiFail(0, e?.message || 'Gemini failed'); if (last.keyBad) return null; }
    }
    return null;
  };
  let hit = await go([lastGood, ...PREFERRED_MODELS()].filter(Boolean) as string[]);
  if (!hit && !last.keyBad && last.status !== 429 && Date.now() < deadline) hit = await go((await discoverModels(key)).slice(0, 2));
  if (hit) return hit;
  console.error('Gemini failed:', last.status, last.message);
  noteGeminiFailure(last, key);
  throw geminiError(last.status, last.message, last.keyBad);
}

// ---- keeping the free Gemini quota alive ---------------------------------------------------------------
// When Google says "quota", every further call only makes things worse. Remember it per key and skip that key until it is allowed again.
const blockedKeys = new Map<string, number>();
const keyTag = (k: string) => k.slice(-8);
function noteGeminiFailure(f: GeminiFail, key = '') {
  if (f.status !== 429 && !/RESOURCE_EXHAUSTED|quota/i.test(f.message)) return;
  const m = f.message.match(/retry in ([\d.]+)s/i) || f.message.match(/"retryDelay":\s*"(\d+)s"/);
  const secs = m ? Math.ceil(Number(m[1])) + 2 : /per ?day|daily|limit: 0/i.test(f.message) ? 1800 : 60;
  blockedKeys.set(keyTag(key), Date.now() + Math.min(secs, 1800) * 1000);
}

/** Every Gemini key that is set: GEMINI_API_KEY, GOOGLE_API_KEY, GEMINI_API_KEY_2 to _5, GEMINI_API_KEYS (comma separated), and an AIza key placed in LLM_API_KEY by mistake. */
function geminiKeyList(): string[] {
  const out: string[] = [];
  const add = (v?: string) => { const t = (v || '').trim(); if (t && !out.includes(t)) out.push(t); };
  add(lookupEnv('GEMINI_API_KEY')?.value); add(lookupEnv('GOOGLE_API_KEY')?.value);
  for (let i = 2; i <= 5; i++) add(process.env[`GEMINI_API_KEY_${i}`]);
  (process.env.GEMINI_API_KEYS || '').split(/[,\s]+/).forEach(add);
  if ((process.env.LLM_API_KEY || '').trim().startsWith('AIza')) add(process.env.LLM_API_KEY); // a second Gemini key put in the backup slot still works
  return out;
}
const keyBlockedMs = (k: string) => Math.max(0, (blockedKeys.get(keyTag(k)) || 0) - Date.now());
/** Time until at least one Gemini key can be used again (0 when one is ready). */
const geminiBlockedMs = () => { const ks = geminiKeyList(); return ks.length ? Math.min(...ks.map(keyBlockedMs)) : 0; };

// ---- backup writers (any OpenAI-compatible service, plus Anthropic) --------------------------------------
export interface LlmBackup { id: string; label: string; kind: 'openai' | 'anthropic'; key: string; base: string; model: string }
const SERVICES: { id: string; label: string; env: string; base: string; model: string; prefix?: string }[] = [
  { id: 'groq', label: 'Groq', env: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', prefix: 'gsk_' },
  { id: 'cerebras', label: 'Cerebras', env: 'CEREBRAS_API_KEY', base: 'https://api.cerebras.ai/v1', model: 'llama3.1-8b', prefix: 'csk-' },
  { id: 'openrouter', label: 'OpenRouter', env: 'OPENROUTER_API_KEY', base: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3.8-27b:free', prefix: 'sk-or-' },
  { id: 'openai', label: 'OpenAI', env: 'OPENAI_API_KEY', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', env: 'DEEPSEEK_API_KEY', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'mistral', label: 'Mistral', env: 'MISTRAL_API_KEY', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'together', label: 'Together', env: 'TOGETHER_API_KEY', base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'xai', label: 'xAI', env: 'XAI_API_KEY', base: 'https://api.x.ai/v1', model: 'grok-3-mini', prefix: 'xai-' },
];

/** All backup writers that are set up, in the order they are tried. LLM_API_KEY works with any service: the service is recognised from the key, or from LLM_BASE_URL. */
export function llmBackups(): LlmBackup[] {
  const out: LlmBackup[] = [];
  const generic = (process.env.LLM_API_KEY || '').trim();
  if (generic && !generic.startsWith('AIza')) {
    const base = (process.env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
    if (generic.startsWith('sk-ant-')) out.push({ id: 'anthropic', label: 'Anthropic', kind: 'anthropic', key: generic, base: 'https://api.anthropic.com', model: (process.env.LLM_MODEL || 'claude-haiku-5-5').trim() });
    else {
      const guess = SERVICES.find((s) => s.prefix && generic.startsWith(s.prefix)) || (generic.startsWith('sk-') ? SERVICES.find((s) => s.id === 'openai') : undefined);
      const svc = guess || SERVICES[0]; // old behaviour: Groq
      out.push({ id: base ? 'custom' : svc.id, label: base ? 'Backup AI (custom URL)' : svc.label, kind: 'openai', key: generic, base: base || svc.base, model: (process.env.LLM_MODEL || svc.model).trim() });
    }
  }
  for (const s of SERVICES) { const k = (process.env[s.env] || '').trim(); if (k && !out.some((o) => o.key === k)) out.push({ id: s.id, label: s.label, kind: 'openai', key: k, base: s.base, model: (process.env[`${s.id.toUpperCase()}_MODEL`] || s.model).trim() }); }
  const ant = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (ant && !out.some((o) => o.key === ant)) out.push({ id: 'anthropic', label: 'Anthropic', kind: 'anthropic', key: ant, base: 'https://api.anthropic.com', model: (process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5').trim() });
  return out;
}
const blockedBackups = new Map<string, number>();

/** For the System check screen. */
export const aiWriterStatus = () => ({ geminiBlockedSeconds: Math.ceil(geminiBlockedMs() / 1000), geminiKeys: geminiKeyList().length, backupConfigured: llmBackups().length > 0, backups: llmBackups().map((b) => ({ id: b.id, label: b.label, model: b.model })), backupModel: llmBackups()[0]?.model || '' });

const haveGemini = () => geminiKeyList().length > 0;
/** Keeps a provider's error message short and removes anything that looks like a key. */
const tidy = (m: string) => String(m || '').replace(/[A-Za-z0-9_\-]{24,}/g, '…').replace(/\s+/g, ' ').trim().slice(0, 160);

const modelCache = new Map<string, string>();
/** Asks the service which models this key can use and picks a good one. Free services rename and retire models often, so a fixed name is not enough. */
async function discoverModel(b: LlmBackup, current: string): Promise<string | null> {
  try {
    const r = await fetch(`${b.base}/models`, { headers: { Authorization: `Bearer ${b.key}` }, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const d: any = await r.json();
    const list: any[] = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
    let models = list.map((m) => ({ id: String(m?.id || ''), free: m?.pricing ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 : false })).filter((m) => m.id && !/embed|whisper|tts|vision|\bvl\b|guard|moderation|image|audio|rerank|safety/i.test(m.id));
    if (b.id === 'openrouter') models = models.filter((m) => m.free || m.id.endsWith(':free'));
    // Prefer currently supported Groq models. llama-3.3-70b-versatile was retired
    // and has appeared in stale model lists, so never select it as a fallback.
    for (const re of [/gpt-oss-?20b/i, /gpt-oss-?120b/i, /qwen.*(235b|32b)/i, /llama.*70b/i, /gpt-oss/i, /deepseek/i, /gemma.*(27b|12b)/i, /llama.*8b/i]) {
      const hit = models.find((m) => re.test(m.id) && m.id !== current);
      if (hit) return hit.id;
    }
    return models.find((m) => m.id !== current)?.id || null;
  } catch { return null; }
}

/** One call to a backup writer. Handles services that reject JSON mode by asking again without it. */
async function callBackup(b: LlmBackup, prompt: string, o: { json: boolean; timeoutMs: number; maxTokens?: number }): Promise<string> {
  const net = (e: any) => new GeminiFail(0, e?.name === 'TimeoutError' ? `${b.label} took too long to answer.` : (e?.message || `Network error talking to ${b.label}.`));
  if (b.kind === 'anthropic') {
    let r: Response;
    try {
      r = await fetch(`${b.base}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': b.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: b.model, max_tokens: o.maxTokens || 8000, messages: [{ role: 'user', content: o.json ? `${prompt}\n\nReturn only the JSON, with no other text.` : prompt }] }), signal: AbortSignal.timeout(o.timeoutMs) });
    } catch (e: any) { throw net(e); }
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new GeminiFail(r.status, `${r.status} ${tidy(d?.error?.message || 'rejected')}`, r.status === 401, r.status === 429 ? waitFromLimit(String(d?.error?.message || ''), r.headers.get('retry-after')) : 0);
    const text = String((d?.content || []).map((c: any) => c?.text || '').join(''));
    if (!text.trim()) throw new GeminiFail(0, `${b.label} returned an empty answer.`);
    return text;
  }
  const modelKey = `${b.id}|${b.base}|${discoveryKey(b.key)}`;
  let model = modelCache.get(modelKey) || b.model;
  const errText = (data: any) => String(data?.error?.message || data?.message || '');
  const ask = async (json: boolean, m: string, maxTok: number) => {
    let res: Response;
    try {
      res = await fetch(`${b.base}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.key}` },
        body: JSON.stringify({ model: m, temperature: 0.9, max_tokens: maxTok, messages: [{ role: 'user', content: prompt }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
        signal: AbortSignal.timeout(o.timeoutMs),
      });
    } catch (e: any) { throw net(e); }
    return { r: res, d: (await res.json().catch(() => ({}))) as any };
  };
  let maxTok = o.maxTokens || 8000;
  let a = await ask(o.json, model, maxTok);
  // some models do not accept JSON mode
  if (o.json && !a.r.ok && [400, 422].includes(a.r.status) && !/model|context|token|exceed/i.test(errText(a.d))) a = await ask(false, model, maxTok);
  // the model name is wrong, retired, or needs credits (free services change their models often): find one that works for this key
  if (!a.r.ok && (a.r.status === 404 || a.r.status === 402 || (a.r.status === 400 && /model|does not exist|not found|decommission|not supported/i.test(errText(a.d))))) {
    const alt = await discoverModel(b, model);
    if (alt && alt !== model) { model = alt; modelCache.set(modelKey, alt); a = await ask(o.json, model, maxTok); if (o.json && !a.r.ok && [400, 422].includes(a.r.status)) a = await ask(false, model, maxTok); }
  }
  // Free provider plans may enforce a combined input + output token budget.
  // Use the provider's own Requested/Limit figures when present, preserving as much
  // useful output as possible instead of repeatedly sending an oversized request.
  for (let retry = 0; retry < 2 && !a.r.ok; retry++) {
    const detail = errText(a.d);
    // A 429 belongs to the provider's current rate-limit window. Do not retry it
    // immediately; llmGenerate records the provider cooldown and tries the next writer.
    const shrinkable = [400, 413].includes(a.r.status)
      && /context|max_tokens|too (large|long|many)|maximum|exceed|request size/i.test(detail);
    if (!shrinkable || maxTok <= 700) break;
    const requested = Number(detail.match(/requested[:\s]+([\d,]+)/i)?.[1]?.replace(/,/g, '') || 0);
    const limit = Number(detail.match(/limit[:\s]+([\d,]+)/i)?.[1]?.replace(/,/g, '') || 0);
    const overflow = requested > limit && limit > 0 ? requested - limit : 0;
    const reduced = overflow ? maxTok - overflow - 300 : Math.floor(maxTok * 0.6);
    const nextMax = Math.max(700, Math.min(maxTok - 1, reduced));
    if (nextMax >= maxTok) break;
    maxTok = nextMax;
    a = await ask(o.json, model, maxTok);
    if (o.json && !a.r.ok && [400, 422].includes(a.r.status) && !/model|context|token|exceed/i.test(errText(a.d))) a = await ask(false, model, maxTok);
  }
  let r = a.r, d: any = a.d;
  const fail = (res: Response, data: any) => {
    const msg = tidy(errText(data) || 'rejected');
    console.error('Backup AI failed', b.id, model, res.status, JSON.stringify(data).slice(0, 300));
    return new GeminiFail(res.status, `${res.status} ${msg}`, res.status === 401, res.status === 429 ? waitFromLimit(errText(data), res.headers.get('retry-after')) : 0);
  };
  if (!r.ok) throw fail(r, d);
  const read = (data: any) => { const m = data?.choices?.[0]?.message; return String(m?.content || '').trim() || String(m?.reasoning_content || m?.reasoning || '').trim(); };
  let text = read(d);
  if (!text && o.json) { // JSON mode sometimes returns nothing: ask once more in plain mode
    const again = await ask(false, model, maxTok); r = again.r; d = again.d;
    if (!r.ok) throw fail(r, d);
    text = read(d);
  }
  if (!text) throw new GeminiFail(0, `${b.label} returned an empty answer (${d?.choices?.[0]?.finish_reason || 'no reason given'}). Try another LLM_MODEL if this keeps happening.`);
  return text;
}

/**
 * Writes text with the best available AI: every Gemini key first (skipping any that are out of quota), then every backup service.
 * One person action therefore never fails just because one free quota ran out, and when everything fails the reason of each is reported.
 */
export async function llmGenerate(prompt: string, o: { json?: boolean; timeoutMs?: number; deadlineMs?: number; maxTokens?: number; preferBackup?: boolean } = {}): Promise<{ text: string; provider: 'gemini' | 'backup'; model: string }> {
  const json = o.json !== false;
  const start = Date.now();
  const deadline = start + (o.deadlineMs || 50_000);
  const backups = llmBackups();
  const configuredPrimary = (process.env.LLM_PRIMARY || '').trim().toLowerCase();
  // A configured OpenAI-compatible backup (Groq by default in this app) is the primary writer unless Gemini is explicitly selected.
  const wantsBackupFirst = backups.length > 0 && (o.preferBackup === true || (o.preferBackup !== false && configuredPrimary !== 'gemini') || configuredPrimary === 'backup');
  const errs: { who: string; f: GeminiFail }[] = [];
  const tryGemini = async () => {
    const keys = geminiKeyList(); if (!keys.length) return null;
    const open = keys.filter((k) => keyBlockedMs(k) === 0);
    if (!open.length) {
      if (backups.length) return null; // every key is resting and a backup exists: do not waste time or requests
      throw new HttpError(424, `The AI writer has reached its free usage limit and needs about ${Math.ceil(geminiBlockedMs() / 1000)} seconds. It will try again by itself. Add a backup AI key to avoid waiting.`, 'GEMINI');
    }
    const budget = backups.length ? Math.min(deadline, start + 24_000) : deadline;
    let lastErr: any = null;
    for (const key of open) {
      if (Date.now() >= budget - 4_000) break;
      try {
        const { out, model } = await withModels(key, budget, (m) => callGemini(key, m, prompt, { grounded: false, json, timeoutMs: Math.max(8_000, Math.min(o.timeoutMs || 40_000, budget - Date.now())), maxTokens: o.maxTokens }));
        // Validate structured output before accepting a provider. A 200 response with malformed JSON
        // must not block the next configured writer from completing the user's request.
        if (json) extractJson(out.text);
        return { text: out.text, provider: 'gemini' as const, model };
      } catch (e: any) {
        const f = e instanceof HttpError ? new GeminiFail(/usage limit|quota/i.test(e.message) ? 429 : 0, e.message) : new GeminiFail(e?.status || 0, e?.message || 'Gemini failed', !!e?.keyBad);
        noteGeminiFailure(f, key); errs.push({ who: `Gemini${keys.length > 1 ? ` key ${keys.indexOf(key) + 1}` : ''}`, f }); lastErr = e;
      }
    }
    if (!backups.length && lastErr) throw lastErr;
    return null;
  };
  const tryBackups = async () => {
    for (const b of backups) {
      if ((blockedBackups.get(b.id) || 0) > Date.now()) { errs.push({ who: b.label, f: new GeminiFail(429, 'at its free limit', false, (blockedBackups.get(b.id) || 0) - Date.now()) }); continue; }
      const left = deadline - Date.now();
      if (left < 6_000) { errs.push({ who: b.label, f: new GeminiFail(0, 'no time left to try it') }); break; }
      try {
        const text = await callBackup(b, prompt, { json, timeoutMs: Math.min(o.timeoutMs || 40_000, left), maxTokens: o.maxTokens });
        // Treat malformed JSON as a provider failure and continue through the remaining backups.
        if (json) extractJson(text);
        return { text, provider: 'backup' as const, model: `${b.id}:${b.model}` };
      }
      catch (e: any) {
        const f = e instanceof GeminiFail ? e : new GeminiFail(0, e?.message || 'failed');
        if (f.status === 429) blockedBackups.set(b.id, Date.now() + (f.retryMs || 60_000));
        errs.push({ who: b.label, f });
      }
    }
    return null;
  };
  const order = wantsBackupFirst ? [tryBackups, tryGemini] : [tryGemini, tryBackups];
  for (const step of order) { const hit = await step(); if (hit) return hit; }
  const limited = errs.filter((e) => e.f.status === 429);
  const geminiResting = geminiBlockedMs() > 0 || errs.some((e) => e.who.startsWith('Gemini') && e.f.status === 429);
  const geminiOk = !geminiKeyList().length || geminiBlockedMs() > 0; // no Gemini key, or every Gemini key is resting
  const everythingAtLimit = geminiOk && backups.every((b) => limited.some((e) => e.who === b.label)) && errs.every((e) => e.f.status === 429) && (limited.length > 0 || geminiBlockedMs() > 0);
  if (geminiResting || limited.length) {
    const waits = [geminiBlockedMs(), ...limited.map((e) => e.f.retryMs)].filter((n) => n > 0);
    const wait = waits.length ? Math.min(...waits) : 0;
    const names = [...(geminiResting ? ['Gemini'] : []), ...limited.filter((e) => !e.who.startsWith('Gemini')).map((e) => e.who)];
    if (everythingAtLimit) {
      throw new HttpError(424, `Your AI writers have used their free allowance for now (${names.join(' and ') || 'all of them'}). ${wait ? `The soonest one is ready again in about ${niceWait(wait)}. ` : ''}Your work is kept and it will carry on by itself. To keep going right now, add another free key in Vercel (for example CEREBRAS_API_KEY, OPENROUTER_API_KEY or a second Gemini key as GEMINI_API_KEY_2) and redeploy.`, 'GEMINI');
    }
  }
  const detail = errs.length ? ` Details: ${errs.map((e) => `${e.who}: ${e.f.keyBad ? 'the key was rejected (check it is copied correctly and is active)' : tidy(e.f.message)}`).join('; ')}.` : '';
  throw new HttpError(424, `The AI writers could not answer right now. It will retry automatically.${detail} Open Settings, System check (owner only) and run it to see which key needs attention.`, 'GEMINI');
}

/** Sends a tiny request to every configured AI writer and reports what happened, so a wrong key or model is easy to find. */
export async function testAiWriters(): Promise<{ name: string; ok: boolean; message: string }[]> {
  const out: { name: string; ok: boolean; message: string }[] = [];
  const keys = geminiKeyList();
  await Promise.all([
    ...keys.map(async (k, i) => {
      const name = `Gemini${keys.length > 1 ? ` key ${i + 1}` : ''}`;
      if (keyBlockedMs(k) > 0) { out.push({ name, ok: false, message: `Out of free quota. It rests for about ${Math.ceil(keyBlockedMs(k) / 1000)} seconds.` }); return; }
      try { const { model } = await withModels(k, Date.now() + 15_000, (m) => callGemini(k, m, 'Reply with the single word OK.', { grounded: false, json: false, timeoutMs: 12_000, maxTokens: 20 })); out.push({ name, ok: true, message: `Working (${model}).` }); }
      catch (e: any) { const f = new GeminiFail(e?.status || 0, e?.message || 'failed', !!e?.keyBad); noteGeminiFailure(f, k); out.push({ name, ok: false, message: tidy(e?.message || 'failed') }); }
    }),
    ...llmBackups().map(async (b) => {
      try { await callBackup(b, 'Reply with the single word OK.', { json: false, timeoutMs: 15_000, maxTokens: 20 }); out.push({ name: `${b.label} (${modelCache.get(`${b.id}|${b.base}|${discoveryKey(b.key)}`) || b.model})`, ok: true, message: 'Working.' }); }
      catch (e: any) { out.push({ name: `${b.label} (${b.model})`, ok: false, message: e?.keyBad ? 'The key was rejected. Check that it is copied correctly and is still active.' : e?.status === 429 ? `The key works, but its free allowance is used up. Ready again in about ${niceWait(e.retryMs || 60_000)}.` : tidy(e?.message || 'failed') }); }
    }),
  ]);
  return out;
}

/** Plain JSON generation (scripts, A/B ideas). Optionally grounded with Google Search. */
export async function geminiRaw(prompt: string, opts: { grounded?: boolean; timeoutMs?: number; deadlineMs?: number; maxTokens?: number; preferBackup?: boolean } = {}): Promise<GeminiResult> {
  if (!opts.grounded) {
    // The configured non-Gemini writer (Groq in this deployment) is the default for scripts and creative generation.
    // Gemini is a fallback, not a hard dependency; callers may explicitly opt into Gemini-first when needed.
    const g = await llmGenerate(prompt, { json: true, timeoutMs: opts.timeoutMs, deadlineMs: opts.deadlineMs, maxTokens: opts.maxTokens, preferBackup: opts.preferBackup !== false });
    try { return { data: extractJson(g.text), model: `${g.provider}:${g.model}`, grounded: false, sources: [] }; }
    catch { throw new HttpError(424, 'The AI answered in an unexpected format. Retrying.', 'GEMINI'); }
  }
  const key = geminiKeyList().find((k) => keyBlockedMs(k) === 0) || need('GEMINI_API_KEY', 'GOOGLE_API_KEY');
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
// Official YouTube public statistics, when the owner has configured a YouTube Data API key.
async function youtubePublicTrendEvidence(niche: string): Promise<{ text: string; sources: { title: string; url: string; publishedAt: string }[] }> {
  const key = (process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY || '').trim();
  if (!key) return { text: 'YouTube Data API: not configured. Web-search discoveries may still include YouTube links, but official public view-count ranking is unavailable.', sources: [] };
  const after = new Date(Date.now() - TREND_FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const base = 'https://www.googleapis.com/youtube/v3/';
  const searchUrl = new URL(base + 'search');
  searchUrl.search = new URLSearchParams({ part: 'snippet', type: 'video', order: 'viewCount', maxResults: '50', publishedAfter: after, q: niche, key }).toString();
  const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(18000) });
  if (!sr.ok) throw new Error('YouTube search returned ' + sr.status);
  const sd: any = await sr.json();
  const found = (sd.items || []).filter((x: any) => x && x.id && x.id.videoId && x.snippet && x.snippet.channelId);
  if (!found.length) return { text: 'YouTube Data API: no public videos found for this niche in the last 14 days.', sources: [] };
  const videoIds = found.map((x: any) => x.id.videoId);
  const channelIds = [...new Set(found.map((x: any) => x.snippet.channelId))];
  const [vr, cr] = await Promise.all([
    fetch(base + 'videos?' + new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: videoIds.join(','), key }), { signal: AbortSignal.timeout(18000) }),
    fetch(base + 'channels?' + new URLSearchParams({ part: 'snippet,statistics', id: channelIds.join(','), key }), { signal: AbortSignal.timeout(18000) }),
  ]);
  if (!vr.ok || !cr.ok) throw new Error('YouTube details returned ' + (!vr.ok ? vr.status : cr.status));
  const vd: any = await vr.json(), cd: any = await cr.json();
  const channels = new Map((cd.items || []).map((x: any) => [x.id, x]));
  const videos = (vd.items || []).map((v: any) => {
    const ch: any = channels.get(v.snippet && v.snippet.channelId);
    return {
      videoId: v.id, title: String((v.snippet && v.snippet.title) || '').slice(0, 220),
      channelId: v.snippet && v.snippet.channelId, channelTitle: String((v.snippet && v.snippet.channelTitle) || ''),
      publishedAt: (v.snippet && v.snippet.publishedAt) || '', views: Number((v.statistics && v.statistics.viewCount) || 0),
      viewsPerHour: Math.round(Number((v.statistics && v.statistics.viewCount) || 0) / Math.max(1, (Date.now() - new Date((v.snippet && v.snippet.publishedAt) || Date.now()).getTime()) / 3600000)),
      likes: Number((v.statistics && v.statistics.likeCount) || 0), comments: Number((v.statistics && v.statistics.commentCount) || 0),
      thumbnail: (v.snippet && v.snippet.thumbnails && (v.snippet.thumbnails.high || v.snippet.thumbnails.medium) && (v.snippet.thumbnails.high || v.snippet.thumbnails.medium).url) || '',
      subscribers: Number((ch && ch.statistics && ch.statistics.subscriberCount) || 0),
      channelUrl: 'https://www.youtube.com/channel/' + (v.snippet && v.snippet.channelId),
      videoUrl: 'https://www.youtube.com/watch?v=' + v.id,
    };
  }).sort((a: any, b: any) => b.views - a.views);
  const grouped = new Map<string, any>();
  for (const v of videos) {
    const prior = grouped.get(v.channelId);
    if (!prior) grouped.set(v.channelId, Object.assign({}, v, { topVideos: [v] }));
    else if (prior.topVideos.length < 3) prior.topVideos.push(v);
  }
  const creators = [...grouped.values()].sort((a: any, b: any) => b.views - a.views).slice(0, 50);
  const evidence = creators.map((c: any, i: number) =>
    '[YOUTUBE PUBLIC CREATOR ' + (i + 1) + '] ' + c.channelTitle +
    '\nChannel: ' + c.channelUrl + '\nSubscribers (public): ' + (c.subscribers || 'Hidden') +
    '\nTop recent public video: ' + c.title + '\nVideo URL: ' + c.videoUrl +
    '\nPublished: ' + c.publishedAt + '\nPublic views: ' + c.views + '\nCalculated public views per hour: ' + c.viewsPerHour +
    '\nPublic likes: ' + (c.likes || 'Hidden') + '\nPublic comments: ' + (c.comments || 'Hidden') +
    '\nThumbnail: ' + c.thumbnail + '\nAdditional videos: ' +
    (c.topVideos.slice(1).map((v: any) => v.title + ' | ' + v.videoUrl + ' | ' + v.views + ' public views | ' + v.viewsPerHour + ' public views/hour (calculated) | ' + v.publishedAt + ' | ' + v.thumbnail).join(' ; ') || 'None returned')
  ).join('\n\n');
  const sources = creators.flatMap((c: any) => [
    { title: c.channelTitle + ' — YouTube channel', url: c.channelUrl, publishedAt: c.publishedAt },
    ...c.topVideos.map((v: any) => ({ title: v.title, url: v.videoUrl, publishedAt: v.publishedAt })),
  ]);
  return {
    text: 'OFFICIAL YOUTUBE DATA API RESULTS. Search ordered by public view count, restricted to videos published in the last 14 days. These are public views, NOT private impressions. This is a discovery sample, not a complete platform-wide ranking.\n\n' + evidence,
    sources,
  };
}

// Independent multi-query search for niche intelligence; does not require Gemini.
export async function webTrendResearch(niche: string, customQuery: string): Promise<{ text: string; sources: { title: string; url: string; domain: string; faviconUrl: string; imageUrl?: string; snippet: string; publishedAt?: string; sourceType: 'video' | 'article' | 'news' | 'website'; platform?: string }[]; provider: string }> {
  const focus = customQuery ? ' ' + customQuery : '';
  const queries = [
    '"' + niche + '" trends launches news published in the last 14 days' + focus,
    '"' + niche + '" top YouTube creators and videos published in the last 14 days' + focus,
    '"' + niche + '" TikTok videos and creators trending in the last 14 days' + focus,
    '"' + niche + '" Instagram Reels published in the last 14 days' + focus,
    '"' + niche + '" creator formats and audience conversations from the last 14 days' + focus,
    '"' + niche + '" recent audience questions, hashtags and market updates published in the last 14 days' + focus,
  ];
  const unique = new Map<string, any>();
  const braveKey = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  const tavilyKey = (process.env.TAVILY_API_KEY || '').trim();
  let searchText = '';
  let provider = '';
  if (braveKey) {
    const groups = await Promise.all(queries.map(async (q, i) => {
      const url = new URL('https://api.search.brave.com/res/v1/llm/context');
      url.searchParams.set('q', q); url.searchParams.set('count', '15');
      url.searchParams.set('maximum_number_of_tokens', '2048'); url.searchParams.set('maximum_number_of_urls', '10');
      url.searchParams.set('context_threshold_mode', 'balanced'); url.searchParams.set('enable_source_metadata', 'true');
      url.searchParams.set('freshness', 'pm');
      const r = await fetch(url, { headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new HttpError(424, 'Brave LLM Context returned ' + r.status + '. Check BRAVE_SEARCH_API_KEY and its plan.', 'SEARCH');
      const d: any = await r.json(), generic = d && d.grounding && d.grounding.generic || [], meta = d && d.sources || {};
      return generic.map((x: any) => {
        const age = meta[x.url]?.age;
        return {
          title: String(x.title || (meta[x.url] && meta[x.url].title) || '').slice(0, 240),
          url: String(x.url || ''),
          content: (x.snippets || []).map((v: any) => String(v)).join('\n').slice(0, 7000),
          date: Array.isArray(age) ? age.join(' | ') : String(age || ''),
          imageUrl: String(meta[x.url]?.thumbnail?.src || meta[x.url]?.thumbnail || ''),
          faviconUrl: String(meta[x.url]?.favicon || ''),
          query: q,
        };
      });
    }));
    for (const group of groups) for (const x of group) if (/^https?:\/\//i.test(x.url)) {
      const oldItem = unique.get(x.url);
      if (oldItem) oldItem.content = (oldItem.content + '\n' + x.content).slice(0, 10000);
      else unique.set(x.url, x);
    }
    const items = [...unique.values()].filter((x) => isRecentTrendSource(x.date)).slice(0, 36);
    if (items.length < 4) throw new HttpError(424, `Live search returned only ${items.length} date-verified sources published in the last 14 days. Older and undated pages were excluded; try a broader niche.`, 'TREND_FRESHNESS');
    searchText = items.map((x, i) => '[SOURCE ' + (i + 1) + '] ' + x.title + '\nURL: ' + x.url + '\nPublished/updated: ' + normalizeTrendPublishedAt(x.date) + '\nSearch query: ' + x.query + '\nExtracted evidence: ' + x.content).join('\n\n');
    provider = 'brave-llm-context';
  } else if (tavilyKey) {
    const groups = await Promise.all(queries.map(async q => {
      const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: q, topic: 'general', search_depth: 'advanced', max_results: 8, include_answer: false, include_raw_content: false, include_images: true, include_favicon: true }), signal: AbortSignal.timeout(18000) });
      if (!r.ok) throw new HttpError(424, 'Tavily Search returned ' + r.status + '. Check TAVILY_API_KEY.', 'SEARCH');
      const d: any = await r.json();
      return (d.results || []).map((x: any) => { const pageImages = Array.isArray(x.images) ? x.images : []; const pageImage = pageImages.map((v: any) => typeof v === 'string' ? v : String(v?.url || '')).find((v: string) => /^https?:\/\//i.test(v)) || ''; return { title: String(x.title || '').slice(0, 240), url: String(x.url || ''), content: String(x.content || '').slice(0, 2200), date: String(x.published_date || ''), imageUrl: String(x.image || x.image_url || x.thumbnail_url || x.thumbnail?.src || pageImage), faviconUrl: String(x.favicon || ''), query: q }; });
    }));
    for (const group of groups) for (const x of group) if (/^https?:\/\//i.test(x.url)) unique.set(x.url, x);
    const items = [...unique.values()].filter((x) => isRecentTrendSource(x.date)).slice(0, 36);
    if (items.length < 4) throw new HttpError(424, `Live search returned only ${items.length} date-verified sources published in the last 14 days. Older and undated pages were excluded; try a broader niche.`, 'TREND_FRESHNESS');
    searchText = items.map((x, i) => '[SOURCE ' + (i + 1) + '] ' + x.title + '\nURL: ' + x.url + '\nPublished: ' + normalizeTrendPublishedAt(x.date) + '\nSearch query: ' + x.query + '\nEvidence: ' + x.content).join('\n\n');
    provider = 'tavily';
  } else {
    throw new HttpError(424, 'Live niche research needs a search API key. Add TAVILY_API_KEY in Vercel, then redeploy. This research step does not use Gemini.', 'SEARCH_SETUP');
  }
  let youtubeText = '';
  try {
    const yt = await youtubePublicTrendEvidence(niche);
    youtubeText = yt.text;
    for (const source of yt.sources) {
      const prior = unique.get(source.url);
      if (prior) prior.date = source.publishedAt;
      else unique.set(source.url, { title: source.title, url: source.url, date: source.publishedAt, query: 'Official YouTube Data API · last 14 days' });
    }
  } catch (e) {
    youtubeText = 'YouTube Data API enrichment unavailable: ' + (e instanceof Error ? e.message : 'request failed') + '. Use only public metrics visible in web-search evidence; do not infer private impressions.';
  }
  const recentSources = [...unique.values()].filter((x) => isRecentTrendSource(x.date));
  if (recentSources.length < 4) throw new HttpError(424, 'Trend research did not return enough source dates from the last 14 days. No older trend cards were generated.', 'TREND_FRESHNESS');
  const sources = recentSources.slice(0, 80).map(x => {
    const parsed = new URL(x.url);
    const domain = parsed.hostname.replace(/^www\./i, '');
    const host = parsed.hostname.toLowerCase();
    const isYouTube = host === 'youtu.be' || host.endsWith('youtube.com');
    const videoId = isYouTube ? (host === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : (parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop())) : '';
    const youtubeImage = videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg' : '';
    const rawImage = typeof x.imageUrl === 'string' ? x.imageUrl : '';
    const imageUrl = /^https?:\/\//i.test(rawImage) ? rawImage : (youtubeImage || undefined);
    const platform = isYouTube ? 'YouTube' : host.includes('tiktok') ? 'TikTok' : host.includes('instagram') ? 'Instagram' : host.includes('facebook') ? 'Facebook' : host.includes('linkedin') ? 'LinkedIn' : host.includes('x.com') || host.includes('twitter') ? 'X' : undefined;
    const sourceType: 'video' | 'news' | 'article' = isYouTube && videoId ? 'video' : /news|bbc|cnn|reuters|guardian|forbes|techcrunch|wired|nytimes/i.test(domain) ? 'news' : 'article';
    return { title: x.title || x.url, url: x.url, domain, faviconUrl: String(x.faviconUrl || '').startsWith('http') ? String(x.faviconUrl) : 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64', imageUrl, snippet: String(x.content || '').slice(0, 360), publishedAt: normalizeTrendPublishedAt(x.date), sourceType, platform };
  });
  const text = 'Search provider: ' + provider + '. Research date: ' + new Date().toISOString() + '. Strict freshness window: 14 days. Older and undated pages were excluded. Web sources: ' + sources.length + '.\n\n' + searchText + '\n\n' + youtubeText;
  return { text, sources, provider: provider + ((process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY) ? '+youtube-data-api' : '') };
}
export async function geminiSearch(researchPrompt: string): Promise<{ text: string; sources: { title: string; url: string }[]; model: string }> {
  const key = geminiKeyList().find((k) => keyBlockedMs(k) === 0) || need('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  if (geminiBlockedMs() > 0) throw new HttpError(424, `Live search has reached Gemini's free limit. Please try again in about ${Math.ceil(geminiBlockedMs() / 1000)} seconds.`, 'GEMINI');
  const { out, model } = await withModels(key, Date.now() + 30_000, (m) => callGemini(key, m, researchPrompt, { grounded: true, json: false, timeoutMs: 28_000, maxTokens: 6000 }));
  if (!out.searched) throw new HttpError(424, 'Live web search did not run for this request, so no research was returned. Please try again.', 'NO_SEARCH');
  return { text: out.text, sources: out.sources, model };
}

/** Step 2 of research: turn the findings into the app's JSON (fast, no search). */
export async function geminiFormat(prompt: string): Promise<{ data: any; model: string }> {
  const g = await llmGenerate(prompt, { json: true, timeoutMs: 38_000, deadlineMs: 46_000, maxTokens: 12_000, preferBackup: true });
  try { return { data: extractJson(g.text), model: `${g.provider}:${g.model}` }; } catch { throw new HttpError(424, 'The research came back in an unexpected format. Please try again.', 'GEMINI'); }
}

export interface VisualReviewImage { name: string; bytes: Buffer; mimeType: string; timestamp?: number }
export interface VisualReviewResult {
  passed: boolean;
  severity: 'none' | 'minor' | 'major';
  identityDrift: boolean;
  handAnatomyIssue: boolean;
  propConsistencyIssue: boolean;
  issues: string[];
  summary: string;
}

/** Reviews sampled shot frames against the opening/reference still using Gemini vision. Returns null when vision is not configured. */
export async function geminiVisualReview(
  sceneDescription: string,
  frames: VisualReviewImage[],
  referenceImages: VisualReviewImage[] = [],
): Promise<VisualReviewResult | null> {
  const key = geminiKeyList().find((candidate) => keyBlockedMs(candidate) === 0);
  if (!key || frames.length < 3) return null;
  const models = [...new Set([...PREFERRED_MODELS(), ...(await discoverModels(key))])].slice(0, 2);
  const images = [
    ...referenceImages.slice(0, 2).map((image) => ({ ...image, label: `REFERENCE: ${image.name}` })),
    ...frames.slice(0, 4).map((image, index) => ({ ...image, label: `SHOT FRAME ${index + 1} at ${Number(image.timestamp || 0).toFixed(2)} seconds` })),
  ];
  const prompt = [
    'You are a strict visual quality-control reviewer for a photorealistic live-action video shot.',
    'Compare the reference image(s), when supplied, with every sampled frame. Judge only visible evidence; do not invent defects.',
    `Intended shot: ${String(sceneDescription || '').slice(0, 1400)}`,
    'Prioritize the named lead characters and story-critical props. Compare only details that are clearly visible in the sampled frames; do not infer hidden clothing, faces, or objects.',
    'Check whether the same named lead character keeps the same face, hair, skin tone, build and clearly visible wardrobe; check hands only when large and unobstructed; check story-critical prop shape; check major location geometry, weather and lighting continuity; note obvious ghosting, duplicated limbs or melted objects.',
    'Background extras are not identity-locked. A changing number or arrangement of distant passengers, pedestrians, crowd members or other background extras is NOT by itself a major defect unless the scene explicitly requires a fixed count or the change visibly breaks the story. Do not count indistinct background people.',
    'Wardrobe is a major defect only when a clearly visible named lead character changes a distinctive clothing item between comparable frames without an indicated costume change. Do not flag an item merely because it is cropped, occluded, out of frame or hard to distinguish.',
    'Mark severity major only for a clearly visible, unmistakable lead-character identity swap; a severe and sustained anatomy defect; a story-critical prop visibly changing shape or disappearing/reappearing; or a major scene/location discontinuity. Minor or uncertain issues must not force regeneration.',
    'Return JSON only with this schema: {"passed":boolean,"severity":"none|minor|major","identityDrift":boolean,"handAnatomyIssue":boolean,"propConsistencyIssue":boolean,"issues":string[],"summary":string}.',
    'If the frames are too ambiguous to judge, set passed=true, severity="minor", and explain the uncertainty rather than inventing a failure.',
    'Images are supplied next in the exact order labelled below:',
    ...images.map((image) => image.label),
  ].join('\n');
  const parts: any[] = [{ text: prompt }];
  for (const image of images) {
    if (!image.bytes?.length || image.bytes.length > 6 * 1024 * 1024) continue;
    parts.push({ inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.bytes.toString('base64') } });
  }
  if (parts.length < 4) return null;
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = String(payload?.error?.message || `Gemini vision ${response.status}`);
        if (response.status === 429) noteGeminiFailure(new GeminiFail(429, message), key);
        console.warn('Visual review model unavailable:', model, response.status, message.slice(0, 180));
        continue;
      }
      const raw = (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => part.text || '').join('');
      const parsed = extractJson(raw);
      const severity = ['none', 'minor', 'major'].includes(String(parsed?.severity)) ? parsed.severity : 'minor';
      const identityDrift = parsed?.identityDrift === true;
      const handAnatomyIssue = parsed?.handAnatomyIssue === true;
      const propConsistencyIssue = parsed?.propConsistencyIssue === true;
      const issues = Array.isArray(parsed?.issues) ? parsed.issues.map((issue: any) => String(issue).slice(0, 220)).slice(0, 8) : [];
      return {
        passed: parsed?.passed === true && severity !== 'major' && !identityDrift && !handAnatomyIssue && !propConsistencyIssue,
        severity,
        identityDrift,
        handAnatomyIssue,
        propConsistencyIssue,
        issues,
        summary: String(parsed?.summary || issues[0] || 'Visual review completed.').slice(0, 400),
      };
    } catch (error: any) {
      console.warn('Visual review request failed:', model, error?.message || error);
    }
  }
  return null;
}

export async function geminiJson(prompt: string, opts: { grounded?: boolean } = {}): Promise<any> {
  return (await geminiRaw(prompt, opts)).data;
}

// =====================================================================
// fal.ai (queue API: submit → poll → fetch result)
// =====================================================================
/** Video model. Override with FAL_VIDEO_MODEL; extra JSON input (e.g. aspect_ratio) can be set in FAL_VIDEO_INPUT. */
const FAL_APP = () => (process.env.FAL_VIDEO_MODEL || 'minimax/h3-max-turbo/text-to-video').trim();
function falVideoBody(prompt: string, resolution: string, seconds: number, aspect: string) {
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(process.env.FAL_VIDEO_INPUT || '{}'); } catch { /* ignore bad JSON */ }
  return { prompt, duration: seconds, resolution, aspect_ratio: aspect, prompt_expansion_mode: process.env.FAL_PROMPT_EXPANSION || 'balanced', ...extra };
}
const falHeaders = () => ({ Authorization: `Key ${need('FAL_KEY')}`, 'Content-Type': 'application/json' });

export async function falSubmit(prompt: string, resolution: '480P' | '768P' | '1080P' = '480P', seconds = 5, aspect = '9:16') {
  let r: Response;
  try {
    r = await fetch(`https://queue.fal.run/${FAL_APP()}`, {
      method: 'POST', headers: falHeaders(), body: JSON.stringify(falVideoBody(prompt, resolution, seconds, aspect)), signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    console.error('fal submit network error', e?.name, e?.message);
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (fal.ai) did not respond in time. Please try again.' : 'Could not reach the video engine (fal.ai).', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id) {
    console.error('fal submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    const exhausted = /exhausted balance|user is locked/i.test(detail);
    const msg = r.status === 401 ? 'fal.ai rejected the API key. Check FAL_KEY.' : exhausted || r.status === 402 ? 'fal.ai has locked generation because its account balance is exhausted. Add fal.ai credits or use the configured deAPI backup.' : r.status === 403 ? `fal.ai denied this request: ${detail.slice(0, 160) || 'access forbidden'}.` : `Video engine rejected the request (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`;
    throw new HttpError(424, msg, 'FAL');
  }
  return { requestId: d.request_id as string, statusUrl: d.status_url as string, responseUrl: d.response_url as string };
}

/** Continues a finished fal clip from its exact final frame using MiniMax H3 Max Turbo image-to-video. */
export async function falContinueSubmit(prompt: string, imageUrl: string, resolution: '480P' | '768P' | '1080P' = '480P', seconds = 10, aspect = '9:16') {
  const model = 'minimax/h3-max-turbo/image-to-video';
  let r: Response;
  try {
    r = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST', headers: falHeaders(),
      body: JSON.stringify({ prompt, image_url: imageUrl, duration: seconds, resolution, aspect_ratio: aspect, prompt_expansion_mode: process.env.FAL_PROMPT_EXPANSION || 'balanced' }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The continuity video engine did not respond in time.' : 'Could not reach the continuity video engine.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id || !d.status_url || !d.response_url) {
    console.error('fal continuation submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    const exhausted = /exhausted balance|user is locked/i.test(detail);
    throw new HttpError(424, r.status === 401 ? 'fal.ai rejected the API key. Check FAL_KEY.' : exhausted || r.status === 402 ? 'fal.ai has locked generation because its account balance is exhausted.' : r.status === 403 ? `fal.ai denied the continuity render: ${detail.slice(0, 180) || 'access forbidden'}.` : `The continuity render was rejected (${r.status}${detail ? `: ${detail.slice(0, 180)}` : ''}).`, 'FAL');
  }
  return { requestId: String(d.request_id), statusUrl: String(d.status_url), responseUrl: String(d.response_url) };
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
  else if (aspect === '1:1') { const sq = resolution === '1080P' ? 960 : resolution === '768P' ? 832 : 640; width = sq; height = sq; }
  return [width, height];
}

/** The numbers deAPI needs for a clip of `seconds` seconds. 24 frames a second, the last frame included. Nothing here may shorten a clip. */
function deapiClip(seconds: number, model?: string) {
  const frames = Math.min(241, Math.max(49, Math.round(seconds * 24) + 1));
  return { frames, fps: 24, seed: Math.floor(Math.random() * 2_000_000_000), model: model || process.env.DEAPI_VIDEO_MODEL || 'Ltx2_5_22B_Dist_INT8' };
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

export async function deapiSubmit(prompt: string, resolution: string = '480P', seconds = 5, aspect: string = '9:16', requestedModel?: string, seedOverride?: number) {
  const [width, height] = deapiCanvas(resolution, aspect);
  const selectedModel = await resolveDeapiVideoModel(requestedModel);
  const c = deapiClip(seconds, selectedModel);
  const [modelInfo, overrides] = await Promise.all([
    getDeapiVideoModelInfo(c.model),
    Promise.resolve(deapiVideoOverrides()),
  ]);
  // The live model catalogue is authoritative. Never send controls that this model rejects.
  const body: Record<string, unknown> = {
    prompt, width, height, frames: c.frames, fps: c.fps, model: c.model,
    ...buildDeapiVideoFields({ info: modelInfo }, overrides),
  };
  body.seed = resolveDeapiSeed(seedOverride, overrides.seed ?? process.env.DEAPI_VIDEO_SEED, c.seed);
  let r: Response;
  try {
    r = await fetch(`${DEAPI_BASE}/videos/generations`, { method: 'POST', headers: deapiHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (deAPI) did not respond in time. Please try again.' : 'Could not reach the video engine (deAPI).', 'DEAPI');
  }
  return { requestId: await deapiParse(r) };
}

const deapiModelInfoCache = new Map<string, { expiresAt: number; info: any }>();
let deapiModelCatalogueCache: { expiresAt: number; models: any[] } | null = null;

/** Read the account's live model catalogue. The API key remains server-side. */
async function loadDeapiModelCatalogue(): Promise<any[]> {
  if (deapiModelCatalogueCache && deapiModelCatalogueCache.expiresAt > Date.now()) return deapiModelCatalogueCache.models;
  const response = await fetch(`${DEAPI_BASE}/models?limit=100`, {
    headers: deapiHeaders(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new HttpError(424, `deAPI model catalogue returned ${response.status}.`, 'DEAPI_MODELS');
  const payload: any = await response.json().catch(() => ({}));
  const list = Array.isArray(payload?.data) ? payload.data : [];
  deapiModelCatalogueCache = { expiresAt: Date.now() + 5 * 60_000, models: list };
  return list;
}

/** Safe model metadata for the authenticated generator UI. No credentials or internal headers are returned. */
export async function deapiVideoModels(): Promise<{ slug: string; name: string; description: string; supportsImageToVideo: boolean; supportsLastFrame: boolean; supportsAudioToVideo: boolean }[]> {
  const list = await loadDeapiModelCatalogue();
  return list.flatMap((item: any) => {
    const slug = String(item?.slug || '').trim();
    const name = String(item?.name || slug).trim();
    if (!slug || !name) return [];
    const info = item?.info && typeof item.info === 'object' ? item.info : {};
    const evidence = [slug, name, item?.type, item?.category, item?.task, item?.modality,
      JSON.stringify(info)].filter(Boolean).join(' ').toLowerCase();
    if (!/(video|ltx|seedance|h3|hunyuan|wan|svd|animatediff|kling)/i.test(evidence)) return [];
    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const supportsImageToVideo = /(image.?to.?video|image.?video|i2v|first_frame_image|first frame)/i.test(evidence)
      || /^(ltx25|ltx23|seedance25|minimaxh3)/.test(normalizedSlug);
    const supportsLastFrame = /(last_frame_image|end.?frame|last.?frame)/i.test(evidence)
      || /^(ltx23|ltx25|minimaxh3)/.test(normalizedSlug);
    const supportsAudioToVideo = supportsDeapiAudioSyncModel(slug, evidence);
    return [{
      slug,
      name,
      description: String(item?.description || info?.description || '').slice(0, 260),
      supportsImageToVideo,
      supportsLastFrame,
      supportsAudioToVideo,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveDeapiVideoModel(requested?: string): Promise<string> {
  const model = String(requested || '').trim();
  if (!model) return String(process.env.DEAPI_VIDEO_MODEL || 'Ltx2_5_22B_Dist_INT8');
  const catalogue = await deapiVideoModels();
  const match = catalogue.find((item) => item.slug === model);
  if (!match) throw new HttpError(400, 'That video model is not available on the connected deAPI account. Refresh the model list and choose an available model.', 'DEAPI_MODEL_UNAVAILABLE');
  return match.slug;
}

/** Fetch capabilities per account/model; deAPI model lists are plan-scoped and defaults vary by model. */
async function getDeapiVideoModelInfo(model: string): Promise<any> {
  const cached = deapiModelInfoCache.get(model);
  if (cached && cached.expiresAt > Date.now()) return cached.info;
  try {
    const response = await fetch(`${DEAPI_BASE}/models?limit=100`, {
      headers: deapiHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`model catalogue returned ${response.status}`);
    const payload: any = await response.json().catch(() => ({}));
    const list = Array.isArray(payload?.data) ? payload.data : [];
    const match = list.find((item: any) => item?.slug === model || item?.name === model);
    const info = match?.info || {};
    deapiModelInfoCache.set(model, { expiresAt: Date.now() + 10 * 60_000, info });
    return info;
  } catch (error: any) {
    // Do not block a generation just because the model catalogue is temporarily unavailable.
    console.warn('Could not read deAPI model capabilities; omitting optional tuning fields:', error?.message || error);
    return {};
  }
}

function deapiVideoOverrides(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(process.env.DEAPI_VIDEO_INPUT || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Image-to-video: starts the clip from a picture (the last frame of the previous clip), so a scene carries on without a visible jump. */
export async function deapiAnimate(prompt: string, firstFrame: Buffer, resolution: string = '480P', seconds = 10, aspect: string = '9:16', requestedModel?: string, lastFrame?: Buffer, seedOverride?: number) {
  const [width, height] = deapiCanvas(resolution, aspect);
  const selectedModel = await resolveDeapiVideoModel(requestedModel);
  if (requestedModel) {
    const selected = (await deapiVideoModels()).find((item) => item.slug === selectedModel);
    if (selected && !selected.supportsImageToVideo) {
      throw new HttpError(400, 'The selected deAPI model does not support image-to-video. Choose a model marked “image-to-video” or remove the opening image.', 'DEAPI_MODEL_MODE');
    }
    if (lastFrame && selected && !selected.supportsLastFrame) {
      throw new HttpError(400, 'The selected deAPI model does not support a last-frame reference. Choose a model marked “start/end frame” or remove the ending frame.', 'DEAPI_LAST_FRAME_MODE');
    }
  }
  const c = deapiClip(seconds, selectedModel);
  const [modelInfo, overrides] = await Promise.all([
    getDeapiVideoModelInfo(c.model),
    Promise.resolve(deapiVideoOverrides()),
  ]);
  const form = new FormData();
  form.set('model', c.model); form.set('prompt', prompt);
  form.set('width', String(width)); form.set('height', String(height));
  const seed = resolveDeapiSeed(seedOverride, overrides.seed ?? process.env.DEAPI_VIDEO_SEED, c.seed);
  form.set('frames', String(c.frames)); form.set('fps', String(c.fps)); form.set('seed', String(seed));
  const imageMime = (bytes: Buffer) => {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
    if (bytes.length >= 8 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { type: 'image/png', ext: 'png' };
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
    throw new HttpError(415, 'The supplied frame must be a valid JPG, PNG or WebP image.', 'DEAPI_FRAME_TYPE');
  };
  const firstMime = imageMime(firstFrame);
  form.set('first_frame_image', new Blob([new Uint8Array(firstFrame)], { type: firstMime.type }), `first-frame.${firstMime.ext}`);
  if (lastFrame) {
    const lastMime = imageMime(lastFrame);
    form.set('last_frame_image', new Blob([new Uint8Array(lastFrame)], { type: lastMime.type }), `last-frame.${lastMime.ext}`);
  }
  // negative_prompt is included unless the model explicitly disables it.
  // Guidance and steps are sent only when the selected model advertises support;
  // defaults and min/max values come from that model's live /models entry.
  for (const [key, value] of Object.entries(buildDeapiVideoFields({ info: modelInfo }, overrides))) {
    form.set(key, value);
  }
  let r: Response;
  try {
    r = await fetch(`${DEAPI_BASE}/videos/animations`, { method: 'POST', headers: { Authorization: `Bearer ${need('DEAPI_API_KEY')}`, Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(30_000) });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The video engine (deAPI) did not respond in time. Please try again.' : 'Could not reach the video engine (deAPI).', 'DEAPI');
  }
  return { requestId: await deapiParse(r) };
}

/** Generates a lip-synced performance from private audio, with an optional identity reference image. */
export async function deapiAudioSync(
  prompt: string,
  audio: Buffer,
  audioContentType: string,
  audioFilename: string,
  durationSeconds: number,
  aspect: string,
  requestedModel: string,
  firstFrame?: Buffer,
) {
  const selected = (await deapiVideoModels()).find((model) => model.slug === requestedModel);
  if (!selected) throw new HttpError(400, 'Choose a video model available on the connected DeAPI account.', 'DEAPI_MODEL_UNAVAILABLE');
  if (!selected.supportsAudioToVideo) {
    throw new HttpError(400, 'This DeAPI model does not advertise audio-to-video support. Choose an audio-sync model such as a compatible LTX model.', 'DEAPI_MODEL_MODE');
  }
  if (firstFrame && !selected.supportsImageToVideo) {
    throw new HttpError(400, 'This DeAPI model does not advertise image conditioning for audio-sync. Remove the speaker image or choose a model supporting image-to-video.', 'DEAPI_FRAME_MODE');
  }
  const mime = deapiAudioMime(audioContentType, audioFilename);
  if (!mime) throw new HttpError(415, 'Audio-to-video accepts MP3, WAV, OGG or FLAC files.', 'DEAPI_AUDIO_TYPE');
  if (!audio.length || audio.length > 20 * 1024 * 1024) throw new HttpError(413, 'Audio-to-video audio must be non-empty and no larger than 20 MB.', 'DEAPI_AUDIO_SIZE');
  const frameCount = deapiAudioSyncFrames(durationSeconds);
  const [width, height] = deapiCanvas('480P', aspect);
  const overrides = deapiVideoOverrides();
  const requestedSeed = Number(overrides.seed ?? process.env.DEAPI_VIDEO_SEED);
  const seed = Number.isSafeInteger(requestedSeed) && requestedSeed >= 0 && requestedSeed <= 2_147_483_647
    ? requestedSeed : Math.floor(Math.random() * 2_000_000_000);
  const form = new FormData();
  form.set('model', selected.slug);
  form.set('prompt', prompt.slice(0, 2200));
  form.set('width', String(width));
  form.set('height', String(height));
  form.set('frames', String(frameCount));
  form.set('seed', String(seed));
  form.set('audio', new Blob([new Uint8Array(audio)], { type: mime.type }), `audio.${mime.extension}`);
  if (firstFrame) {
    const imageMime = (bytes: Buffer) => {
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
      if (bytes.length >= 8 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { type: 'image/png', ext: 'png' };
      if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
      throw new HttpError(415, 'The speaker reference must be a valid JPG, PNG or WebP image.', 'DEAPI_FRAME_TYPE');
    };
    const image = imageMime(firstFrame);
    if (firstFrame.length > 10 * 1024 * 1024) throw new HttpError(413, 'The speaker reference image must be 10 MB or smaller.', 'DEAPI_FRAME_SIZE');
    form.set('first_frame_image', new Blob([new Uint8Array(firstFrame)], { type: image.type }), `speaker.${image.ext}`);
  }
  let response: Response;
  try {
    response = await fetch(`${DEAPI_BASE}/videos/audio-syncs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${need('DEAPI_API_KEY')}`, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error: any) {
    throw new HttpError(424, error?.name === 'TimeoutError' ? 'The DeAPI audio-sync engine did not respond in time.' : 'Could not reach the DeAPI audio-sync engine.', 'DEAPI');
  }
  return { requestId: await deapiParse(response), frameCount, duration: frameCount / 24 };
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
  for (let i = 0; i < 35; i++) {
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

/**
 * VOICE_PROVIDER = deapi | fal | auto. Auto selects DeAPI whenever its key is present.
 * Provider failures are surfaced to the caller; they never silently switch engines.
 */
export async function synthesize(text: string, voiceId: string, gender?: string) {
  const mode = (process.env.VOICE_PROVIDER || 'auto').trim().toLowerCase();
  const haveDe = !!lookupEnv('DEAPI_API_KEY'), haveFal = !!lookupEnv('FAL_KEY');
  const selected = mode === 'auto' ? (haveDe ? 'deapi' : haveFal ? 'fal' : '') : mode;
  if (selected === 'deapi') return deapiTts(text, voiceId, gender);
  if (selected === 'fal') return falTts(text, voiceId, gender);
  throw new HttpError(424, selected ? 'VOICE_PROVIDER must be deapi, fal or auto.' : 'No voice provider is configured. Add DEAPI_API_KEY (recommended) or FAL_KEY in Vercel.', 'VOICE_PROVIDER');
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


/** Starts an image-conditioned brand-ad clip on H3 Max Turbo. Optional TTS audio is pinned as the exact ad voice-over. */
export async function falImageVideoSubmit(imageUrl: string, prompt: string, seconds: 5 | 10, aspect: '9:16' | '16:9' | '1:1', resolution: '480P' | '768P' | '1080P' = '480P', targetAudioUrl?: string) {
  const model = 'minimax/h3-max-turbo/image-to-video';
  const body = {
    image_url: imageUrl,
    prompt,
    duration: seconds,
    resolution,
    aspect_ratio: aspect,
    prompt_expansion_mode: process.env.FAL_PROMPT_EXPANSION || 'balanced',
    ...(targetAudioUrl ? { target_audio_url: targetAudioUrl } : {}),
  };
  let r: Response;
  try {
    r = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST', headers: falHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The image-to-video engine did not respond in time. Please try again.' : 'Could not reach the image-to-video engine.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id || !d.status_url || !d.response_url) {
    console.error('fal image-to-video submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    throw new HttpError(424, r.status === 401 || r.status === 403 ? 'fal.ai rejected the key. Check FAL_KEY and your fal.ai balance.' : r.status === 402 ? 'fal.ai credits are exhausted.' : `Image-to-video request was rejected (${r.status}${detail ? `: ${detail.slice(0, 180)}` : ''}).`, 'FAL');
  }
  return { requestId: String(d.request_id), statusUrl: String(d.status_url), responseUrl: String(d.response_url) };
}

/** Edits a location plate or extracted episode frame while preserving the original camera and scene geometry. */
export async function falEditLocationPlate(imageUrl: string, instruction: string) {
  const prompt = `Edit this existing cinematic continuity reference. Make only this requested change: ${instruction.slice(0, 650)}. Preserve the exact camera angle, lens perspective, framing, room architecture, wall and floor geometry, windows, doors, furniture placement, lighting direction, color palette and all unmentioned objects. Do not redesign the environment, move the camera, add people, add text, or introduce new props. Photorealistic, physically coherent, same scene and same composition.`;
  let r: Response;
  try {
    r = await fetch('https://fal.run/fal-ai/flux-kontext/dev', {
      method: 'POST', headers: falHeaders(),
      body: JSON.stringify({ prompt, image_url: imageUrl, num_inference_steps: 28, guidance_scale: 2.5, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', resolution_mode: 'match_input' }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The reference image edit timed out. Please try again.' : 'Could not reach the reference image editor.', 'FAL_IMAGE_EDIT');
  }
  const d: any = await r.json().catch(() => ({}));
  const url = String(d?.images?.[0]?.url || '');
  if (!r.ok || !/^https:\/\//i.test(url)) {
    console.error('fal continuity image edit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : '';
    throw new HttpError(424, r.status === 402 ? 'fal.ai image credits are exhausted.' : `The reference image edit was rejected (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`, 'FAL_IMAGE_EDIT');
  }
  return url;
}

/** Creates a shot-specific still from one saved identity/location/product reference before DeAPI image-to-video. */
export async function falGenerateSceneKeyframe(referenceImageUrl: string, prompt: string, aspect: string = '9:16') {
  if (!/^https:\/\//i.test(String(referenceImageUrl || ''))) throw new HttpError(400, 'A public visual reference is required to create a scene keyframe.', 'REFERENCE_IMAGE');
  const ratio = ['9:16', '16:9', '1:1'].includes(aspect) ? aspect : '9:16';
  let response: Response;
  try {
    response = await fetch('https://fal.run/fal-ai/flux-kontext/dev', {
      method: 'POST',
      headers: falHeaders(),
      body: JSON.stringify({
        prompt: String(prompt || '').slice(0, 3500),
        image_url: referenceImageUrl,
        num_inference_steps: 28,
        guidance_scale: 2.5,
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'jpeg',
        resolution_mode: ratio,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error: any) {
    throw new HttpError(424, error?.name === 'TimeoutError' ? 'Scene keyframe generation timed out.' : 'Could not reach the scene keyframe generator.', 'FAL_KEYFRAME');
  }
  const payload: any = await response.json().catch(() => ({}));
  const url = String(payload?.images?.[0]?.url || '');
  if (!response.ok || !/^https:\/\//i.test(url)) {
    console.error('fal scene keyframe failed', response.status, payload);
    const detail = typeof payload?.detail === 'string' ? payload.detail : '';
    throw new HttpError(424, response.status === 402 ? 'The image generator has run out of credits while preparing a continuity frame.' : `Scene keyframe generation failed (${response.status}${detail ? `: ${detail.slice(0, 150)}` : ''}).`, 'FAL_KEYFRAME');
  }
  return url;
}

/** Generates a reusable wide location plate for a series. */
export async function falGenerateLocationPlate(description: string, look = 'cinematic') {
  const prompt = `Create a photorealistic wide 16:9 master location reference plate for a fictional ${look} series. Environment: ${description.slice(0, 900)}. Show the complete room or location layout in one coherent establishing view, with stable architecture, furniture, doors, windows and important props clearly visible. No people, no faces, no text, no logos, no watermark. Neutral balanced natural light appropriate to the described setting, realistic materials, consistent spatial geometry, clean composition. This is a reusable continuity reference, not a dramatic movie frame.`;
  let r: Response;
  try {
    r = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST', headers: falHeaders(),
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1, num_inference_steps: 28, enable_safety_checker: true, output_format: 'jpeg' }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'Location reference generation timed out.' : 'Could not reach the location reference generator.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  const url = String(d?.images?.[0]?.url || '');
  if (!r.ok || !/^https:\/\//i.test(url)) {
    console.error('fal location reference failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : '';
    throw new HttpError(424, r.status === 402 ? 'fal.ai image credits are exhausted.' : `Location reference generation failed (${r.status}${detail ? `: ${detail.slice(0, 140)}` : ''}).`, 'FAL');
  }
  return url;
}

/** Generates one reusable cast portrait. Called only when the creator opts into character references. */
export async function falGenerateCharacterReference(name: string, role: string, gender: string, description: string) {
  const identity = [name, role, gender, description].filter(Boolean).join(', ');
  const prompt = `Create a premium live-action casting reference portrait for a fictional film character. Character identity: ${identity}. One person only, head and upper torso visible, looking slightly toward camera, neutral calm expression, natural relaxed posture. Photorealistic human skin with natural pores and fine texture, realistic eyes, hair strands and fabric detail, cinematic but neutral soft studio lighting, simple uncluttered warm grey background, accurate anatomy, no props, no text, no logos, no watermark. This is a clean identity reference image, not a movie scene. Preserve the exact age, facial structure, skin tone, hairstyle, build and wardrobe described.`;
  let r: Response;
  try {
    r = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST', headers: falHeaders(),
      body: JSON.stringify({ prompt, image_size: 'portrait_4_3', num_images: 1, num_inference_steps: 28, enable_safety_checker: true, output_format: 'jpeg' }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'Character portrait generation timed out.' : 'Could not reach the character portrait generator.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  const url = String(d?.images?.[0]?.url || '');
  if (!r.ok || !/^https:\/\//i.test(url)) {
    console.error('fal character reference failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : '';
    throw new HttpError(424, r.status === 402 ? 'fal.ai image credits are exhausted.' : `Character portrait generation failed (${r.status}${detail ? `: ${detail.slice(0, 140)}` : ''}).`, 'FAL');
  }
  return url;
}

/** H3 Max reference-to-video. Reference images preserve cast identity; image_url optionally fixes the first frame. */
export async function falReferenceVideoSubmit(prompt: string, referenceImageUrls: string[], resolution: '480P' | '768P' | '1080P' = '480P', seconds = 10, aspect = '9:16', imageUrl?: string) {
  const refs = referenceImageUrls.filter((u) => /^https:\/\//i.test(String(u))).slice(0, 4);
  if (!refs.length) throw new HttpError(400, 'At least one valid character reference image is required.');
  const model = 'minimax/h3-max/reference-to-video';
  const body = {
    prompt,
    reference_image_urls: refs,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    duration: seconds,
    resolution,
    aspect_ratio: aspect,
    prompt_expansion_mode: process.env.FAL_PROMPT_EXPANSION || 'balanced',
    enable_safety_checker: true,
  };
  let r: Response;
  try {
    r = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: falHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The reference video engine did not respond in time.' : 'Could not reach the reference video engine.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id || !d.status_url || !d.response_url) {
    console.error('fal reference video submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    const exhausted = /exhausted balance|user is locked/i.test(detail);
    throw new HttpError(424, r.status === 401 ? 'fal.ai rejected the API key. Check FAL_KEY.' : exhausted || r.status === 402 ? 'fal.ai video credits are exhausted.' : `Reference video request failed (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`, 'FAL');
  }
  return { requestId: String(d.request_id), statusUrl: String(d.status_url), responseUrl: String(d.response_url) };
}

/** Kling 4.0 reference-to-video with per-shot prompts for short-drama coverage. */
export async function falKlingReferenceSubmit(
  prompt: string,
  referenceImageUrls: string[],
  resolution: '720p' | '1080p' = '720p',
  seconds = 10,
  aspect = '9:16',
  startImageUrl?: string,
  referenceVideoUrls: string[] = [],
  multiPrompt?: { prompt: string; duration: number }[],
) {
  const start = /^https:\/\//i.test(String(startImageUrl || '')) ? String(startImageUrl) : undefined;
  const images = referenceImageUrls.filter((u) => /^https:\/\//i.test(String(u))).slice(0, start ? 9 : 10);
  const videos = referenceVideoUrls.filter((u) => /^https:\/\//i.test(String(u))).slice(0, 5);
  const shots = (multiPrompt || []).filter((x) => x && String(x.prompt || '').trim() && Number.isInteger(x.duration) && x.duration >= 1);
  if (!String(prompt || '').trim() && !shots.length) throw new HttpError(400, 'Kling needs a visual prompt.');
  if (shots.length && shots.reduce((n, x) => n + x.duration, 0) !== seconds) {
    throw new HttpError(400, 'Kling shot durations must add up to the clip length.');
  }
  const body = {
    ...(String(prompt || '').trim() ? { prompt } : {}),
    ...(shots.length ? { multi_prompt: shots } : {}),
    ...(images.length ? { image_urls: images } : {}),
    ...(videos.length ? { video_urls: videos } : {}),
    ...(start ? { start_image_url: start } : {}),
    duration: seconds,
    resolution,
    aspect_ratio: aspect,
  };
  let r: Response;
  try {
    r = await fetch('https://queue.fal.run/kling/v4/reference-to-video', {
      method: 'POST', headers: falHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'Kling 4.0 did not respond in time.' : 'Could not reach Kling 4.0.', 'FAL_KLING');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id || !d.status_url || !d.response_url) {
    console.error('fal Kling 4.0 submit failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : d?.detail ? JSON.stringify(d.detail) : '';
    throw new HttpError(424, r.status === 401 || r.status === 403
      ? 'fal.ai rejected the Kling request. Check FAL_KEY and model access.'
      : r.status === 402 || /exhausted balance|insufficient balance|user is locked/i.test(detail)
        ? 'fal.ai does not have enough credit for Kling 4.0.'
        : `Kling 4.0 request failed (${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`, 'FAL_KLING');
  }
  return { requestId: String(d.request_id), statusUrl: String(d.status_url), responseUrl: String(d.response_url) };
}

/** Generates two optional brand campaign stills; the FAL key stays server-side. */
export async function falGenerateBrandImages(prompt: string, aspect: '9:16' | '16:9' | '1:1') {
  const imageSize = aspect === '9:16' ? 'portrait_16_9' : aspect === '16:9' ? 'landscape_16_9' : 'square_hd';
  let r: Response;
  try {
    r = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST', headers: falHeaders(),
      body: JSON.stringify({ prompt, image_size: imageSize, num_images: 2, num_inference_steps: 28, enable_safety_checker: true }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'Brand image generation timed out. Please try again.' : 'Could not reach the brand image generator.', 'FAL');
  }
  const d: any = await r.json().catch(() => ({}));
  const images = Array.isArray(d?.images) ? d.images.map((x: any) => String(x?.url || '')).filter((x: string) => /^https:\/\//i.test(x)).slice(0, 2) : [];
  if (!r.ok || !images.length) {
    console.error('fal brand image generation failed', r.status, d);
    const detail = typeof d?.detail === 'string' ? d.detail : '';
    throw new HttpError(424, r.status === 401 || r.status === 403 ? 'fal.ai rejected the key. Check FAL_KEY and your fal.ai balance.' : r.status === 402 ? 'fal.ai credits are exhausted.' : `Brand image generation failed (${r.status}${detail ? `: ${detail.slice(0, 180)}` : ''}).`, 'FAL');
  }
  return images;
}

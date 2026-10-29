import crypto from 'node:crypto';
import {
  Req, Res, HttpError, json, redirect, readRaw, appUrl, clientIp, parseCookies, setCookie, startSession, endSession,
  sessionUserId, signBlob, readBlob, hashPassword, verifyPassword, sha256, newId, randomCode, rateLimit, unlimitedUsers, EMAIL_RE, normEmail, str,
} from './lib/core.js';
import { sql, ensureSchema } from './lib/db.js';
import { PLANS, TIERS, Tier, Cycle, planId, tierFromPlanId, priceFor, BILLING_CURRENCY, TRIAL, TOPUPS, trialPrice } from './lib/plans.js';
import { mail, flw, verifyFlwSignature, lookupEnv, geminiJson, geminiRaw, geminiSearch, geminiFormat, aiWriterStatus, falSubmit, falStatus, deapiSubmit, deapiStatus, deapiAnimate, RateLimited, synthesize } from './lib/services.js';
import { trendsResearchPrompt, trendsFormatPrompt, scriptPrompt, abPrompt, competitorPrompt, outrankPrompt, parseStoryBrief, type SeriesContinuity, type StoryBriefInput, storyBeats, STORY_MOODS, CAMERA_PROFILES, GENRES, INTENSITIES, ENDINGS, PRESENTATIONS, CASTS, TROPES, styleBlock, STORY_LIMITS, planScenes, castMinimum, storyboardPrompt, outlinePrompt, chunkPrompt, adaptPrompt, PART_SECONDS, SCENES_PER_WRITER_CALL, MAX_WORDS_PER_CLIP } from './lib/prompts.js';
import { refineScene, shownInstruction, proseToUnits, thoughtToVisual, type SpokenLine } from './lib/screenplay.js';
import { ppConfigured, ppConnectUrl, ppSync, ppForget, ppPublish, ppHealth } from './lib/postpeer.js';
import { mergeClips, lastFrameJpeg } from './lib/merge.js';
import { PROVIDERS, PLATFORM_IDS, Platform, isPlatform, isConfigured, redirectUri, socialPkce, socialAuthorizeUrl, exchangeSocialCode, saveSocialConnection, listSocialAccounts, removeSocialConnection, publishToPlatform, socialMetrics } from './lib/social.js';

// We parse bodies ourselves (webhooks need the raw bytes).
export const config = { api: { bodyParser: false }, maxDuration: 60 };

type Ctx = { req: Req; res: Res; body: any; raw: Buffer; query: URLSearchParams };
type Handler = (c: Ctx) => Promise<void>;

// ---------------------------------------------------------------- users
const UNLIMITED = 1_000_000;
const toUser = (r: any) => {
  // Paid access lasts until the end of the paid period (+3 days grace for renewal webhooks). A missed renewal therefore lapses automatically.
  const GRACE_MS = 3 * 86400_000;
  const trial = r.sub_status === 'trial' && !!r.period_end && new Date(r.period_end).getTime() > Date.now();
  const active = trial || (['active', 'canceling', 'owner'].includes(r.sub_status) && !!r.period_end && new Date(r.period_end).getTime() + GRACE_MS > Date.now());
  const plan = PLANS[(r.tier as Tier)] || PLANS.starter;
  return {
    id: r.id, name: r.name, email: r.email, brandName: r.brand_name, avatarUrl: '', tier: r.tier as Tier,
    subscriptionStatus: r.sub_status as string, billingCycle: r.sub_cycle as string | null,
    hasAccess: !!active, currentPeriodEnd: r.period_end ? new Date(r.period_end).toISOString() : null,
    // The owner (admin) account is unlimited: no monthly video or seconds cap.
    channelsLimit: plan.channels, videosLimit: r.sub_status === 'owner' ? UNLIMITED : trial ? Math.ceil(TRIAL.seconds / 5) : plan.videosPerMonth, secondsLimit: r.sub_status === 'owner' ? UNLIMITED : trial ? TRIAL.seconds : plan.secondsPerMonth,
    isTrial: trial, trialAvailable: r.sub_status === 'none' && !r.trial_used && !!r.email_verified, createdAt: new Date(r.created_at).toISOString(),
    isVerified: !!r.email_verified, isOwner: r.sub_status === 'owner',
  };
};

async function currentUser(req: Req) {
  const uid = await sessionUserId(req);
  if (!uid) throw new HttpError(401, 'Please sign in.', 'UNAUTHENTICATED');
  const rows = (await sql()`SELECT * FROM users WHERE id = ${uid}`) as any[];
  if (!rows[0] || !rows[0].email_verified) throw new HttpError(401, 'Please sign in.', 'UNAUTHENTICATED');
  return rows[0];
}
async function requireAccess(req: Req) {
  const row = await currentUser(req);
  const u = toUser(row);
  if (!u.hasAccess) throw new HttpError(402, 'An active subscription is required to use this feature.', 'SUBSCRIPTION_REQUIRED');
  if (u.isOwner) unlimitedUsers.add(row.id);
  return { row, user: u };
}

async function issueCode(email: string, purpose: 'verify' | 'reset') {
  const code = randomCode();
  await sql()`INSERT INTO email_codes (email, purpose, code_hash, expires_at, attempts)
    VALUES (${email}, ${purpose}, ${sha256(email + ':' + code)}, now() + interval '10 minutes', 0)
    ON CONFLICT (email, purpose) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`;
  return code;
}
async function checkCode(email: string, purpose: 'verify' | 'reset', code: string) {
  const rows = (await sql()`SELECT * FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`) as any[];
  const r = rows[0];
  if (!r || new Date(r.expires_at) < new Date()) throw new HttpError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  if (r.attempts >= 5) throw new HttpError(429, 'Too many incorrect attempts. Request a new code.', 'CODE_LOCKED');
  if (r.code_hash !== sha256(email + ':' + String(code).trim())) {
    await sql()`UPDATE email_codes SET attempts = attempts + 1 WHERE email = ${email} AND purpose = ${purpose}`;
    throw new HttpError(400, 'That code is incorrect.', 'CODE_INVALID');
  }
  await sql()`DELETE FROM email_codes WHERE email = ${email} AND purpose = ${purpose}`;
}
function checkPassword(pw: string) {
  if (pw.length < 8 || pw.length > 128 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))
    throw new HttpError(400, 'Password must be at least 8 characters and include a letter and a number.');
}

// ---------------------------------------------------------------- auth routes
const register: Handler = async ({ req, res, body }) => {
  const email = normEmail(body.email), name = str(body.name, 80), pw = String(body.password || '');
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  checkPassword(pw);
  if (body.acceptTerms !== true) throw new HttpError(400, 'Please accept the Terms of Service and Privacy Policy to continue.');
  await rateLimit(`reg:ip:${clientIp(req)}`, 10, 3600);
  await rateLimit(`reg:email:${email}`, 5, 3600);
  const existing = (await sql()`SELECT id, email_verified FROM users WHERE email = ${email}`) as any[];
  if (existing[0]?.email_verified) throw new HttpError(409, 'An account with this email already exists. Please sign in.', 'EXISTS');
  const hash = await hashPassword(pw);
  const address = body.address && typeof body.address === 'object' ? JSON.stringify(body.address).slice(0, 1000) : null;
  if (existing[0]) {
    await sql()`UPDATE users SET terms_accepted_at=now(), name=${name}, password_hash=${hash}, brand_name=${str(body.brandName, 80)}, phone=${str(body.phoneNumber, 30)}, dob=${str(body.dateOfBirth, 10)}, address=${address}::jsonb WHERE id=${existing[0].id}`;
  } else {
    await sql()`INSERT INTO users (id, email, name, password_hash, terms_accepted_at, brand_name, phone, dob, address)
      VALUES (${newId('usr')}, ${email}, ${name}, ${hash}, now(), ${str(body.brandName, 80)}, ${str(body.phoneNumber, 30)}, ${str(body.dateOfBirth, 10)}, ${address}::jsonb)`;
  }
  await mail.otp(email, name, await issueCode(email, 'verify'), 'verify');
  json(res, 200, { ok: true, email });
};

const verifyEmail: Handler = async ({ req, res, body }) => {
  const email = normEmail(body.email);
  await rateLimit(`ver:ip:${clientIp(req)}`, 30, 3600);
  await checkCode(email, 'verify', body.code);
  const rows = (await sql()`UPDATE users SET email_verified = TRUE WHERE email = ${email} RETURNING *`) as any[];
  if (!rows[0]) throw new HttpError(404, 'Account not found.');
  await startSession(res, rows[0].id);
  mail.welcome(email, rows[0].name, appUrl(req)).catch((e) => console.error('welcome email', e));
  json(res, 200, { user: toUser(rows[0]) });
};

const resend: Handler = async ({ req, res, body }) => {
  const email = normEmail(body.email);
  const purpose = body.purpose === 'reset' ? 'reset' : 'verify';
  await rateLimit(`resend:${email}`, 5, 3600);
  await rateLimit(`resend:ip:${clientIp(req)}`, 20, 3600);
  const rows = (await sql()`SELECT name, email_verified FROM users WHERE email = ${email}`) as any[];
  const r = rows[0];
  if (r && (purpose === 'reset' ? r.email_verified : !r.email_verified)) await mail.otp(email, r.name, await issueCode(email, purpose), purpose);
  json(res, 200, { ok: true }); // identical response whether or not the account exists
};

const login: Handler = async ({ req, res, body }) => {
  const email = normEmail(body.email), pw = String(body.password || '');
  await rateLimit(`login:${clientIp(req)}:${email}`, 10, 900);
  const rows = (await sql()`SELECT * FROM users WHERE email = ${email}`) as any[];
  const r = rows[0];
  if (!r || !(await verifyPassword(pw, r.password_hash))) throw new HttpError(401, 'Incorrect email or password.', 'BAD_CREDENTIALS');
  if (!r.email_verified) {
    await mail.otp(email, r.name, await issueCode(email, 'verify'), 'verify');
    throw new HttpError(403, 'Please verify your email. We sent you a new code.', 'UNVERIFIED');
  }
  await startSession(res, r.id);
  json(res, 200, { user: toUser(r) });
};

const resetPassword: Handler = async ({ req, res, body }) => {
  const email = normEmail(body.email), pw = String(body.password || '');
  checkPassword(pw);
  await rateLimit(`reset:ip:${clientIp(req)}`, 20, 3600);
  await checkCode(email, 'reset', body.code);
  await sql()`UPDATE users SET password_hash = ${await hashPassword(pw)} WHERE email = ${email}`;
  json(res, 200, { ok: true });
};

/** Owner/test access: a secret code (env OWNER_ACCESS_CODE) signs in a full-access test account with no signup or payment. */
const ownerAccess: Handler = async ({ req, res, body }) => {
  const expected = process.env.OWNER_ACCESS_CODE;
  if (!expected) throw new HttpError(404, 'Access codes are not enabled.', 'DISABLED');
  await rateLimit(`owner:${clientIp(req)}`, 6, 900);
  const given = String(body.code || '').trim();
  const a = Buffer.from(sha256(given)), b = Buffer.from(sha256(expected));
  if (!given || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'That access code is not valid.', 'BAD_CODE');
  const rows = (await sql()`INSERT INTO users (id, email, name, password_hash, brand_name, email_verified, terms_accepted_at, tier, sub_status, sub_cycle, period_end)
    VALUES (${newId('usr')}, 'owner@omnipulse.local', 'Owner (test access)', ${await hashPassword(newId('pw'))}, 'Owner', TRUE, now(), 'agency', 'owner', 'annual', '2100-01-01T00:00:00Z')
    ON CONFLICT (email) DO UPDATE SET tier='agency', sub_status='owner', sub_cycle='annual', period_end='2100-01-01T00:00:00Z', email_verified=TRUE
    RETURNING *`) as any[];
  await startSession(res, rows[0].id);
  json(res, 200, { user: toUser(rows[0]) });
};

const me: Handler = async ({ req, res }) => {
  const uid = await sessionUserId(req);
  if (!uid) return json(res, 200, { user: null });
  const rows = (await sql()`SELECT * FROM users WHERE id = ${uid}`) as any[];
  json(res, 200, { user: rows[0]?.email_verified ? toUser(rows[0]) : null });
};

// ---------------------------------------------------------------- billing (Flutterwave)
async function activate(userRow: any, plan: { tier: Tier; cycle: Cycle }, req?: Req) {
  const periodEnd = new Date(Date.now() + (plan.cycle === 'annual' ? 367 : 32) * 86400_000);
  const wasActive = userRow.sub_status === 'active';
  await sql()`UPDATE users SET tier=${plan.tier}, sub_cycle=${plan.cycle}, sub_status='active', period_end=${periodEnd.toISOString()} WHERE id=${userRow.id}`;
  if (!wasActive && req) mail.subscribed(userRow.email, userRow.name, PLANS[plan.tier].name, appUrl(req)).catch((e) => console.error('sub email', e));
}

/** Cancels the customer's active Flutterwave subscriptions (optionally keeping one plan, used when switching plans). */
async function cancelSubscriptions(email: string, keepPlanId?: string) {
  const subs: any[] = (await flw(`/subscriptions?email=${encodeURIComponent(email)}`).catch((e) => { console.error('list subs', e); return []; })) || [];
  let cancelled = 0;
  for (const sub of subs) {
    if (sub.status !== 'active') continue;
    if (keepPlanId && String(sub.plan) === keepPlanId) continue;
    await flw(`/subscriptions/${sub.id}/cancel`, 'PUT').then(() => cancelled++).catch((e) => console.error('cancel sub', sub.id, e));
  }
  return cancelled;
}

// Prices shown in the app come from the real Flutterwave plans (cached), so the page can never disagree with the charge.
const planCache = new Map<string, { at: number; v: { amount: number; currency: string } | null }>();
async function livePlan(id: string) {
  const hit = planCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  let v: { amount: number; currency: string } | null = null;
  try { const p = await flw(`/payment-plans/${encodeURIComponent(id)}`); if (p?.amount) v = { amount: Number(p.amount), currency: String(p.currency || BILLING_CURRENCY()) }; } catch { /* fall back to configured prices */ }
  planCache.set(id, { at: Date.now(), v });
  return v;
}

const plans: Handler = async ({ res }) => {
  const out = [] as any[];
  for (const t of TIERS) {
    let monthly = PLANS[t].monthly, annual = PLANS[t].annual, currency = BILLING_CURRENCY();
    const mId = planId(t, 'monthly'), aId = planId(t, 'annual');
    const m = mId ? await livePlan(mId) : null, a = aId ? await livePlan(aId) : null;
    if (m) { monthly = m.amount; currency = m.currency; }
    if (a) { annual = Math.round((a.amount / 12) * 100) / 100; currency = a.currency; }
    out.push({ id: t, name: PLANS[t].name, monthly, annual, currency, channels: PLANS[t].channels, videosPerMonth: PLANS[t].videosPerMonth, secondsPerMonth: PLANS[t].secondsPerMonth, quality: PLANS[t].quality, available: !!(mId || aId) });
  }
  json(res, 200, { plans: out });
};

const checkout: Handler = async ({ req, res, body }) => {
  const row = await currentUser(req);
  if (row.sub_status === 'owner') throw new HttpError(400, 'Owner test access does not need a subscription.');
  const tier = body.tier as Tier, cycle: Cycle = body.cycle === 'annual' ? 'annual' : 'monthly';
  if (!TIERS.includes(tier)) throw new HttpError(400, 'Unknown plan.');
  const pid = planId(tier, cycle);
  if (!pid) throw new HttpError(424, `The ${PLANS[tier].name} ${cycle} plan isn't configured yet.`, 'CONFIG');
  await rateLimit(`checkout:${row.id}`, 20, 3600);
  // Ask Flutterwave for the plan itself so the charge always matches it, and fail early with a clear message if the plan ID
  // does not exist for this API key (the usual cause of checkout errors is a test/live mismatch).
  let amount = priceFor(tier, cycle), currency = BILLING_CURRENCY();
  try {
    const plan = await flw(`/payment-plans/${encodeURIComponent(pid)}`);
    if (plan?.amount) amount = Number(plan.amount);
    if (plan?.currency) currency = String(plan.currency);
    if (plan?.status && String(plan.status).toLowerCase() !== 'active') throw new HttpError(424, `The ${PLANS[tier].name} plan is not active in Flutterwave.`, 'CONFIG');
  } catch (e) {
    if (e instanceof HttpError && e.code === 'CONFIG') throw e;
    console.error('Plan lookup failed', pid, e);
    throw new HttpError(424, `Flutterwave could not find payment plan ${pid} for your API key. Make sure the plan was created in the same mode (Test or Live) as FLW_SECRET_KEY.`, 'CONFIG');
  }
  const txRef = newId('tx');
  await sql()`INSERT INTO payments (tx_ref, user_id, tier, cycle, amount, currency) VALUES (${txRef}, ${row.id}, ${tier}, ${cycle}, ${amount}, ${currency})`;
  const data = await flw('/payments', 'POST', {
    tx_ref: txRef, amount, currency, payment_plan: Number(pid), redirect_url: `${appUrl(req)}/?billing=callback`,
    customer: { email: row.email, name: row.name },
    customizations: { title: 'OmniPulse AI', description: `${PLANS[tier].name} (${cycle})`, logo: process.env.FLW_LOGO_URL || `${appUrl(req)}/logo.png` },
    meta: { userId: row.id, tier, cycle },
  });
  json(res, 200, { url: data.link });
};


// ---------------------------------------------------------------- card-verified trial and top-ups
const trialCheckout: Handler = async ({ req, res }) => {
  const row = await currentUser(req);
  if (!toUser(row).trialAvailable) throw new HttpError(400, 'A trial is only available once, before you subscribe.');
  await rateLimit(`checkout:${row.id}`, 20, 3600);
  const amount = trialPrice(), currency = BILLING_CURRENCY();
  const txRef = newId('trial');
  await sql()`INSERT INTO payments (tx_ref, user_id, tier, cycle, amount, currency) VALUES (${txRef}, ${row.id}, 'trial', 'once', ${amount}, ${currency})`;
  const data = await flw('/payments', 'POST', {
    tx_ref: txRef, amount, currency, payment_options: 'card', redirect_url: `${appUrl(req)}/?billing=callback`,
    customer: { email: row.email, name: row.name },
    customizations: { title: 'OmniPulse AI', description: `${TRIAL.days}-day trial (card check, no automatic renewal)`, logo: process.env.FLW_LOGO_URL || `${appUrl(req)}/logo.png` },
    meta: { userId: row.id, kind: 'trial' },
  });
  json(res, 200, { url: data.link });
};

const topupCheckout: Handler = async ({ req, res, body }) => {
  const row = await currentUser(req);
  if (!['active', 'canceling', 'owner'].includes(row.sub_status)) throw new HttpError(400, 'Extra video seconds are available to subscribers. Choose a plan first.');
  const pack = TOPUPS.find((t) => t.id === body.pack);
  if (!pack) throw new HttpError(400, 'Unknown top-up pack.');
  await rateLimit(`checkout:${row.id}`, 20, 3600);
  const currency = BILLING_CURRENCY();
  const txRef = newId('topup');
  await sql()`INSERT INTO payments (tx_ref, user_id, tier, cycle, amount, currency) VALUES (${txRef}, ${row.id}, 'topup', ${pack.id}, ${pack.price}, ${currency})`;
  const data = await flw('/payments', 'POST', {
    tx_ref: txRef, amount: pack.price, currency, redirect_url: `${appUrl(req)}/?billing=callback`,
    customer: { email: row.email, name: row.name },
    customizations: { title: 'OmniPulse AI', description: `${pack.seconds} extra seconds of AI video`, logo: process.env.FLW_LOGO_URL || `${appUrl(req)}/logo.png` },
    meta: { userId: row.id, kind: 'topup', pack: pack.id },
  });
  json(res, 200, { url: data.link });
};

const billingExtras: Handler = async ({ res }) => {
  json(res, 200, { currency: BILLING_CURRENCY(), trial: { days: TRIAL.days, seconds: TRIAL.seconds, price: trialPrice() }, topups: TOPUPS });
};

async function refundTx(transactionId: string | number, amount: number) {
  await flw(`/transactions/${encodeURIComponent(String(transactionId))}/refund`, 'POST', { amount }).catch((e) => console.error('refund failed', transactionId, e?.message));
}

async function settleTrial(d: any, pay: any, userRow: any) {
  const card = d.card || {};
  const first6 = String(card.first_6digits || ''), last4 = String(card.last_4digits || ''), exp = String(card.expiry || '');
  const reject = async (status: string) => {
    await sql()`UPDATE payments SET status = ${status} WHERE tx_ref = ${d.tx_ref}`;
    await refundTx(d.id, Number(pay.amount));
    return null;
  };
  if (!first6 || !last4) { console.error('Trial payment had no card details', d.tx_ref); return reject('rejected'); }
  if (userRow.sub_status !== 'none' || userRow.trial_used) return reject('rejected');
  const hash = sha256(`${first6}|${last4}|${exp}|${process.env.SESSION_SECRET || ''}`);
  const ins = (await sql()`INSERT INTO trial_cards (card_hash, user_id) VALUES (${hash}, ${userRow.id}) ON CONFLICT DO NOTHING RETURNING card_hash`) as any[];
  if (!ins.length) return reject('duplicate_card');
  const end = new Date(Date.now() + TRIAL.days * 86400_000).toISOString();
  await sql()`UPDATE users SET sub_status='trial', tier='starter', sub_cycle=NULL, period_end=${end}, trial_used=TRUE WHERE id=${userRow.id}`;
  await sql()`UPDATE payments SET status = 'paid' WHERE tx_ref = ${d.tx_ref}`;
  return userRow.id as string;
}

async function settleTopup(d: any, pay: any, userRow: any) {
  const pack = TOPUPS.find((t) => t.id === pay.cycle);
  if (!pack) { console.error('Unknown top-up pack on payment', d.tx_ref); return null; }
  await sql()`INSERT INTO topups (tx_ref, user_id, seconds) VALUES (${d.tx_ref}, ${userRow.id}, ${pack.seconds}) ON CONFLICT DO NOTHING`;
  await sql()`UPDATE payments SET status = 'paid' WHERE tx_ref = ${d.tx_ref}`;
  return userRow.id as string;
}

/** Confirms a transaction directly with Flutterwave (never trusts the redirect/webhook payload alone). */
async function settleTransaction(transactionId: string, req?: Req, expectedTxRef?: string) {
  const d = await flw(`/transactions/${encodeURIComponent(transactionId)}/verify`);
  if (d.status !== 'successful') return null;
  if (expectedTxRef && d.tx_ref !== expectedTxRef) { console.error('tx_ref mismatch', expectedTxRef, d.tx_ref); return null; }
  const pay = ((await sql()`SELECT * FROM payments WHERE tx_ref = ${d.tx_ref}`) as any[])[0];
  let userRow: any, plan: { tier: Tier; cycle: Cycle } | null = null;
  if (pay) {
    if (String(d.currency).toUpperCase() !== String(pay.currency).toUpperCase()) {
      console.error('Payment currency mismatch', d.tx_ref, d.amount, d.currency); return null;
    }
    userRow = ((await sql()`SELECT * FROM users WHERE id = ${pay.user_id}`) as any[])[0];
    if (pay.tier === 'trial' || pay.tier === 'topup') {
      if (!userRow) return null;
      if (Number(d.amount) + 0.001 < Number(pay.amount)) { console.error('Amount too low', d.tx_ref, d.amount, pay.amount); return null; }
      if (pay.status === 'paid') return userRow.id as string;
      return pay.tier === 'trial' ? settleTrial(d, pay, userRow) : settleTopup(d, pay, userRow);
    }
    plan = { tier: pay.tier as Tier, cycle: pay.cycle as Cycle };
    await sql()`UPDATE payments SET status = 'paid' WHERE tx_ref = ${d.tx_ref}`;
  } else {
    // Recurring renewal charged by Flutterwave: identify customer by email and plan.
    const email = normEmail(d.customer?.email);
    userRow = ((await sql()`SELECT * FROM users WHERE email = ${email}`) as any[])[0];
    plan = tierFromPlanId(d.payment_plan ?? d.plan) || (userRow && userRow.sub_status !== 'none' ? { tier: userRow.tier as Tier, cycle: (userRow.sub_cycle || 'monthly') as Cycle } : null);
  }
  if (!userRow || !plan) return null;
  await activate(userRow, plan, req);
  if (pay) { const pid = planId(plan.tier, plan.cycle); cancelSubscriptions(userRow.email, pid).catch(() => undefined); }
  return userRow.id as string;
}

const billingVerify: Handler = async ({ req, res, query }) => {
  const row = await currentUser(req);
  const status = query.get('status') || '', txRef = query.get('tx_ref') || '', txId = query.get('transaction_id') || '';
  if (!['successful', 'completed'].includes(status)) return json(res, 200, { status, user: toUser(row) });
  if (!/^\d{1,20}$/.test(txId) || !/^[\w.-]{6,100}$/.test(txRef)) throw new HttpError(400, 'Invalid payment reference.');
  const pay = ((await sql()`SELECT user_id FROM payments WHERE tx_ref = ${txRef}`) as any[])[0];
  if (!pay || pay.user_id !== row.id) throw new HttpError(403, 'This payment belongs to a different account.');
  const settled = await settleTransaction(txId, req, txRef);
  if (!settled) {
    const st = ((await sql()`SELECT status FROM payments WHERE tx_ref = ${txRef}`) as any[])[0]?.status;
    if (st === 'duplicate_card') return json(res, 200, { status: 'denied', message: 'This card has already been used for a trial, so a second trial is not possible. Your payment has been refunded. Please choose a plan.', user: toUser(row) });
    if (st === 'rejected') return json(res, 200, { status: 'denied', message: 'We could not start your trial. Your payment has been refunded. Please try again or choose a plan.', user: toUser(row) });
    return json(res, 200, { status: 'pending', user: toUser(row) });
  }
  const fresh = (await sql()`SELECT * FROM users WHERE id = ${row.id}`) as any[];
  json(res, 200, { status: 'success', user: toUser(fresh[0]) });
};

const cancelBilling: Handler = async ({ req, res }) => {
  const row = await currentUser(req);
  if (row.sub_status !== 'active') throw new HttpError(400, 'There is no active subscription to cancel.');
  await cancelSubscriptions(row.email);
  await sql()`UPDATE users SET sub_status='canceling' WHERE id=${row.id}`;
  const fresh = (await sql()`SELECT * FROM users WHERE id = ${row.id}`) as any[];
  json(res, 200, { user: toUser(fresh[0]) });
};

const webhook: Handler = async ({ req, res, raw }) => {
  if (!verifyFlwSignature(req.headers['verif-hash'] as string)) throw new HttpError(401, 'Bad signature');
  const ev = JSON.parse(raw.toString('utf8'));
  const event = ev.event || ev['event.type'];
  const d = ev.data || {};
  const dedupe = `${event}:${d.id ?? sha256(raw.toString())}`;
  const fresh = (await sql()`INSERT INTO webhook_events (id) VALUES (${dedupe}) ON CONFLICT DO NOTHING RETURNING id`) as any[];
  if (!fresh.length) return json(res, 200, { ok: true, duplicate: true });

  if (event === 'charge.completed') {
    if (d.status === 'successful') await settleTransaction(String(d.id), req);
    else if (d.status === 'failed' && d.customer?.email) {
      const u = ((await sql()`SELECT * FROM users WHERE email = ${normEmail(d.customer.email)}`) as any[])[0];
      if (u && u.sub_status === 'active') mail.paymentFailed(u.email, u.name, appUrl(req)).catch((e) => console.error(e));
    }
  } else if (event === 'subscription.cancelled') {
    const email = normEmail(d.customer?.customer_email || d.customer?.email);
    if (email) await sql()`UPDATE users SET sub_status='canceling' WHERE email=${email} AND sub_status='active'`;
  }
  json(res, 200, { ok: true });
};

// ---------------------------------------------------------------- account
async function topupBalance(userId: string): Promise<number> {
  const t = (await sql()`SELECT (COALESCE((SELECT sum(seconds) FROM topups WHERE user_id=${userId}), 0) - COALESCE((SELECT sum(seconds) FROM video_jobs WHERE user_id=${userId} AND source = 'topup' AND status <> 'failed'), 0))::int AS bal`) as any[];
  return Math.max(0, t[0].bal);
}

const usage: Handler = async ({ req, res }) => {
  const { row, user } = await requireAccess(req);
  const r = (await sql()`SELECT count(*)::int AS n, COALESCE(sum(seconds) FILTER (WHERE source = 'plan'), 0)::int AS plan_secs FROM video_jobs WHERE user_id=${row.id} AND status <> 'failed' AND created_at >= date_trunc('month', now())`) as any[];
  json(res, 200, { videosUsed: r[0].n, videosLimit: user.videosLimit, secondsUsed: r[0].plan_secs, secondsLimit: user.secondsLimit, topupSeconds: await topupBalance(row.id) });
};

const updateProfile: Handler = async ({ req, res, body }) => {
  const row = await currentUser(req);
  const name = str(body.name, 80);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  const rows = (await sql()`UPDATE users SET name=${name}, brand_name=${str(body.brandName, 80)} WHERE id=${row.id} RETURNING *`) as any[];
  json(res, 200, { user: toUser(rows[0]) });
};

const changePassword: Handler = async ({ req, res, body }) => {
  const row = await currentUser(req);
  await rateLimit(`pw:${row.id}`, 10, 3600);
  if (!(await verifyPassword(String(body.currentPassword || ''), row.password_hash))) throw new HttpError(400, 'Your current password is incorrect.');
  const next = String(body.newPassword || '');
  checkPassword(next);
  await sql()`UPDATE users SET password_hash=${await hashPassword(next)} WHERE id=${row.id}`;
  json(res, 200, { ok: true });
};

const exportData: Handler = async ({ req, res }) => {
  const row = await currentUser(req);
  const dash = (await sql()`SELECT data FROM dashboards WHERE user_id=${row.id}`) as any[];
  const pay = (await sql()`SELECT tx_ref, tier, cycle, amount, currency, status, created_at FROM payments WHERE user_id=${row.id}`) as any[];
  const jobs = (await sql()`SELECT id, status, video_url, created_at FROM video_jobs WHERE user_id=${row.id}`) as any[];
  const series = (await sql()`SELECT p.id, p.title, p.genre, p.character_db, p.created_at, (SELECT COALESCE(json_agg(json_build_object('partNumber', e.part_number, 'status', e.status, 'promptInput', e.prompt_input, 'storyboard', e.storyboard_json) ORDER BY e.part_number), '[]'::json) FROM episodes e WHERE e.project_id = p.id) AS episodes FROM projects p WHERE p.user_id=${row.id}`) as any[];
  res.setHeader('Content-Disposition', 'attachment; filename="omnipulse-data.json"');
  json(res, 200, { exportedAt: new Date().toISOString(), profile: toUser(row), termsAcceptedAt: row.terms_accepted_at, dashboard: dash[0]?.data || null, payments: pay, videoJobs: jobs, series });
};

const deleteAccount: Handler = async ({ req, res, body }) => {
  const row = await currentUser(req);
  await rateLimit(`del:${row.id}`, 5, 3600);
  if (!(await verifyPassword(String(body.password || ''), row.password_hash))) throw new HttpError(400, 'Password is incorrect.');
  await cancelSubscriptions(row.email).catch((e) => console.error('cancel on delete', e));
  const id = row.id;
  await sql()`DELETE FROM dashboards WHERE user_id=${id}`;
  await sql()`DELETE FROM social_connections WHERE user_id=${id}`;
  await sql()`DELETE FROM scheduled_posts WHERE user_id=${id}`;
  await sql()`DELETE FROM projects WHERE user_id=${id}`; // episodes are removed with their project
  await sql()`DELETE FROM video_jobs WHERE user_id=${id}`;
  await sql()`DELETE FROM email_codes WHERE email=${row.email}`;
  await sql()`DELETE FROM users WHERE id=${id}`;
  endSession(res);
  json(res, 200, { ok: true });
};

// ---------------------------------------------------------------- dashboard state
const getDashboard: Handler = async ({ req, res }) => {
  const { row } = await requireAccess(req);
  const r = (await sql()`SELECT data FROM dashboards WHERE user_id = ${row.id}`) as any[];
  json(res, 200, { data: r[0]?.data || null });
};
const putDashboard: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  if (!body?.data || typeof body.data !== 'object') throw new HttpError(400, 'Invalid dashboard data.');
  const s = JSON.stringify(body.data);
  if (s.length > 1_500_000) throw new HttpError(413, 'Dashboard data is too large.');
  await sql()`INSERT INTO dashboards (user_id, data, updated_at) VALUES (${row.id}, ${s}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  json(res, 200, { ok: true });
};

// ---------------------------------------------------------------- AI
const genScript: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const data = await geminiJson(scriptPrompt({
    idea: str(body.idea || 'Automated viral marketing for creator business', 600), niche: str(body.niche || 'Tech & AI SaaS', 80),
    videoType: str(body.videoType || 'explainer_video', 40), aspectRatio: str(body.aspectRatio || '9:16', 10),
    targetPlatforms: Array.isArray(body.targetPlatforms) ? body.targetPlatforms.slice(0, 7).map((x: any) => str(x, 20)) : ['tiktok', 'youtube', 'instagram'],
    directorStyle: str(body.directorStyle || 'dynamic_viral', 40), hookFormula: str(body.hookFormula || 'witty_provocative', 40), voiceName: str(body.voiceName || 'No voice-over', 60), seconds: Number(body.seconds) === 10 ? 10 : 5,
  }));
  if (!Array.isArray(data.scenes) || !data.scenes.length) throw new HttpError(424, 'The AI returned an incomplete script. Please try again.', 'GEMINI');
  json(res, 200, { success: true, ...data });
};

const researchTrends: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const niche = str(body.niche || 'Tech & AI SaaS', 80), custom = str(body.customQuery, 120);
  if (body.step === 'format') {
    const notes = str(body.notes, 20000);
    if (notes.length < 50) throw new HttpError(400, 'No research notes to format.');
    const r = await geminiFormat(trendsFormatPrompt(niche, notes));
    return json(res, 200, { success: true, ...r.data, model: r.model });
  }
  const r = await geminiSearch(trendsResearchPrompt(niche, custom));
  json(res, 200, { success: true, notes: r.text, sources: r.sources, grounded: true, model: r.model });
};


/** How many seconds of video this user can still render (plan seconds left this month plus bought top-ups). */
async function secondsAvailable(row: any, user: { secondsLimit: number }) {
  const used = (await sql()`SELECT COALESCE(sum(seconds), 0)::int AS secs FROM video_jobs WHERE user_id=${row.id} AND source = 'plan' AND status <> 'failed' AND created_at >= date_trunc('month', now())`) as any[];
  return Math.max(0, user.secondsLimit - used[0].secs) + (await topupBalance(row.id));
}

const SPEECH_WORDS_PER_SECOND = 2.3;
const speechSeconds = (lines: { text: string }[]) => lines.reduce((t, l) => t + (l.text.trim().split(/\s+/).filter(Boolean).length / SPEECH_WORDS_PER_SECOND) + 0.5, 0);

/** Shortens one spoken line to at most `maxWords` words so it is never cut off by the end of its clip. */
const clipWords = (text: string, maxWords: number) => {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length <= maxWords ? text.trim() : w.slice(0, maxWords).join(' ').replace(/[,;:\-\u2013\u2014]+$/, '') + '.';
};

/** The longest render prompt the /video/render endpoint accepts. */
const RENDER_PROMPT_MAX = 2380;

/**
 * Writes a multi-scene storyboard and prepares every scene for rendering.
 *
 * 1. The creative brief (duration mode, target length, mood, camera profile, character lock) is read and validated.
 * 2. The target length is split into 5 or 10 second clips (a 1 minute video becomes six 10 second scenes).
 * 3. The model writes one scene per clip. Each scene is checked, trimmed to fit its clip and given a ready-to-send render payload.
 */
/** The creative settings every storyboard request carries, whether it is a one-off video or one part of a series. */
interface StoryInput {
  idea: string; format: string; look: string; aspect: string; niche: string;
  brief: StoryBriefInput;
  /** Set for Part 2 and later: what the writer must remember from the previous part. */
  continuity?: SeriesContinuity;
  /** The person's own script (paste mode). Empty means the AI writes the story. */
  script?: string;
}

/** Reads the shared creative fields from a request body. Throws a 400 when the idea is too short. */
function parseStoryInput(body: any): Omit<StoryInput, 'continuity' | 'script'> {
  const idea = str(body.idea, 800);
  if (idea.length < 10) throw new HttpError(400, 'Please describe your story in a little more detail.');
  return {
    idea,
    format: ['drama', 'documentary', 'animation'].includes(String(body.format)) ? String(body.format) : 'drama',
    look: str(body.look, 80) || 'cinematic',
    aspect: ['9:16', '16:9', '1:1'].includes(String(body.aspectRatio)) ? String(body.aspectRatio) : '9:16',
    niche: str(body.niche || 'general audience', 80),
    brief: parseStoryBrief(body),
  };
}

const generateStory: Handler = async ({ req, res, body }) => {
  const { row, user } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const out = await writeStoryboard(row, user, parseStoryInput(body), undefined, true);
  if ('draft' in out) throw new HttpError(424, 'The script is not ready yet. Please try again.', 'GEMINI');
  json(res, 200, (out as { sb: any }).sb);
};

const sumSeconds = (a: number[]) => a.reduce((x, y) => x + y, 0);
const speechCap = 9.0; // seconds of speech that safely fit a 10 second clip

/** Everything a writer step needs, worked out once. */
async function prepareStory(row: any, user: { secondsLimit: number }, input: StoryInput, single: boolean, noCap = false) {
  const { idea, format, look, aspect, brief, continuity } = input;
  const script = (input.script || '').trim();
  const available = await secondsAvailable(row, user);
  if (available < PART_SECONDS) throw new HttpError(403, `You need at least ${PART_SECONDS} video seconds to make a video. Buy extra seconds or upgrade your plan.`, 'LIMIT');

  let plan = planScenes(brief.requestedSeconds, available, brief.sceneSeconds);
  const notes: string[] = [];
  if (plan.capped) notes.push(`You asked for ${brief.requestedSeconds} seconds but only have ${available} video seconds left, so this part is ${plan.targetSeconds} seconds.`);
  if ((script || single) && !noCap && plan.scenes.length > SCENES_PER_WRITER_CALL) {
    const keep = plan.scenes.slice(0, SCENES_PER_WRITER_CALL);
    plan = { scenes: keep, targetSeconds: sumSeconds(keep), capped: plan.capped };
    if (script) notes.push(`A pasted script is turned into parts of up to ${plan.targetSeconds} seconds. Whatever does not fit is saved and becomes the next part.`);
  }
  const defaultLen = STORY_LIMITS.long.fallback;
  const pacing = brief.requestedSeconds < defaultLen ? 'Tight and economical. Cut straight to the point, no filler, every scene moves the story forward.'
    : brief.requestedSeconds > defaultLen ? 'Unhurried and immersive. Allow atmosphere, small details and a slower build before each turn.'
    : 'Balanced. Steady build with room for one or two breathing moments.';
  const mood = STORY_MOODS[brief.mood], cam = CAMERA_PROFILES[brief.cameraProfile];
  // a documentary is always narrated; everything else follows the chosen presentation
  const presentation = format === 'documentary' ? 'narrated' as const : brief.presentation;
  const silentCast = presentation === 'narrated' || (brief.dialogue === 'none' && presentation !== 'dialogue' && presentation !== 'shortdrama') || (brief.cast === 'animals' && !brief.animalsTalk);
  const style = styleBlock({ presentation, genre: brief.genre, intensity: brief.intensity, dialogue: brief.dialogue, ending: brief.ending, cast: brief.cast, animalsTalk: brief.animalsTalk, trope: brief.trope });
  const base = { idea, format, look, niche: input.niche, aspectRatio: aspect, scenes: plan.scenes, mood: brief.mood, cameraProfile: brief.cameraProfile, pacing, characterLock: brief.characterLock, continuity, style, silentCast };
  return { idea, format, look, aspect, brief, continuity, script, available, plan, notes, mood, cam, base, presentation, silentCast, castMin: castMinimum(plan.targetSeconds, format) };
}

type StoryCtx = Awaited<ReturnType<typeof prepareStory>>;
const WRITER_OPTS = { timeoutMs: 44_000, deadlineMs: 52_000, maxTokens: 2800 };
const CHUNK = 3;

/**
 * Writes the storyboard, one bounded step at a time.
 * Up to 8 scenes (or a pasted script) are written in one request. Longer parts are written as an outline first and then in chunks,
 * one step per call, so no single request ever has to hold a whole 10 minute script. Returns `done:false` with a draft to save while more steps remain.
 */
async function writeStoryboard(row: any, user: { secondsLimit: number }, input: StoryInput, draft?: any, single = false, scriptOpts = WRITER_OPTS): Promise<{ done: true; sb: any } | { done: false; draft: any }> {
  const ctx = await prepareStory(row, user, input, single);
  const { base, plan, castMin, script } = ctx;
  if (script) return { done: true, sb: finishStory(ctx, (await geminiRaw(adaptPrompt({ ...base, script: script.slice(0, 20000), castMin }), scriptOpts)).data || {}, input) };
  if (plan.scenes.length <= SCENES_PER_WRITER_CALL) return { done: true, sb: finishStory(ctx, (await geminiRaw(storyboardPrompt({ ...base, castMin }), WRITER_OPTS)).data || {}, input) };

  // long part: outline first
  if (!draft?.outline) {
    const o: any = (await geminiRaw(outlinePrompt({ ...base, castMin }), { timeoutMs: 40_000, deadlineMs: 50_000, maxTokens: 2500 })).data || {};
    const outline = (Array.isArray(o.outline) ? o.outline : []).map((x: any, i: number) => ({ sceneNumber: Number(x?.sceneNumber) || i + 1, summary: str(x?.summary, 300) })).filter((x: any) => x.summary);
    if (outline.length < Math.ceil(plan.scenes.length * 0.6) || !Array.isArray(o.characters) || !o.characters.length) throw new HttpError(424, 'The story plan came back incomplete. Retrying.', 'GEMINI');
    return { done: false, draft: { ...o, outline, scenes: [] } };
  }
  // then the scenes, two chunks per step
  const total = plan.scenes.length;
  const have = (draft.scenes || []).length;
  const ranges: [number, number][] = [];
  for (let f = have + 1; f <= total && ranges.length < 1; f += CHUNK) ranges.push([f, Math.min(total, f + CHUNK - 1)]);
  const writerPlan = { title: str(draft.title, 100), logline: str(draft.logline, 300), characters: draft.characters || [], outline: draft.outline };
  const outs = await Promise.all(ranges.map(([f, t]) => geminiRaw(chunkPrompt(base, writerPlan, f, t), { timeoutMs: 40_000, deadlineMs: 50_000, maxTokens: 2800 })));
  const scenes = [...(draft.scenes || [])];
  outs.forEach((o, i) => {
    const got: any[] = Array.isArray((o.data as any)?.scenes) ? (o.data as any).scenes : [];
    const want = ranges[i][1] - ranges[i][0] + 1;
    if (!got.length) throw new HttpError(424, 'A part of the script came back empty. Retrying.', 'GEMINI');
    scenes.push(...got.slice(0, want));
  });
  const next = { ...draft, scenes };
  return scenes.length >= total ? { done: true, sb: finishStory(ctx, next, input) } : { done: false, draft: next };
}

// ---------------------------------------------------------------- pasted script without the AI
type ScriptUnit = { speaker: string; text: string; setting: string; action: string; cue: string; look: string };
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

/**
 * Reads a pasted script like a director. Spoken lines ("NAME: line", or a screenplay speaker cue followed by the line) become dialogue.
 * Everything else (scene headings, action lines, bracketed directions) is NOT spoken: it becomes what the camera shows.
 * Only a script with no dialogue at all is read aloud by a narrator.
 */
function scriptUnits(script: string, maxWords: number, proseSpoken = false): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  let setting = '';
  let pending = '';
  let action = '';
  let cue = '';
  let look = '';
  const act = (t: string) => { action = `${action} ${t}`.trim(); };
  const push = (speaker: string, text: string) => {
    // acting notes inside a spoken line, like "(whispering)", are shown on screen, never said aloud
    const clean = text.replace(/[([]([^)\]]*)[)\]]/g, (_, t) => { if (!cue) cue = String(t).trim(); return ' '; }).replace(/\s+/g, ' ').replace(/^["“”']+|["“”']+$/g, '').trim();
    if (!clean) return;
    // sentences first, so a long speech becomes several short lines; a sentence that is still too long is cut by words
    const sentences = clean.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) || [clean];
    let first = true;
    for (const sent of sentences) {
      const w = words(sent);
      for (let i = 0; i < w.length; i += maxWords) {
        units.push({ speaker, text: w.slice(i, i + maxWords).join(' '), setting, action: first ? action : '', cue: first ? cue : '', look: first ? look : '' });
        if (first) { action = ''; cue = ''; look = ''; first = false; }
      }
    }
  };
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { pending = ''; continue; }
    if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.|SCENE\b|CHAPTER\b)/i.test(line)) { setting = line.replace(/^SCENE\s*\d*\s*[:.-]?\s*/i, '').slice(0, 160); continue; }
    const bracket = line.match(/^[([](.*)[)\]]$/);
    if (bracket) { act(bracket[1]); continue; } // a stage direction on its own line
    if (/^(title|author|by|genre|logline|synopsis|notes?)\s*[:：]/i.test(line)) continue; // details about the script, not words to speak
    if (pending) { push(pending, line); continue; }
    const m = line.match(/^([A-Za-z][A-Za-z0-9 .'’-]{0,28}?)\s*(?:[([]([^)\]]*)[)\]])?\s*[:：]\s*(.+)$/);
    if (m && words(m[1]).length <= 3) {
      const note = (m[2] || '').trim();
      if (note) { if (/\b\d{2}s?\b|\byears?\b|\bold\b/i.test(note)) look = note; else cue = note; }
      push(/^narrator|^voice ?over|^v\.?o\.?$/i.test(m[1].trim()) ? 'Narrator' : m[1].trim(), m[3]); continue;
    }
    if (/^[A-Z][A-Z0-9 .'’-]{1,28}$/.test(line) && words(line).length <= 3) { pending = line.replace(/\b(\w)(\w*)/g, (_, c, d) => c + d.toLowerCase()); continue; } // screenplay speaker cue
    if (proseSpoken) push('Narrator', line); else act(line);
  }
  if (action && units.length) units[units.length - 1].action = `${units[units.length - 1].action} ${action}`.trim();
  return units;
}

/** Plain prose becomes screenplay units: quoted speech is dialogue, actions and thoughts become what the camera shows, and only a short time jump is narrated. */
function proseScriptUnits(script: string, maxWords: number): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  let action = '';
  const blank = { setting: '', cue: '', look: '' };
  for (const u of proseToUnits(script)) {
    if (u.kind === 'speech') {
      const w = words(u.text);
      for (let i = 0; i < w.length; i += maxWords) { units.push({ speaker: u.speaker, text: w.slice(i, i + maxWords).join(' '), action: i === 0 ? action : '', ...blank }); if (i === 0) action = ''; }
    } else if (u.kind === 'narration') { units.push({ speaker: 'Narrator', text: u.text, action, ...blank }); action = ''; }
    else {
      action = `${action} ${u.kind === 'thought' ? thoughtToVisual(u.text) : u.text}`.trim();
      if (words(action).length > 40) { units.push({ speaker: '', text: '', action, ...blank }); action = ''; }
    }
  }
  if (action) units.push({ speaker: '', text: '', action, ...blank });
  return units;
}

const LOOKS = {
  female: ['a woman in her early 30s with shoulder-length dark wavy hair, warm brown eyes, a cream linen blouse and a thin gold chain', 'a woman in her late 20s with braids tied back, a fitted olive jacket and small hoop earrings', 'a woman in her 50s with short grey-streaked hair, a kind lined face and a deep blue cardigan', 'a young woman around 22 with a high ponytail, a denim jacket over a white tee and light makeup'],
  male: ['a man in his mid 30s with short black hair and a trimmed beard, a charcoal shirt with rolled sleeves', 'a man in his late 40s, broad build, greying temples, a navy blazer over an open collar', 'a lanky young man around 24 with a shaved head, a plain white tee and a light bomber jacket', 'an older man in his 60s with a weathered face, white stubble and a brown cardigan'],
};
const VOICES = {
  female: ['warm, mid-pitched woman, calm and measured', 'bright, quick young woman, expressive', 'soft, low woman, slow and thoughtful', 'firm, clear woman, confident'],
  male: ['deep, steady man, unhurried', 'gravelly older man, slow and weary', 'light, energetic young man, fast', 'smooth, mid-pitched man, controlled'],
};
const FEMALE_NAMES = /^(maya|amara|ngozi|chioma|ada|adaeze|ife|ifeoma|funke|bisi|sade|folake|zainab|aisha|fatima|hauwa|blessing|grace|mary|anna|ann|sarah|sara|lisa|jane|linda|rose|esther|ruth|joy|faith|mercy|precious|favour|chinwe|nneka|amina|halima|kemi|titi|tola|yemi|zara|lola|nkechi|ebele|uche|oluchi|mum|mother|mama|aunty|sister|queen|lady|woman|girl|wife)$/i;

/**
 * The no-AI route for a pasted script. The person's own words are kept exactly: dialogue is spoken, action lines become what the camera shows,
 * and each scene gets a director-style picture prompt (shot, setting, who is in frame with a fixed look, the action, the feeling, realistic light).
 * Whatever does not fit in this part is returned in remainingScript and becomes the next part, like the AI route.
 */
async function adaptScriptLocally(row: any, user: { secondsLimit: number }, input: StoryInput) {
  const ctx = await prepareStory(row, user, input, false, true); // no AI writes this, so the whole length asked for is made in one part
  const { plan, script } = ctx;
  const N = plan.scenes.length;
  const LINE_WORDS = 14; // a line this short always fits inside one 10 second clip
  const capOf = (len: number) => (len / PART_SECONDS) * LINE_WORDS * 2; // comfortable words per scene, leaving room for pauses between lines
  const totalCap = plan.scenes.reduce((n, len) => n + capOf(len), 0);
  let units = scriptUnits(script, LINE_WORDS);
  const hasDialogue = units.length > 0;
  if (!hasDialogue) units = proseScriptUnits(script, LINE_WORDS); // plain prose: quoted speech is spoken, everything that happens is shown, nothing is read out by a narrator
  const weightOf = (u: ScriptUnit) => words(u.text).length || Math.min(10, Math.ceil(words(u.action).length / 3));
  const totalWords = units.reduce((n, u) => n + weightOf(u), 0);
  // spread the words evenly over the scenes they need, so the story is not crammed into the first ones
  const fit = Math.min(totalWords, totalCap);
  // A short script is still spread over the length that was asked for (about 6 words or more per scene), so a 3 minute choice is not cut to a minute.
  const S = Math.max(1, Math.min(N, Math.max(Math.ceil(fit / (totalCap / N * 0.8)), Math.floor(totalWords / 6))));
  const perScene = Math.max(6, Math.ceil(fit / S));
  const wordCount = (ls: { text: string }[]) => ls.reduce((n, l) => n + words(l.text).length, 0);

  // who is in the story: a fixed look and voice for each, so they stay the same person in every scene
  const speakers = [...new Set(units.map((u) => u.speaker).filter((x) => x && x !== 'Narrator'))].slice(0, 6);
  const genderOf = (n: string): 'male' | 'female' => {
    if (FEMALE_NAMES.test(n.split(' ')[0])) return 'female';
    const near = [...script.matchAll(new RegExp(`\\b${n.replace(/[^\w ]/g, '')}\\b([^.\\n]{0,80})`, 'gi'))].map((m) => m[1]).join(' ');
    return /\b(she|her|hers)\b/i.test(near) && !/\b(he|his|him)\b/i.test(near) ? 'female' : 'male';
  };
  const cast = speakers.map((n, k) => {
    const gender = genderOf(n);
    const taken = speakers.slice(0, k).filter((x) => genderOf(x) === gender).length;
    const prior = ctx.continuity?.characters.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (prior) return { name: prior.name, role: prior.role || 'character', gender: prior.gender === 'female' ? 'female' as const : 'male' as const, voice: prior.voice || VOICES[gender][taken % 4], description: prior.description }; // the same person as in the earlier part
    const given = units.find((u) => u.speaker === n && u.look)?.look;
    const look = given ? `${LOOKS[gender][taken % 4]} (${given})` : LOOKS[gender][taken % 4];
    return { name: n, role: 'character', gender, voice: VOICES[gender][taken % 4], description: `${look}, the same face, hair and clothes in every scene` };
  });
  const lookOf = new Map(cast.map((c) => [c.name, c.description]));

  const rawScenes: any[] = [];
  let at = 0;
  for (let k = 0; k < N && at < units.length; k++) {
    const halves = plan.scenes[k] / PART_SECONDS;
    const target = k < S ? Math.min(capOf(plan.scenes[k]), perScene) : capOf(plan.scenes[k]);
    let lines: { speaker: string; text: string; half: number }[] = [];
    let used = 0;
    const startAt = at;
    while (at < units.length) {
      const u = units[at], w = weightOf(u);
      if (used > 0 && used + w > target) break;
      const next = lines.map((l) => ({ ...l }));
      const last = next[next.length - 1];
      if (u.text) { if (last && last.speaker === u.speaker) last.text += ` ${u.text}`; else next.push({ speaker: u.speaker, text: u.text, half: 1 }); }
      if (used > 0 && wordCount(packLines(next, halves)) < wordCount(next)) break; // the scene's two clips cannot say all of this in time
      lines = next; used += w; at++;
    }
    const here = units.slice(startAt, at);
    const setting = here.find((u) => u.setting)?.setting || '';
    const acts = here.map((u) => u.action).filter(Boolean);
    const cues = here.map((u) => u.cue).filter(Boolean);
    const who = [...new Set(here.map((u) => u.speaker).filter((x) => x !== 'Narrator' && lookOf.has(x)))].slice(0, 3);
    const first = here.find((u) => u.text) || here[0];
    const mood = /!/.test(first.text) ? 'intense, charged emotion, raised energy' : /\?/.test(first.text) ? 'uncertain, searching, tense' : 'quiet, restrained, believable emotion';
    // shot: an opening wide shot, a two-shot when two people share the scene, otherwise a close-up on the speaker
    const shot = k === 0 && !ctx.continuity ? `Wide establishing shot${setting ? ` of ${setting}` : ''}, then settling on ${who.length ? who.join(' and ') : 'the scene'}`
      : who.length >= 2 ? `Dynamic handheld shot, ${who[0]} and ${who[1]} in tense physical confrontation, moving through the space`
      : who.length === 1 ? `Tracking shot following ${who[0]} as they move through the place`
      : 'Cinematic establishing view of the place';
    const people = who.map((n) => `${n} is ${lookOf.get(n)}`).join('. ');
    const split = halves === 2 && acts.length >= 2 ? Math.ceil(acts.length / 2) : acts.length;
    const firstActs = acts.slice(0, split), laterActs = acts.slice(split);
    const doing = (acts.length ? firstActs.join(' ') : cues.length ? `${who[0] || 'The speaker'} is ${cues[0]}` : `${who[0] || 'The character'} moves urgently through the place, grabbing, pushing or reaching for things, and speaks while moving`).replace(/[.\s]+$/, '');
    rawScenes.push({
      lines,
      visualPrompt: `${shot}. ${setting && k !== 0 ? `Setting: ${setting}. ` : ''}${people ? `${people}. ` : ''}${doing}. Mood: ${mood}. Photorealistic live-action film, real human proportions, natural skin texture and expressions, realistic fabric and hair movement, motivated natural lighting, shallow depth of field, shot on a 35mm cinema camera.`.replace(/\s+/g, ' '),
      secondHalfAction: (() => {
        if (laterActs.length) return `${laterActs.join(' ')} The camera stays in the same place, no cut and no repeat of what already happened.`;
        const talker = lines[lines.length - 1]?.speaker;
        const listener = who.find((x) => x !== talker);
        return talker && talker !== 'Narrator' ? `The action escalates: ${talker} keeps moving and speaking${listener ? ` while ${listener} reacts physically, lunging, ducking or blocking the way` : ', pushing forward through the danger'}. The camera stays in the same place, no cut and no repeat of what already happened.` : 'The action escalates with the same people in the same place: a sudden movement, a crash or a new danger, no cut and no repeat of what already happened.';
      })(),
    });
  }
  const remainingScript = units.slice(at).map((u) => (u.text ? `${u.action ? `${u.action}\n` : ''}${u.speaker}: ${u.text}` : u.action)).join('\n');
  // a short script makes a short part: only the scenes that have something to say are made
  const shortCtx = { ...ctx, plan: { ...plan, scenes: plan.scenes.slice(0, Math.max(1, rawScenes.length)), targetSeconds: sumSeconds(plan.scenes.slice(0, Math.max(1, rawScenes.length))) } };

  const named = script.match(/^\s*title\s*[:：-]\s*(.+)$/im)?.[1] || '';
  const typed = input.idea !== script.slice(0, 160) && !input.idea.endsWith('(the story)') ? input.idea : ''; // the title the person typed, if any
  const title = str(named || typed, 60) || 'My script';
  const used = new Set(units.slice(0, at).map((u) => u.speaker));
  const sb = finishStory(shortCtx, {
    title, logline: str(words(script).slice(0, 30).join(' '), 300), storySoFar: str(words(units.slice(0, at).map((u) => u.text).join(' ')).slice(0, 120).join(' '), 900),
    characters: cast.filter((c) => used.has(c.name)), scenes: rawScenes, remainingScript, hashtags: [], callToAction: '',
  }, input);
  sb.notes = [...(sb.notes || []), 'Your script was used exactly as you wrote it: spoken lines are said by the characters, and action lines are shown on screen instead of being read out.'];
  return sb;
}

/**
 * A pasted script is read like a director would read it. The AI breaks it down first (what is said, what is shown, what is only a thought),
 * and if the AI is busy or fails, the built-in reader does the same job with fixed rules, so the video never waits on a failed request.
 */
async function adaptPastedScript(row: any, user: { secondsLimit: number }, input: StoryInput): Promise<{ done: true; sb: any }> {
  try {
    const r = await writeStoryboard(row, user, input, undefined, false, { timeoutMs: 34_000, deadlineMs: 40_000, maxTokens: 12_000 });
    if (r.done) {
      r.sb.notes = [...(r.sb.notes || []), 'Your script was broken down like a screenplay: spoken lines are said by the characters, actions are performed on screen, and thoughts are shown as pictures.'];
      return r;
    }
  } catch (e: any) {
    if (e instanceof HttpError && (e.code === 'LIMIT' || e.status === 403)) throw e;
    console.error('AI script breakdown failed, using the built-in reader:', e?.message || e);
  }
  return { done: true, sb: await adaptScriptLocally(row, user, input) };
}

/** Shortens text to at most `max` words, ending at a full sentence or clause where possible so nobody is cut off mid-thought. */
function fitText(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  const cut = words.slice(0, max).join(' ');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (end > cut.length * 0.4) return cut.slice(0, end + 1);
  const comma = cut.lastIndexOf(', ');
  if (comma > cut.length * 0.5) return `${cut.slice(0, comma)}.`;
  return `${cut.replace(/[,;:\s]+$/, '')}.`;
}

/** Splits a line at a sentence (or clause) boundary so the first piece takes at most `maxWords`. Returns null when there is no good place to split. */
function splitLine(text: string, maxWords: number): [string, string] | null {
  const words = text.trim().split(/\s+/);
  for (const re of [/[.!?]["']?$/, /[,;:]$/]) {
    for (let i = Math.min(maxWords, words.length - 1); i >= 3; i--) {
      if (re.test(words[i - 1])) return [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    }
  }
  return null;
}

/**
 * Lays dialogue out over the clips of a scene (one clip per 10 seconds) by how long it takes to say. A line that does not fit is split
 * at a sentence break and continues in the next clip, or moves there whole. Nothing is ever cut off in the middle of a sentence, and a
 * 20 second scene gives both of its clips something to say whenever it has two or more lines.
 */
type PackLine = { speaker: string; text: string; emotion?: string; doing?: string };
function packLines(lines: PackLine[], halves: number): (PackLine & { half: 1 | 2 })[] {
  const out: (PackLine & { half: 1 | 2 })[] = [];
  let half: 1 | 2 = 1;
  const inHalf = (h: number) => out.filter((l) => l.half === h);
  const queue: PackLine[] = lines.map((l) => ({ ...l, text: fitText(l.text, MAX_WORDS_PER_CLIP * halves) }));
  while (queue.length) {
    const l = queue.shift()!;
    const room = () => speechCap - speechSeconds(inHalf(half));
    if (speechSeconds([l]) <= room()) { out.push({ ...l, half }); continue; }
    if (half === 1 && halves === 2) {
      const fitWords = Math.max(0, Math.floor((room() - 0.5) * 2.3));
      const ws = l.text.trim().split(/\s+/);
      // best: split at a sentence or clause break; if there is none, split by words so the sentence simply carries on in the next clip
      const sp = fitWords >= 4 ? (splitLine(l.text, fitWords) || (fitWords >= 6 && ws.length > fitWords + 2 ? [ws.slice(0, fitWords).join(' '), ws.slice(fitWords).join(' ')] as [string, string] : null)) : null;
      if (sp) { out.push({ ...l, text: sp[0], half: 1 }); half = 2; queue.unshift({ ...l, text: sp[1] }); continue; }
      half = 2; queue.unshift(l); continue;
    }
    const fitWords = Math.max(0, Math.floor((room() - 0.5) * 2.3));
    if (fitWords >= 3 && !inHalf(half).length) out.push({ ...l, text: fitText(l.text, Math.min(MAX_WORDS_PER_CLIP, fitWords)), half });
    // otherwise this line does not fit in what is left of the scene and is dropped, rather than cutting someone off
  }
  if (halves === 2 && !inHalf(2).length && inHalf(1).length >= 2) out[out.length - 1].half = 2;
  return out;
}

/** Turns the writer's raw JSON into a checked storyboard: cast, scenes split into 10 second clips, and a ready render prompt for every clip. */
function finishStory(ctx: StoryCtx, d: any, input: StoryInput) {
  const { format, look, aspect, brief, continuity, plan, mood, cam, notes, available, script, castMin, presentation, silentCast } = ctx;
  const characters: { id: string; name: string; role: string; gender: 'male' | 'female'; voice: string; description: string; kind: 'human' | 'animal' | 'creature' }[] = [];
  const byName = new Map<string, number>();
  const addChar = (name: string, role = '', gender: string = 'male', description = '', voice = '', kind = '') => {
    const clean = str(name, 30); if (!clean || characters.length >= 6) return;
    const key = clean.toLowerCase(); if (byName.has(key)) return;
    byName.set(key, characters.length);
    characters.push({ id: `c${characters.length + 1}`, name: clean, role: str(role, 60), gender: gender === 'female' ? 'female' : 'male', voice: str(voice, 90), description: str(description, 400), kind: kind === 'animal' || kind === 'creature' ? kind : 'human' });
  };
  const modelChars: any[] = Array.isArray(d.characters) ? d.characters : [];
  if (continuity?.characters.length) {
    continuity.characters.forEach((c) => addChar(c.name, c.role, c.gender, c.description, (c as any).voice));
    modelChars.forEach((c: any) => addChar(c?.name, c?.role, c?.gender, c?.description, c?.voice, c?.kind));
  } else if (brief.characterLock) {
    const first = modelChars[0] || {};
    addChar(brief.characterLock.name || first.name || 'Protagonist', first.role || 'main character', first.gender, brief.characterLock.descriptor, first.voice, first.kind);
    modelChars.slice(1).forEach((c: any) => addChar(c?.name, c?.role, c?.gender, c?.description, c?.voice, c?.kind));
  } else modelChars.forEach((c: any) => addChar(c?.name, c?.role, c?.gender, c?.description, c?.voice, c?.kind));
  const protagonist = brief.characterLock || continuity?.characters.length ? characters[0] : undefined;

  const aspectHint = aspect === '9:16' ? 'Vertical 9:16 framing.' : aspect === '1:1' ? 'Square 1:1 framing.' : 'Wide 16:9 framing.';
  const beats = storyBeats(plan.scenes.length);
  const lockKey = brief.characterLock ? brief.characterLock.descriptor.toLowerCase().slice(0, 40) : '';
  const spokenFor = (ls: { speaker: string; text: string; emotion?: string; doing?: string }[]) => ls.map((l) => {
    const ch = characters.find((c) => c.name.toLowerCase() === l.speaker.toLowerCase());
    const v = ch?.voice || (ch?.gender === 'female' ? 'a female voice' : 'a male voice');
    const words = l.text.replace(/"/g, "'");
    const how = l.emotion ? `, ${l.emotion.replace(/[.\s]+$/, '')}` : '', act = l.doing ? ` while ${l.doing.replace(/^while\s+/i, '').replace(/[.\s]+$/, '')}` : '';
    return l.speaker.toLowerCase() === 'narrator' ? `A narrator, off screen, speaking in the voice of ${v}, says: "${words}"` : `${l.speaker}, speaking in the voice of ${v}${how}${act}, says: "${words}"`;
  }).join(' Then ');

  type Line = { speaker: string; text: string; half: 1 | 2; emotion?: string; doing?: string };
  const scenes: any[] = [];
  const narration = { narratorLines: 0 };
  const rawScenes: any[] = Array.isArray(d.scenes) ? d.scenes : [];
  for (let i = 0; i < plan.scenes.length && i < rawScenes.length; i++) {
    const sc = rawScenes[i], len = plan.scenes[i], halves = len / PART_SECONDS;

    // dialogue: structured lines first, then plain voiceover text read by the narrator
    let lines: Line[] = (Array.isArray(sc?.lines) ? sc.lines : []).map((l: any) => ({ speaker: str(l?.speaker, 30), text: str(l?.text, 260), emotion: str(l?.emotion, 30), doing: str(l?.doing, 70), half: Number(l?.half) === 2 ? 2 : 1 })).filter((l: any) => l.speaker && l.text);
    if (!lines.length && str(sc?.voiceoverText, 400)) lines = [{ speaker: 'Narrator', text: str(sc.voiceoverText, 260), half: 1 }];
    // dialogue amount and presentation decide who may speak
    if (presentation === 'narrated') lines = lines.map((l) => ({ ...l, speaker: 'Narrator' }));
    else if (brief.dialogue === 'none') lines = [];
    else if (brief.dialogue === 'minimal') lines = lines.slice(0, 1);
    lines.forEach((l) => { if (!byName.has(l.speaker.toLowerCase())) addChar(l.speaker); });
    lines = lines.filter((l) => byName.has(l.speaker.toLowerCase()));
    // What is SAID versus SHOWN: a line that only describes an action ("The lion fell.") is shown by the actors instead of being read out,
    // and narration is kept only for the opening, a jump in time or place, and the close.
    const refined = refineScene(lines as SpokenLine[], { sceneIndex: i, policy: { narratorCarriesStory: presentation === 'narrated', scenes: plan.scenes.length }, names: characters.map((c) => c.name), state: narration });
    lines = refined.lines as Line[];
    const shownText = shownInstruction(refined.shown);
    // lay the dialogue out over the clips by speaking time (the writer's own half tags are only a hint)
    lines = packLines(lines, halves);

    const vp = str(sc?.visualPrompt, 900) || str(sc?.setting, 300);
    if (vp.length < 10) continue;
    const visualCore = brief.characterLock && !vp.toLowerCase().includes(lockKey) ? `Main character, identical in every scene: ${brief.characterLock.descriptor}. ${vp}` : vp;
    const visualBase = shownText ? `${visualCore} ${shownText}` : visualCore;
    const soundText = str(sc?.sound, 160);
    const modelCam = str(sc?.cameraMotion, 220);
    const cameraMotion = modelCam.length >= 8 ? modelCam : cam.direct;
    const second = str(sc?.secondHalfAction, 400);

    const genreLook = GENRES[brief.genre]?.render, energy = presentation === 'movie' ? INTENSITIES[brief.intensity]?.render : '';
    const openers = {
      movie: 'Cinematic live-action movie scene with continuous physical action: the people are always moving and doing things, interacting with the place and each other, never posing, never facing the camera, never giving a speech.',
      dialogue: 'Cinematic dramatic scene with natural, believable acting: the people talk to each other in the place, with natural gestures and movement, never looking into the camera.',
      narrated: 'Cinematic film footage of the story with natural movement: nobody speaks on camera and no lips move.',
      shortdrama: 'Cinematic vertical short-drama scene with emotionally intense, believable acting: people confront each other in the place, with tight reaction close-ups, strong body language and movement, never looking into the camera.',
    } as const;
    const fixed = `${openers[presentation]} Camera: ${cameraMotion}. Mood and grade: ${mood.render}.${genreLook ? ` Genre look: ${genreLook}.` : ''}${energy ? ` Energy: ${energy}.` : ''} Visual look: ${look}. ${aspectHint} No text, captions or subtitles in the picture.`;
    const parts = [];
    for (let h = 1; h <= halves; h++) {
      const mine = lines.filter((l) => l.half === h);
      const tails = {
        movie: mine.length ? `Audio: the lines below are spoken inside the scene, in the middle of the action and never to the camera, with accurate lip sync and realistic sound effects (footsteps, impacts, wind, crashes, breathing). No music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: realistic sound effects and ambient sound of the action (footsteps, impacts, wind, crashes), no music, no speech.',
        dialogue: mine.length ? `Audio: clear natural spoken dialogue, unhurried and human, with accurate lip sync and matching room sound, no music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: natural room sound, no music, no speech.',
        shortdrama: mine.length ? `Audio: clear, emotional spoken dialogue delivered to the other person in the scene, with accurate lip sync and matching room sound, no music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: tense room sound and small realistic sounds, no music, no speech.',
        narrated: mine.length ? `Audio: a calm off-screen narrator reads the line below as a voice-over, over natural ambient sound. No music. Nobody on screen speaks. ${spokenFor(mine)}` : 'Audio: natural ambient sound, no music, no speech.',
      } as const;
      const tail = `${tails[presentation]}${soundText && h === 1 ? ` Sounds in this scene: ${soundText}.` : ''}`;
      const lead = h === 1 ? '' : `Continuing seamlessly from the previous moment, with no cut, in the same place and with the same characters: ${(second || 'the action carries on naturally and the moment develops').replace(/[.\s]+$/, '')}. `;
      // The second half starts from the first half's last picture, so it only describes the next beat. Repeating the opening description makes the video jump back.
      const visual = h === 1 ? str(visualBase, Math.max(200, RENDER_PROMPT_MAX - fixed.length - tail.length - lead.length - 4)) : 'The same people, place and light as in the picture it starts from.';
      parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt: `${lead}${visual} ${fixed} ${tail}`.slice(0, RENDER_PROMPT_MAX), lines: mine.map((l) => ({ speaker: l.speaker, text: l.text })) });
    }
    scenes.push({
      id: `s${scenes.length + 1}`, sceneId: `scene-${String(scenes.length + 1).padStart(2, '0')}`, sceneNumber: scenes.length + 1, beat: beats[i] || '',
      visualPrompt: str(visualBase, 900), secondHalfAction: second, voiceoverText: lines.map((l) => l.text).join(' '), cameraMotion, sound: soundText,
      lines: lines.map((l) => ({ speaker: l.speaker, text: l.text, half: l.half })), clipSeconds: len, parts,
    });
  }
  const need = Math.max(1, Math.ceil(plan.scenes.length * (script ? 0.34 : 0.67)));
  if (scenes.length < Math.min(need, plan.scenes.length)) throw new HttpError(424, `The script came back with ${scenes.length} usable scenes instead of ${plan.scenes.length}. Retrying.`, 'GEMINI');
  if (scenes.length < plan.scenes.length && !script) notes.push(`The writer returned ${scenes.length} of ${plan.scenes.length} planned scenes, so this part is shorter than requested.`);
  const total = sumSeconds(scenes.map((s) => s.clipSeconds));

  const used = new Set(scenes.flatMap((s) => s.lines.map((l: any) => l.speaker.toLowerCase())));
  if (protagonist) used.add(protagonist.name.toLowerCase());
  const cast = characters.filter((c) => silentCast || c.kind !== 'human' || used.has(c.name.toLowerCase())).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  // A small cast makes every script sound the same, so a part with too few voices is written again.
  if (!silentCast && !script && !continuity && scenes.length >= 2 && cast.length < Math.max(2, castMin - 1)) throw new HttpError(424, `The script only had ${cast.length} speaking characters, fewer than the ${castMin} it needs. Retrying with a bigger cast.`, 'GEMINI');
  return {
    success: true, title: str(d.title, 100) || 'Untitled production', logline: str(d.logline, 300), storySoFar: str(d.storySoFar, 900), format,
    remainingScript: script ? str(d.remainingScript, 20000) : '',
    brief: {
      durationMode: brief.durationMode, requestedSeconds: brief.requestedSeconds, targetSeconds: plan.targetSeconds, sceneSeconds: brief.sceneSeconds,
      mood: brief.mood, moodLabel: mood.label, cameraProfile: brief.cameraProfile, cameraLabel: cam.label, characterLock: brief.characterLock,
      presentation, presentationLabel: PRESENTATIONS[presentation].label, genre: brief.genre, genreLabel: GENRES[brief.genre].label, intensity: brief.intensity, dialogue: brief.dialogue, ending: brief.ending, endingLabel: ENDINGS[brief.ending].label,
      cast: brief.cast, castLabel: CASTS[brief.cast].label, animalsTalk: brief.animalsTalk, trope: brief.trope, tropeLabel: TROPES[brief.trope].label,
    },
    characters: cast, scenes, totalSeconds: total, secondsAvailable: available, notes,
    hashtags: (Array.isArray(d.hashtags) ? d.hashtags : []).map((h: any) => str(h, 40)).filter(Boolean).slice(0, 8), callToAction: str(d.callToAction, 200),
  };
}

const abVariations: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const data = await geminiJson(abPrompt({ idea: str(body.idea, 400), platform: str(body.platform || 'tiktok', 20), niche: str(body.niche || 'general', 80) }));
  if (!data?.variantA?.hook || !data?.variantB?.hook) throw new HttpError(424, 'The AI returned incomplete variants. Please try again.', 'GEMINI');
  json(res, 200, { success: true, ...data });
};

const competitorAnalysis: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const target = str(body.target, 200);
  if (target.length < 2) throw new HttpError(400, 'Enter a competitor handle or URL.');
  const data = await geminiJson(competitorPrompt({ target, platform: str(body.platform || 'tiktok', 20), niche: str(body.niche || 'general', 80) }), { grounded: true });
  json(res, 200, { success: true, ...data });
};

const outrank: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`ai:${row.id}`, 120, 3600);
  const hook = str(body.hook, 400), caption = str(body.caption, 2000);
  if (!hook && !caption) throw new HttpError(400, 'Paste the competitor hook or caption first.');
  const data = await geminiJson(outrankPrompt({ competitorName: str(body.competitorName || 'a competitor', 80), hook, caption, niche: str(body.niche || 'general', 80) }));
  json(res, 200, { success: true, ...data });
};

// ---------------------------------------------------------------- owner system check
const systemCheck: Handler = async ({ req, res }) => {
  const row = await currentUser(req);
  if (row.sub_status !== 'owner') throw new HttpError(403, 'Only the owner can run the system check.');
  type R = { name: string; ok: boolean; detail: string };
  const run = async (name: string, fn: () => Promise<string>): Promise<R> => {
    try { return { name, ok: true, detail: await fn() }; } catch (e: any) { return { name, ok: false, detail: e?.message || 'Failed' }; }
  };
  const need = (v: string) => { if (!process.env[v]) throw new Error(`${v} is not set in Vercel.`); return process.env[v] as string; };
  const timeout = () => AbortSignal.timeout(9000);
  const checks = await Promise.all([
    run('Database', async () => { await sql()`SELECT 1 AS ok`; return 'Connected.'; }),
    run('App URL & session secret', async () => {
      const u = need('APP_URL'); if (!u.startsWith('https://')) throw new Error('APP_URL must start with https://');
      if ((process.env.SESSION_SECRET || '').length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
      return `APP_URL ${u}`;
    }),
    run('Gemini (scripts, trends, A/B)', async () => { const r = await geminiRaw('Return exactly this JSON and nothing else: {"ok":true}'); return `Working. Model in use: ${r.model}.`; }),
    run('Gemini live web search (trends)', async () => {
      const r = await geminiRaw('Use Google Search. Return only this JSON: {"headline":"<one real tech news headline from this week>"}', { grounded: true });
      if (!r.grounded) throw new Error('Gemini answered without using live search, so trend research would be generic. Check that your Gemini key/plan allows Google Search grounding.');
      return `Working. ${r.sources.length} live sources returned (model ${r.model}).`;
    }),
    run('Voice-over (deAPI or fal.ai)', async () => { const a = await synthesize('Test.', 'pNInz6obpgDQGcFmaJgB', 'male'); return `Working. Generated ${a.audio.length} bytes of audio.`; }),
    run('fal.ai (video rendering)', async () => {
      const hit = lookupEnv('FAL_KEY'); if (!hit) throw new Error('No fal.ai key found in Vercel. Add it as FAL_KEY.'); const key = hit.value;
      const r = await fetch('https://queue.fal.run/fal-ai/minimax/video-01/requests/00000000-0000-0000-0000-000000000000/status', { headers: { Authorization: `Key ${key}` }, signal: timeout() });
      if (r.status === 401 || r.status === 403) throw new Error('fal.ai rejected the key. Check FAL_KEY and that your fal account has credit.');
      return 'Key accepted by fal.ai. (A real render is only charged when a customer generates a video.)';
    }),
    run('deAPI (backup / test video provider)', async () => {
      const hit = lookupEnv('DEAPI_API_KEY'); if (!hit) return 'Not set up (optional). Add DEAPI_API_KEY to test video with free credits.';
      const r = await fetch('https://api.deapi.ai/api/v2/account/balance', { headers: { Authorization: `Bearer ${hit.value}`, Accept: 'application/json' }, signal: timeout() });
      if (r.status === 401 || r.status === 403) throw new Error('deAPI rejected the key. Check DEAPI_API_KEY.');
      const d: any = await r.json().catch(() => ({}));
      return `${process.env.DEAPI_FRAMES ? 'Note: DEAPI_FRAMES is no longer used and can be deleted from Vercel. ' : ''}Key accepted by deAPI.${d?.data?.balance !== undefined ? ` Balance: ${d.data.balance}.` : ''} Active provider: ${(process.env.VIDEO_PROVIDER || 'fal').toLowerCase()}.`;
    }),
    run('AI writer backup (LLM_API_KEY)', async () => {
      const w = aiWriterStatus();
      if (!w.backupConfigured) return `Not set up (recommended). Gemini's free plan allows only a few requests a day, so add LLM_API_KEY (for example a free Groq key) so scripts never stop. ${w.geminiBlockedSeconds > 0 ? `Gemini is out of quota for about ${w.geminiBlockedSeconds} more seconds.` : ''}`.trim();
      return `Ready (${w.backupModel}). Scripts switch to it automatically when Gemini is out of quota.${w.geminiBlockedSeconds > 0 ? ` Gemini is resting for about ${w.geminiBlockedSeconds} seconds.` : ''}`;
    }),
    run('Resend (emails)', async () => {
      const key = lookupEnv('RESEND_API_KEY')?.value; if (!key) throw new Error('RESEND_API_KEY is not set in Vercel.'); const from = need('EMAIL_FROM');
      const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: timeout() });
      if (r.status === 401 || r.status === 403) return `Key present. It looks send-only, so the domain list can't be read. Sending from ${from}.`;
      const d: any = await r.json().catch(() => ({}));
      const domain = (from.match(/@([^>\s]+)/) || [])[1];
      const match = (d.data || []).find((x: any) => x.name === domain);
      if (!match) throw new Error(`The domain "${domain}" in EMAIL_FROM is not added in Resend.`);
      if (match.status !== 'verified') throw new Error(`The domain "${domain}" is in Resend but its status is "${match.status}". Finish the DNS verification.`);
      return `Domain ${domain} is verified.`;
    }),
    run('Flutterwave (payments)', async () => {
      const key = need('FLW_SECRET_KEY'); if (!/^FLWSECK/.test(key)) throw new Error('FLW_SECRET_KEY should start with FLWSECK (v3 secret key). Client ID / Client secret (v4) will not work.');
      need('FLW_SECRET_HASH');
      const ids = TIERS.flatMap((t) => (['monthly', 'annual'] as Cycle[]).map((c) => ({ t, c, id: planId(t, c) }))).filter((x) => x.id);
      if (!ids.length) throw new Error('No FLW_PLAN_* variables are set. Create plans in Flutterwave and add their IDs.');
      const out: string[] = [];
      for (const x of ids) { const p = await flw(`/payment-plans/${encodeURIComponent(x.id!)}`).catch(() => { throw new Error(`Plan ${x.id} (${x.t} ${x.c}) was not found. Is it in the same mode (Test/Live) as your secret key?`); }); out.push(`${x.t} ${x.c}: ${p.amount} ${p.currency}`); }
      return `Key accepted. Plans: ${out.join(' · ')}`;
    }),
    run('PostPeer (social publishing)', async () => {
      if (!ppConfigured()) return 'Not set up. Add POSTPEER_API_KEY in Vercel to connect social accounts.';
      await ppHealth();
      return 'Key accepted by PostPeer. Customers can connect their accounts.';
    }),
    run('Social networks (direct connect)', async () => {
      if (ppConfigured()) return 'Not needed: PostPeer is handling the connections.';
      const lines = PLATFORM_IDS.map((p) => `${PROVIDERS[p].name}: ${isConfigured(p) ? 'ready' : `missing ${PROVIDERS[p].idEnv} / ${PROVIDERS[p].secretEnv}`} · redirect ${redirectUri(appUrl(req), p)}`);
      if (!PLATFORM_IDS.some((p) => isConfigured(p))) throw new Error(`No social network is set up yet. ${lines.join(' | ')}`);
      return lines.join(' | ');
    }),
    run('Scheduled-post sender', async () => {
      if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is not set. Scheduled posts will not be sent until you set it and ping /api/cron/dispatch every few minutes (see docs/ENVIRONMENT.md).');
      return 'CRON_SECRET is set. Make sure something calls /api/cron/dispatch every 5 minutes.';
    }),
  ]);
  json(res, 200, { checks });
};

const tts: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`tts:${row.id}`, 400, 3600);
  const text = str(body.text, 2000);
  if (!text) throw new HttpError(400, 'Text is required.');
  const out = await synthesize(text, str(body.voiceId, 40), str(body.gender, 10));
  res.statusCode = 200; res.setHeader('Content-Type', out.type); res.setHeader('Cache-Control', 'private, max-age=3600'); res.end(out.audio);
};

// ---------------------------------------------------------------- video (fal.ai / deAPI queue)
/** Sends one clip to the configured video provider (VIDEO_PROVIDER: fal, deapi or auto) and returns its queue addresses. */
async function submitToProvider(prompt: string, reso: '480P' | '768P' | '1080P', seconds: 5 | 10, aspect: string): Promise<{ statusUrl: string; responseUrl: string }> {
  const provider = (process.env.VIDEO_PROVIDER || 'fal').trim().toLowerCase();
  const viaDeapi = async () => { const j = await deapiSubmit(prompt, reso, seconds, aspect); return { statusUrl: `deapi:${j.requestId}`, responseUrl: 'deapi' }; };
  const viaFal = async () => { const j = await falSubmit(prompt, reso, seconds); return { statusUrl: j.statusUrl, responseUrl: j.responseUrl }; };
  if (provider === 'deapi') return viaDeapi();
  if (provider === 'auto' && lookupEnv('DEAPI_API_KEY')) {
    try { return await viaFal(); } catch (e: any) { console.error('fal failed, switching to deAPI:', e?.message); return viaDeapi(); }
  }
  return viaFal();
}

const videoRender: Handler = async ({ req, res, body }) => {
  const { row, user } = await requireAccess(req);
  const prompt = str(body.prompt, 2400);
  if (prompt.length < 5) throw new HttpError(400, 'A video prompt is required.');
  const seconds: 5 | 10 = Number(body.seconds) === 10 ? 10 : 5;
  const aspect = ['9:16', '16:9', '1:1'].includes(String(body.aspect)) ? String(body.aspect) : '9:16';
  const used = (await sql()`SELECT COALESCE(sum(seconds), 0)::int AS secs FROM video_jobs WHERE user_id=${row.id} AND source = 'plan' AND status <> 'failed' AND created_at >= date_trunc('month', now())`) as any[];
  const planLeft = Math.max(0, user.secondsLimit - used[0].secs);
  const bonus = await topupBalance(row.id);
  let source = 'plan';
  if (seconds > planLeft) {
    if (seconds <= bonus) source = 'topup';
    else throw new HttpError(403, planLeft + bonus > 0 ? `You have ${planLeft + bonus} seconds of video left, so a ${seconds} second video will not fit. Choose a shorter length or buy more seconds.` : `You've used all your video seconds for this month. Buy extra seconds or upgrade your plan.`, 'LIMIT');
  }
  await rateLimit(`render:${row.id}`, 80, 3600);
  const job = await submitToProvider(prompt, PLANS[user.tier]?.resolution || '480P', seconds, aspect);
  const id = newId('job');
  await sql()`INSERT INTO video_jobs (id, user_id, status_url, response_url, seconds, source) VALUES (${id}, ${row.id}, ${job.statusUrl}, ${job.responseUrl}, ${seconds}, ${source})`;
  json(res, 200, { jobId: id });
};

/** Most scenes one production can have (2 minutes of 10 second clips). */
const MAX_BATCH_SCENES = 12;

/**
 * Render supervisor: starts every scene of a storyboard at the same time.
 *
 * - The whole batch is checked against the person's video seconds ONCE, before anything is sent. Separate parallel requests
 *   would each read the same "seconds used" number and could overspend the allowance together.
 * - All scenes are sent to the video provider with Promise.all. Each send catches its own error, so one failed scene never
 *   throws away the clips the provider already accepted (they would be billed but lost).
 * - Only scenes the provider accepted are recorded in video_jobs, so a failed scene never uses video seconds.
 * Reply: { jobs: [{ index, jobId } | { index, error }], accepted, failed }. The browser polls each jobId with /video/status.
 */
const videoRenderBatch: Handler = async ({ req, res, body }) => {
  const { row, user } = await requireAccess(req);
  const raw: any[] = Array.isArray(body.scenes) ? body.scenes : [];
  if (!raw.length) throw new HttpError(400, 'No scenes were given.');
  if (raw.length > MAX_BATCH_SCENES) throw new HttpError(400, `A production can have at most ${MAX_BATCH_SCENES} scenes.`);
  const scenes = raw.map((sc, index) => ({
    index, prompt: str(sc?.prompt, 2400), seconds: (Number(sc?.seconds) === 10 ? 10 : 5) as 5 | 10,
    aspect: ['9:16', '16:9', '1:1'].includes(String(sc?.aspect)) ? String(sc.aspect) : '9:16',
  }));
  const bad = scenes.find((s) => s.prompt.length < 5);
  if (bad) throw new HttpError(400, `Scene ${bad.index + 1} has no picture description.`);
  const jobs = await startSceneBatch(row, user, scenes);
  json(res, 200, { jobs, accepted: jobs.filter((j) => 'jobId' in j).length, failed: jobs.filter((j) => 'error' in j).length });
};

interface BatchScene { index: number; prompt: string; seconds: 5 | 10; aspect: string }
type BatchJob = { index: number; jobId: string } | { index: number; error: string };

/**
 * Checks the allowance once for the whole batch, sends every scene to the video provider at the same time (Promise.all),
 * and records the accepted scenes in video_jobs. Shared by the single-video flow and the series worker.
 */
async function startSceneBatch(row: any, user: ReturnType<typeof toUser>, scenes: BatchScene[]): Promise<BatchJob[]> {
  // Allowance: plan seconds are used first, then bought top-up seconds, exactly like single renders.
  const total = scenes.reduce((t, s) => t + s.seconds, 0);
  const used = (await sql()`SELECT COALESCE(sum(seconds), 0)::int AS secs FROM video_jobs WHERE user_id=${row.id} AND source = 'plan' AND status <> 'failed' AND created_at >= date_trunc('month', now())`) as any[];
  let planLeft = Math.max(0, user.secondsLimit - used[0].secs);
  let bonus = await topupBalance(row.id);
  if (total > planLeft + bonus) throw new HttpError(403, planLeft + bonus > 0 ? `You have ${planLeft + bonus} seconds of video left, but this production needs ${total}. Choose a shorter length or buy more seconds.` : `You've used all your video seconds for this month. Buy extra seconds or upgrade your plan.`, 'LIMIT');
  const sources: ('plan' | 'topup')[] = scenes.map((s) => {
    if (s.seconds <= planLeft) { planLeft -= s.seconds; return 'plan'; }
    bonus -= s.seconds; return 'topup';
  });
  for (let i = 0; i < scenes.length; i++) await rateLimit(`render:${row.id}`, 80, 3600); // every scene counts toward the hourly limit
  const reso = PLANS[user.tier]?.resolution || '480P';

  const results = await Promise.all(scenes.map(async (s, i) => {
    try {
      const job = await submitToProvider(s.prompt, reso, s.seconds, s.aspect);
      return { index: s.index, ok: true as const, job, source: sources[i], seconds: s.seconds };
    } catch (e: any) {
      console.error(`batch scene ${s.index + 1} failed to start:`, e?.message);
      return { index: s.index, ok: false as const, error: String(e?.message || 'The video engine could not start this scene.').slice(0, 300) };
    }
  }));

  const jobs: BatchJob[] = [];
  for (const r of results) {
    if (!r.ok) { jobs.push({ index: r.index, error: r.error }); continue; }
    const id = newId('job');
    await sql()`INSERT INTO video_jobs (id, user_id, status_url, response_url, seconds, source) VALUES (${id}, ${row.id}, ${r.job.statusUrl}, ${r.job.responseUrl}, ${r.seconds}, ${r.source})`;
    jobs.push({ index: r.index, jobId: id });
  }
  return jobs;
}

const videoStatus: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  const rows = (await sql()`SELECT * FROM video_jobs WHERE id=${query.get('id') || ''} AND user_id=${row.id}`) as any[];
  const j = rows[0];
  if (!j) throw new HttpError(404, 'Render job not found.');
  json(res, 200, await refreshJob(j));
};

/** Asks the video provider how one render job is doing and saves the answer. Finished jobs are answered from the database. */
async function refreshJob(j: any): Promise<{ state: string; videoUrl?: string; error?: string }> {
  if (j.status === 'done') return { state: 'done', videoUrl: j.video_url };
  if (j.status === 'failed') return { state: 'failed', error: j.error };
  const s: any = String(j.status_url).startsWith('deapi:') ? await deapiStatus(String(j.status_url).slice(6)) : await falStatus(j.status_url, j.response_url);
  if (s.state === 'done') await sql()`UPDATE video_jobs SET status='done', video_url=${s.videoUrl} WHERE id=${j.id}`;
  if (s.state === 'failed') await sql()`UPDATE video_jobs SET status='failed', error=${s.error} WHERE id=${j.id}`;
  return s;
}

// ---------------------------------------------------------------- Social networks (direct OAuth)
const socialAccounts: Handler = async ({ req, res }) => {
  const { row, user } = await requireAccess(req);
  json(res, 200, { accounts: await listSocialAccounts(row.id), limit: user.channelsLimit, provider: ppConfigured() ? 'postpeer' : 'direct' });
};

/** Pulls the customer's newly connected accounts in from PostPeer. */
const socialSync: Handler = async ({ req, res }) => {
  const { row, user } = await requireAccess(req);
  const added = ppConfigured() ? await ppSync(row.id, user.channelsLimit) : 0;
  json(res, 200, { added, accounts: await listSocialAccounts(row.id) });
};

/** Opens the network's own login + permission screen. */
const socialConnect: Handler = async ({ req, res, query }) => {
  const fail = (why: string) => redirect(res, `/?social=error&reason=${encodeURIComponent(why)}`);
  const uid = await sessionUserId(req);
  if (!uid) return redirect(res, '/');
  const p = query.get('platform');
  if (!isPlatform(p)) return fail('Unknown platform.');
  try {
    const { user } = await requireAccess(req);
    if (ppConfigured()) return redirect(res, await ppConnectUrl(uid, p));
    const { verifier, challenge, state } = socialPkce();
    const url = socialAuthorizeUrl(p, appUrl(req), state, challenge);
    setCookie(res, 'op_soc', await signBlob({ v: verifier, s: state, u: uid, p }), 900);
    redirect(res, url);
  } catch (e: any) { fail(e instanceof HttpError ? e.message : 'Could not start the connection.'); }
};

const socialCallback: Handler = async ({ req, res, query }) => {
  const p = query.get('platform');
  const fail = (why: string) => redirect(res, `/?social=error&platform=${encodeURIComponent(p || '')}&reason=${encodeURIComponent(why)}`);
  const blob = await readBlob(parseCookies(req)['op_soc']);
  setCookie(res, 'op_soc', '', 0);
  const uid = await sessionUserId(req);
  if (!isPlatform(p)) return fail('Unknown platform.');
  if (query.get('error')) return fail(/denied|cancel/i.test(`${query.get('error')} ${query.get('error_description') || ''}`) ? `You declined access on ${PROVIDERS[p].name}.` : `${PROVIDERS[p].name} returned an error.`);
  if (!blob || !uid || blob.u !== uid || blob.p !== p || blob.s !== query.get('state') || !query.get('code')) return fail('The connection attempt expired. Please try again.');
  try {
    const { user } = await requireAccess(req);
    const tokens = await exchangeSocialCode(p, query.get('code')!, appUrl(req), blob.v as string);
    await saveSocialConnection(uid, p, tokens, user.channelsLimit);
    redirect(res, `/?social=connected&platform=${p}`);
  } catch (e: any) { console.error('social callback', p, e); fail(e instanceof HttpError ? e.message : 'Could not complete the connection.'); }
};

const socialDisconnect: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  if (!isPlatform(body.platform)) throw new HttpError(400, 'Unknown platform.');
  if (ppConfigured()) await ppForget(row.id, body.platform);
  await removeSocialConnection(row.id, body.platform);
  json(res, 200, { ok: true });
};

const socialMetricsRoute: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  const ids = (query.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
  json(res, 200, { metrics: ids.length ? await socialMetrics(row.id, ids) : [] });
};

type PublishResult = { platform: string; name: string; ok: boolean; postId?: string; scheduled?: boolean; error?: string };

async function publishAll(userId: string, platforms: Platform[], post: { text: string; title: string; videoUrl?: string }): Promise<PublishResult[]> {
  const out: PublishResult[] = [];
  for (const p of platforms) {
    try { out.push({ platform: p, name: PROVIDERS[p].name, ok: true, postId: await publishToPlatform(userId, p, post) }); }
    catch (e: any) { out.push({ platform: p, name: PROVIDERS[p].name, ok: false, error: e?.message || 'Publishing failed.' }); }
  }
  return out;
}

const socialPublish: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`publish:${row.id}`, 60, 3600);
  const text = str(body.text, 5000), title = str(body.title || 'Your post', 120);
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(isPlatform).slice(0, 7) as Platform[];
  const videoUrl = typeof body.videoUrl === 'string' && /^https:\/\//.test(body.videoUrl) ? body.videoUrl : undefined;
  if (!text || !platforms.length) throw new HttpError(400, 'A caption and at least one connected channel are required.');
  const when = body.dueAt ? new Date(body.dueAt).getTime() : 0;
  if (body.mode === 'scheduled' && when > Date.now() + 60_000 && ppConfigured()) {
    // PostPeer holds the post and publishes it at the chosen time, so no timer of our own is needed.
    const results: PublishResult[] = [];
    for (const p of platforms) {
      try { results.push({ platform: p, name: PROVIDERS[p].name, ok: true, scheduled: true, postId: await ppPublish(row.id, p, { text, title, videoUrl }, new Date(when)) }); }
      catch (e: any) { results.push({ platform: p, name: PROVIDERS[p].name, ok: false, error: e?.message || 'Scheduling failed.' }); }
    }
    return json(res, 200, { results });
  }
  if (body.mode === 'scheduled' && when > Date.now() + 60_000) {
    await sql()`INSERT INTO scheduled_posts (id, user_id, platforms, text, title, video_url, due_at) VALUES (${newId('sp')}, ${row.id}, ${JSON.stringify(platforms)}::jsonb, ${text}, ${title}, ${videoUrl || null}, ${new Date(when).toISOString()})`;
    return json(res, 200, { results: platforms.map((p) => ({ platform: p, name: PROVIDERS[p].name, ok: true, scheduled: true })) });
  }
  const results = await publishAll(row.id, platforms, { text, title, videoUrl });
  const okNames = results.filter((r) => r.ok).map((r) => r.name);
  if (okNames.length) mail.published(row.email, row.name, title, okNames).catch((e) => console.error(e));
  json(res, 200, { results });
};

/** Sends scheduled posts that are due. Call it every ~5 minutes (Vercel Cron on Pro, or a free pinger such as cron-job.org). */
const cronDispatch: Handler = async ({ req, res, query }) => {
  const secret = process.env.CRON_SECRET;
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || query.get('key') || '';
  if (!secret || sha256(given) !== sha256(secret)) throw new HttpError(401, 'Unauthorized');
  const due = await sql()`UPDATE scheduled_posts SET status='running' WHERE id IN (
      SELECT id FROM scheduled_posts WHERE status='pending' AND due_at <= now() ORDER BY due_at LIMIT 10) RETURNING *`;
  for (const j of due) {
    const u = (await sql()`SELECT * FROM users WHERE id=${j.user_id}`)[0];
    if (!u || !toUser(u).hasAccess) { await sql()`UPDATE scheduled_posts SET status='failed', results=${JSON.stringify([{ ok: false, error: 'Subscription inactive.' }])}::jsonb WHERE id=${j.id}`; continue; }
    const results = await publishAll(j.user_id, (j.platforms || []).filter(isPlatform) as Platform[], { text: j.text, title: j.title, videoUrl: j.video_url || undefined });
    const ok = results.filter((r) => r.ok);
    await sql()`UPDATE scheduled_posts SET status=${ok.length ? 'done' : 'failed'}, results=${JSON.stringify(results)}::jsonb WHERE id=${j.id}`;
    if (ok.length) mail.published(u.email, u.name, j.title, ok.map((r) => r.name)).catch((e) => console.error(e));
  }
  // Safety net for series episodes: advance any that no browser has polled for two minutes (for example the tab was closed).
  let episodes = 0;
  const idle = (await sql()`SELECT e.*, p.user_id, p.title AS project_title, p.target_parts, p.auto_continue FROM episodes e JOIN projects p ON p.id = e.project_id
    WHERE e.status IN ('PROCESSING', 'RENDERING') AND e.updated_at < now() - interval '2 minutes' ORDER BY e.updated_at LIMIT 3`) as any[];
  const started = Date.now();
  for (const e of idle) {
    if (Date.now() - started > 35_000) break; // one cron call must stay inside the function time limit
    const u = ((await sql()`SELECT * FROM users WHERE id = ${e.user_id}`) as any[])[0];
    if (!u || !toUser(u).hasAccess) { await failEpisode(e.id, 'Your subscription is inactive.'); continue; }
    try { await advanceEpisode(u, toUser(u), e); episodes++; } catch (err: any) { console.error('cron episode step failed:', err?.message); }
  }
  json(res, 200, { processed: due.length, episodes });
};

// ---------------------------------------------------------------- downloads
const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'video';

async function jobVideoUrl(j: any): Promise<string> {
  // A finished scene already has its video address saved. Use it: asking the video provider again for every download
  // burns its status allowance (deAPI basic accounts get only a few hundred checks a day) and fails once the job record expires.
  if (j.status === 'done' && j.video_url) return String(j.video_url);
  let s: any;
  try { s = await refreshJob(j); }
  catch (e: any) {
    if (e instanceof HttpError && e.code === 'DEAPI') throw new HttpError(424, 'The video engine could not confirm this scene right now. Please try the download again in a minute.', 'DOWNLOAD');
    throw e;
  }
  if (s.state !== 'done' || !s.videoUrl) throw new HttpError(409, 'This scene is not ready yet. Please try again in a moment.');
  return String(s.videoUrl);
}

/** Sends one scene to the browser as a file download. */
const videoDownload: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  const j = ((await sql()`SELECT * FROM video_jobs WHERE id = ${query.get('id') || ''} AND user_id = ${row.id}`) as any[])[0];
  if (!j) throw new HttpError(404, 'Video not found.');
  const up = await fetch(await jobVideoUrl(j), { signal: AbortSignal.timeout(30_000) });
  if (!up.ok || !up.body) throw new HttpError(424, 'The video could not be fetched from the video engine.', 'DOWNLOAD');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(query.get('name') || 'scene')}.mp4"`);
  res.setHeader('Cache-Control', 'private, no-store');
  const len = up.headers.get('content-length'); if (len) res.setHeader('Content-Length', len);
  for await (const chunk of up.body as any) res.write(chunk);
  res.end();
};

/** Joins all scenes of a production into one MP4 and sends it as a download. */
const videoMerge: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`merge:${row.id}`, 12, 3600);
  const ids = (query.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 14);
  if (!ids.length) throw new HttpError(400, 'No scenes were given.');
  const urls: string[] = [];
  for (const id of ids) {
    const j = ((await sql()`SELECT * FROM video_jobs WHERE id = ${id} AND user_id = ${row.id}`) as any[])[0];
    if (!j) throw new HttpError(404, 'One of the scenes was not found.');
    urls.push(await jobVideoUrl(j));
  }
  await streamMergedVideo(res, urls, query.get('name') || 'omnipulse-video');
};

/** Joins the clips into one MP4 (fluent-ffmpeg concat) and streams it to the browser as a download. */
async function streamMergedVideo(res: Res, urls: string[], name: string) {
  let merged: { file: string; cleanup: () => Promise<void> };
  try { merged = await mergeClips(urls); }
  catch (e: any) {
    if (e?.message === 'NO_FFMPEG') throw new HttpError(424, 'Joining scenes is not available on this server yet. Download the scenes one by one for now.', 'NO_FFMPEG');
    console.error('merge failed', e?.message);
    throw new HttpError(424, e?.message || 'The scenes could not be joined.', 'MERGE');
  }
  try {
    const fsp = await import('node:fs/promises');
    const { createReadStream } = await import('node:fs');
    const size = (await fsp.stat(merged.file)).size;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(name)}.mp4"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await new Promise<void>((resolve, reject) => { const rs = createReadStream(merged.file); rs.on('error', reject); rs.on('end', () => resolve()); res.on('close', () => resolve()); rs.pipe(res); });
  } finally { await merged.cleanup(); }
}

// ---------------------------------------------------------------- series: projects, episodes and episodic memory
//
// A Project groups the Episodes (parts) of one story. Nothing slow runs inside the request that creates an episode:
//
//   POST /episodes/create   saves the episode as PROCESSING and answers at once (HTTP 202).
//   GET  /episodes/status   moves the episode forward by ONE bounded step and reports where it is. The browser polls it, and
//                           /cron/dispatch also calls it for episodes nobody is watching, so work never depends on one request.
//
//   PROCESSING  write the storyboard (Part 2+ reads Part N-1 from the database first)        -> RENDERING
//   RENDERING   send every scene to the video provider with Promise.all, then follow them    -> COMPLETED
//   COMPLETED   finalVideoUrl points at /episodes/video, which joins the scene clips with fluent-ffmpeg (-f concat,
//               +faststart) in its own request. FAILED keeps the reason in `error`; scenes that failed use no video seconds.
//
// Each step takes a short database lease (locked_until) before it works, so two polls can never run the same step twice, and a
// step that dies with its serverless instance is simply picked up again when the lease runs out.

const ACTIVE_STATUSES = ['PROCESSING', 'RENDERING'];
const MAX_SCRIPT_ATTEMPTS = 8;
const MAX_PART_TRIES = 3;
const EPISODE_TIMEOUT_MS = 3 * 3600_000;
const STEP_LEASE_SECONDS = 50;
const STEP_BUDGET_MS = 40_000;
const FIRST_CHECK_MS = 40_000; // a 10 second clip takes a while; asking sooner only wastes the provider's status allowance
const CHECK_EVERY_MS = 20_000;
const MAX_STARTS_PER_STEP = 4;

/** One 10 second clip of a scene, as saved in episodes.render_jobs. */
interface PartEntry { tries: number; jobId?: string; url?: string; error?: string; checkAt?: number; retryAt?: number }
/** One scene: a 10 second scene has one clip, a 20 second scene has two that follow each other. */
interface RenderEntry { index: number; parts: PartEntry[] }

/** The saved render state, rebuilt from the storyboard when it is missing or from an older layout. */
function normalizeEntries(raw: unknown, scenes: any[]): RenderEntry[] {
  const ok = Array.isArray(raw) && raw.length === scenes.length && raw.every((en: any, i: number) => Array.isArray(en?.parts) && en.parts.length === (scenes[i]?.parts?.length || 0));
  return ok ? (raw as RenderEntry[]) : scenes.map((sc, index) => ({ index, parts: (sc.parts || []).map(() => ({ tries: 0 })) }));
}

const jsonb = (v: unknown) => JSON.stringify(v);
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

async function loadOwnedEpisode(userId: string, id: string) {
  const r = (await sql()`SELECT e.*, p.user_id, p.title AS project_title, p.target_parts, p.auto_continue FROM episodes e JOIN projects p ON p.id = e.project_id WHERE e.id = ${id} AND p.user_id = ${userId}`) as any[];
  if (!r[0]) throw new HttpError(404, 'Episode not found.');
  return r[0];
}

/** What the browser sees of an episode. */
function episodeView(e: any) {
  const sb = e.storyboard_json || {};
  const scenes: any[] = Array.isArray(sb.scenes) ? sb.scenes : [];
  const entries = normalizeEntries(e.render_jobs, scenes);
  const partsTotal = entries.reduce((n, en) => n + en.parts.length, 0);
  const partsDone = entries.reduce((n, en) => n + en.parts.filter((p) => p.url).length, 0);
  const sceneStates = entries.map((en) => en.parts.every((p) => p.url) ? 'done'
    : en.parts.some((p) => !p.url && !p.jobId && p.tries >= MAX_PART_TRIES) ? 'failed'
    : en.parts.some((p) => p.jobId) ? 'rendering' : 'waiting');
  const cfg = e.brief || {};
  const note = e.status === 'PROCESSING' && Number(e.attempts) > 0
    ? (String(e.error || '').trim() || ((e.brief || {}).mode === 'paste' ? 'The AI helper could not finish that step. It will retry automatically.' : 'The AI writer could not finish that step. It will retry automatically.'))
    : e.status === 'RENDERING' && e.error ? String(e.error) : '';
  return {
    id: e.id as string, projectId: e.project_id as string, partNumber: e.part_number as number, status: e.status as string,
    promptInput: e.prompt_input as string, title: String(sb.title || ''), logline: String(sb.logline || ''), storySoFar: String(sb.storySoFar || ''),
    finalVideoUrl: (e.final_video_url as string | null) || null, error: e.status === 'FAILED' ? ((e.error as string | null) || 'This part could not be finished.') : null, note,
    createdAt: iso(e.created_at), updatedAt: iso(e.updated_at),
    totalScenes: scenes.length, renderedScenes: sceneStates.filter((s) => s === 'done').length, partsTotal, partsDone, sceneStates,
    totalSeconds: Number(sb.totalSeconds) || 0,
    mode: cfg.mode === 'paste' ? 'paste' : 'ai', hasRemainingScript: !!sb.remainingScript,
    targetParts: Number(e.target_parts) || 1, autoContinue: !!e.auto_continue,
    brief: e.brief || {},
    characters: (Array.isArray(sb.characters) ? sb.characters : []).map((c: any) => ({ name: String(c.name || ''), role: String(c.role || ''), gender: c.gender === 'female' ? 'female' : 'male', voice: String(c.voice || '') })),
    notes: Array.isArray(sb.notes) ? sb.notes.map(String) : [],
    scenes: scenes.map((sc) => ({
      sceneId: String(sc.sceneId || ''), sceneNumber: Number(sc.sceneNumber) || 0, beat: String(sc.beat || ''), clipSeconds: Number(sc.clipSeconds) || 0,
      visualPrompt: String(sc.visualPrompt || ''), voiceoverText: String(sc.voiceoverText || ''), cameraMotion: String(sc.cameraMotion || ''),
      lines: (Array.isArray(sc.lines) ? sc.lines : []).map((l: any) => ({ speaker: String(l.speaker || ''), text: String(l.text || '') })),
    })),
    // Finished clips in story order. A 20 second scene contributes its two clips one after the other, so every scene plays to its end.
    clips: e.status === 'COMPLETED' ? entries.flatMap((en) => en.parts.map((p) => p.url as string).filter(Boolean)) : [],
  };
}

/** The previous part's saved script, cast and ending: the episodic memory handed to the writer for Part 2 and later. */
async function buildContinuity(project: any, partNumber: number): Promise<SeriesContinuity> {
  const prev = ((await sql()`SELECT storyboard_json FROM episodes WHERE project_id = ${project.id} AND part_number = ${partNumber - 1} AND status = 'COMPLETED'`) as any[])[0];
  if (!prev) throw new HttpError(409, `Part ${partNumber - 1} is not finished, so Part ${partNumber} cannot continue from it.`, 'SERIES_ORDER');
  const sb = prev.storyboard_json || {};
  const scenes: any[] = Array.isArray(sb.scenes) ? sb.scenes : [];
  const last = scenes[scenes.length - 1] || {};
  const stored: any[] = Array.isArray(project.character_db?.characters) ? project.character_db.characters : (Array.isArray(sb.characters) ? sb.characters : []);
  return {
    partNumber,
    previousTitle: String(sb.title || ''), previousLogline: String(sb.logline || ''), storySoFar: String(sb.storySoFar || ''),
    endingScene: { visualPrompt: String(last.visualPrompt || ''), voiceoverText: String(last.voiceoverText || '') },
    characters: stored.map((c) => ({ name: str(c?.name, 30), role: str(c?.role, 60), gender: c?.gender === 'female' ? 'female' : 'male', voice: str(c?.voice, 90), description: str(c?.description, 400) })).filter((c) => c.name),
  };
}

const episodeCreate: Handler = async ({ req, res, body }) => {
  const { row, user } = await requireAccess(req);
  await rateLimit(`series:${row.id}`, 30, 3600);
  const mode: 'ai' | 'paste' = body.mode === 'paste' ? 'paste' : 'ai';
  const script = mode === 'paste' ? str(body.script, 20000) : '';
  const direction = str(body.direction, 800);
  let projectId = str(body.projectId, 80);
  if (mode === 'paste' && !projectId && script.length < 40) throw new HttpError(400, 'Paste your script first (at least a few lines).');
  const fallbackIdea = mode === 'paste' ? (str(body.title, 100) || script.slice(0, 160) || 'Continue with the saved script.') : (str(body.idea, 800) || direction || (projectId ? 'Continue the story from where the last part ended.' : ''));
  const input = parseStoryInput({ ...body, idea: fallbackIdea.length >= 10 ? fallbackIdea : `${fallbackIdea} (the story)` });
  if ((await secondsAvailable(row, user)) < PART_SECONDS) throw new HttpError(403, 'You have no video seconds left. Buy extra seconds or upgrade your plan.', 'LIMIT');

  let partNumber = 1;
  let createdProject = false;
  if (projectId) {
    const project = ((await sql()`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${row.id}`) as any[])[0];
    if (!project) throw new HttpError(404, 'Project not found.');
    const active = (await sql()`SELECT part_number FROM episodes WHERE project_id = ${projectId} AND status IN ('PROCESSING', 'RENDERING') LIMIT 1`) as any[];
    if (active.length) throw new HttpError(409, `Part ${active[0].part_number} is still being made. Wait for it to finish before starting the next part.`, 'SERIES_BUSY');
    await sql()`DELETE FROM episodes WHERE project_id = ${projectId} AND status = 'FAILED' AND render_jobs IS NULL`; // a failed part with no finished clips gives its number back; ones with clips are kept so they can be retried
    const last = (await sql()`SELECT COALESCE(max(part_number), 0)::int AS n FROM episodes WHERE project_id = ${projectId}`) as any[];
    partNumber = last[0].n + 1;
  } else {
    projectId = newId('prj');
    const parts = Math.max(1, Math.min(10, Math.round(Number(body.series?.parts)) || 1));
    const auto = body.series?.deliver === 'all' && parts > 1;
    await sql()`INSERT INTO projects (id, user_id, title, genre, target_parts, auto_continue) VALUES (${projectId}, ${row.id}, ${str(body.title, 100)}, ${STORY_MOODS[input.brief.mood].label}, ${parts}, ${auto})`;
    createdProject = true;
  }

  const episodeId = newId('ep');
  const settings = { format: input.format, look: input.look, aspect: input.aspect, niche: input.niche, brief: input.brief, mode, script, direction };
  try {
    await sql()`INSERT INTO episodes (id, project_id, part_number, prompt_input, status, brief) VALUES (${episodeId}, ${projectId}, ${partNumber}, ${input.idea}, 'PROCESSING', ${jsonb(settings)}::jsonb)`;
  } catch (e: any) {
    if (createdProject) await sql()`DELETE FROM projects WHERE id = ${projectId}`;
    if (e?.code === '23505') throw new HttpError(409, 'Another part of this project was just started. Please refresh.', 'SERIES_BUSY');
    throw e;
  }
  await sql()`UPDATE projects SET updated_at = now() WHERE id = ${projectId}`;
  json(res, 202, { projectId, episodeId, partNumber, status: 'PROCESSING' });
};

async function failEpisode(id: string, message: string) {
  await sql()`UPDATE episodes SET status = 'FAILED', error = ${message.slice(0, 400)}, locked_until = NULL, updated_at = now() WHERE id = ${id} AND status IN ('PROCESSING', 'RENDERING')`;
}

/** PROCESSING: writes this part's storyboard, in as many bounded steps as it needs. Part 2 and later get the previous part's memory first. */
async function stageScript(row: any, user: ReturnType<typeof toUser>, ep: any) {
  const project = ((await sql()`SELECT * FROM projects WHERE id = ${ep.project_id}`) as any[])[0];
  const cfg = ep.brief || {};
  let brief = parseStoryBrief(cfg.brief || {});
  const continuity = ep.part_number > 1 ? await buildContinuity(project, ep.part_number) : undefined;
  const lead = continuity?.characters[0];
  if (lead && !brief.characterLock && lead.description.length >= 10) brief = { ...brief, characterLock: { name: lead.name, descriptor: lead.description } };

  // Pasted script: use what was pasted, or carry on with what was left over from the last part.
  let script = cfg.mode === 'paste' ? String(cfg.script || '') : '';
  if (cfg.mode === 'paste' && !script.trim() && ep.part_number > 1) {
    const prev = ((await sql()`SELECT storyboard_json FROM episodes WHERE project_id = ${ep.project_id} AND part_number = ${ep.part_number - 1}`) as any[])[0];
    script = String(prev?.storyboard_json?.remainingScript || '');
    if (!script.trim()) throw new HttpError(409, 'There is no saved script left to continue. Paste more of your script, or ask the AI to write the next part.', 'SERIES_STATE');
  }
  const storyInput: StoryInput = { idea: ep.prompt_input, format: cfg.format || 'drama', look: cfg.look || 'cinematic', aspect: cfg.aspect || '9:16', niche: cfg.niche || 'general audience', brief, continuity, script };
  // A pasted script never waits for the AI: it is split into scenes right here and the video starts at once.
  const out: Awaited<ReturnType<typeof writeStoryboard>> = script.trim()
    ? await adaptPastedScript(row, user, storyInput)
    : await writeStoryboard(row, user, storyInput, ep.storyboard_json?.draft);
  if ('draft' in out) {
    await sql()`UPDATE episodes SET storyboard_json = ${jsonb({ draft: out.draft })}::jsonb, attempts = 0, updated_at = now() WHERE id = ${ep.id} AND status = 'PROCESSING'`;
    return;
  }
  const sb = (out as { sb: any }).sb;
  await sql()`UPDATE episodes SET storyboard_json = ${jsonb(sb)}::jsonb, status = 'RENDERING', render_jobs = NULL, error = NULL, attempts = 0, updated_at = now() WHERE id = ${ep.id} AND status = 'PROCESSING'`;
  await sql()`UPDATE projects SET title = CASE WHEN title = '' THEN ${str(sb.title, 100)} ELSE title END, updated_at = now() WHERE id = ${ep.project_id}`;
}

/** Chooses where the seconds for one clip come from (plan first, then bought extras) or throws a LIMIT error when there are none. */
async function reserveSource(row: any, user: ReturnType<typeof toUser>, seconds: number): Promise<'plan' | 'topup'> {
  const used = (await sql()`SELECT COALESCE(sum(seconds), 0)::int AS secs FROM video_jobs WHERE user_id=${row.id} AND source = 'plan' AND status <> 'failed' AND created_at >= date_trunc('month', now())`) as any[];
  const planLeft = Math.max(0, user.secondsLimit - used[0].secs), bonus = await topupBalance(row.id);
  if (seconds <= planLeft) return 'plan';
  if (seconds <= bonus) return 'topup';
  throw new HttpError(403, planLeft + bonus > 0 ? `You have ${planLeft + bonus} video seconds left, which is not enough for the rest of this part. Buy extra seconds or upgrade, then tap Retry. Finished clips are kept.` : 'You have used all your video seconds. Buy extra seconds or upgrade your plan, then tap Retry. Finished clips are kept.', 'LIMIT');
}

/**
 * Starts one 10 second clip. The second half of a 20 second scene starts from the last picture of the first half (image-to-video),
 * so the scene carries on without a jump; if that is not possible it falls back to a normal clip with a "continue" prompt.
 */
async function startPart(row: any, user: ReturnType<typeof toUser>, spec: { prompt: string; aspect: string; kind: 'text' | 'continue'; prevUrl?: string }) {
  const source = await reserveSource(row, user, PART_SECONDS);
  await rateLimit(`render:${row.id}`, 300, 3600);
  const reso = PLANS[user.tier]?.resolution || '480P';
  let job: { statusUrl: string; responseUrl: string } | undefined;
  if (spec.kind === 'continue' && spec.prevUrl && (process.env.VIDEO_PROVIDER || 'fal').trim().toLowerCase() === 'deapi') {
    try {
      const frame = await lastFrameJpeg(spec.prevUrl);
      const j = await deapiAnimate(spec.prompt, frame, reso, PART_SECONDS, spec.aspect);
      job = { statusUrl: `deapi:${j.requestId}`, responseUrl: 'deapi' };
    } catch (e: any) {
      if (e instanceof RateLimited) throw e;
      console.error('image-to-video failed, using a normal clip instead:', e?.message);
    }
  }
  if (!job) job = await submitToProvider(spec.prompt, reso, PART_SECONDS, spec.aspect);
  const id = newId('job');
  await sql()`INSERT INTO video_jobs (id, user_id, status_url, response_url, seconds, source) VALUES (${id}, ${row.id}, ${job.statusUrl}, ${job.responseUrl}, ${PART_SECONDS}, ${source})`;
  return { jobId: id };
}

/**
 * RENDERING: moves every clip forward by one bounded step.
 *  1. Follow clips that are running (each is asked about at most every 20 seconds).
 *  2. Start clips that are ready, one after the other, never all at once. When the video engine says "too many requests" we stop and
 *     wait exactly as long as it asks. That wait is not a failure and does not use up a try.
 * Finished clips are kept for ever, so a retry only renders what is missing. Returns how many seconds to wait before the next step.
 */
async function stageRender(row: any, user: ReturnType<typeof toUser>, ep: any): Promise<{ wait: number }> {
  const scenes: any[] = Array.isArray(ep.storyboard_json?.scenes) ? ep.storyboard_json.scenes : [];
  if (!scenes.length) throw new HttpError(409, 'This episode has no scenes to render.', 'SERIES_STATE');
  const aspect = String(ep.brief?.aspect || '9:16');
  const entries = normalizeEntries(ep.render_jobs, scenes);
  const t0 = Date.now(), left = () => STEP_BUDGET_MS - (Date.now() - t0);
  const save = () => sql()`UPDATE episodes SET render_jobs = ${jsonb(entries)}::jsonb, updated_at = now() WHERE id = ${ep.id} AND status = 'RENDERING'`;
  let wait = 0;
  let note: string | null = null;

  // 1. follow the clips that are running
  for (const en of entries) for (const p of en.parts) {
    if (!p.jobId || p.url || (p.checkAt || 0) > Date.now()) continue;
    if (left() < 6_000) break;
    const j = ((await sql()`SELECT * FROM video_jobs WHERE id = ${p.jobId} AND user_id = ${row.id}`) as any[])[0];
    if (!j) { p.error = 'The render record is missing.'; delete p.jobId; p.retryAt = Date.now() + 5_000; continue; }
    try {
      const st = await refreshJob(j);
      if (st.state === 'done' && st.videoUrl) { p.url = st.videoUrl; delete p.error; }
      else if (st.state === 'failed') { p.error = st.error || 'The video engine could not render this clip.'; delete p.jobId; p.retryAt = Date.now() + 10_000; }
      else p.checkAt = Date.now() + CHECK_EVERY_MS;
    } catch (e: any) { console.error(`episode ${ep.id} status check failed:`, e?.message); p.checkAt = Date.now() + CHECK_EVERY_MS; } // provider hiccup: ask again later
  }

  // 2. start the clips that are ready, one by one
  let started = 0;
  outer: for (const en of entries) for (let k = 0; k < en.parts.length; k++) {
    const p = en.parts[k];
    if (p.jobId || p.url || p.tries >= MAX_PART_TRIES || (p.retryAt || 0) > Date.now()) continue;
    if (k > 0 && !en.parts[k - 1].url) continue; // the second half starts from the first half's last picture
    if (started >= MAX_STARTS_PER_STEP || left() < 14_000) break outer;
    try {
      const { jobId } = await startPart(row, user, { prompt: scenes[en.index].parts[k].prompt, aspect, kind: k === 0 ? 'text' : 'continue', prevUrl: k > 0 ? en.parts[k - 1].url : undefined });
      p.jobId = jobId; p.tries += 1; p.checkAt = Date.now() + FIRST_CHECK_MS; delete p.error; started++;
    } catch (e: any) {
      if (e instanceof RateLimited) {
        wait = e.daily ? 900 : Math.max(10, Math.min(e.retryAfter + 2, 120));
        note = e.daily ? e.message : `Waiting for the video engine's rate limit (about ${Math.round(wait)} seconds). Free video accounts allow one new clip a minute, so this is normal. Nothing is lost.`;
        break outer;
      }
      if (e instanceof HttpError && [400, 402, 403, 409].includes(e.status)) { await save(); throw e; }
      p.tries += 1; p.error = String(e?.message || 'Could not start this clip.').slice(0, 300); p.retryAt = Date.now() + 15_000;
    }
  }
  await save();

  if (entries.every((en) => en.parts.every((p) => p.url))) { await completeEpisode(ep, entries); return { wait: 0 }; }
  const running = entries.some((en) => en.parts.some((p) => p.jobId && !p.url));
  const dead = entries.flatMap((en) => en.parts.map((p, k) => ({ en, k, p }))).find((x) => !x.p.url && !x.p.jobId && x.p.tries >= MAX_PART_TRIES);
  if (dead && !running) {
    await failEpisode(ep.id, `Scene ${dead.en.index + 1} could not be rendered${dead.p.error ? `: ${dead.p.error.replace(/[.\s]+$/, '')}.` : '.'} Clips that finished are kept. Tap Retry to render only the missing ones. Clips that failed do not use your video seconds.`);
    return { wait: 0 };
  }
  await sql()`UPDATE episodes SET error = ${note}, updated_at = now() WHERE id = ${ep.id} AND status = 'RENDERING'`;
  return { wait };
}

/** Marks the episode COMPLETED, saves its cast into the project, and (when the series is being made all at once) starts the next part. */
async function completeEpisode(ep: any, _entries: RenderEntry[]) {
  const project = ((await sql()`SELECT character_db, target_parts, auto_continue FROM projects WHERE id = ${ep.project_id}`) as any[])[0];
  const known: any[] = Array.isArray(project?.character_db?.characters) ? project.character_db.characters : [];
  const cast = [...known];
  for (const c of (Array.isArray(ep.storyboard_json?.characters) ? ep.storyboard_json.characters : [])) {
    if (c?.name && !cast.some((k) => String(k.name).toLowerCase() === String(c.name).toLowerCase())) cast.push({ name: c.name, role: c.role || '', gender: c.gender === 'female' ? 'female' : 'male', voice: c.voice || '', description: c.description || '' });
  }
  await sql()`UPDATE projects SET character_db = ${jsonb({ characters: cast })}::jsonb, updated_at = now() WHERE id = ${ep.project_id}`;
  const done = (await sql()`UPDATE episodes SET status = 'COMPLETED', final_video_url = ${`/api/episodes/video?id=${ep.id}`}, error = NULL, locked_until = NULL, updated_at = now() WHERE id = ${ep.id} AND status = 'RENDERING' RETURNING id`) as any[];
  // "Make the whole series now": the next part is queued by itself, carrying on with the saved script if there is one, otherwise with the AI.
  if (done.length && project?.auto_continue && ep.part_number < Number(project.target_parts)) {
    const cfg = ep.brief || {};
    const remainder = !!ep.storyboard_json?.remainingScript;
    const next = ep.part_number + 1, last = next === Number(project.target_parts);
    const idea = remainder ? 'Continue with the saved script.' : `Part ${next} of ${project.target_parts}: carry the story forward and raise the stakes${last ? '. This is the final part, so bring every thread to a satisfying ending' : ''}.`;
    await sql()`INSERT INTO episodes (id, project_id, part_number, prompt_input, status, brief) VALUES (${newId('ep')}, ${ep.project_id}, ${next}, ${idea}, 'PROCESSING', ${jsonb({ ...cfg, mode: remainder ? 'paste' : 'ai', script: '', direction: '' })}::jsonb) ON CONFLICT DO NOTHING`;
  }
}

/** Moves one episode forward by one bounded step. Safe to call from many places at once. Returns the episode row as it is afterwards. */
async function advanceEpisode(row: any, user: ReturnType<typeof toUser>, ep: any): Promise<any> {
  const reload = async () => ((await sql()`SELECT e.*, p.user_id, p.title AS project_title, p.target_parts, p.auto_continue FROM episodes e JOIN projects p ON p.id = e.project_id WHERE e.id = ${ep.id}`) as any[])[0];
  if (!ACTIVE_STATUSES.includes(ep.status)) return ep;
  if (Date.now() - new Date(ep.created_at).getTime() > EPISODE_TIMEOUT_MS) {
    await failEpisode(ep.id, 'This part took too long and was stopped. Clips that finished are kept: tap Retry to render only the missing ones.');
    return reload();
  }
  const claimed = (await sql()`UPDATE episodes SET locked_until = now() + ${STEP_LEASE_SECONDS}::int * interval '1 second', updated_at = now()
    WHERE id = ${ep.id} AND status = ${ep.status} AND (locked_until IS NULL OR locked_until < now()) RETURNING *`) as any[];
  if (!claimed.length) return reload(); // another request is already working on this step
  const cur = { ...claimed[0], project_title: ep.project_title };
  try {
    let wait = 0;
    if (cur.status === 'PROCESSING') await stageScript(row, user, cur);
    else wait = (await stageRender(row, user, cur)).wait;
    if (wait > 0) await sql()`UPDATE episodes SET locked_until = now() + ${Math.round(wait)}::int * interval '1 second' WHERE id = ${ep.id} AND status IN ('PROCESSING', 'RENDERING')`;
    else await sql()`UPDATE episodes SET locked_until = NULL WHERE id = ${ep.id} AND status IN ('PROCESSING', 'RENDERING')`;
  } catch (e: any) {
    console.error(`episode ${ep.id} (${cur.status}) step failed:`, e?.message);
    const attempts = (cur.attempts || 0) + 1;
    const permanent = e instanceof HttpError && [400, 402, 403, 409].includes(e.status);
    if (permanent || attempts >= MAX_SCRIPT_ATTEMPTS) await failEpisode(ep.id, String(e?.message || 'Something went wrong while making this part.'));
    else { const pause = Math.min(45, 4 * 2 ** (attempts - 1)); const reason = String(e?.message || 'The AI provider failed without a message.').replace(/[\r\n]+/g, ' ').slice(0, 260); await sql()`UPDATE episodes SET attempts = ${attempts}, error = ${reason}, locked_until = now() + ${pause}::int * interval '1 second' WHERE id = ${ep.id} AND status = ${cur.status}`; } // preserve the actual cause for the UI while retrying
  }
  return reload();
}

/** Puts a failed part back to work. Finished clips stay; only what is missing is made again. */
const episodeRetry: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  const ep = await loadOwnedEpisode(row.id, str(body.id, 80));
  if (ep.status !== 'FAILED') throw new HttpError(409, 'Only a part that stopped can be retried.', 'SERIES_STATE');
  const scenes: any[] = Array.isArray(ep.storyboard_json?.scenes) ? ep.storyboard_json.scenes : [];
  if (!scenes.length) {
    await sql()`UPDATE episodes SET status = 'PROCESSING', error = NULL, attempts = 0, locked_until = NULL, updated_at = now() WHERE id = ${ep.id}`;
  } else {
    const entries = normalizeEntries(ep.render_jobs, scenes);
    entries.forEach((en) => en.parts.forEach((p) => { if (!p.url) { p.tries = 0; delete p.error; delete p.jobId; delete p.retryAt; delete p.checkAt; } }));
    await sql()`UPDATE episodes SET status = 'RENDERING', render_jobs = ${jsonb(entries)}::jsonb, error = NULL, attempts = 0, locked_until = NULL, created_at = now(), updated_at = now() WHERE id = ${ep.id}`;
  }
  json(res, 200, { ok: true });
};

const episodeStop: Handler = async ({ req, res, body }) => {
  const { row } = await requireAccess(req);
  const id = str(body.id, 80);
  const ep = await loadOwnedEpisode(row.id, id);
  if (!ACTIVE_STATUSES.includes(ep.status)) {
    json(res, 200, { ok: true, stopped: false, status: ep.status, message: 'This process is no longer running.' });
    return;
  }
  const stopped = (await sql()`UPDATE episodes SET status = 'FAILED', error = 'Stopped by you. Finished clips are kept; tap Resume to continue later.', locked_until = NULL, updated_at = now() WHERE id = ${id} AND status IN ('PROCESSING', 'RENDERING') RETURNING id`) as any[];
  json(res, 200, { ok: true, stopped: stopped.length > 0, status: stopped.length ? 'FAILED' : 'PROCESSING' });
};

const episodeStatus: Handler = async ({ req, res, query }) => {
  const { row, user } = await requireAccess(req);
  const ep = await loadOwnedEpisode(row.id, query.get('id') || '');
  json(res, 200, { episode: episodeView(await advanceEpisode(row, user, ep)) });
};

const projectsList: Handler = async ({ req, res }) => {
  const { row } = await requireAccess(req);
  const rows = (await sql()`SELECT p.id, p.title, p.genre, p.created_at, p.updated_at,
      COALESCE(json_agg(json_build_object('id', e.id, 'partNumber', e.part_number, 'status', e.status, 'title', e.storyboard_json->>'title') ORDER BY e.part_number) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS episodes
    FROM projects p LEFT JOIN episodes e ON e.project_id = p.id WHERE p.user_id = ${row.id} GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 50`) as any[];
  json(res, 200, { projects: rows.map((p) => ({ id: p.id, title: p.title || 'Untitled series', genre: p.genre, createdAt: iso(p.created_at), updatedAt: iso(p.updated_at), episodes: p.episodes })) });
};

const projectGet: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  const project = ((await sql()`SELECT * FROM projects WHERE id = ${query.get('id') || ''} AND user_id = ${row.id}`) as any[])[0];
  if (!project) throw new HttpError(404, 'Project not found.');
  const eps = ((await sql()`SELECT e.*, p.user_id, p.title AS project_title, p.target_parts, p.auto_continue FROM episodes e JOIN projects p ON p.id = e.project_id WHERE e.project_id = ${project.id} ORDER BY e.part_number`) as any[]).map(episodeView);
  const lastDone = [...eps].reverse().find((e) => e.status === 'COMPLETED');
  const active = eps.find((e) => ACTIVE_STATUSES.includes(e.status));
  json(res, 200, {
    project: { id: project.id, targetParts: Number(project.target_parts) || 1, autoContinue: !!project.auto_continue, title: project.title || 'Untitled series', genre: project.genre, createdAt: iso(project.created_at), updatedAt: iso(project.updated_at), characters: project.character_db?.characters || [] },
    episodes: eps,
    // A failed part gives its number back (episodeCreate removes it), so only parts that still count are used here.
    nextPartNumber: (eps.filter((e) => e.status !== 'FAILED').reduce((m, e) => Math.max(m, e.partNumber), 0)) + 1,
    activeEpisodeId: active?.id || null,
    // The page shows this as "where you left off" and starts the next part with the same look and settings.
    recap: lastDone ? { partNumber: lastDone.partNumber, title: lastDone.title, logline: lastDone.logline, storySoFar: lastDone.storySoFar, hasRemainingScript: lastDone.hasRemainingScript, scenes: lastDone.scenes } : null,
    defaults: (lastDone || eps[eps.length - 1])?.brief || null,
  });
};

/** Downloads the whole episode as one MP4: the scene clips are joined by fluent-ffmpeg in this request, not while the episode is being made. */
const episodeVideo: Handler = async ({ req, res, query }) => {
  const { row } = await requireAccess(req);
  await rateLimit(`merge:${row.id}`, 12, 3600);
  const ep = await loadOwnedEpisode(row.id, query.get('id') || '');
  if (ep.status !== 'COMPLETED') throw new HttpError(409, 'This part is not finished yet.', 'SERIES_STATE');
  const scenes: any[] = Array.isArray(ep.storyboard_json?.scenes) ? ep.storyboard_json.scenes : [];
  const ids = normalizeEntries(ep.render_jobs, scenes).flatMap((en) => en.parts.map((p) => p.jobId).filter(Boolean)) as string[];
  if (!ids.length) throw new HttpError(409, 'This part has no scene clips.', 'SERIES_STATE');
  const urls = await Promise.all(ids.map(async (id) => {
    const j = ((await sql()`SELECT * FROM video_jobs WHERE id = ${id} AND user_id = ${row.id}`) as any[])[0];
    if (!j) throw new HttpError(404, 'One of the clips was not found.');
    return jobVideoUrl(j);
  }));
  await streamMergedVideo(res, urls, `${ep.project_title || 'series'} part ${ep.part_number}`);
};

// ---------------------------------------------------------------- router
const routes: Record<string, Handler> = {
  'POST /auth/register': register, 'POST /auth/verify': verifyEmail, 'POST /auth/resend': resend, 'POST /auth/login': login,
  'POST /auth/reset': resetPassword, 'POST /auth/owner-access': ownerAccess, 'GET /auth/me': me,
  'POST /auth/logout': async ({ res }) => { endSession(res); json(res, 200, { ok: true }); },
  'GET /billing/plans': plans, 'POST /gemini/generate-story': generateStory, 'POST /video/render-batch': videoRenderBatch, 'POST /billing/checkout': checkout, 'POST /billing/trial': trialCheckout, 'POST /billing/topup': topupCheckout, 'GET /billing/extras': billingExtras, 'GET /billing/verify': billingVerify,
  'POST /billing/cancel': cancelBilling, 'POST /billing/webhook': webhook,
  'GET /account/usage': usage, 'PUT /account/profile': updateProfile, 'POST /account/password': changePassword,
  'GET /account/export': exportData, 'POST /account/delete': deleteAccount,
  'GET /dashboard': getDashboard, 'PUT /dashboard': putDashboard,
  'POST /gemini/generate-script': genScript, 'POST /gemini/research-trends': researchTrends, 'POST /tts': tts,
  'POST /gemini/ab-variations': abVariations, 'POST /gemini/competitor-analysis': competitorAnalysis, 'POST /gemini/outrank': outrank,
  'POST /video/render': videoRender, 'GET /video/status': videoStatus,
  'GET /social/accounts': socialAccounts, 'POST /social/sync': socialSync, 'GET /video/download': videoDownload, 'GET /video/merge': videoMerge, 'GET /social/connect': socialConnect, 'GET /social/callback': socialCallback,
  'POST /social/disconnect': socialDisconnect, 'GET /social/metrics': socialMetricsRoute, 'POST /social/publish': socialPublish,
  'POST /episodes/create': episodeCreate, 'POST /episodes/retry': episodeRetry, 'POST /episodes/stop': episodeStop, 'GET /episodes/status': episodeStatus, 'GET /episodes/video': episodeVideo, 'GET /projects': projectsList, 'GET /projects/get': projectGet,
  'GET /cron/dispatch': cronDispatch, 'POST /cron/dispatch': cronDispatch,
  'GET /system/check': systemCheck,
  'GET /health': async ({ res }) => json(res, 200, {
    ok: true, build: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    configured: {
      database: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL), sessionSecret: (process.env.SESSION_SECRET || '').length >= 32,
      gemini: !!lookupEnv('GEMINI_API_KEY'), fal: !!lookupEnv('FAL_KEY'), postpeer: ppConfigured(), deapi: !!lookupEnv('DEAPI_API_KEY'), resend: !!lookupEnv('RESEND_API_KEY'),
      flutterwave: !!process.env.FLW_SECRET_KEY, flutterwaveHash: !!process.env.FLW_SECRET_HASH, social: Object.fromEntries(PLATFORM_IDS.map((p) => [p, isConfigured(p)])), cron: !!process.env.CRON_SECRET, ownerCode: !!process.env.OWNER_ACCESS_CODE,
    },
  }),
};

export default async function handler(req: Req, res: Res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url || '/', 'http://x');
    // vercel.json rewrites /api/* to this function and passes the original path as ?__path=, so routing never depends on how the platform rewrites req.url.
    const forced = url.searchParams.get('__path');
    url.searchParams.delete('__path');
    const path = forced !== null ? '/' + forced.replace(/^\/+|\/+$/g, '') : url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
    // Each network redirects back to /api/social/callback/<platform>.
    const cb = path.match(/^\/social\/callback\/([a-z]+)$/);
    if (cb) url.searchParams.set('platform', cb[1]);
    const route = routes[cb ? 'GET /social/callback' : `${req.method} ${path}`];
    if (!route) throw new HttpError(404, 'Not found');
    const isWebhook = path === '/billing/webhook';
    if (path !== '/health') await ensureSchema();
    const raw = ['POST', 'PUT', 'PATCH'].includes(req.method || '') ? await readRaw(req) : Buffer.alloc(0);
    let body: any = {};
    if (raw.length && !isWebhook) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Unsupported content type');
      try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
    }
    let timer: any;
    const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new HttpError(424, 'This took too long on the server. Please try again.', 'TIMEOUT')), 55_000); });
    try { await Promise.race([route({ req, res, body, raw, query: url.searchParams }), deadline]); } finally { clearTimeout(timer); }
  } catch (e: any) {
    if (res.headersSent) return;
    if (e instanceof HttpError) return json(res, e.status, { error: e.message, code: e.code });
    console.error('Unhandled API error:', e);
    const cfg = /SESSION_SECRET|DATABASE_URL/.test(String(e?.message));
    json(res, 500, { error: cfg ? 'Server configuration is incomplete. Check the deployment environment variables.' : 'Something went wrong. Please try again.', code: cfg ? 'CONFIG' : 'INTERNAL' });
  }
}

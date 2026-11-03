import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from './db.js';

export type Req = IncomingMessage & { body?: any; query?: any };
export type Res = ServerResponse;

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

// ---------- HTTP helpers ----------
export async function readRaw(req: Req, limit = 2_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function redirect(res: Res, location: string) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export function appUrl(req: Req): string {
  const env = process.env.APP_URL?.replace(/\/$/, '');
  if (env) return env;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  return `${proto}://${req.headers.host}`;
}

export function clientIp(req: Req): string {
  return ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// ---------- Cookies & sessions ----------
const COOKIE = 'op_session';
const secretKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return new TextEncoder().encode(s);
};

export function parseCookies(req: Req): Record<string, string> {
  const out: Record<string, string> = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function setCookie(res: Res, name: string, value: string, maxAgeSec: number) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (process.env.NODE_ENV !== 'development') parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}

export async function startSession(res: Res, userId: string) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('30d').sign(secretKey());
  setCookie(res, COOKIE, token, 60 * 60 * 24 * 30);
}
export function endSession(res: Res) { setCookie(res, COOKIE, '', 0); }

export async function sessionUserId(req: Req): Promise<string | null> {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  try { return ((await jwtVerify(t, secretKey())).payload.uid as string) || null; } catch { return null; }
}

/** Short-lived signed blob (used for the Buffer OAuth state/PKCE cookie). */
export async function signBlob(payload: Record<string, unknown>, ttl = '15m') {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(ttl).sign(secretKey());
}
export async function readBlob(token?: string) {
  if (!token) return null;
  try { return (await jwtVerify(token, secretKey())).payload as Record<string, any>; } catch { return null; }
}

// ---------- Crypto ----------
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const dk = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
}

const encKey = () => crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET || '').digest();
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// ---------- Rate limiting (DB-backed, works across serverless instances) ----------
/** Owner (admin) accounts have no limits. requireAccess adds their id here, and their per-user rate limits are skipped. */
export const unlimitedUsers = new Set<string>();
export async function rateLimit(key: string, max: number, windowSec: number) {
  for (const id of unlimitedUsers) if (key.endsWith(id)) return;
  const q = sql();
  const rows = (await q`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, 1, now() + (${windowSec} || ' seconds')::interval)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + (${windowSec} || ' seconds')::interval ELSE rate_limits.reset_at END
    RETURNING count`) as any[];
  if (rows[0].count > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}

// ---------- Validation ----------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
export function str(v: unknown, max: number): string { return String(v ?? '').trim().slice(0, max); }

import { sql } from './db.js';
import { HttpError } from './core.js';

// PostPeer (postpeer.dev) is a unified publishing API, so OmniPulse does not need its own developer app for every network.
// Docs: https://www.postpeer.dev/docs . The access key lives only in the POSTPEER_API_KEY environment variable.
const BASE = 'https://api.postpeer.dev/v1';
export const ppConfigured = () => !!(process.env.POSTPEER_API_KEY || '').trim();

// OmniPulse platform id -> PostPeer platform name
const TO_PP: Record<string, string> = { x: 'twitter', youtube: 'youtube', tiktok: 'tiktok', instagram: 'instagram', linkedin: 'linkedin', facebook: 'facebook', pinterest: 'pinterest' };
const FROM_PP: Record<string, string> = Object.fromEntries(Object.entries(TO_PP).map(([k, v]) => [v, k]));

async function pp(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const key = (process.env.POSTPEER_API_KEY || '').trim();
  if (!key) throw new HttpError(424, 'Social publishing is not set up yet. Add POSTPEER_API_KEY in Vercel.', 'POSTPEER');
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, {
      method: init.method || 'GET',
      headers: { 'x-access-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e: any) {
    throw new HttpError(424, e?.name === 'TimeoutError' ? 'The publishing service (PostPeer) did not respond in time. Please try again.' : 'Could not reach the publishing service (PostPeer).', 'POSTPEER');
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('PostPeer error', path, r.status, JSON.stringify(d).slice(0, 300));
    const detail = String(d?.message || d?.error || '').slice(0, 200);
    const msg = r.status === 401 || r.status === 403 ? 'PostPeer rejected the key. Check POSTPEER_API_KEY.'
      : r.status === 402 || /credit/i.test(detail) ? 'PostPeer credits are used up. Add credits in your PostPeer dashboard.'
      : `PostPeer could not complete the request (${r.status}${detail ? `: ${detail}` : ''}).`;
    throw new HttpError(424, msg, 'POSTPEER');
  }
  return d;
}

export const ppHealth = () => pp('/health/auth');

/** Every OmniPulse customer gets their own PostPeer "profile", which keeps their connected accounts separate. */
async function ensureProfile(userId: string): Promise<string> {
  const rows = (await sql()`SELECT profile_id FROM postpeer_profiles WHERE user_id = ${userId}`) as any[];
  if (rows[0]) return rows[0].profile_id;
  const d = await pp('/profiles', { method: 'POST', body: { name: `omnipulse-${userId}`.slice(0, 80) } });
  const id = String(d?.profile?.id || '');
  if (!id) throw new HttpError(424, 'PostPeer did not return a profile.', 'POSTPEER');
  await sql()`INSERT INTO postpeer_profiles (user_id, profile_id) VALUES (${userId}, ${id}) ON CONFLICT (user_id) DO NOTHING`;
  return id;
}

/** Returns the network's own login and permission page. */
export async function ppConnectUrl(userId: string, platform: string): Promise<string> {
  const pf = TO_PP[platform];
  if (!pf) throw new HttpError(400, 'Unknown platform.');
  const profileId = await ensureProfile(userId);
  const d = await pp(`/connect/${encodeURIComponent(pf)}?profileId=${encodeURIComponent(profileId)}`);
  const url = String(d?.url || '');
  if (!/^https:\/\//.test(url)) throw new HttpError(424, 'PostPeer did not return a sign-in link.', 'POSTPEER');
  return url;
}

/** Copies the customer's connected accounts from PostPeer into OmniPulse. Safe to call repeatedly. */
export async function ppSync(userId: string, limit: number): Promise<number> {
  const profileId = await ensureProfile(userId);
  const d = await pp(`/connect/integrations?profileId=${encodeURIComponent(profileId)}`);
  const list: any[] = Array.isArray(d?.integrations) ? d.integrations : [];
  const removed = new Set(((await sql()`SELECT integration_id FROM postpeer_removed WHERE user_id = ${userId}`) as any[]).map((r) => r.integration_id));
  let added = 0;
  for (const i of list) {
    const platform = FROM_PP[String(i?.platform || '')];
    const id = String(i?.id || '');
    if (!platform || !id || removed.has(id)) continue;
    const existing = (await sql()`SELECT platform FROM social_connections WHERE user_id = ${userId}`) as any[];
    const has = existing.some((r) => r.platform === platform);
    if (!has && existing.length >= limit) continue;
    const handle = String(i?.username || i?.displayName || i?.name || i?.platformUserId || '').slice(0, 120);
    await sql()`INSERT INTO social_connections (user_id, platform, access_token_enc, external_id, handle, avatar, followers, connected_at)
      VALUES (${userId}, ${platform}, '', ${id}, ${handle}, ${String(i?.avatar || i?.picture || '').slice(0, 500)}, 0, now())
      ON CONFLICT (user_id, platform) DO UPDATE SET external_id = EXCLUDED.external_id, handle = CASE WHEN EXCLUDED.handle <> '' THEN EXCLUDED.handle ELSE social_connections.handle END`;
    if (!has) added++;
  }
  return added;
}

export async function ppForget(userId: string, platform: string) {
  const rows = (await sql()`SELECT external_id FROM social_connections WHERE user_id = ${userId} AND platform = ${platform}`) as any[];
  if (rows[0]?.external_id) await sql()`INSERT INTO postpeer_removed (user_id, integration_id) VALUES (${userId}, ${rows[0].external_id}) ON CONFLICT DO NOTHING`;
}

/** Publishes now, or schedules for `scheduledAt`, through PostPeer. Returns "platform:postId". */
export async function ppPublish(userId: string, platform: string, post: { text: string; title: string; videoUrl?: string }, scheduledAt?: Date): Promise<string> {
  const pf = TO_PP[platform];
  const rows = (await sql()`SELECT external_id FROM social_connections WHERE user_id = ${userId} AND platform = ${platform}`) as any[];
  if (!pf || !rows[0]?.external_id) throw new HttpError(409, `${platform} is not connected. Reconnect it from the accounts bar.`, 'SOCIAL_NOT_CONNECTED');
  const target: Record<string, unknown> = { platform: pf, accountId: rows[0].external_id };
  if (platform === 'youtube') target.title = post.title.slice(0, 100);
  const body: Record<string, unknown> = { content: post.text, platforms: [target] };
  if (post.videoUrl) body.mediaItems = [{ url: post.videoUrl, type: 'video' }];
  if (scheduledAt) { body.scheduledFor = scheduledAt.toISOString().slice(0, 19); body.timezone = 'UTC'; } else body.publishNow = true;
  const d = await pp('/posts', { method: 'POST', body });
  const r0 = Array.isArray(d?.platforms) ? d.platforms[0] : null;
  if (d?.success === false || (r0 && r0.success === false)) {
    throw new HttpError(422, String(r0?.error || r0?.message || d?.message || 'The network refused this post.').slice(0, 250), 'SOCIAL_POST');
  }
  return `${platform}:${d?.postId || r0?.platformPostId || 'ok'}`;
}

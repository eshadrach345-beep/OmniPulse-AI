import crypto from 'node:crypto';
import { sql } from './db.js';
import { HttpError, encrypt, decrypt } from './core.js';
import type { Platform } from './social.js';

const API = 'https://api.buffer.com';
const AUTH = 'https://auth.buffer.com';
const SERVICE_TO_PLATFORM: Record<string, Platform> = {
  twitter: 'x', x: 'x', youtube: 'youtube', tiktok: 'tiktok', instagram: 'instagram',
  linkedin: 'linkedin', facebook: 'facebook', pinterest: 'pinterest',
};
const PLATFORM_NAMES: Record<Platform, string> = {
  x: 'X (Twitter)', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
  linkedin: 'LinkedIn', facebook: 'Facebook Page', pinterest: 'Pinterest',
};

export const bufferConfigured = () => !!(process.env.BUFFER_CLIENT_ID || '').trim() && !!(process.env.BUFFER_CLIENT_SECRET || '').trim();
const clientId = () => (process.env.BUFFER_CLIENT_ID || '').trim();
const clientSecret = () => (process.env.BUFFER_CLIENT_SECRET || '').trim();
const b64url = (b: Buffer) => b.toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');

export function bufferPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  return { verifier, challenge, state };
}

export function bufferAuthorizeUrl(base: string, state: string, challenge: string): string {
  if (!bufferConfigured()) throw new HttpError(424, 'Buffer is not configured. Add BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET in Vercel, then redeploy.', 'BUFFER_CONFIG');
  const redirectUri = `${base}/api/social/buffer-callback`;
  const qs = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri, response_type: 'code',
    scope: 'posts:read posts:write account:read offline_access',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'consent',
  });
  return `${AUTH}/auth?${qs.toString()}`;
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const response = await fetch(`${AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error('Buffer OAuth token request failed', response.status, JSON.stringify(data).slice(0, 300));
    throw new HttpError(424, `Buffer authorization failed: ${String(data.error_description || data.error || 'token exchange was rejected').slice(0, 180)}`, 'BUFFER_AUTH');
  }
  return data;
}

export async function bufferExchangeCode(code: string, base: string, verifier: string): Promise<any> {
  return tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: `${base}/api/social/buffer-callback`, code_verifier: verifier,
  });
}

async function accessToken(userId: string): Promise<string> {
  let rows: any[] = await sql()`SELECT * FROM buffer_connections WHERE user_id=${userId}`;
  let row = rows[0];
  if (!row) throw new HttpError(409, 'Connect your Buffer account first.', 'BUFFER_NOT_CONNECTED');
  if (!row.expires_at || new Date(row.expires_at).getTime() - Date.now() > 90_000) return decrypt(row.access_token_enc);
  if (!row.refresh_token_enc) throw new HttpError(409, 'Your Buffer session expired. Reconnect Buffer.', 'BUFFER_REAUTH');

  // Refresh tokens are single-use. A short database lock prevents parallel requests from reusing one.
  const lock: any[] = await sql()`UPDATE buffer_connections SET refresh_lock_until=now()+interval '30 seconds'
    WHERE user_id=${userId} AND (refresh_lock_until IS NULL OR refresh_lock_until < now())
    RETURNING refresh_token_enc`;
  if (!lock[0]) {
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      rows = await sql()`SELECT * FROM buffer_connections WHERE user_id=${userId}`;
      row = rows[0];
      if (row && (!row.expires_at || new Date(row.expires_at).getTime() - Date.now() > 90_000)) return decrypt(row.access_token_enc);
    }
    throw new HttpError(424, 'Buffer is refreshing your connection. Please retry in a moment.', 'BUFFER_REFRESH');
  }
  try {
    const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(lock[0].refresh_token_enc) });
    const expires = new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString();
    await sql()`UPDATE buffer_connections SET access_token_enc=${encrypt(token.access_token)},
      refresh_token_enc=${token.refresh_token ? encrypt(token.refresh_token) : row.refresh_token_enc},
      expires_at=${expires}, refresh_lock_until=NULL WHERE user_id=${userId}`;
    return token.access_token;
  } catch (error) {
    await sql()`UPDATE buffer_connections SET refresh_lock_until=NULL WHERE user_id=${userId}`;
    throw error;
  }
}

async function graph<T=any>(token: string, query: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000),
    });
  } catch (error: any) {
    throw new HttpError(424, error?.name === 'TimeoutError' ? 'Buffer did not respond in time.' : 'Could not reach Buffer. Please try again.', 'BUFFER');
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.errors?.length) {
    const message = data.errors?.[0]?.message || 'Buffer rejected the request.';
    console.error('Buffer GraphQL error', response.status, String(message).slice(0, 300));
    if (response.status === 401 || /unauthorized|invalid token/i.test(message)) throw new HttpError(409, 'Buffer authorization expired. Reconnect your Buffer account.', 'BUFFER_REAUTH');
    throw new HttpError(424, `Buffer API: ${String(message).slice(0, 220)}`, 'BUFFER');
  }
  return data.data as T;
}

export async function bufferSaveConnection(userId: string, tokens: any): Promise<void> {
  if (!tokens?.access_token) throw new HttpError(424, 'Buffer did not return an access token.', 'BUFFER_AUTH');
  const expires = new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString();
  await sql()`INSERT INTO buffer_connections (user_id,access_token_enc,refresh_token_enc,expires_at,connected_at,refresh_lock_until)
    VALUES (${userId},${encrypt(tokens.access_token)},${tokens.refresh_token ? encrypt(tokens.refresh_token) : null},${expires},now(),NULL)
    ON CONFLICT (user_id) DO UPDATE SET access_token_enc=EXCLUDED.access_token_enc,
      refresh_token_enc=EXCLUDED.refresh_token_enc,expires_at=EXCLUDED.expires_at,connected_at=now(),refresh_lock_until=NULL`;
  await bufferSyncAccounts(userId, 7);
}

export async function bufferHasConnection(userId: string): Promise<boolean> {
  const rows: any[] = await sql()`SELECT user_id FROM buffer_connections WHERE user_id=${userId}`;
  return !!rows[0];
}

export async function bufferSyncAccounts(userId: string, limit: number): Promise<number> {
  const token = await accessToken(userId);
  const account: any = await graph(token, 'query { account { id email organizations { id name } } }');
  const organizations: any[] = account?.account?.organizations || [];
  const all: any[] = [];
  for (const org of organizations) {
    const query = `query { channels(input: { organizationId: ${JSON.stringify(String(org.id))} }) { id name service } }`;
    const result: any = await graph(token, query);
    const channels = Array.isArray(result?.channels) ? result.channels : result?.channels?.edges?.map((edge: any) => edge.node) || [];
    for (const channel of channels) all.push({ ...channel, organizationId: org.id });
  }
  const mapped = all.map((channel) => ({ ...channel, platform: SERVICE_TO_PLATFORM[String(channel.service || '').toLowerCase()] }))
    .filter((channel) => channel.platform);
  const unique = new Map<Platform, any>();
  for (const channel of mapped) if (!unique.has(channel.platform)) unique.set(channel.platform, channel);
  const selected = Array.from(unique.values()).slice(0, Math.max(0, limit));
  await sql()`DELETE FROM buffer_channels WHERE user_id=${userId}`;
  for (const channel of selected) {
    await sql()`INSERT INTO buffer_channels (user_id,platform,channel_id,name,service,organization_id,connected_at)
      VALUES (${userId},${channel.platform},${String(channel.id)},${String(channel.name || PLATFORM_NAMES[channel.platform]).slice(0,120)},
      ${String(channel.service || '')},${String(channel.organizationId || '')},now())
      ON CONFLICT (user_id,platform) DO UPDATE SET channel_id=EXCLUDED.channel_id,name=EXCLUDED.name,
      service=EXCLUDED.service,organization_id=EXCLUDED.organization_id,connected_at=now()`;
  }
  return selected.length;
}

export async function bufferListAccounts(userId: string, limit: number) {
  const rows: any[] = await sql()`SELECT platform,name,connected_at FROM buffer_channels WHERE user_id=${userId}`;
  return (Object.keys(PLATFORM_NAMES) as Platform[]).map((platform) => {
    const channel = rows.find((row) => row.platform === platform);
    return {
      platform, name: PLATFORM_NAMES[platform], configured: bufferConfigured(), publishable: true,
      connected: !!channel, handle: channel?.name || '', avatar: '', followers: 0, connectedAt: channel?.connected_at || null,
    };
  });
}

export async function bufferDisconnectChannel(userId: string, platform: Platform): Promise<void> {
  await sql()`DELETE FROM buffer_channels WHERE user_id=${userId} AND platform=${platform}`;
}

export async function bufferPublish(
  userId: string, platform: Platform, post: { text: string; title: string; videoUrl?: string }, scheduledAt?: Date,
): Promise<string> {
  const rows: any[] = await sql()`SELECT channel_id FROM buffer_channels WHERE user_id=${userId} AND platform=${platform}`;
  if (!rows[0]?.channel_id) throw new HttpError(409, `${PLATFORM_NAMES[platform]} is not connected in Buffer. Add it to your Buffer account, then sync channels.`, 'SOCIAL_NOT_CONNECTED');
  if (['youtube','tiktok','instagram'].includes(platform) && !post.videoUrl) {
    throw new HttpError(422, `${PLATFORM_NAMES[platform]} requires a finished video. Select a completed MP4 before publishing.`, 'SOCIAL_MEDIA_REQUIRED');
  }
  const token = await accessToken(userId);
  const channelId = String(rows[0].channel_id);
  const text = JSON.stringify(post.text || '').replace(/\\u2028/g, '\\\\u2028').replace(/\\u2029/g, '\\\\u2029');
  const id = JSON.stringify(channelId);
  const assets = post.videoUrl ? `assets: [{ video: { url: ${JSON.stringify(post.videoUrl)} } }]` : '';
  const mode = scheduledAt ? 'customScheduled' : 'shareNow';
  const dueAt = scheduledAt ? `dueAt: ${JSON.stringify(scheduledAt.toISOString())}` : '';
  const mutation = `mutation { createPost(input: { text: ${text}, channelId: ${id}, schedulingType: automatic, mode: ${mode}, ${dueAt} ${assets} }) { ... on PostActionSuccess { post { id status dueAt } } ... on MutationError { message } } }`;
  const data: any = await graph(token, mutation);
  const result = data?.createPost;
  if (result?.message) throw new HttpError(422, String(result.message).slice(0,220), 'BUFFER_POST');
  const postId = String(result?.post?.id || '');
  if (!postId) throw new HttpError(424, 'Buffer did not confirm that the post was created.', 'BUFFER_POST');
  return `${platform}:${postId}`;
}

export async function bufferHealth(): Promise<void> {
  if (!bufferConfigured()) throw new HttpError(424, 'Add BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET in Vercel.', 'BUFFER_CONFIG');
  // OAuth credentials are validated by Buffer when a customer authorizes; no global customer token exists for a safe health probe.
}

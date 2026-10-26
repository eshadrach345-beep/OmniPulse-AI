import crypto from 'node:crypto';
import { sql } from './db.js';
import { HttpError, encrypt, decrypt } from './core.js';
import { ppConfigured, ppPublish } from './postpeer.js';

/**
 * Direct connections to each social network (no middleman).
 * Users click Connect → the network's own login/consent screen → back to OmniPulse.
 * Tokens are stored encrypted. Each platform needs a developer app created once by the site owner (see docs/ENVIRONMENT.md).
 */
export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'x' | 'linkedin' | 'facebook' | 'pinterest';

interface Provider {
  id: Platform;
  name: string;
  idEnv: string;
  secretEnv: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSep: string;
  pkce: boolean;
  basicAuth?: boolean;
  clientIdParam?: string;
  extraAuth?: Record<string, string>;
  /** false = connect works but publishing is not built yet. */
  publishable: boolean;
}

const META_AUTH = 'https://www.facebook.com/v21.0/dialog/oauth';
const META_TOKEN = 'https://graph.facebook.com/v21.0/oauth/access_token';
export const GRAPH = 'https://graph.facebook.com/v21.0';

export const PROVIDERS: Record<Platform, Provider> = {
  youtube: {
    id: 'youtube', name: 'YouTube', idEnv: 'GOOGLE_CLIENT_ID', secretEnv: 'GOOGLE_CLIENT_SECRET',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'], scopeSep: ' ', pkce: true,
    extraAuth: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }, publishable: true,
  },
  x: {
    id: 'x', name: 'X (Twitter)', idEnv: 'X_CLIENT_ID', secretEnv: 'X_CLIENT_SECRET',
    authUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], scopeSep: ' ', pkce: true, basicAuth: true, publishable: true,
  },
  facebook: {
    id: 'facebook', name: 'Facebook Page', idEnv: 'META_APP_ID', secretEnv: 'META_APP_SECRET',
    authUrl: META_AUTH, tokenUrl: META_TOKEN,
    scopes: ['public_profile', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement'], scopeSep: ',', pkce: false, publishable: true,
  },
  instagram: {
    id: 'instagram', name: 'Instagram', idEnv: 'META_APP_ID', secretEnv: 'META_APP_SECRET',
    authUrl: META_AUTH, tokenUrl: META_TOKEN,
    scopes: ['public_profile', 'pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'], scopeSep: ',', pkce: false, publishable: true,
  },
  linkedin: {
    id: 'linkedin', name: 'LinkedIn', idEnv: 'LINKEDIN_CLIENT_ID', secretEnv: 'LINKEDIN_CLIENT_SECRET',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'w_member_social'], scopeSep: ' ', pkce: false, publishable: true,
  },
  tiktok: {
    id: 'tiktok', name: 'TikTok', idEnv: 'TIKTOK_CLIENT_KEY', secretEnv: 'TIKTOK_CLIENT_SECRET',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.publish', 'video.upload'], scopeSep: ',', pkce: false, clientIdParam: 'client_key', publishable: true,
  },
  pinterest: {
    id: 'pinterest', name: 'Pinterest', idEnv: 'PINTEREST_APP_ID', secretEnv: 'PINTEREST_APP_SECRET',
    authUrl: 'https://www.pinterest.com/oauth/', tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: ['user_accounts:read', 'boards:read', 'pins:read', 'pins:write'], scopeSep: ',', pkce: false, basicAuth: true, publishable: false,
  },
};

export const PLATFORM_IDS = Object.keys(PROVIDERS) as Platform[];
export const isPlatform = (p: unknown): p is Platform => typeof p === 'string' && p in PROVIDERS;
export const isConfigured = (p: Platform) => ppConfigured() || !!(process.env[PROVIDERS[p].idEnv] && process.env[PROVIDERS[p].secretEnv]);
export const redirectUri = (base: string, p: Platform) => `${base}/api/social/callback/${p}`;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------------------------------------------------------------- OAuth
export function socialPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), state: b64url(crypto.randomBytes(16)) };
}

export function socialAuthorizeUrl(p: Platform, base: string, state: string, challenge: string): string {
  const pr = PROVIDERS[p];
  if (!isConfigured(p)) throw new HttpError(424, `${pr.name} isn't set up on this server yet. The site owner needs to add ${pr.idEnv} and ${pr.secretEnv}.`, 'CONFIG');
  const params = new URLSearchParams({
    [pr.clientIdParam || 'client_id']: process.env[pr.idEnv]!, redirect_uri: redirectUri(base, p), response_type: 'code',
    scope: pr.scopes.join(pr.scopeSep), state, ...(pr.extraAuth || {}),
  });
  if (pr.pkce) { params.set('code_challenge', challenge); params.set('code_challenge_method', 'S256'); }
  return `${pr.authUrl}?${params}`;
}

async function tokenCall(p: Platform, params: Record<string, string>): Promise<any> {
  const pr = PROVIDERS[p];
  const id = process.env[pr.idEnv]!, secret = process.env[pr.secretEnv]!;
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (pr.basicAuth) headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  else { body.set(pr.clientIdParam || 'client_id', id); body.set('client_secret', secret); }
  const r = await fetch(pr.tokenUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) });
  const d: any = await r.json().catch(() => ({}));
  const tok = d.access_token || d.data?.access_token;
  if (!r.ok || !tok) {
    console.error(`${p} token error`, r.status, JSON.stringify(d).slice(0, 400));
    throw new HttpError(424, `${pr.name} authorization failed. ${d.error_description || d.error?.message || ''}`.trim(), 'SOCIAL');
  }
  return d.data ? { ...d.data } : d;
}

export const exchangeSocialCode = (p: Platform, code: string, base: string, verifier: string) =>
  tokenCall(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(base, p), ...(PROVIDERS[p].pkce ? { code_verifier: verifier } : {}) });

// ---------------------------------------------------------------- profile lookup (also validates the account can publish)
interface Profile { externalId: string; handle: string; avatar: string; followers: number; extra: Record<string, any>; token?: string }

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('profile call failed', url.split('?')[0], r.status, JSON.stringify(d).slice(0, 300)); throw new HttpError(424, d?.error?.message || d?.message || d?.error_description || `Request failed (${r.status})`, 'SOCIAL'); }
  return d;
}

async function loadProfile(p: Platform, t: any): Promise<Profile> {
  const bearer = { Authorization: `Bearer ${t.access_token}` };
  switch (p) {
    case 'youtube': {
      const d = await getJson('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', bearer);
      const c = d.items?.[0];
      if (!c) throw new HttpError(422, 'That Google account has no YouTube channel. Create a channel on YouTube first, then connect again.', 'SOCIAL');
      return { externalId: c.id, handle: c.snippet?.customUrl || c.snippet?.title || 'YouTube channel', avatar: c.snippet?.thumbnails?.default?.url || '', followers: Number(c.statistics?.subscriberCount) || 0, extra: {} };
    }
    case 'x': {
      const d = await getJson('https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics', bearer);
      return { externalId: d.data.id, handle: `@${d.data.username}`, avatar: d.data.profile_image_url || '', followers: d.data.public_metrics?.followers_count || 0, extra: {} };
    }
    case 'facebook':
    case 'instagram': {
      // Long-lived user token → page tokens that never expire.
      const ll = await tokenCall(p, { grant_type: 'fb_exchange_token', fb_exchange_token: t.access_token }).catch(() => t);
      const fields = p === 'facebook' ? 'id,name,access_token,picture{url},followers_count' : 'id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}';
      const d = await getJson(`${GRAPH}/me/accounts?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(ll.access_token)}`);
      const pages: any[] = d.data || [];
      if (p === 'facebook') {
        const pg = pages[0];
        if (!pg) throw new HttpError(422, 'No Facebook Page found. You need to be an admin of a Facebook Page, and you must select it on the Facebook permission screen.', 'SOCIAL');
        return { externalId: pg.id, handle: pg.name, avatar: pg.picture?.data?.url || '', followers: pg.followers_count || 0, extra: { pageToken: pg.access_token }, token: pg.access_token };
      }
      const pg = pages.find((x) => x.instagram_business_account);
      if (!pg) throw new HttpError(422, 'No Instagram professional account found. Switch your Instagram to a Business or Creator account, link it to a Facebook Page, then connect again and select that Page.', 'SOCIAL');
      const ig = pg.instagram_business_account;
      return { externalId: ig.id, handle: `@${ig.username}`, avatar: ig.profile_picture_url || '', followers: ig.followers_count || 0, extra: { pageToken: pg.access_token }, token: pg.access_token };
    }
    case 'linkedin': {
      const d = await getJson('https://api.linkedin.com/v2/userinfo', bearer);
      return { externalId: d.sub, handle: d.name || 'LinkedIn member', avatar: d.picture || '', followers: 0, extra: {} };
    }
    case 'tiktok': {
      const d = await getJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', bearer);
      const u = d.data?.user || {};
      return { externalId: u.open_id || t.open_id || '', handle: u.display_name || 'TikTok account', avatar: u.avatar_url || '', followers: 0, extra: {} };
    }
    case 'pinterest': {
      const d = await getJson('https://api.pinterest.com/v5/user_account', bearer);
      return { externalId: d.username, handle: `@${d.username}`, avatar: d.profile_image || '', followers: d.follower_count || 0, extra: {} };
    }
  }
}

export async function saveSocialConnection(userId: string, p: Platform, t: any, limit: number) {
  const existing = await sql()`SELECT platform FROM social_connections WHERE user_id = ${userId}`;
  if (!existing.some((r: any) => r.platform === p) && existing.length >= limit) {
    throw new HttpError(403, `Your plan allows ${limit} connected channels. Disconnect one or upgrade to add ${PROVIDERS[p].name}.`, 'LIMIT');
  }
  const prof = await loadProfile(p, t);
  const token = prof.token || t.access_token;
  const long = p === 'facebook' || p === 'instagram';
  const exp = long ? null : new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString();
  await sql()`INSERT INTO social_connections (user_id, platform, access_token_enc, refresh_token_enc, expires_at, external_id, handle, avatar, followers, extra_enc, connected_at)
    VALUES (${userId}, ${p}, ${encrypt(token)}, ${t.refresh_token ? encrypt(t.refresh_token) : null}, ${exp}, ${prof.externalId}, ${prof.handle}, ${prof.avatar}, ${prof.followers}, ${encrypt(JSON.stringify(prof.extra))}, now())
    ON CONFLICT (user_id, platform) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, social_connections.refresh_token_enc), expires_at = EXCLUDED.expires_at,
      external_id = EXCLUDED.external_id, handle = EXCLUDED.handle, avatar = EXCLUDED.avatar, followers = EXCLUDED.followers,
      extra_enc = EXCLUDED.extra_enc, connected_at = now()`;
}

export async function listSocialAccounts(userId: string) {
  const rows = await sql()`SELECT platform, handle, avatar, followers, connected_at FROM social_connections WHERE user_id = ${userId}`;
  return PLATFORM_IDS.map((p) => {
    const c = rows.find((r: any) => r.platform === p);
    return {
      platform: p, name: PROVIDERS[p].name, configured: isConfigured(p), publishable: ppConfigured() || PROVIDERS[p].publishable,
      connected: !!c, handle: c?.handle || '', avatar: c?.avatar || '', followers: Number(c?.followers) || 0, connectedAt: c?.connected_at || null,
    };
  });
}

export async function removeSocialConnection(userId: string, p: Platform) {
  await sql()`DELETE FROM social_connections WHERE user_id = ${userId} AND platform = ${p}`;
}

interface Conn { token: string; externalId: string; extra: any }

/** Returns a valid access token, refreshing it when it is about to expire. */
async function connection(userId: string, p: Platform): Promise<Conn> {
  const rows = await sql()`SELECT * FROM social_connections WHERE user_id = ${userId} AND platform = ${p}`;
  const row = rows[0];
  const notConnected = () => new HttpError(409, `${PROVIDERS[p].name} is not connected. Reconnect it from the accounts bar.`, 'SOCIAL_NOT_CONNECTED');
  if (!row) throw notConnected();
  const extra = row.extra_enc ? JSON.parse(decrypt(row.extra_enc)) : {};
  const fresh = !row.expires_at || new Date(row.expires_at).getTime() - Date.now() > 60_000;
  if (fresh) return { token: decrypt(row.access_token_enc), externalId: row.external_id, extra };
  if (!row.refresh_token_enc) { await removeSocialConnection(userId, p); throw notConnected(); }
  try {
    const t = await tokenCall(p, { grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token_enc) });
    const exp = new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString();
    await sql()`UPDATE social_connections SET access_token_enc = ${encrypt(t.access_token)}, refresh_token_enc = ${t.refresh_token ? encrypt(t.refresh_token) : row.refresh_token_enc}, expires_at = ${exp} WHERE user_id = ${userId} AND platform = ${p}`;
    return { token: t.access_token, externalId: row.external_id, extra };
  } catch {
    await removeSocialConnection(userId, p);
    throw notConnected();
  }
}

// ---------------------------------------------------------------- publishing
export interface PostInput { text: string; title: string; videoUrl?: string }
const ensure = (ok: any, msg: string) => { if (!ok) throw new HttpError(422, msg, 'SOCIAL_POST'); };

async function downloadVideo(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new HttpError(424, 'Could not download the video file to publish it.', 'SOCIAL_POST');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 200 * 1024 * 1024) throw new HttpError(413, 'The video is too large to publish.', 'SOCIAL_POST');
  return buf;
}

async function call(url: string, init: RequestInit, label: string): Promise<{ r: Response; d: any }> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
  const raw = await r.text();
  let d: any = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = { raw }; }
  if (!r.ok) {
    console.error(`${label} failed`, r.status, raw.slice(0, 400));
    const msg = d?.error?.message || d?.error?.error_user_msg || d?.message || d?.detail || d?.title || d?.error?.code || (typeof d?.error === 'string' ? d.error : '') || `status ${r.status}`;
    throw new HttpError(424, `${label}: ${String(msg).slice(0, 220)}`, 'SOCIAL_POST');
  }
  return { r, d };
}

const form = (o: Record<string, string>) => new URLSearchParams(o);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function publishYouTube(c: Conn, p: PostInput): Promise<string> {
  ensure(p.videoUrl, 'YouTube needs a video. Attach a generated video to this post.');
  const video = await downloadVideo(p.videoUrl!);
  const meta = { snippet: { title: (p.title || p.text).replace(/\s+/g, ' ').slice(0, 95) || 'New video', description: p.text.slice(0, 4900), categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length) },
    body: JSON.stringify(meta),
  });
  const loc = init.headers.get('location');
  if (!init.ok || !loc) { console.error('YouTube init failed', init.status, (await init.text()).slice(0, 300)); throw new HttpError(424, 'YouTube rejected the upload request. Check that your Google project has the YouTube Data API enabled.', 'SOCIAL_POST'); }
  const { d } = await call(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(video.length) }, body: new Uint8Array(video) }, 'YouTube upload');
  return d.id;
}

async function publishX(c: Conn, p: PostInput): Promise<string> {
  // X's video upload needs a paid API tier, so the video goes out as a link.
  const link = p.videoUrl ? `\n${p.videoUrl}` : '';
  const text = p.text.slice(0, Math.max(0, 280 - (p.videoUrl ? 24 : 0))).trim() + link;
  const { d } = await call('https://api.twitter.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, 'X');
  return d.data.id;
}

async function publishFacebook(c: Conn, p: PostInput): Promise<string> {
  const tok = c.extra.pageToken || c.token;
  if (p.videoUrl) {
    const { d } = await call(`${GRAPH}/${c.externalId}/videos`, { method: 'POST', body: form({ file_url: p.videoUrl, description: p.text, title: p.title.slice(0, 100), access_token: tok }) }, 'Facebook');
    return d.id;
  }
  const { d } = await call(`${GRAPH}/${c.externalId}/feed`, { method: 'POST', body: form({ message: p.text, access_token: tok }) }, 'Facebook');
  return d.id;
}

async function publishInstagram(c: Conn, p: PostInput): Promise<string> {
  ensure(p.videoUrl, 'Instagram needs a video or image. Attach a generated video to this post.');
  const tok = c.extra.pageToken || c.token;
  const { d: made } = await call(`${GRAPH}/${c.externalId}/media`, { method: 'POST', body: form({ media_type: 'REELS', video_url: p.videoUrl!, caption: p.text.slice(0, 2200), access_token: tok }) }, 'Instagram');
  for (let i = 0; i < 12; i++) {
    const st = await getJson(`${GRAPH}/${made.id}?fields=status_code,status&access_token=${encodeURIComponent(tok)}`);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new HttpError(424, `Instagram could not process the video (${st.status || st.status_code}).`, 'SOCIAL_POST');
    await sleep(4000);
  }
  const { d } = await call(`${GRAPH}/${c.externalId}/media_publish`, { method: 'POST', body: form({ creation_id: made.id, access_token: tok }) }, 'Instagram');
  return d.id;
}

async function publishLinkedIn(c: Conn, p: PostInput): Promise<string> {
  const owner = `urn:li:person:${c.externalId}`;
  const h = { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202504', 'X-Restli-Protocol-Version': '2.0.0' };
  let content: any;
  if (p.videoUrl) {
    const video = await downloadVideo(p.videoUrl);
    const { d: init } = await call('https://api.linkedin.com/rest/videos?action=initializeUpload', { method: 'POST', headers: h, body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: video.length, uploadCaptions: false, uploadThumbnail: false } }) }, 'LinkedIn');
    const v = init.value;
    const etags: string[] = [];
    for (const part of v.uploadInstructions) {
      const chunk = video.subarray(part.firstByte, part.lastByte + 1);
      const up = await fetch(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(chunk), signal: AbortSignal.timeout(45_000) });
      if (!up.ok) throw new HttpError(424, 'LinkedIn rejected the video upload.', 'SOCIAL_POST');
      etags.push(up.headers.get('etag') || '');
    }
    await call('https://api.linkedin.com/rest/videos?action=finalizeUpload', { method: 'POST', headers: h, body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || '', uploadedPartIds: etags } }) }, 'LinkedIn');
    content = { media: { title: p.title.slice(0, 200) || 'Video', id: v.video } };
  }
  const body: any = { author: owner, commentary: p.text.slice(0, 2900), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false };
  if (content) body.content = content;
  const { r } = await call('https://api.linkedin.com/rest/posts', { method: 'POST', headers: h, body: JSON.stringify(body) }, 'LinkedIn');
  return r.headers.get('x-restli-id') || 'posted';
}

async function publishTikTok(c: Conn, p: PostInput): Promise<string> {
  ensure(p.videoUrl, 'TikTok needs a video. Attach a generated video to this post.');
  const video = await downloadVideo(p.videoUrl!);
  const privacy = process.env.TIKTOK_PRIVACY || 'SELF_ONLY'; // unaudited TikTok apps can only post privately
  const { d } = await call('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ post_info: { title: p.text.slice(0, 2000), privacy_level: privacy }, source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 } }),
  }, 'TikTok');
  const up = d.data?.upload_url;
  ensure(up, 'TikTok did not return an upload address.');
  const put = await fetch(up, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${video.length - 1}/${video.length}`, 'Content-Length': String(video.length) }, body: new Uint8Array(video), signal: AbortSignal.timeout(45_000) });
  if (!put.ok) throw new HttpError(424, 'TikTok rejected the video upload.', 'SOCIAL_POST');
  return d.data.publish_id;
}

export async function publishToPlatform(userId: string, p: Platform, post: PostInput): Promise<string> {
  if (ppConfigured()) return ppPublish(userId, p, post);
  if (!PROVIDERS[p].publishable) throw new HttpError(422, `${PROVIDERS[p].name} publishing isn't available yet.`, 'SOCIAL_POST');
  const c = await connection(userId, p);
  let id: string;
  switch (p) {
    case 'youtube': id = await publishYouTube(c, post); break;
    case 'x': id = await publishX(c, post); break;
    case 'facebook': id = await publishFacebook(c, post); break;
    case 'instagram': id = await publishInstagram(c, post); break;
    case 'linkedin': id = await publishLinkedIn(c, post); break;
    case 'tiktok': id = await publishTikTok(c, post); break;
    default: throw new HttpError(422, 'Unsupported platform.', 'SOCIAL_POST');
  }
  return `${p}:${id}`;
}

// ---------------------------------------------------------------- metrics (where the network exposes them)
export async function socialMetrics(userId: string, ids: string[]) {
  if (ppConfigured()) return [];
  const out: { id: string; metrics: Record<string, number> }[] = [];
  for (const full of ids) {
    const [p, ...rest] = full.split(':');
    const pid = rest.join(':');
    if (!isPlatform(p) || !pid) continue;
    try {
      const c = await connection(userId, p);
      if (p === 'youtube') {
        const d = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(pid)}`, { Authorization: `Bearer ${c.token}` });
        const s = d.items?.[0]?.statistics;
        if (s) out.push({ id: full, metrics: { views: +s.viewCount || 0, reactions: +s.likeCount || 0, comments: +s.commentCount || 0 } });
      } else if (p === 'x') {
        const d = await getJson(`https://api.twitter.com/2/tweets/${encodeURIComponent(pid)}?tweet.fields=public_metrics`, { Authorization: `Bearer ${c.token}` });
        const m = d.data?.public_metrics;
        if (m) out.push({ id: full, metrics: { impressions: m.impression_count || 0, reactions: m.like_count || 0, comments: m.reply_count || 0, reposts: m.retweet_count || 0 } });
      } else if (p === 'facebook') {
        const d = await getJson(`${GRAPH}/${pid}?fields=likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(c.extra.pageToken || c.token)}`);
        out.push({ id: full, metrics: { reactions: d.likes?.summary?.total_count || 0, comments: d.comments?.summary?.total_count || 0 } });
      } else if (p === 'instagram') {
        const d = await getJson(`${GRAPH}/${pid}?fields=like_count,comments_count&access_token=${encodeURIComponent(c.extra.pageToken || c.token)}`);
        out.push({ id: full, metrics: { reactions: d.like_count || 0, comments: d.comments_count || 0 } });
      }
    } catch (e) { console.error('metrics', full, (e as Error).message); }
  }
  return out;
}

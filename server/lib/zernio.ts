import { sql } from './db.js';
import { HttpError } from './core.js';

const BASE = 'https://zernio.com/api/v1';
const TO_Z: Record<string,string> = { x:'twitter', youtube:'youtube', tiktok:'tiktok', instagram:'instagram', linkedin:'linkedin', facebook:'facebook', pinterest:'pinterest' };
const FROM_Z: Record<string,string> = Object.fromEntries(Object.entries(TO_Z).map(([a,b])=>[b,a]));
export const zernioConfigured = () => !!(process.env.ZERNIO_API_KEY || '').trim();

async function zernioRequest(path:string, init:RequestInit = {}):Promise<any> {
  const key=(process.env.ZERNIO_API_KEY||'').trim();
  if(!key) throw new HttpError(424,'Social publishing is not configured. Add ZERNIO_API_KEY in Vercel Environment Variables, then redeploy.','ZERNIO_CONFIG');
  let response:Response;
  try {
    response=await fetch(`${BASE}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(25000)});
  } catch(e:any) {
    throw new HttpError(424,e?.name==='TimeoutError'?'Zernio did not respond in time. Please try again.':'Could not reach Zernio. Please try again.','ZERNIO');
  }
  const raw=await response.text(); let data:any={};
  try{data=raw?JSON.parse(raw):{};}catch{data={message:raw};}
  if(!response.ok){
    console.error('Zernio API error',path,response.status,raw.slice(0,400));
    const detail=String(data?.error?.message||data?.message||data?.error||data?.detail||'').slice(0,220);
    const msg=response.status===401||response.status===403?'Zernio rejected the API key or its permissions. Check ZERNIO_API_KEY.':
      response.status===402?'Zernio requires a billing action. Check your Zernio dashboard.':
      response.status===429?'Zernio rate limit reached. Wait briefly and retry.':
      `Zernio request failed (${response.status})${detail?`: ${detail}`:''}.`;
    throw new HttpError(424,msg,'ZERNIO');
  }
  return data;
}

/** Each OmniPulse user receives a separate Zernio profile. */
export async function zernioEnsureProfile(userId:string):Promise<string>{
  const rows:any[]=await sql()`SELECT profile_id FROM zernio_profiles WHERE user_id=${userId}`;
  if(rows[0]?.profile_id) return String(rows[0].profile_id);
  const name=`omnipulse-${userId}`.slice(0,80);
  let d:any;
  try { d=await zernioRequest('/profiles',{method:'POST',body:JSON.stringify({name,description:'OmniPulse customer profile'})}); }
  catch(e:any) {
    // Recover safely if an earlier timed-out request created the profile before the local ID was saved.
    if(!String(e?.message||'').includes('(409)')) throw e;
    const listed=await zernioRequest('/profiles');
    const profiles:any[]=Array.isArray(listed?.profiles)?listed.profiles:Array.isArray(listed?.data?.profiles)?listed.data.profiles:[];
    const match=profiles.find(p=>String(p?.name||'')===name);
    const existingId=String(match?._id||match?.id||'');
    if(!existingId) throw new HttpError(424,'A Zernio profile with this customer ID already exists but could not be safely recovered.','ZERNIO_PROFILE');
    await sql()`INSERT INTO zernio_profiles (user_id,profile_id) VALUES (${userId},${existingId}) ON CONFLICT (user_id) DO NOTHING`;
    const saved:any[]=await sql()`SELECT profile_id FROM zernio_profiles WHERE user_id=${userId}`;
    return String(saved[0]?.profile_id||existingId);
  }
  const id=String(d?.profile?._id||d?.profile?.id||'');
  if(!id) throw new HttpError(424,'Zernio did not return a customer profile ID.','ZERNIO_PROFILE');
  await sql()`INSERT INTO zernio_profiles (user_id,profile_id) VALUES (${userId},${id}) ON CONFLICT (user_id) DO NOTHING`;
  const saved:any[]=await sql()`SELECT profile_id FROM zernio_profiles WHERE user_id=${userId}`;
  return String(saved[0]?.profile_id||id);
}

export async function zernioConnectUrl(userId:string,platform:string,redirectUrl:string):Promise<{url:string;profileId:string;state:string}>{
  const zPlatform=TO_Z[platform];
  if(!zPlatform) throw new HttpError(400,'This social platform is not supported.');
  const profileId=await zernioEnsureProfile(userId);
  const state=(await import('node:crypto')).randomBytes(24).toString('hex');
  const qs=new URLSearchParams({profileId,redirect_url:`${redirectUrl}?state=${state}`});
  const d=await zernioRequest(`/connect/${encodeURIComponent(zPlatform)}?${qs.toString()}`);
  const url=String(d?.authUrl||'');
  if(!/^https:\/\//i.test(url)) throw new HttpError(424,'Zernio did not return a valid authorization link.','ZERNIO');
  return {url,profileId,state};
}

export async function zernioSyncAccounts(userId:string,limit:number):Promise<number>{
  const profileId=await zernioEnsureProfile(userId);
  const d=await zernioRequest(`/accounts?profileId=${encodeURIComponent(profileId)}`);
  const accounts:any[]=Array.isArray(d?.accounts)?d.accounts:[];
  let added=0;
  const supported=accounts.filter(a=>FROM_Z[String(a?.platform||'')] && (a?.isActive!==false));
  const remoteIds=new Set(supported.map(a=>String(a._id||a.accountId||'')).filter(Boolean));
  const existingRows:any[]=await sql()`SELECT platform,account_id FROM zernio_connections WHERE user_id=${userId}`;
  for(const old of existingRows){
    if(!remoteIds.has(String(old.account_id))) await sql()`DELETE FROM zernio_connections WHERE user_id=${userId} AND platform=${old.platform}`;
  }
  const existing:any[]=await sql()`SELECT platform FROM zernio_connections WHERE user_id=${userId}`;
  const known=new Set(existing.map(r=>String(r.platform)));
  for(const a of supported){
    const platform=FROM_Z[String(a.platform)];
    const accountId=String(a._id||a.accountId||'');
    if(!accountId) continue;
    if(!known.has(platform) && known.size>=limit) continue;
    const username=String(a.username||a.name||a.displayName||platform).slice(0,120);
    await sql()`INSERT INTO zernio_connections (user_id,profile_id,platform,account_id,username,connected_at)
      VALUES (${userId},${profileId},${platform},${accountId},${username},now())
      ON CONFLICT (user_id,platform) DO UPDATE SET profile_id=EXCLUDED.profile_id,account_id=EXCLUDED.account_id,username=EXCLUDED.username,connected_at=now()`;
    if(!known.has(platform)){known.add(platform);added++;}
  }
  return added;
}

export async function zernioListAccounts(userId:string,limit:number){
  await zernioSyncAccounts(userId,limit);
  const rows:any[]=await sql()`SELECT platform,username,connected_at FROM zernio_connections WHERE user_id=${userId}`;
  return Object.entries(TO_Z).map(([platform])=>{
    const a=rows.find(r=>r.platform===platform);
    const names:Record<string,string>={x:'X (Twitter)',youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram',linkedin:'LinkedIn',facebook:'Facebook Page',pinterest:'Pinterest'};
    return {platform,name:names[platform]||platform,configured:zernioConfigured(),publishable:true,connected:!!a,handle:a?.username||'',avatar:'',followers:0,connectedAt:a?.connected_at||null};
  });
}

export async function zernioDisconnect(userId:string,platform:string):Promise<void>{
  const rows:any[]=await sql()`SELECT account_id FROM zernio_connections WHERE user_id=${userId} AND platform=${platform}`;
  if(!rows[0]) return;
  await zernioRequest(`/accounts/${encodeURIComponent(String(rows[0].account_id))}`,{method:'DELETE'});
  await sql()`DELETE FROM zernio_connections WHERE user_id=${userId} AND platform=${platform}`;
}

export async function zernioPublish(userId:string,platform:string,post:{text:string;title:string;videoUrl?:string},scheduledAt?:Date):Promise<string>{
  const rows:any[]=await sql()`SELECT account_id FROM zernio_connections WHERE user_id=${userId} AND platform=${platform}`;
  if(!rows[0]?.account_id) throw new HttpError(409,`${platform} is not connected. Connect it from Social Accounts first.`,'SOCIAL_NOT_CONNECTED');
  const targetPlatform=TO_Z[platform];
  if(!targetPlatform) throw new HttpError(422,'Unsupported social platform.','SOCIAL_POST');
  const body:any={content:post.text,platforms:[{platform:targetPlatform,accountId:String(rows[0].account_id)}]};
  if(post.videoUrl) body.mediaItems=[{type:'video',url:post.videoUrl}];
  if(scheduledAt){body.scheduledFor=scheduledAt.toISOString();body.timezone='UTC';}
  else body.publishNow=true;
  const d=await zernioRequest('/posts',{method:'POST',body:JSON.stringify(body)});
  const result=d?.post||d;
  const platformResult=Array.isArray(result?.platforms)?result.platforms[0]:null;
  if(platformResult && ['failed','error'].includes(String(platformResult.status||'').toLowerCase())){
    throw new HttpError(422,String(platformResult.error||platformResult.message||'The social network rejected this post.').slice(0,240),'SOCIAL_POST');
  }
  const id=String(result?._id||result?.id||platformResult?.platformPostId||'queued');
  return `${platform}:${id}`;
}

export async function zernioHealth():Promise<void>{
  await zernioRequest('/profiles');
}

/** Remove the customer's connected accounts and profile when they delete their OmniPulse account. */
export async function zernioDeleteCustomer(userId:string):Promise<void>{
  const profiles:any[]=await sql()`SELECT profile_id FROM zernio_profiles WHERE user_id=${userId}`;
  if(!profiles[0]?.profile_id) return;
  const accounts:any[]=await sql()`SELECT account_id FROM zernio_connections WHERE user_id=${userId}`;
  for(const account of accounts){
    await zernioRequest(`/accounts/${encodeURIComponent(String(account.account_id))}`,{method:'DELETE'});
  }
  await zernioRequest(`/profiles/${encodeURIComponent(String(profiles[0].profile_id))}`,{method:'DELETE'});
  await sql()`DELETE FROM zernio_connections WHERE user_id=${userId}`;
  await sql()`DELETE FROM zernio_profiles WHERE user_id=${userId}`;
}

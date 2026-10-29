import { api, ApiError } from './api';
import { 
  GeneratedVideo, 
  VideoType, 
  AspectRatioType, 
  PlatformId, 
  VideoScene, 
  VideoCharacter,
  SceneLine,
  NicheCategory, 
  TrendingTopic, 
  TrendingCreator,
  HashtagGroup, 
  BestPractice,
  VideoDirectorStyle,
  HookFormulaStyle,
  AIDirectorEngine,
  GrokHookStyle,
  StoryBrief
} from '../types';
import { STUDIO_VOICES, StudioVoice, ElevenLabsVoice } from '../data/voicesData';

/**
 * Return real playable MP4 video footage matching the selected style and aspect ratio
 */

/**
 * High-Fidelity Studio Neural Audio Engine
 */
const audioCache = new Map<string, string>();

let currentAudioElement: HTMLAudioElement | null = null;
let currentPlaybackToken = 0;

/** The voice the user last clicked. Nothing is ever picked automatically: with no choice, videos have no voice-over. */
export const lastChosenVoice = (): string => {
  try { return localStorage.getItem('omnipulse:voice') || 'none'; } catch { return 'none'; }
};

export const StudioAudioService = {
  getAllVoices(): StudioVoice[] {
    return STUDIO_VOICES;
  },

  getVoicesByFilter(filter?: { gender?: string; voiceType?: string }): StudioVoice[] {
    return STUDIO_VOICES.filter(v => {
      if (filter?.gender && filter.gender !== 'all' && v.gender !== filter.gender) return false;
      if (filter?.voiceType && filter.voiceType !== 'all' && v.voiceType !== filter.voiceType) return false;
      return true;
    });
  },

  getVoice(voiceId?: string): StudioVoice {
    if (voiceId === 'none') return { ...STUDIO_VOICES[0], id: 'none', name: 'No voice-over', speakerName: 'No voice-over' } as StudioVoice;
    if (!voiceId) return STUDIO_VOICES[0];
    const clean = voiceId.toLowerCase().trim();

    // 1. Exact match by ID
    const exact = STUDIO_VOICES.find(v => v.id === voiceId);
    if (exact) return exact;

    // 2. Direct name matching
    if (clean.includes('adam')) return STUDIO_VOICES[0];
    if (clean.includes('sarah') || clean.includes('rachel') || voiceId === '21m00Tcm4TlvDq8ikWAM') {
      return STUDIO_VOICES[1]; // Sarah (Female)
    }
    if (clean.includes('chris') || voiceId === 'IKne3meq5aC7j9y36IXY') {
      return STUDIO_VOICES[2]; // Chris (Male)
    }
    if (clean.includes('alice')) {
      return STUDIO_VOICES[3]; // Alice (Female)
    }
    if (clean.includes('brian') || clean.includes('josh')) {
      return STUDIO_VOICES[4]; // Brian (Male)
    }
    if (clean.includes('bella')) {
      return STUDIO_VOICES[5]; // Bella (Female)
    }
    if (clean.includes('charlie') || clean.includes('jeremy')) {
      return STUDIO_VOICES[6]; // Charlie (Male)
    }
    if (clean.includes('jessica') || clean.includes('charlotte') || clean.includes('elli')) {
      return STUDIO_VOICES[7]; // Jessica (Female)
    }

    return STUDIO_VOICES[0];
  },

  getApiKey(): string {
    return '';
  },

  setApiKey(_key: string) {
    /* Voice keys are managed server-side. */
  },

  previewVoice(voiceId: string, onEnd?: () => void) {
    const voice = this.getVoice(voiceId);
    this.speak(voice.previewText, voice.id, voice.recommendedMomentum, onEnd);
  },

  async speak(
    text: string, 
    voiceId: string = 'pNInz6obpgDQGcFmaJgB', 
    momentum: number = 1.1, 
    onEnd?: () => void
  ) {
    // 1. Forcefully stop ANY playing audio immediately to guarantee NO OVERLAPPING VOICES
    this.stop();
    if (voiceId === 'none') { onEnd?.(); return; }

    const playbackToken = ++currentPlaybackToken;
    const voice = this.getVoice(voiceId);
    const cacheKey = `${voice.id}_${text.trim()}`;

    // 2. Check in-memory audio cache for instant playback
    if (audioCache.has(cacheKey)) {
      try {
        const cachedUrl = audioCache.get(cacheKey)!;
        const audio = new Audio(cachedUrl);
        audio.playbackRate = Math.max(0.75, Math.min(1.4, momentum));
        currentAudioElement = audio;

        audio.onended = () => {
          if (currentAudioElement === audio) currentAudioElement = null;
          if (onEnd) onEnd();
        };
        audio.onerror = () => {
          if (currentAudioElement === audio) currentAudioElement = null;
          if (onEnd) onEnd();
        };

        if (playbackToken === currentPlaybackToken) {
          await audio.play();
        }
        return;
      } catch (cacheErr) {
        console.warn('Cached audio playback error:', cacheErr);
      }
    }

    // 3. Call Server-Side Proxy Route (/api/tts) with gender guarantee
    let failure = 'The voice service could not be reached.';
    try {
      const proxyRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: voice.id,
          gender: voice.gender
        })
      });

      if (proxyRes.ok) {
        // If a new speak request was made while waiting, abort this playback!
        if (playbackToken !== currentPlaybackToken) {
          return;
        }

        const blob = await proxyRes.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioCache.set(cacheKey, audioUrl);

        const audio = new Audio(audioUrl);
        audio.playbackRate = Math.max(0.75, Math.min(1.4, momentum));
        currentAudioElement = audio;

        audio.onended = () => {
          if (currentAudioElement === audio) currentAudioElement = null;
          if (onEnd) onEnd();
        };
        audio.onerror = () => {
          if (currentAudioElement === audio) currentAudioElement = null;
          if (onEnd) onEnd();
        };

        if (playbackToken === currentPlaybackToken) {
          await audio.play();
        }
        return;
      }
      const errBody = await proxyRes.json().catch(() => null);
      failure = errBody?.error || `Voice request failed (${proxyRes.status}).`;
    } catch (proxyErr) {
      console.warn('/api/tts request failed:', proxyErr);
    }

    // No silent robotic fallback: tell the user clearly that the voice could not be generated.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('omnipulse:voice-error', { detail: failure }));
    if (onEnd) onEnd();
  },

  stop() {
    currentPlaybackToken++;

    if (currentAudioElement) {
      try {
        currentAudioElement.pause();
        currentAudioElement.currentTime = 0;
        currentAudioElement.src = '';
      } catch {
        // safe ignore
      }
      currentAudioElement = null;
    }

  }
};

export const ElevenLabsAudioService = StudioAudioService;

/** Neutral generated thumbnail (a gradient with the title's initial) until a real frame is available. */
export function placeholderThumb(label: string): string {
  const letter = (label.trim()[0] || 'V').toUpperCase().replace(/[<>&"']/g, 'V');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="160" y="105" font-family="Arial" font-size="64" font-weight="700" fill="#a5b4fc" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollRender(jobId: string, onStatus?: (m: string) => void, signal?: AbortSignal): Promise<string> {
  const started = Date.now();
  let hiccups = 0;
  while (Date.now() - started < 8 * 60_000) {
    if (signal?.aborted) throw new ApiError(0, 'Process stopped by you.', 'ABORTED');
    await sleep(5000);
    if (signal?.aborted) throw new ApiError(0, 'Process stopped by you.', 'ABORTED');
    let s: { state: 'queued' | 'rendering' | 'done' | 'failed'; videoUrl?: string; error?: string };
    try { s = await api.get<{ state: 'queued' | 'rendering' | 'done' | 'failed'; videoUrl?: string; error?: string }>(`/video/status?id=${encodeURIComponent(jobId)}`, { signal }); hiccups = 0; }
    catch (e) { if (signal?.aborted || (e instanceof ApiError && e.code === 'ABORTED')) throw e; if (++hiccups > 6) throw e; continue; }
    if (s.state === 'done' && s.videoUrl) return s.videoUrl;
    if (s.state === 'failed') throw new Error(s.error || 'The video render failed. Please try again.');
    const secs = Math.round((Date.now() - started) / 1000);
    onStatus?.(s.state === 'queued' ? `Waiting in the render queue... (${secs}s)` : `Rendering your video... (${secs}s)`);
  }
  throw new Error('Rendering is taking longer than expected. Please try again in a few minutes.');
}


/**
 * Generate a complete Video Script & Visual Storyboard using Gemini + fal.ai Pipeline
 */
export async function generateAIVideoScript(params: {
  idea: string;
  videoType: VideoType;
  aspectRatio: AspectRatioType;
  targetPlatforms: PlatformId[];
  nicheName: string;
  aiDirectorEngine?: AIDirectorEngine;
  grokHookStyle?: GrokHookStyle;
  voiceId?: string;
  /** Length of the video in seconds: 5 or 10. */
  seconds?: number;
  voiceMomentum?: number;
  voiceQuality?: string;
  signal?: AbortSignal;
}, onStatus?: (message: string) => void): Promise<GeneratedVideo> {
  const { 
    idea, 
    videoType, 
    aspectRatio, 
    targetPlatforms, 
    nicheName, 
    aiDirectorEngine = 'dynamic_viral',
    grokHookStyle = 'witty_provocative',
    voiceId = lastChosenVoice(),
    voiceMomentum = 1.1,
    voiceQuality = 'AI Studio Voice',
    seconds = 5,
    signal,
  } = params;
  const ensureRunning = () => { if (signal?.aborted) throw new ApiError(0, 'Process stopped by you.', 'ABORTED'); };
  ensureRunning();

  const chosenVoice = StudioAudioService.getVoice(voiceId);

  // 1. Script + storyboard from Gemini (server-side). Errors surface to the user.
  onStatus?.('Writing your script and storyboard...');
  const scriptBody = {
    idea,
    niche: nicheName,
    videoType,
    aspectRatio,
    targetPlatforms,
    directorStyle: aiDirectorEngine,
    hookFormula: grokHookStyle,
    voiceName: chosenVoice.speakerName,
    seconds,
  };
  const transient = (e: unknown) => e instanceof ApiError && ([0, 502, 503, 504].includes(e.status) || (e.status === 424 && e.code === 'GEMINI'));
  let scriptData: any;
  try {
    try { scriptData = await api.post('/gemini/generate-script', scriptBody, { signal }); }
    catch (e) { if (signal?.aborted || (e instanceof ApiError && e.code === 'ABORTED') || !transient(e)) throw e; onStatus?.('Script engine was busy, retrying...'); await sleep(1500); ensureRunning(); scriptData = await api.post('/gemini/generate-script', scriptBody, { signal }); }
  } catch (e) {
    throw new Error(`Script step failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  // 2. Real video render on fal.ai: submit job, then poll until it completes.
  onStatus?.('Submitting your video to the render engine...');
  const falPrompt = scriptData?.falPrompt || `${idea}. Dynamic camera motion, cinematic lighting, high detail`;
  let jobId: string;
  try { ({ jobId } = await api.post<{ jobId: string }>('/video/render', { prompt: falPrompt, seconds }, { signal })); }
  catch (e) { throw new Error(`Video render step failed: ${e instanceof Error ? e.message : 'unknown error'}`); }
  ensureRunning();
  const generatedVideoUrl = await pollRender(jobId, onStatus, signal);
  const falEngineName = 'fal-ai/minimax/video-01';

  // If Gemini generated the script, build the complete video object
  {
    const GRADIENTS = ['from-indigo-950 via-slate-900 to-black', 'from-blue-950 via-slate-900 to-black', 'from-emerald-950 via-slate-900 to-black', 'from-purple-950 via-slate-900 to-black'];
    const MOTIONS: VideoScene['motionStyle'][] = ['Dynamic Zoom', 'Kinetic Kinetic Typography', 'Isometric Pan', 'Hand Sketch Draw'];
    const scenes: VideoScene[] = scriptData.scenes.map((s: any, idx: number) => ({
      id: `scene-${Date.now()}-${idx}`,
      sceneNumber: s.sceneNumber || idx + 1,
      duration: Number(s.duration) || 4,
      visualCue: s.visualDescription || `High-retention visual sequence for ${idea}`,
      motionStyle: MOTIONS[idx % MOTIONS.length],
      bgGradient: GRADIENTS[idx % GRADIENTS.length],
      narration: s.narration || `Scene ${idx + 1} narration`,
      onScreenText: s.onScreenText || '',
      soundEffectCue: s.soundEffectCue || 'Whoosh / Audio Accent',
    }));

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    return {
      id: `vid-${Date.now()}`,
      title: scriptData.title || `${idea.slice(0, 40)}...`,
      userPrompt: idea,
      nicheId: nicheName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      status: 'ready' as const,
      voiceoverStyle: `${chosenVoice.speakerName} · ${voiceQuality} [${voiceMomentum}x]`,
      backgroundMusicTrack: 'Voice-over only',
      videoType,
      aspectRatio,
      targetPlatforms,
      estimatedDuration: totalDuration,
      scenes,
      hashtags: Array.isArray(scriptData.hashtags) ? scriptData.hashtags : [],
      videoUrl: generatedVideoUrl,
      thumbnailUrl: placeholderThumb(scriptData?.title || idea),
      createdAt: new Date().toISOString(),
      directorStyle: aiDirectorEngine,
      hookFormula: grokHookStyle,
      voiceId: chosenVoice.id,
      voiceName: chosenVoice.speakerName,
      voiceMomentum,
      voiceQuality,
      soundDesignBadge: `${falEngineName} · AI voice`,
      callToAction: scenes[scenes.length - 1]?.narration || '',
    };
  }

}

/**
 * Live niche research: Gemini + Google Search grounding on the server. Throws on failure (no canned data).
 */
export async function analyzeNicheTrends(nicheName: string, customQuery?: string): Promise<{
  trendingTopics: TrendingTopic[];
  viralHashtags: HashtagGroup;
  suggestedKeywords: string[];
  bestPractices: BestPractice[];
  researchSources: { title: string; url: string }[];
  researchGrounded: boolean;
  trendingCreators: TrendingCreator[];
}> {
  // Two short requests (live search, then formatting) so no single request runs long.
  const found: any = await api.post('/gemini/research-trends', { niche: nicheName, customQuery: customQuery || '' });
  const data: any = await api.post('/gemini/research-trends', { step: 'format', niche: nicheName, notes: found.notes });
  data.sources = found.sources; data.grounded = !!found.grounded;
  if (!Array.isArray(data.trendingTopics) || !data.trendingTopics.length) {
    throw new Error('Research returned no trends. Please try again.');
  }
  const stamp = Date.now();
  return {
    trendingTopics: data.trendingTopics.map((t: any, idx: number) => ({
      id: t.id || `topic-${stamp}-${idx}`,
      title: t.title,
      velocity: t.velocity || '',
      sentiment: t.sentiment || 'Rising',
      recommendedFormat: t.recommendedFormat || 'TikTok/Reels 9:16',
      viralHooks: t.viralHooks || [],
      contentAngle: t.contentAngle || '',
      estimatedReachMultiplier: t.estimatedReachMultiplier || '',
      falVideoPrompt: t.falVideoPrompt,
      whyNow: t.whyNow || '',
    })),
    viralHashtags: {
      viral: data.viralHashtags?.viral || [],
      nicheSpecific: data.viralHashtags?.nicheSpecific || [],
      evergreen: data.viralHashtags?.evergreen || [],
    },
    suggestedKeywords: data.suggestedKeywords || [],
    bestPractices: data.bestPractices || [],
    researchSources: Array.isArray(data.sources) ? data.sources : [],
    researchGrounded: !!data.grounded,
    trendingCreators: Array.isArray(data.trendingCreators) ? data.trendingCreators.filter((c: any) => c && c.name).map((c: any) => ({
      name: String(c.name), handle: String(c.handle || ''), platform: String(c.platform || ''), url: c.url ? String(c.url) : undefined,
      whyTrending: String(c.whyTrending || ''), contentStyle: String(c.contentStyle || ''), takeaway: String(c.takeaway || ''), exampleHook: c.exampleHook ? String(c.exampleHook) : undefined,
    })) : [],
  };
}

// ---------------------------------------------------------------------------
// Multi-character productions (drama, documentary, animation)
// ---------------------------------------------------------------------------
export type StoryFormat = 'drama' | 'documentary' | 'animation';

/** Exactly what the render endpoint (POST /video/render) takes. The server builds it, the browser sends it unchanged. */
export interface SceneRenderPayload { prompt: string; seconds: 5 | 10; aspect: AspectRatioType }

export interface StoryScene {
  id: string;
  /** Stable storyboard id, e.g. "scene-03". */
  sceneId?: string;
  sceneNumber?: number;
  /** Story beat, e.g. "Hook", "Climax". */
  beat?: string;
  /** Micro-detailed description of what the camera sees (scenery, physics, lighting) in the chosen mood. */
  visualPrompt: string;
  /** The spoken words of this scene (narration and dialogue, no speaker names). */
  voiceoverText?: string;
  /** The camera instruction for this scene, translated from the chosen camera profile. */
  cameraMotion?: string;
  /** What is sent to the video engine: the picture plus the spoken dialogue. Same text as render.prompt. */
  renderPrompt?: string;
  /** Ready-to-send render request for this scene. */
  render?: SceneRenderPayload;
  lines: SceneLine[];
  /** Length of this scene's clip: 5 or 10 seconds, planned from the length the person chose. */
  clipSeconds: 5 | 10;
}

export interface StoryDraft {
  title: string;
  logline: string;
  format: StoryFormat;
  brief?: StoryBrief & { targetSeconds: number; moodLabel?: string; cameraLabel?: string };
  characters: VideoCharacter[];
  scenes: StoryScene[];
  totalSeconds: number;
  secondsAvailable: number;
  /** Plain-language messages for the person, e.g. that the length was reduced to fit their allowance. */
  notes?: string[];
  hashtags: string[];
  callToAction: string;
}

export interface StoryDraftRequest {
  idea: string;
  format: StoryFormat;
  look: string;
  aspectRatio: AspectRatioType;
  niche: string;
  /** Duration mode, target length, mood, camera profile and optional character lock. */
  brief: StoryBrief;
}

/**
 * Asks the server for a multi-scene storyboard. The brief is flattened into the request body the handler reads
 * (durationMode, requestedSeconds, mood, cameraProfile, characterLock). Retries once if the script engine is briefly busy.
 */
export async function generateStoryDraft(p: StoryDraftRequest): Promise<StoryDraft> {
  if (!p.idea || p.idea.trim().length < 10) throw new Error('Please describe your story in a sentence or two.');
  const body = {
    idea: p.idea, format: p.format, look: p.look, aspectRatio: p.aspectRatio, niche: p.niche,
    durationMode: p.brief.durationMode, requestedSeconds: p.brief.requestedSeconds,
    mood: p.brief.mood, cameraProfile: p.brief.cameraProfile, characterLock: p.brief.characterLock,
  };
  const transient = (e: unknown) => e instanceof ApiError && ([0, 502, 503, 504].includes(e.status) || (e.status === 424 && e.code === 'GEMINI'));
  let draft: StoryDraft;
  try { draft = await api.post<StoryDraft>('/gemini/generate-story', body); }
  catch (e) {
    if (!transient(e)) throw e;
    await sleep(1500);
    draft = await api.post<StoryDraft>('/gemini/generate-story', body);
  }
  if (!draft || !Array.isArray(draft.scenes) || !draft.scenes.length) throw new Error('The script came back without any scenes. Please try again.');
  return draft;
}

/** Reads the render payload the server prepared for a scene (older drafts only had renderPrompt). */
function payloadFor(scene: StoryScene, aspectRatio: AspectRatioType): SceneRenderPayload {
  const payload: SceneRenderPayload = scene.render || { prompt: scene.renderPrompt || scene.visualPrompt, seconds: scene.clipSeconds, aspect: aspectRatio };
  if (!payload.prompt || payload.prompt.length < 5) throw new Error(`Scene ${scene.sceneNumber ?? ''} has no picture description to render.`.replace('Scene  ', 'This scene '));
  return payload;
}

/** `id` is the scene's `id` (the key the screen stores clips under). */
export interface SceneRenderResult { id: string; ok: boolean; url?: string; jobId?: string; error?: string }

/**
 * Render supervisor (browser side). Sends ALL scenes to the server in one request, where they are started in parallel,
 * then follows every started scene at the same time with Promise.all. One failed scene never stops the others:
 * each result says whether that scene worked, so only the failed ones need a retry.
 *
 * `onScene` is called whenever a scene changes state, so the screen can show per-scene progress.
 */
export async function renderStoryScenesParallel(
  scenes: StoryScene[],
  aspectRatio: AspectRatioType,
  onScene?: (sceneId: string, state: 'rendering' | 'done' | 'failed', message?: string) => void,
): Promise<SceneRenderResult[]> {
  if (!scenes.length) return [];
  const payloads = scenes.map((sc) => payloadFor(sc, aspectRatio));

  // 1. Start every scene at once. The server checks the whole allowance first, so this either starts or explains why not.
  type Started = { jobs: ({ index: number; jobId: string } | { index: number; error: string })[] };
  let started: Started | undefined;
  for (let attempt = 0; attempt < 4 && !started; attempt++) {
    try { started = await api.post<Started>('/video/render-batch', { scenes: payloads }); }
    catch (e) {
      const busy = e instanceof ApiError && (e.code === 'RATE_LIMIT' || e.status === 429 || [502, 503, 504].includes(e.status));
      if (!busy || attempt === 3) throw new Error(e instanceof Error ? e.message : 'Could not start the render.');
      await sleep(8000 + attempt * 8000);
    }
  }
  const byIndex = new Map<number, { jobId?: string; error?: string }>();
  (started?.jobs || []).forEach((j) => byIndex.set(j.index, { jobId: 'jobId' in j ? j.jobId : undefined, error: 'error' in j ? j.error : undefined }));

  // 2. Follow every started scene at the same time.
  return Promise.all(scenes.map(async (sc, i): Promise<SceneRenderResult> => {
    const job = byIndex.get(i);
    if (!job?.jobId) {
      const error = job?.error || 'The video engine did not start this scene.';
      onScene?.(sc.id, 'failed', error);
      return { id: sc.id, ok: false, error };
    }
    onScene?.(sc.id, 'rendering');
    try {
      const url = await pollRender(job.jobId, (m) => onScene?.(sc.id, 'rendering', m));
      onScene?.(sc.id, 'done');
      return { id: sc.id, ok: true, url, jobId: job.jobId };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'This scene failed.';
      onScene?.(sc.id, 'failed', error);
      return { id: sc.id, ok: false, error, jobId: job.jobId };
    }
  }));
}

/** Renders one scene as its own clip. Kept for single retries; whole productions use renderStoryScenesParallel. */
export async function renderStoryScene(scene: StoryScene, aspectRatio: AspectRatioType, onStatus?: (m: string) => void): Promise<{ url: string; jobId: string }> {
  const payload = payloadFor(scene, aspectRatio);
  let jobId = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      ({ jobId } = await api.post<{ jobId: string }>('/video/render', { prompt: payload.prompt, seconds: payload.seconds, aspect: payload.aspect }));
      break;
    } catch (e) {
      const busy = e instanceof ApiError && (e.code === 'RATE_LIMIT' || /too many|busy/i.test(e.message));
      if (!busy || attempt === 5) throw new Error(e instanceof Error ? e.message : 'Could not start the render.');
      for (let left = 10 + attempt * 8; left > 0; left--) { onStatus?.(`The video engine is busy. Trying again in ${left}s...`); await sleep(1000); }
    }
  }
  if (!jobId) throw new Error('The render did not start. Please try again.');
  return { url: await pollRender(jobId, onStatus), jobId };
}

export function buildStoryVideo(draft: StoryDraft, clips: Record<string, { url: string; jobId: string }>, o: { idea: string; aspectRatio: AspectRatioType; nicheName: string; targetPlatforms: PlatformId[] }): GeneratedVideo {
  const GRADIENTS = ['from-indigo-950 via-slate-900 to-black', 'from-blue-950 via-slate-900 to-black', 'from-emerald-950 via-slate-900 to-black', 'from-purple-950 via-slate-900 to-black'];
  const scenes: VideoScene[] = draft.scenes.map((sc, i) => ({
    id: `scene-${Date.now()}-${i}`,
    sceneNumber: i + 1,
    duration: sc.clipSeconds,
    visualCue: sc.visualPrompt,
    visualPrompt: sc.visualPrompt,
    voiceoverText: sc.voiceoverText || sc.lines.map((l) => l.text).join(' '),
    cameraMotion: sc.cameraMotion,
    beat: sc.beat,
    narration: sc.lines.map((l) => `${l.speaker}: ${l.text}`).join(' '),
    lines: sc.lines,
    clipUrl: clips[sc.id]?.url,
    clipJobId: clips[sc.id]?.jobId,
    onScreenText: '',
    soundEffectCue: '',
    motionStyle: draft.brief?.cameraProfile === 'steady_pan' || draft.brief?.cameraProfile === 'static_narrative' ? 'Isometric Pan' : 'Dynamic Zoom',
    bgGradient: GRADIENTS[i % GRADIENTS.length],
  }));
  return {
    id: `vid-${Date.now()}`,
    title: draft.title,
    userPrompt: o.idea,
    videoType: draft.format === 'animation' ? 'cartoon_3d' : draft.format === 'documentary' ? 'real_video' : 'cgi_3d',
    aspectRatio: o.aspectRatio,
    targetPlatforms: o.targetPlatforms,
    nicheId: o.nicheName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    estimatedDuration: draft.totalSeconds,
    scenes,
    characters: draft.characters,
    format: draft.format,
    brief: draft.brief ? { durationMode: draft.brief.durationMode, requestedSeconds: draft.brief.requestedSeconds, targetSeconds: draft.brief.targetSeconds, mood: draft.brief.mood, cameraProfile: draft.brief.cameraProfile, characterLock: draft.brief.characterLock } : undefined,
    voiceoverStyle: `${draft.characters.length} characters, voices made by the video engine`,
    backgroundMusicTrack: 'Sound made by the video engine',
    thumbnailUrl: placeholderThumb(draft.title),
    createdAt: new Date().toISOString(),
    status: 'ready',
    hashtags: draft.hashtags,
    callToAction: draft.callToAction,
  };
}

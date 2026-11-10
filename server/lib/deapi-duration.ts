export interface DeapiFrameLimits {
  minFrames: number;
  maxFrames: number;
  fps: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
}

const finite = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Documented DeAPI fallback limits for models whose live catalogue omits
 * frame limits. Live /models metadata always takes precedence.
 */
const DOCUMENTED_LIMITS: Record<string, { minFrames: number; maxFrames: number; fps: number }> = {
  seedance25: { minFrames: 97, maxFrames: 721, fps: 24 },
  kling4: { minFrames: 73, maxFrames: 721, fps: 24 },
  minimaxh3: { minFrames: 96, maxFrames: 360, fps: 24 },
  ltx25: { minFrames: 49, maxFrames: 241, fps: 24 },
  ltx23: { minFrames: 49, maxFrames: 241, fps: 24 },
  veo31: { minFrames: 97, maxFrames: 193, fps: 24 },
  ltxvideo13b: { minFrames: 30, maxFrames: 120, fps: 30 },
};

const normalizedSlug = (slug: string) => String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function getDeapiFrameLimits(model: string, modelInfo: any): DeapiFrameLimits | null {
  const info = modelInfo?.info && typeof modelInfo.info === 'object' ? modelInfo.info : (modelInfo || {});
  const limits = info?.limits || {};
  const defaults = info?.defaults || {};
  const fallback = Object.entries(DOCUMENTED_LIMITS).find(([prefix]) => normalizedSlug(model).startsWith(prefix))?.[1];

  const minFrames = finite(limits.min_frames) ?? fallback?.minFrames ?? null;
  const maxFrames = finite(limits.max_frames) ?? fallback?.maxFrames ?? null;
  const minFps = finite(limits.min_fps);
  const maxFps = finite(limits.max_fps);
  const fps = finite(defaults.fps)
    ?? (minFps !== null && maxFps !== null && minFps === maxFps ? minFps : null)
    ?? minFps
    ?? maxFps
    ?? fallback?.fps
    ?? null;

  if (minFrames === null || maxFrames === null || fps === null
    || minFrames < 2 || maxFrames < minFrames || fps <= 0) return null;

  const minDurationSeconds = Math.round(((minFrames - 1) / fps) * 100) / 100;
  const maxDurationSeconds = Math.round(((maxFrames - 1) / fps) * 100) / 100;
  return { minFrames, maxFrames, fps, minDurationSeconds, maxDurationSeconds };
}

/** Converts a requested whole-second clip into provider frames without silently truncating it. */
export function deapiFramesForDuration(seconds: number, model: string, modelInfo: any): { frames: number; fps: number } {
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new RangeError('Video duration must be a positive whole number of seconds.');
  }
  const bounds = getDeapiFrameLimits(model, modelInfo);
  if (!bounds) throw new RangeError(`DeAPI did not publish frame limits for ${model}. Refresh the model list or choose a model with known duration limits.`);
  const frames = Math.round(seconds * bounds.fps) + 1;
  if (frames < bounds.minFrames || frames > bounds.maxFrames) {
    const min = Math.ceil(bounds.minDurationSeconds * 10) / 10;
    const max = Math.floor(bounds.maxDurationSeconds * 10) / 10;
    throw new RangeError(`${model} supports approximately ${min}–${max} seconds at ${bounds.fps} FPS; ${seconds} seconds is not supported.`);
  }
  return { frames, fps: bounds.fps };
}

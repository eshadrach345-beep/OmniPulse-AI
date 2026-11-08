export type DeapiVideoModelInfo = {
  info?: { features?: Record<string, unknown>; limits?: Record<string, unknown>; defaults?: Record<string, unknown> };
};

export type DeapiVideoOverrides = { negative_prompt?: unknown; guidance?: unknown; steps?: unknown };

export const DEAPI_VIDEO_NEGATIVE_PROMPT = [
  'malformed hands', 'deformed hands', 'extra fingers', 'fused fingers',
  'distorted limbs', 'duplicate people', 'duplicate faces', 'ghosting',
  'morphing', 'warping', 'melting', 'smearing', 'flicker', 'jitter',
  'unstable anatomy', 'floating objects', 'unreadable text', 'watermark',
  'screen-within-screen', 'phone status bar', 'collage',
].join(', ');

const finiteNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
  return Number.isFinite(n) ? n : null;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Converts live model capabilities/defaults into supported multipart fields. */
export function buildDeapiVideoFields(modelInfo: DeapiVideoModelInfo | null | undefined, overrides: DeapiVideoOverrides = {}): Record<string, string> {
  const info = modelInfo?.info || {};
  const features = info.features || {};
  const limits = info.limits || {};
  const defaults = info.defaults || {};
  const fields: Record<string, string> = {};
  if (features.supports_negative_prompt !== false) {
    const custom = typeof overrides.negative_prompt === 'string' ? overrides.negative_prompt.trim() : '';
    fields.negative_prompt = [DEAPI_VIDEO_NEGATIVE_PROMPT, custom].filter(Boolean).join(', ').slice(0, 1800);
  }
  if (features.supports_guidance === true) {
    const min = finiteNumber(limits.min_guidance) ?? 0;
    const max = finiteNumber(limits.max_guidance) ?? 30;
    const requested = finiteNumber(overrides.guidance) ?? finiteNumber(defaults.guidance) ?? 3;
    fields.guidance = String(clamp(requested, min, max));
  }
  if (features.supports_steps === true) {
    const min = finiteNumber(limits.min_steps) ?? 1;
    const max = finiteNumber(limits.max_steps) ?? 100;
    const requested = finiteNumber(overrides.steps) ?? finiteNumber(defaults.steps) ?? 20;
    fields.steps = String(Math.round(clamp(requested, min, max)));
  }
  return fields;
}

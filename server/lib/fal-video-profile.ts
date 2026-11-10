export type FalVideoTask = 'text' | 'image';
export type FalVideoQuality = 'balanced' | 'quality';

const DEFAULT_MODELS: Record<FalVideoTask, Record<FalVideoQuality, string>> = {
  text: {
    balanced: 'minimax/h3-max-turbo/text-to-video',
    quality: 'minimax/h3-max/text-to-video',
  },
  image: {
    balanced: 'minimax/h3-max-turbo/image-to-video',
    quality: 'minimax/h3-max/image-to-video',
  },
};

/**
 * Resolve the provider endpoint for a creator's selected quality profile.
 * Built-in H3 workspace defaults follow the per-production profile. A genuinely
 * custom FAL_VIDEO_MODEL remains authoritative.
 */
export function resolveFalVideoModel(
  task: FalVideoTask,
  quality: FalVideoQuality = 'balanced',
  configuredModel?: string,
): string {
  const configured = String(configuredModel || '').trim();
  const selectedQuality = quality === 'quality' ? 'quality' : 'balanced';
  if (configured) {
    // A workspace H3 default is not allowed to silently override the per-production
    // quality choice. Preserve only genuinely custom workspace model overrides.
    const configuredH3 = /^minimax\/h3-max(?:-turbo)?\/(?:text-to-video|image-to-video)$/.test(configured);
    if (configuredH3) return DEFAULT_MODELS[task][selectedQuality];
    if (task === 'image' && configured.endsWith('/text-to-video')) {
      return configured.replace(/\/text-to-video$/, '/image-to-video');
    }
    if (task === 'text' && configured.endsWith('/image-to-video')) {
      return configured.replace(/\/image-to-video$/, '/text-to-video');
    }
    return configured;
  }
  return DEFAULT_MODELS[task][selectedQuality];
}

/** Keep an explicit workspace prompt-expansion setting, otherwise match the profile. */
export function resolveFalPromptExpansionMode(
  quality: FalVideoQuality = 'balanced',
  configuredMode?: string,
): 'disabled' | 'balanced' | 'quality' {
  const configured = String(configuredMode || '').trim().toLowerCase();
  if (configured === 'disabled' || configured === 'balanced' || configured === 'quality') return configured;
  return quality === 'quality' ? 'quality' : 'balanced';
}

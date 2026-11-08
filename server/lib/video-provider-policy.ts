/** Explicit provider policy for video rendering. A backup is used only when the operator selects VIDEO_PROVIDER=auto. */
export type VideoProvider = 'fal' | 'deapi' | 'auto';

export function parseVideoProvider(value: unknown): VideoProvider {
  const provider = String(value || 'fal').trim().toLowerCase();
  if (provider === 'fal' || provider === 'deapi' || provider === 'auto') return provider;
  throw new Error('VIDEO_PROVIDER must be fal, deapi, or auto.');
}

export function shouldFallbackToDeapi(provider: VideoProvider): boolean {
  return provider === 'auto';
}

export function shouldAttemptKlingMultiShot(provider: VideoProvider, hasFalKey: boolean, shotCount: number): boolean {
  return provider !== 'deapi' && hasFalKey && shotCount > 0;
}

export function requiresKlingMultiShot(provider: VideoProvider, shotCount: number): boolean {
  return provider !== 'deapi' && shotCount > 0;
}

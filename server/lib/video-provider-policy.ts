/** Explicit provider policy for video rendering. Credit exhaustion always activates a configured backup. */
export type VideoProvider = 'fal' | 'deapi' | 'auto';

export function parseVideoProvider(value: unknown): VideoProvider {
  const provider = String(value || 'fal').trim().toLowerCase();
  if (provider === 'fal' || provider === 'deapi' || provider === 'auto') return provider;
  throw new Error('VIDEO_PROVIDER must be fal, deapi, or auto.');
}

export function isFalCreditExhaustion(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');
  return /fal(?:\\.ai)?[^\\n]*(?:credit|balance|locked|insufficient)|(?:exhausted|insufficient)[^\\n]*(?:fal(?:\\.ai)?|video credits?|balance)|user is locked/i.test(message);
}

export function shouldFallbackToDeapi(provider: VideoProvider, error?: unknown): boolean {
  return provider === 'auto' || isFalCreditExhaustion(error);
}

export function shouldAttemptKlingMultiShot(provider: VideoProvider, hasFalKey: boolean, shotCount: number): boolean {
  return provider !== 'deapi' && hasFalKey && shotCount > 0;
}

export function requiresKlingMultiShot(provider: VideoProvider, shotCount: number): boolean {
  return provider !== 'deapi' && shotCount > 0;
}

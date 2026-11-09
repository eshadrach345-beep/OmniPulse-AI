/** Pure helpers for DeAPI's audio-conditioned video endpoint. */
export const DEAPI_AUDIO_SYNC_MIN_SECONDS = 1;
export const DEAPI_AUDIO_SYNC_MAX_SECONDS = 11;

/** LTX audio-sync expects frame counts in 8n+1 steps at 24 fps. */
export function deapiAudioSyncFrames(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds < DEAPI_AUDIO_SYNC_MIN_SECONDS || durationSeconds > DEAPI_AUDIO_SYNC_MAX_SECONDS) {
    throw new RangeError(`Audio-to-video duration must be between ${DEAPI_AUDIO_SYNC_MIN_SECONDS} and ${DEAPI_AUDIO_SYNC_MAX_SECONDS} seconds.`);
  }
  const units = Math.max(3, Math.min(33, Math.round(durationSeconds * 3)));
  return units * 8 + 1;
}

export function supportsDeapiAudioSyncModel(slug: string, evidence = ''): boolean {
  const normalized = String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /audio.?to.?video|audio.?sync|audio.?conditioned.?video|supports.?audio.?input/i.test(evidence)
    || /^ltx23/.test(normalized);
}

/** Only the audio types documented by DeAPI's audio-sync endpoint are accepted. */
export function deapiAudioMime(contentType: string, filename = ''): { type: string; extension: string } | null {
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  const ext = String(filename || '').toLowerCase().split('.').pop() || '';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3' || ext === 'mp3') return { type: 'audio/mpeg', extension: 'mp3' };
  if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave' || ext === 'wav') return { type: 'audio/wav', extension: 'wav' };
  if (mime === 'audio/ogg' || mime === 'application/ogg' || ext === 'ogg') return { type: 'audio/ogg', extension: 'ogg' };
  if (mime === 'audio/flac' || mime === 'audio/x-flac' || ext === 'flac') return { type: 'audio/flac', extension: 'flac' };
  return null;
}

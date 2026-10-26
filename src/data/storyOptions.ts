// Creative options for the Story Studio (length, mood, camera, character lock).
//
// The ids here are the SAME ids the server accepts (server/lib/prompts.ts: STORY_MOODS, CAMERA_PROFILES, STORY_LIMITS).
// If you add or rename an option, change both files. The server always falls back to a safe default for an unknown id.

import type { CameraProfileId, StoryBrief, StoryMoodId } from '../types';

/** Quick length choices for one part. Anything from 20 seconds to 10 minutes works; these are just the common ones. */
export const LENGTH_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 seconds' }, { seconds: 60, label: '1 minute' }, { seconds: 120, label: '2 minutes' },
  { seconds: 180, label: '3 minutes' }, { seconds: 300, label: '5 minutes' }, { seconds: 600, label: '10 minutes' },
];
export const MIN_PART_SECONDS = 20;
export const MAX_PART_SECONDS = 600;
/** Most scenes one pasted script part holds; the rest of the script carries over to the next part. */
export const PASTE_SCENES_PER_PART = 8;

export interface MoodOption { id: StoryMoodId; label: string; hint: string }
export const MOOD_OPTIONS: MoodOption[] = [
  { id: 'dramatic_suspense', label: 'Dramatic / Suspense', hint: 'Slow-burn tension, shadows, unanswered questions.' },
  { id: 'melodrama', label: 'Melodrama', hint: 'Big feelings, high stakes, rich colour.' },
  { id: 'viral_hook', label: 'High-Energy Viral Hook', hint: 'Scroll-stopping first second, fast reversals.' },
  { id: 'emotional_heartfelt', label: 'Emotional / Heartfelt', hint: 'Warm light, small human moments.' },
  { id: 'cinematic_trailer', label: 'Cinematic Movie Trailer', hint: 'Epic scale, rising stakes, big reveal.' },
];

export interface CameraOption { id: CameraProfileId; label: string; hint: string }
export const CAMERA_OPTIONS: CameraOption[] = [
  { id: 'slow_dramatic_zoom', label: 'Slow Dramatic Zoom', hint: 'Gradual push-in on the subject.' },
  { id: 'steady_pan', label: 'Steady Pan', hint: 'Smooth sideways sweep across the scene.' },
  { id: 'static_narrative', label: 'Static Narrative', hint: 'Locked-off shot; the action carries it.' },
  { id: 'kinetic_tracking', label: 'Kinetic Tracking', hint: 'Fast, energetic follow shot.' },
];

export const CHARACTER_DESCRIPTOR_MIN = 10;
export const CHARACTER_DESCRIPTOR_MAX = 300;

/** Turns what the person chose into a length that is valid (a multiple of 10, 20 seconds to 10 minutes) and fits what they can still use. */
export function clampSeconds(wanted: number, secondsLeft?: number | null): number {
  const n = Number.isFinite(wanted) ? wanted : 60;
  const inRange = Math.max(MIN_PART_SECONDS, Math.min(MAX_PART_SECONDS, Math.round(n / 10) * 10));
  if (secondsLeft == null || !Number.isFinite(secondsLeft)) return inRange;
  return Math.max(10, Math.min(inRange, Math.floor(secondsLeft / 10) * 10));
}

/** "45 seconds", "1 minute", "2 min 40 s" */
export function formatSeconds(s: number): string {
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : m === 1 ? '1 minute' : `${m} minutes`;
}

/** How many scenes a length gives: whole scenes of `sceneSeconds`, plus a 10 second hook scene when something is left over. */
export function sceneCountFor(seconds: number, sceneSeconds: 10 | 20 = 20): number {
  const full = Math.floor(seconds / sceneSeconds);
  return full + (seconds - full * sceneSeconds >= 10 ? 1 : 0);
}

/**
 * Checks the form and returns the brief to send, or a message to show the person.
 * Keeping this in one place means the screen and the request can never disagree.
 */
export function buildBrief(i: {
  seconds: number; sceneSeconds: 10 | 20; mood: StoryMoodId | ''; camera: CameraProfileId | '';
  lockEnabled: boolean; lockName: string; lockDescriptor: string; secondsLeft?: number | null;
}): { ok: true; brief: StoryBrief } | { ok: false; error: string } {
  if (!i.mood) return { ok: false, error: 'Choose a story genre or mood.' };
  if (!i.camera) return { ok: false, error: 'Choose a camera movement profile.' };
  if (i.secondsLeft != null && i.secondsLeft < 10) return { ok: false, error: 'You have fewer than 10 video seconds left. Buy extra seconds or upgrade your plan.' };
  let characterLock: StoryBrief['characterLock'];
  if (i.lockEnabled) {
    const descriptor = i.lockDescriptor.replace(/\s+/g, ' ').trim();
    if (descriptor.length < CHARACTER_DESCRIPTOR_MIN) return { ok: false, error: `Describe your main character in at least ${CHARACTER_DESCRIPTOR_MIN} characters (age, hair, clothes, one distinctive detail).` };
    characterLock = { name: i.lockName.replace(/\s+/g, ' ').trim().slice(0, 30) || undefined, descriptor: descriptor.slice(0, CHARACTER_DESCRIPTOR_MAX) };
  }
  const requestedSeconds = clampSeconds(i.seconds, i.secondsLeft);
  return { ok: true, brief: { durationMode: requestedSeconds <= 60 ? 'short' : 'long', requestedSeconds, sceneSeconds: i.sceneSeconds, mood: i.mood, cameraProfile: i.camera, characterLock } };
}

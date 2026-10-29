// Client for the series (project and episode) routes. The server saves an episode as PROCESSING at once and does the work in steps;
// getEpisode() both reads the episode and nudges the next step forward, so the screen simply polls it.

import { api } from './api';
import type { AspectRatioType, StoryBrief } from '../types';
import type { StoryFormat } from './aiService';

export type EpisodeStatus = 'PROCESSING' | 'RENDERING' | 'COMPLETED' | 'FAILED';

export interface EpisodeScene {
  sceneId: string;
  sceneNumber: number;
  beat: string;
  clipSeconds: number;
  visualPrompt: string;
  voiceoverText: string;
  cameraMotion: string;
  lines: { speaker: string; text: string }[];
}

export interface Episode {
  id: string;
  projectId: string;
  partNumber: number;
  status: EpisodeStatus;
  promptInput: string;
  title: string;
  logline: string;
  storySoFar: string;
  finalVideoUrl: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** A reason shown while a part is still working (for example: waiting for the video engine's rate limit). */
  note: string;
  totalScenes: number;
  renderedScenes: number;
  /** Video clips finished out of all clips (a 20 second scene is two clips). */
  partsDone: number;
  partsTotal: number;
  sceneStates: ('done' | 'rendering' | 'waiting' | 'failed')[];
  totalSeconds: number;
  mode: 'ai' | 'paste';
  /** True when a pasted script was longer than this part and the rest is saved for the next part. */
  hasRemainingScript: boolean;
  targetParts: number;
  autoContinue: boolean;
  characters: { name: string; role: string; gender: string; voice: string }[];
  notes: string[];
  /** The settings this part was made with: { format, look, aspect, niche, brief }. */
  brief: { format?: StoryFormat; look?: string; aspect?: AspectRatioType; niche?: string; brief?: StoryBrief };
  scenes: EpisodeScene[];
  /** Finished scene clips in story order (set once the episode is COMPLETED). */
  clips: string[];
}

export interface SeriesCharacter { name: string; role: string; gender: string; description: string; voice?: string }

export interface ProjectSummary {
  id: string;
  title: string;
  genre: string;
  createdAt: string | null;
  updatedAt: string | null;
  episodes: { id: string; partNumber: number; status: EpisodeStatus; title: string | null }[];
}

export interface ProjectDetail {
  project: { id: string; title: string; genre: string; targetParts: number; autoContinue: boolean; createdAt: string | null; updatedAt: string | null; characters: SeriesCharacter[] };
  episodes: Episode[];
  nextPartNumber: number;
  /** Set while a part is still being made. */
  activeEpisodeId: string | null;
  /** The latest finished part, shown as "where you left off". */
  recap: { partNumber: number; title: string; logline: string; storySoFar: string; hasRemainingScript?: boolean; scenes: EpisodeScene[] } | null;
  defaults: Episode['brief'] | null;
}

export interface CreateEpisodeRequest {
  /** Leave out to start a new series (Part 1). */
  projectId?: string;
  title?: string;
  /** What the AI should write about (AI mode), or what should happen next. */
  idea: string;
  /** 'ai': the AI writes the script. 'paste': the person's own script is adapted into scenes. */
  mode: 'ai' | 'paste';
  /** The pasted script (paste mode). May be empty when continuing a script that was saved. */
  script?: string;
  format: StoryFormat;
  look: string;
  aspectRatio: AspectRatioType;
  niche: string;
  brief: StoryBrief;
  /** New series only: how many parts, and whether to make them all now or one at a time. */
  series?: { parts: number; deliver: 'all' | 'one' };
}

export const Series = {
  list: () => api.get<{ projects: ProjectSummary[] }>('/projects').then((r) => r.projects),
  get: (id: string) => api.get<ProjectDetail>(`/projects/get?id=${encodeURIComponent(id)}`),
  create: (r: CreateEpisodeRequest) => api.post<{ projectId: string; episodeId: string; partNumber: number; status: EpisodeStatus }>('/episodes/create', {
    projectId: r.projectId, title: r.title, idea: r.idea, mode: r.mode, script: r.script, series: r.series, format: r.format, look: r.look, aspectRatio: r.aspectRatio, niche: r.niche,
    durationMode: r.brief.durationMode, requestedSeconds: r.brief.requestedSeconds, sceneSeconds: r.brief.sceneSeconds, mood: r.brief.mood, cameraProfile: r.brief.cameraProfile, characterLock: r.brief.characterLock,
  }),
  /** Puts a stopped part back to work. Clips that already finished are kept. */
  retry: (id: string) => api.post<{ ok: boolean }>('/episodes/retry', { id }),
  /** Stops an active script or render process. Finished clips are preserved for a later resume. */
  stop: (id: string) => api.post<{ ok: boolean; stopped: boolean; status: EpisodeStatus }>('/episodes/stop', { id }),
  /** Reads the episode and moves it one step forward on the server. */
  status: (id: string) => api.get<{ episode: Episode }>(`/episodes/status?id=${encodeURIComponent(id)}`).then((r) => r.episode),
};

export const isActive = (s: EpisodeStatus) => s === 'PROCESSING' || s === 'RENDERING';

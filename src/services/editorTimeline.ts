import type { VideoMediaLayer, VideoScene } from '../types';

type TimedItem = { start: number; end: number; [key: string]: unknown };

function splitTimedItems<T extends TimedItem>(items: T[] | undefined, splitAt: number): { first: T[]; second: T[] } {
  const first: T[] = [], second: T[] = [];
  for (const item of items || []) {
    const start = Math.max(0, Number(item.start) || 0);
    const end = Math.max(start, Number(item.end) || start);
    if (start < splitAt && Math.min(end, splitAt) > start) first.push({ ...item, start, end: Math.min(end, splitAt) } as T);
    if (end > splitAt) second.push({ ...item, start: Math.max(0, start - splitAt), end: end - splitAt } as T);
  }
  return { first, second };
}

function splitLayers(layers: VideoMediaLayer[] | undefined, splitAt: number, duration: number): { first: VideoMediaLayer[]; second: VideoMediaLayer[] } {
  const first: VideoMediaLayer[] = [], second: VideoMediaLayer[] = [];
  for (const layer of layers || []) {
    const start = Math.max(0, Math.min(duration, Number(layer.startAt) || 0));
    const end = Math.max(start, Math.min(duration, start + Math.max(0, Number(layer.duration) || 0)));
    const firstEnd = Math.min(end, splitAt);
    if (firstEnd > start) first.push({ ...layer, startAt: start, duration: firstEnd - start });
    const secondStart = Math.max(start, splitAt);
    if (end > secondStart) second.push({
      ...layer,
      id: `${layer.id}-split-${Math.round(splitAt * 1000)}`,
      startAt: Math.max(0, secondStart - splitAt),
      sourceIn: Math.max(0, Number(layer.sourceIn) || 0) + Math.max(0, secondStart - start),
      duration: end - secondStart,
    });
  }
  return { first, second };
}

/** Non-destructively split one scene and every timed layer at a local timeline position. */
export function splitVideoScene(scene: VideoScene, splitAt: number): { first: VideoScene; second: VideoScene } | null {
  const duration = Math.max(0, Number(scene.duration) || 0);
  const point = Number(splitAt);
  if (!Number.isFinite(point) || duration < 1 || point < 0.5 || point > duration - 0.5) return null;
  const layers = splitLayers(scene.mediaLayers, point, duration);
  const captions = splitTimedItems(scene.captions, point);
  const textOverlays = splitTimedItems(scene.textOverlays, point);
  const first: VideoScene = { ...scene, duration: point, mediaLayers: layers.first, captions: captions.first, textOverlays: textOverlays.first };
  const second: VideoScene = {
    ...scene,
    id: `${scene.id}-split-${Date.now().toString(36)}`,
    duration: duration - point,
    sourceIn: Math.max(0, Number(scene.sourceIn) || 0) + point,
    mediaLayers: layers.second,
    captions: captions.second,
    textOverlays: textOverlays.second,
  };
  return { first, second };
}

export interface SceneKeyframeCharacter {
  name: string;
  description?: string;
  wardrobe?: string;
}
export interface SceneKeyframeInput {
  scenePrompt: string;
  location?: string;
  aspect?: string;
  characters?: SceneKeyframeCharacter[];
  props?: Array<{ name: string; description?: string }>;
  referenceKind?: 'character' | 'location' | 'product' | 'prop';
}

/** Prompt construction stays provider-agnostic so it can be regression-tested without paid image calls. */
export function buildSceneKeyframePrompt(input: SceneKeyframeInput): string {
  const characters = (input.characters || []).filter((c) => c.name).slice(0, 4)
    .map((c) => `${c.name}: ${String(c.description || 'preserve the supplied face and identity').slice(0, 220)}${c.wardrobe ? `, wardrobe: ${c.wardrobe.slice(0, 100)}` : ''}`)
    .join('; ');
  const props = (input.props || []).filter((p) => p.name).slice(0, 6)
    .map((p) => `${p.name}: ${String(p.description || '').slice(0, 160)}`)
    .join('; ');
  const ratio = ['9:16', '16:9', '1:1'].includes(String(input.aspect)) ? input.aspect : '9:16';
  const source = input.referenceKind === 'location'
    ? 'Use the supplied image as the exact environment and spatial-layout reference. Keep its architecture, railing, cliffs, furniture and background geometry stable.'
    : input.referenceKind === 'product' || input.referenceKind === 'prop'
      ? 'Use the supplied image as the exact product/prop design reference. Preserve its silhouette, material, color, panel geometry and proportions; do not invent a replacement.'
      : 'Use the supplied image as the exact lead-character identity reference. Preserve the same face, age, skin tone, hair, build and wardrobe; do not cast a different person.';
  return [
    'Create one photorealistic live-action cinematic KEYFRAME still for a video shot, not a collage, character sheet or poster.',
    `Compose for a ${ratio} frame with a clear readable subject and physically plausible anatomy.`,
    source,
    characters ? `Other cast identities and appearance to preserve: ${characters}.` : '',
    input.location ? `Exact scene location and background: ${input.location.slice(0, 500)}.` : '',
    props ? `Important objects that must remain stable: ${props}.` : '',
    `Shot content and action: ${String(input.scenePrompt || '').slice(0, 1100)}.`,
    'Use a single coherent camera angle, natural hands and fingers, realistic object contact, consistent weather and lighting. Keep important faces and props fully visible. No ghosted objects, duplicate limbs, melted fingers, broken/reappearing props, captions, typography, logos or watermarks.',
    'The still is the opening frame for image-to-video animation. Choose a composition that can animate subtly without changing identity or object shape.',
  ].filter(Boolean).join(' ');
}

export function chooseSceneKeyframeReference<T extends { url: string; kind?: string }>(refs: T[]): T | undefined {
  return refs.find((ref) => ref.kind === 'character') || refs.find((ref) => ref.kind === 'prop')
    || refs.find((ref) => ref.kind === 'product') || refs.find((ref) => ref.kind === 'location') || refs[0];
}

/** Prefer a prepared scene still, but never lose an available source reference on image-edit failure. */
export function resolveSceneOpeningFrameUrl(preparedKeyframeUrl?: string, sourceReferenceUrl?: string): string {
  const prepared = String(preparedKeyframeUrl || '').trim();
  if (/^https:\/\//i.test(prepared)) return prepared;
  const fallback = String(sourceReferenceUrl || '').trim();
  return /^https:\/\//i.test(fallback) ? fallback : '';
}


/** Keep canonical recurring props explicit in every render and visual-QA comparison. */
export function buildCanonicalPropLock(props?: Array<{ name?: string; description?: string }>): string {
  const entries = (Array.isArray(props) ? props : []).filter((prop) => String(prop?.name || '').trim()).slice(0, 8)
    .map((prop) => {
      const name = String(prop.name || '').trim().slice(0, 80);
      const description = String(prop.description || '').trim().slice(0, 240);
      return description ? `${name}: ${description}` : name;
    });
  if (!entries.length) return '';
  return 'CANONICAL STORY-PROP CONTINUITY LOCK (these designs are fixed across shots): ' + entries.join('; ') + '. Preserve each listed object’s exact silhouette, proportions, material, colour, texture, markings and scale. Keep its holder, hand, orientation, damage and screen position continuous unless the visible action explicitly changes them. Never replace, duplicate, erase, redesign or spontaneously restore a story-critical prop.';
}

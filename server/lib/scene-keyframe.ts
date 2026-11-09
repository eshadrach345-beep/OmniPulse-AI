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

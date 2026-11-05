// Builds the text sent to the video model for each 10 second clip of a scene. It lives in its own file so that a scene can be rebuilt
// after the person has edited its script, in exactly the same way as when the script was first written.
import { GENRES, INTENSITIES, PART_SECONDS } from './prompts.js';

export const RENDER_PROMPT_MAX = 2380;

export type SceneLine = { speaker: string; text: string; half: 1 | 2; emotion?: string; doing?: string };
export type Presentation = 'movie' | 'dialogue' | 'narrated' | 'shortdrama';

const cut = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export interface AssembleInput {
  presentation: Presentation;
  brief: { genre: keyof typeof GENRES; intensity: keyof typeof INTENSITIES };
  mood: { render: string };
  look: string;
  aspect: string;
  cameraMotion: string;
  halves: number;
  lines: SceneLine[];
  visualBase: string;
  second: string;
  soundText: string;
  characters: { name: string; voice?: string; gender?: string }[];
  continuesPrevious?: boolean;
}

export function assembleParts(o: AssembleInput) {
  const { presentation, brief, mood, look, aspect, cameraMotion, halves, lines, visualBase, second, soundText, characters, continuesPrevious } = o;
  const aspectHint = aspect === '9:16' ? 'Vertical 9:16 framing.' : aspect === '1:1' ? 'Square 1:1 framing.' : 'Wide 16:9 framing.';
  const spokenFor = (ls: SceneLine[]) => ls.map((l) => {
    const ch = characters.find((c) => c.name.toLowerCase() === l.speaker.toLowerCase());
    const v = ch?.voice || (ch?.gender === 'female' ? 'a female voice' : 'a male voice');
    const words = l.text.replace(/"/g, "'");
    const how = l.emotion ? `, ${l.emotion.replace(/[.\s]+$/, '')}` : '', act = l.doing ? ` while ${l.doing.replace(/^while\s+/i, '').replace(/[.\s]+$/, '')}` : '';
    return l.speaker.toLowerCase() === 'narrator' ? `A narrator, off screen, speaking in the voice of ${v}, says: "${words}"` : `${l.speaker}, speaking in the exact same established voice identity as their previous appearances (same timbre, pitch, accent and cadence), voice of ${v}${how}${act}, speaks ONLY the exact quoted words verbatim, in the same language and in the listed order: "${words}". Do not add, omit, paraphrase, translate, improvise, repeat or insert filler words; do not speak the character name or any stage direction`;
  }).join(' Then ');
  const genreLook = GENRES[brief.genre]?.render, energy = presentation === 'movie' ? INTENSITIES[brief.intensity]?.render : '';
  const openers = {
    movie: 'Cinematic live-action movie scene with continuous physical action: the people are always moving and doing things, interacting with the place and each other, never posing, never facing the camera, never giving a speech.',
    dialogue: 'Cinematic dramatic scene with natural, believable acting: the people talk to each other in the place, with natural gestures and movement, never looking into the camera.',
    narrated: 'Cinematic film footage of the story with natural movement: nobody speaks on camera and no lips move.',
    shortdrama: 'Cinematic vertical short-drama scene with emotionally intense, believable acting: people confront each other in the place, with tight reaction close-ups, strong body language and movement, never looking into the camera.',
  } as const;
  const verticalCraft = aspect === '9:16' ? 'Compose for a phone: keep faces and key action within the central vertical safe area; eyes sit near the upper third in close/medium shots. Use a natural 35mm/50mm lens perspective, restrained depth of field, natural 24fps/180-degree-shutter motion blur, soft motivated key light and subtle rim separation. Preserve pores, natural skin, hair and fabric texture; avoid waxy/plastic faces and excessive sharpening. ' : '';
  const fixed = `${openers[presentation]} Camera: ${cameraMotion}. Mood: ${mood.render}. ${genreLook ? `Genre: ${genreLook}. ` : ''}${energy ? `Energy: ${energy}. ` : ''}Look: ${look}. ${aspectHint} ${verticalCraft}One coherent shot, no unmotivated cuts. Preserve the same face, age, skin tone, hair, build, wardrobe and props for every named character. Keep natural anatomy, hand shape and physical contact with objects; show grounded feet and believable weight. Preserve fixed set geometry, perspective, object scale, the 180-degree axis, screen direction and subject facing. A runner keeps looking and moving in the stated travel direction; never reverse, mirror, spin, face the lens or snap-zoom unless explicitly motivated. One readable physical beat at a time. Only named story characters; no idle extras, duplicates, teleporting, reset actions, morphing limbs, floating, sliding, frozen crowds or generated text/logos/subtitles/captions. These are generation targets, not a guarantee of artifact-free output.`;
  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((l) => l.half === h);
    const tails = {
      movie: mine.length ? `Audio: continuous score and location sound from first frame to last; music stays underneath dialogue and gently ducks, never cuts out or restarts. Natural in-scene speech with accurate lip sync; speak only these exact words in order, no ad-libs or stage directions, and finish before the clip ends. ${spokenFor(mine)}` : 'Audio: continuous cinematic score and natural action sounds from first frame to last; no speech.',
      dialogue: mine.length ? `Audio: natural in-scene dialogue with accurate lip sync over continuous room tone and subtle music. Keep music audible under speech; never stop or restart it. Speak only the exact quoted words in order, with no additions, omissions or narrator. Finish before the clip ends. ${spokenFor(mine)}` : 'Audio: continuous subtle score and natural room tone from first frame to last; no speech.',
      shortdrama: mine.length ? `Audio: emotional in-scene dialogue with accurate lip sync over continuous room tone and score. The score remains audible under speech and never cuts out. Speak only the exact quoted words in order, no ad-libs or narrator; finish before the clip ends. ${spokenFor(mine)}` : 'Audio: continuous tense score and natural room tone; no speech.',
      narrated: mine.length ? `Audio: off-screen narrator reads only the exact words below over continuous ambient sound and score. Nobody on screen speaks. ${spokenFor(mine)}` : 'Audio: continuous natural ambience and subtle score; no speech.',
    } as const;
    const tail = `${tails[presentation]}${soundText && h === 1 ? ` Scene sounds: ${soundText}.` : ''}`;
    const lead = h === 1 && continuesPrevious ? 'CONTINUATION: begin on the exact previous scene final frame. Preserve the same faces, clothing, pose, props, location, light, camera side and screen direction. Continue the action; no reset, reversal, teleport or new person. ' : h === 1 ? '' : `CONTINUATION: begin on the exact previous clip final frame. Preserve identity, pose, props, camera and direction. No cut or location change. Next physical beat: ${(second || 'continue the action naturally').replace(/[.\\s]+$/, '')}. `;
    // Reserve space for the complete action description and spoken lines; never let the final truncation cut the audio direction.
    const visualBudget = Math.max(180, RENDER_PROMPT_MAX - lead.length - fixed.length - tail.length - 8);
    const visual = h === 1 ? cut(visualBase, visualBudget) : 'Same characters, location and light as the exact frame it starts from.';
    let prompt = [lead, visual, fixed, tail].filter(Boolean).join(' ');
    if (prompt.length > RENDER_PROMPT_MAX) {
      const excess = prompt.length - RENDER_PROMPT_MAX;
      const trimmedVisual = visual.slice(0, Math.max(120, visual.length - excess - 8));
      prompt = [lead, trimmedVisual, fixed, tail].filter(Boolean).join(' ').slice(0, RENDER_PROMPT_MAX);
    }
    parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt, lines: mine.map((l) => ({ speaker: l.speaker, text: l.text })) });
  }
  return parts;
}

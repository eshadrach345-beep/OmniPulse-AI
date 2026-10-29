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
}

export function assembleParts(o: AssembleInput) {
  const { presentation, brief, mood, look, aspect, cameraMotion, halves, lines, visualBase, second, soundText, characters } = o;
  const aspectHint = aspect === '9:16' ? 'Vertical 9:16 framing.' : aspect === '1:1' ? 'Square 1:1 framing.' : 'Wide 16:9 framing.';
  const spokenFor = (ls: SceneLine[]) => ls.map((l) => {
    const ch = characters.find((c) => c.name.toLowerCase() === l.speaker.toLowerCase());
    const v = ch?.voice || (ch?.gender === 'female' ? 'a female voice' : 'a male voice');
    const words = l.text.replace(/"/g, "'");
    const how = l.emotion ? `, ${l.emotion.replace(/[.\s]+$/, '')}` : '', act = l.doing ? ` while ${l.doing.replace(/^while\s+/i, '').replace(/[.\s]+$/, '')}` : '';
    return l.speaker.toLowerCase() === 'narrator' ? `A narrator, off screen, speaking in the voice of ${v}, says: "${words}"` : `${l.speaker}, speaking in the voice of ${v}${how}${act}, says: "${words}"`;
  }).join(' Then ');
  const genreLook = GENRES[brief.genre]?.render, energy = presentation === 'movie' ? INTENSITIES[brief.intensity]?.render : '';
  const openers = {
    movie: 'Cinematic live-action movie scene with continuous physical action: the people are always moving and doing things, interacting with the place and each other, never posing, never facing the camera, never giving a speech.',
    dialogue: 'Cinematic dramatic scene with natural, believable acting: the people talk to each other in the place, with natural gestures and movement, never looking into the camera.',
    narrated: 'Cinematic film footage of the story with natural movement: nobody speaks on camera and no lips move.',
    shortdrama: 'Cinematic vertical short-drama scene with emotionally intense, believable acting: people confront each other in the place, with tight reaction close-ups, strong body language and movement, never looking into the camera.',
  } as const;
  const fixed = `${openers[presentation]} Camera: ${cameraMotion}. Mood and grade: ${mood.render}.${genreLook ? ` Genre look: ${genreLook}.` : ''}${energy ? ` Energy: ${energy}.` : ''} Visual look: ${look}. ${aspectHint} No text, captions or subtitles in the picture.`;
  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((l) => l.half === h);
    const tails = {
      movie: mine.length ? `Audio: the lines below are spoken inside the scene, in the middle of the action and never to the camera, with accurate lip sync and realistic sound effects (footsteps, impacts, wind, crashes, breathing). No music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: realistic sound effects and ambient sound of the action (footsteps, impacts, wind, crashes), no music, no speech.',
      dialogue: mine.length ? `Audio: clear natural spoken dialogue, unhurried and human, with accurate lip sync and matching room sound, no music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: natural room sound, no music, no speech.',
      shortdrama: mine.length ? `Audio: clear, emotional spoken dialogue delivered to the other person in the scene, with accurate lip sync and matching room sound, no music. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: tense room sound and small realistic sounds, no music, no speech.',
      narrated: mine.length ? `Audio: a calm off-screen narrator reads the line below as a voice-over, over natural ambient sound. No music. Nobody on screen speaks. ${spokenFor(mine)}` : 'Audio: natural ambient sound, no music, no speech.',
    } as const;
    const tail = `${tails[presentation]}${soundText && h === 1 ? ` Sounds in this scene: ${soundText}.` : ''}`;
    const lead = h === 1 ? '' : `Continuing seamlessly from the previous moment, with no cut, in the same place and with the same characters: ${(second || 'the action carries on naturally and the moment develops').replace(/[.\s]+$/, '')}. `;
    // The second half starts from the first half's last picture, so it only describes the next beat. Repeating the opening description makes the video jump back.
    const visual = h === 1 ? cut(visualBase, Math.max(200, RENDER_PROMPT_MAX - fixed.length - tail.length - lead.length - 4)) : 'The same people, place and light as in the picture it starts from.';
    parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt: `${lead}${visual} ${fixed} ${tail}`.slice(0, RENDER_PROMPT_MAX), lines: mine.map((l) => ({ speaker: l.speaker, text: l.text })) });
  }
  return parts;
}

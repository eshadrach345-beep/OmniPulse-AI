// Builds the text sent to the video model for each 10 second clip of a scene. It lives in its own file so that a scene can be rebuilt
// after the person has edited its script, in exactly the same way as when the script was first written.
import { GENRES, INTENSITIES, PART_SECONDS } from './prompts.js';

export const RENDER_PROMPT_MAX = 2380;

export type SceneLine = { speaker: string; text: string; half: 1 | 2; emotion?: string; doing?: string };
export type Presentation = 'movie' | 'dialogue' | 'narrated' | 'shortdrama';

const cut = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/**
 * Convert the silent two-shot coverage prompts into one chronological prose prompt.
 * LTX-2.5 performs its cuts from the prompt itself; no extra generation or API request is made.
 */
export function toNativeMultiShotPrompt(shots: { prompt: string; duration: number }[]): string {
  const valid = shots
    .filter((shot) => shot && String(shot.prompt || '').trim() && Number.isFinite(shot.duration) && shot.duration > 0)
    .slice(0, 4);
  if (!valid.length) return '';
  const globalRule = /^Vertical 9:16 premium live-action short drama\.\s*Preserve the same actors, faces, wardrobe, props, set geometry, light direction and screen direction across both shots\.\s*/i;
  const prose = valid.map((shot, index) => {
    const description = String(shot.prompt)
      .replace(globalRule, '')
      .replace(/^Continue from the exact action and body positions in Shot 1\.\s*/i, '')
      .replace(/\b(?:First|Second) shot:\s*/i, '')
      .trim();
    const duration = Math.max(1, Math.round(shot.duration));
    return index === 0
      ? `The opening shot lasts about ${duration} seconds. ${description}`
      : `A hard cut transitions to the next shot, which lasts about ${duration} seconds. ${description}`;
  });
  return prose.join(' ') + ' Keep the same named cast, exact faces, hair, wardrobe, props, location geometry, light direction and screen direction consistent across every cut.';
}

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
  /** Use the previous scene's final frame as a visual anchor across a motivated cut. */
  referencePrevious?: boolean;
  /** 1-based storyboard scene number, used to rotate editorial coverage deliberately. */
  sceneNumber?: number;
}

export function assembleParts(o: AssembleInput) {
  const { presentation, brief, mood, look, aspect, cameraMotion, halves, lines, visualBase, second, soundText, characters, continuesPrevious, referencePrevious } = o;
  const sceneNumber = Math.max(1, Math.floor(o.sceneNumber || 1));
  const spokenFor = (ls: SceneLine[]) => ls.map((line) => {
    const character = characters.find((item) => item.name.toLowerCase() === line.speaker.toLowerCase());
    const voice = character?.voice || (character?.gender === 'female' ? 'a warm female voice' : 'a grounded male voice');
    const words = line.text.replace(/"/g, "'");
    const delivery = line.emotion ? line.emotion.replace(/[.\s]+$/, '') : 'natural and conversational';
    if (line.speaker.toLowerCase() === 'narrator') {
      return 'The off-screen narrator, using ' + voice + ', speaks in English with a ' + delivery + ' delivery: "' + words + '".';
    }
    const acting = line.doing ? ' The visible action during this line is ' + line.speaker + ' ' + line.doing.replace(/[.\s]+$/, '') + '.' : '';
    return line.speaker + ', using the same ' + voice + ' voice, speaks in English with a ' + delivery + ' delivery: "' + words + '".' + acting;
  }).join(' ');

  const coverage = [
    {
      primary: 'a medium-wide side-angle master with clear foreground and background depth',
      first: "a medium-wide side-angle master that reveals the room geography and the characters' starting positions",
      second: 'a close insert of the consequential object or hand movement, keeping the active character identifiable',
    },
    {
      primary: 'an over-the-shoulder composition with the listener in a distinct depth plane and both eyelines readable',
      first: 'an over-the-shoulder view of the protagonist, with the other character in a separate depth plane',
      second: "a reverse over-the-shoulder view of the listener's genuine reaction from the same action axis",
    },
    {
      primary: 'a moving profile composition that tracks the subject through the environment',
      first: 'a lateral profile shot that follows the subject through the space and keeps nearby landmarks visible',
      second: 'a low-angle medium view of the decision or physical consequence, preserving travel direction',
    },
    {
      primary: 'a subjective point-of-view composition framed through a doorway or foreground object',
      first: 'a subjective point-of-view shot that reveals the discovery or threat from the protagonist’s eyeline',
      second: 'a three-quarter reaction close-up with the eyes fixed on the discovery',
    },
    {
      primary: 'a motivated high-angle geography shot with a strong diagonal composition',
      first: 'a high-angle view that maps the characters, exits and important props in the space',
      second: 'a tight detail insert on the clue, object or physical choice that changes the scene',
    },
    {
      primary: 'a low, slightly off-axis reveal with a distinct foreground silhouette',
      first: 'a low reveal as the character or threat enters the frame, establishing scale through movement',
      second: 'a wider reaction composition showing the character and the environment changing around them',
    },
    {
      primary: 'a compressed profile two-shot with a natural foreground edge separating the characters',
      first: 'a compressed profile two-shot that preserves personal space and clearly separates the characters',
      second: 'a moving three-quarter medium close-up that follows the affected character’s turn or withdrawal',
    },
  ][(sceneNumber - 1) % 7];

  const hasOnScreenDialogue = lines.some((line) => line.speaker.toLowerCase() !== 'narrator');
  const frame = aspect === '9:16'
    ? 'Compose for a vertical 9:16 frame, keeping faces, hands and story-critical props inside the central safe area.'
    : aspect === '1:1' ? 'Compose for a square frame.' : 'Compose for a wide 16:9 frame.';
  const visualStyle = 'The camera ' + cameraMotion.replace(/,\s*no cuts?\.?$/i, '') + '. Lighting: ' + mood.render + '. Finish: ' + (GENRES[brief.genre]?.render || 'natural cinematic detail') + ', ' + look + '. ' + frame;

  const shotDirection = hasOnScreenDialogue
    ? 'Hold one uninterrupted ' + coverage.primary + ' for the entire speaking performance. Keep the current speaker’s face and mouth readable while the listener stays in frame and reacts through eye movement, breathing and posture. Let gestures and blocking create visual variation within the take.'
    : 'Begin with ' + coverage.first + '. A clear hard cut transitions to ' + coverage.second + '; the second composition reveals the consequence of the first action. Carry the same characters, props, light direction and screen geography across the edit.';

  const soundscape = soundText
    ? 'The close soundscape is ' + soundText.replace(/[.\s]+$/, '') + '.'
    : 'The close soundscape follows the visible action with natural room or outdoor ambience and clear action foley.';
  const audioFor = (spokenLines: SceneLine[]) => {
    const dialogue = spokenFor(spokenLines);
    if (presentation === 'narrated') {
      return spokenLines.length
        ? soundscape + ' The picture remains a silent performance while ' + dialogue + ' The narrator stays off-screen.'
        : soundscape + ' The picture is a silent performance.';
    }
    if (spokenLines.length) {
      const score = presentation === 'shortdrama' || presentation === 'movie'
        ? 'A restrained cinematic score stays low beneath the voices.'
        : 'Subtle room tone remains beneath the voices.';
      return dialogue + ' The quoted English lines are the complete spoken performance for this clip and occur once in this order. Each named character delivers their own line while the listener remains silent and reacts physically. Speech ends after the final quoted line, leaving a brief quiet beat. ' + soundscape + ' ' + score;
    }
    return 'There is no spoken dialogue; all story information is carried by the visible performance. ' + soundscape + ' Natural action sounds lead, with a restrained score only when it suits the moment.';
  };

  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((line) => line.half === h);
    const tail = audioFor(mine);
    const frameReference = h === 1 && referencePrevious === true && continuesPrevious !== true;
    const imageContinuation = h > 1 || (h === 1 && continuesPrevious) || frameReference;
    const actionForClip = h > 1 ? (second || 'Continue the same physical action to a clear end state.') : visualBase;
    const lead = imageContinuation
      ? (h > 1
        ? 'Continue from the exact supplied final frame. The next physical beat is: ' + actionForClip.replace(/[.\s]+$/, '') + '.'
        : frameReference
          ? 'Use the exact supplied final frame of the preceding scene as the visual starting anchor. Preserve the same people, faces, hair, wardrobe, carried props, object designs and time of day. If the screenplay calls for a new angle or adjacent room, make one motivated cut or reframe without changing those identities or possessions. The next scene action is: ' + actionForClip.replace(/[.\s]+$/, '') + '.'
          : 'Continue from the exact supplied final frame of the preceding scene. The next visible action is: ' + actionForClip.replace(/[.\s]+$/, '') + '.')
      : '';
    const visual = imageContinuation
      ? (frameReference
        ? actionForClip
        : 'The supplied frame already establishes the people, faces, wardrobe, location, lighting and prop positions; preserve them as they are.')
      : actionForClip;
    const fixed = imageContinuation
      ? (frameReference
        ? 'Preserve the established character identities, exact wardrobe, prop designs, location geometry, light direction and screen geography. Follow the new shot composition without duplicating anyone or reversing the 180-degree action axis. Natural stable faces and anatomy; two arms, five distinct fingers, believable grips; no extra limbs, fused fingers, warped faces or duplicate people. ' + frame
        : 'Keep the same camera side, screen direction and take. Continue the action with natural body movement and a clear final position. Natural stable faces and anatomy; two arms, five distinct fingers, believable grips; no extra limbs, fused fingers, warped faces or duplicate people. ' + frame)
      : 'Natural stable faces and anatomy; two arms, five distinct fingers, believable grips; no extra limbs, fused fingers, warped faces or duplicate people. ' + shotDirection + ' ' + visualStyle + ' Preserve the established faces, wardrobe, room geography and carried props.';

    // Protect the story action and approved dialogue first. Style detail is the first material shortened
    // when a prompt approaches the provider limit; action and spoken lines are never cut to make room for adjectives.
    const safeLead = cut(lead, 520);
    const maxVisual = Math.max(0, Math.min(1320, RENDER_PROMPT_MAX - safeLead.length - tail.length - 260));
    const safeVisual = cut(visual, maxVisual);
    const fixedBudget = Math.max(0, RENDER_PROMPT_MAX - safeLead.length - safeVisual.length - tail.length - 3);
    const safeFixed = cut(fixed, fixedBudget);
    const prompt = [safeLead, safeVisual, safeFixed, tail].filter(Boolean).join(' ');
    let multiPrompt: { prompt: string; duration: number }[] | undefined;

    // Use explicit multi-shot coverage only for silent short-drama clips. Dialogue stays in one take
    // so the active speaker remains visible for the whole synchronized performance.
    if (presentation === 'shortdrama' && !hasOnScreenDialogue && !imageContinuation) {
      const globalContinuity = 'Vertical 9:16 premium live-action short drama. Preserve the same actors, faces, wardrobe, props, set geometry, light direction and screen direction across both shots.';
      const shotOne = globalContinuity + ' ' + visual + ' ' + visualStyle + ' First shot: ' + coverage.first + '. ' + soundscape;
      const shotTwo = globalContinuity + ' Continue from the exact action and body positions in Shot 1. Second shot: ' + coverage.second + '. Preserve the prop positions and show the physical consequence. ' + soundscape;
      multiPrompt = [{ prompt: shotOne, duration: 5 }, { prompt: shotTwo, duration: 5 }];
    }
    parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt, multiPrompt, lines: mine.map((line) => ({ speaker: line.speaker, text: line.text })) });
  }
  return parts;
}

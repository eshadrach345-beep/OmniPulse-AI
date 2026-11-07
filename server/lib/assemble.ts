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
  /** 1-based storyboard scene number, used to rotate editorial coverage deliberately. */
  sceneNumber?: number;
}

export function assembleParts(o: AssembleInput) {
  const { presentation, brief, mood, look, aspect, cameraMotion, halves, lines, visualBase, second, soundText, characters, continuesPrevious } = o;
  const sceneNumber = Math.max(1, Math.floor(o.sceneNumber || 1));
  // LTX-2.5 responds best to screenplay-style dialogue in flowing prose, not rigid field labels.
  const spokenFor = (ls: SceneLine[]) => ls.map((line) => {
    const character = characters.find((item) => item.name.toLowerCase() === line.speaker.toLowerCase());
    const voice = character?.voice || (character?.gender === 'female' ? 'a warm female voice' : 'a grounded male voice');
    const words = line.text.replace(/"/g, "'");
    const delivery = line.emotion ? line.emotion.replace(/[.\s]+$/, '') : 'natural and conversational';
    if (line.speaker.toLowerCase() === 'narrator') {
      return `The off-screen narrator, using ${voice}, speaks in English with a ${delivery} delivery: "${words}".`;
    }
    return `${line.speaker}, using the same ${voice} voice established for this character, speaks in English with a ${delivery} delivery: "${words}".`;
  }).join(' ');
  const genreLook = GENRES[brief.genre]?.render;
  const openers = {
    movie: 'Cinematic live-action movie scene with purposeful, physically believable action. Characters move only when the story calls for it; use restrained gestures and grounded body movement, never idle crowds or constant motion.',
    dialogue: 'Cinematic dramatic scene with natural, believable acting: the people talk to each other in the place, with natural gestures and movement, never looking into the camera.',
    narrated: 'Cinematic film footage of the story with natural movement: nobody speaks on camera and no lips move.',
    shortdrama: 'Cinematic vertical short-drama scene built around a consequential event, a revealing choice or a sharp human interaction. Use emotionally specific, controlled acting and purposeful movement; do not stage every scene as the same face-to-face confrontation or talking-head exchange. Never look into the camera.',
  } as const;
  const coverage = [
    { primary: "Use a medium-wide side-angle master with clear foreground and background depth.", first: "Open on a medium-wide side-angle master that reveals the geography and both characters' positions; let the action enter or cross the frame.", second: "Cut to a detailed insert of the consequential object or hand movement, keeping the active character identifiable in the composition." },
    { primary: "Use an over-the-shoulder composition with a strong foreground layer.", first: "Open over the protagonist's shoulder, with the other character held in a distinct depth plane and the eyeline readable.", second: "Cut across the 180-degree axis to a reverse over-the-shoulder view; capture the other person's genuine response, not a repeated frontal pose." },
    { primary: "Use a moving profile composition that tracks the character through the environment.", first: "Open in profile and track laterally as the character moves through the space; keep obstacles and landmarks visible.", second: "Cut to a low-angle medium view of the decision or physical consequence, preserving travel direction and screen geography." },
    { primary: "Use a subjective point-of-view composition or a frame through a doorway, window or foreground object.", first: "Open from the protagonist's point of view, looking toward the discovery or threat; show enough context to understand what is being seen.", second: "Cut to a close reaction from a three-quarter angle, with the eyeline fixed on the discovery and no face-to-face pose." },
    { primary: "Use a high-angle geography shot with strong diagonal composition.", first: "Open from a motivated high angle that maps the characters, exits and important props in the space.", second: "Cut to a tight detail insert on the clue, object or physical choice that changes the scene." },
    { primary: "Use a low-angle reveal with a distinct foreground silhouette.", first: "Open low and slightly off-axis as the character or threat enters the frame; reveal scale and intention through movement.", second: "Cut to a wider reaction composition that shows both the acting character and the environment changing around them." },
    { primary: "Use a restrained long-lens profile or compressed two-shot, not a frontal talking-head setup.", first: "Open with a compressed profile two-shot, using a natural foreground edge to separate the characters while preserving personal space.", second: "Cut to a moving three-quarter medium close-up that follows the affected character's turn or withdrawal." },
  ][(sceneNumber - 1) % 7];
  const coverageProse = [
    { opening: 'a medium-wide side-angle master revealing the geography and both characters’ positions as the action enters frame', response: 'a detailed insert of the consequential object or hand movement, with the active character still identifiable' },
    { opening: 'an over-the-shoulder view of the protagonist, with the other character in a distinct depth plane and their eyeline readable', response: 'a reverse over-the-shoulder view capturing the listener’s genuine reaction from the same action axis' },
    { opening: 'a lateral profile tracking shot following the character through the space, with obstacles and landmarks visible', response: 'a low-angle medium view of the decision or physical consequence, preserving travel direction' },
    { opening: 'a subjective point-of-view shot framed through a doorway or foreground object, revealing the discovery or threat', response: 'a three-quarter reaction close-up with the eyeline fixed on the discovery' },
    { opening: 'a motivated high-angle geography shot mapping the characters, exits and key props in the space', response: 'a tight detail insert on the clue, object or physical choice that changes the scene' },
    { opening: 'a low, slightly off-axis reveal as the character or threat enters frame, establishing scale through movement', response: 'a wider reaction composition showing both the acting character and the environment changing around them' },
    { opening: 'a compressed profile two-shot with a natural foreground edge separating the characters while preserving personal space', response: 'a moving three-quarter medium close-up following the affected character’s turn or withdrawal' },
  ][(sceneNumber - 1) % 7];
  const hasOnScreenDialogue = lines.some((line) => line.speaker.toLowerCase() !== 'narrator');
  // Keep lip-synced performances in one continuous take. Silent scenes can use
  // LTX-2.5's native multi-shot cuts, with the same soundscape carried across them.
  const shotPlan = hasOnScreenDialogue
    ? `Use the camera angle and composition established in the opening visual description above. Hold that single, continuous performance take while the character speaks; keep the speaker's face and mouth visible and the listener's reaction readable. Let the actors' expressions and small physical actions carry the moment instead of cutting away during speech.`
    : `The opening visual description above establishes the first shot. After about five seconds, a clear hard cut transitions to ${coverageProse.response}. The second shot reveals the result of the first action; the same actors, location, props, light and screen direction remain consistent, while the natural soundscape continues smoothly across the cut.`;

  const fixed = `${openers[presentation]} ${shotPlan} The camera uses ${cameraMotion.replace(/,\s*no cuts?\.?$/i, '')}. The scene is lit by ${mood.render}, with ${genreLook || 'natural cinematic detail'} and a ${look} finish. ${aspect === '9:16' ? 'Compose for a vertical 9:16 phone frame, keeping faces, hands and story-critical props in the central safe area.' : aspect === '1:1' ? 'Compose for a square 1:1 frame.' : 'Compose for a wide 16:9 frame.'} Preserve the established faces, ages, hair, builds, wardrobe, location geometry and prop placement. Show the action through clear physical behaviour, visible reactions and cause and effect. Characters speak to each other, not to the camera.`;
  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((l) => l.half === h);
    const audioFor = (spokenLines: SceneLine[]) => {
      const dialogue = spokenFor(spokenLines);
      const soundscape = soundText
        ? `The close soundscape includes ${soundText.replace(/[.\s]+$/, '')}, clearly caused by the action in frame.`
        : 'The close soundscape follows the visible action and the natural room or outdoor ambience.';
      if (presentation === 'narrated') {
        return spokenLines.length
          ? `${soundscape} The picture remains silent while ${dialogue} The narrator's voice continues smoothly through any visual cut without restarting.`
          : `${soundscape} No one speaks on screen.`;
      }
      if (spokenLines.length) {
        const score = presentation === 'shortdrama' || presentation === 'movie'
          ? 'A restrained cinematic score stays low beneath the voices.'
          : 'Subtle room tone remains audible beneath the voices.';
        return `${soundscape} ${score} ${dialogue} The voices sound human and conversational, with natural pauses and distinct character identities. Complete the spoken lines before the final second, then leave a brief beat of silence.`;
      }
      return `${soundscape} Let the real action sounds lead; add a restrained score only if it suits the moment. There is no dialogue.`;
    };
    const tail = audioFor(mine);
    const lead = h === 1 && continuesPrevious ? 'CONTINUATION: begin on the exact previous scene final frame. Preserve the same faces, clothing, pose, props, location, light, camera side and screen direction. Continue the action; no reset, reversal, teleport or new person. ' : h === 1 ? '' : `CONTINUATION: begin on the exact previous clip final frame. Preserve identity, pose, props, camera and direction. No cut or location change. Next physical beat: ${(second || 'continue the action naturally').replace(/[.\s]+$/, '')}. `;
    // Reserve space for the complete action description and spoken lines; never let the final truncation cut the audio direction.
    // Audio directions must survive even when the scene description is long.
    const fixedBudget = Math.max(0, RENDER_PROMPT_MAX - lead.length - tail.length - 260);
    const safeFixed = cut(fixed, fixedBudget);
    const visualBudget = Math.max(0, RENDER_PROMPT_MAX - lead.length - safeFixed.length - tail.length - 8);
    const visual = h === 1 ? cut(visualBase, visualBudget) : cut('Same characters, location and light as the exact frame it starts from.', visualBudget);
    const prompt = [lead, visual, safeFixed, tail].filter(Boolean).join(' ');
    let multiPrompt: { prompt: string; duration: number }[] | undefined;
    if (presentation === 'shortdrama') {
      // Kling receives explicit editorial coverage: establish the action, then cut to the emotional consequence.
      // Dialogue is distributed between shots so a single five-second shot is not overloaded.
      const totalWords = mine.reduce((n, line) => n + line.text.trim().split(/\s+/).filter(Boolean).length, 0);
      const firstLines: SceneLine[] = [], secondLines: SceneLine[] = [];
      let firstWords = 0;
      for (const line of mine) {
        const count = line.text.trim().split(/\s+/).filter(Boolean).length;
        if (firstWords < totalWords / 2 && (firstLines.length === 0 || firstWords + count <= totalWords / 2 + 5)) {
          firstLines.push(line); firstWords += count;
        } else secondLines.push(line);
      }
      if (mine.length === 1) { firstLines.length = 0; secondLines.splice(0, secondLines.length, ...mine); }
      const firstDuration = totalWords === 0 ? 5 : Math.max(3, Math.min(7, Math.round(10 * firstWords / totalWords) || 3));
      const secondDuration = 10 - firstDuration;
      const globalContinuity = 'Vertical 9:16 premium live-action short drama. Preserve the same actors, exact faces, age, hair, skin tone, build, wardrobe, props, set geometry, light direction and screen direction across both shots. This is one continuous moment with a motivated edit, not a montage or a new scene.';
      const shotOne = `${globalContinuity} ${lead}${visual} ${fixed} SHOT 1: ${coverage.first} Show the first clear action and its cause. ${audioFor(firstLines)}${soundText && h === 1 ? ` Location sound: ${soundText}.` : ''}`;
      const shotTwo = `${globalContinuity} Continue from the exact action and body positions in Shot 1. ${visual} SHOT 2: ${coverage.second} Preserve the 180-degree axis, gaze direction and prop positions; show the consequence, not a reset. ${audioFor(secondLines)}`;
      multiPrompt = [{ prompt: shotOne, duration: firstDuration }, { prompt: shotTwo, duration: secondDuration }];
    }
    parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt, multiPrompt, lines: mine.map((l) => ({ speaker: l.speaker, text: l.text })) });
  }
  return parts;
}

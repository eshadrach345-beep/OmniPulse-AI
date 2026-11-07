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
    movie: 'Cinematic live-action movie scene with purposeful, physically believable action. Characters move only when the story calls for it; use restrained gestures and grounded body movement, never idle crowds or constant motion.',
    dialogue: 'Cinematic dramatic scene with natural, believable acting: the people talk to each other in the place, with natural gestures and movement, never looking into the camera.',
    narrated: 'Cinematic film footage of the story with natural movement: nobody speaks on camera and no lips move.',
    shortdrama: 'Cinematic vertical short-drama scene with emotionally intense but controlled acting: one or two characters confront each other with readable expressions and measured body movement, never looking into the camera.',
  } as const;
  const verticalCraft = aspect === '9:16' ? 'VERTICAL PREMIUM SHORT-DRAMA CINEMATOGRAPHY: Compose specifically for 9:16 mobile viewing; keep faces, hands and essential props inside the central safe area, with eyes near the upper third for close and medium close-ups. Use a natural cinema-prime perspective (35mm for spatial coverage, 50mm for emotional coverage), restrained shallow depth of field and natural 24fps motion blur consistent with a 180-degree shutter. Light faces with a soft motivated key and subtle hair/rim separation; use moody chiaroscuro, restrained neon edge light or warm golden-hour light only when motivated by the location and story. Render natural pores, fine facial texture, believable hair and detailed fabric grain; avoid waxy skin, plastic sheen, over-sharpening and fake lens flares. Keep the performance intimate and emotionally readable without cropping hands or important story props. ' : '';
  const coverage = [
    { primary: "Use a medium-wide side-angle master with clear foreground and background depth.", first: "Open on a medium-wide side-angle master that reveals the geography and both characters' positions; let the action enter or cross the frame.", second: "Cut to a detailed insert of the consequential object or hand movement, keeping the active character identifiable in the composition." },
    { primary: "Use an over-the-shoulder composition with a strong foreground layer.", first: "Open over the protagonist's shoulder, with the other character held in a distinct depth plane and the eyeline readable.", second: "Cut across the 180-degree axis to a reverse over-the-shoulder view; capture the other person's genuine response, not a repeated frontal pose." },
    { primary: "Use a moving profile composition that tracks the character through the environment.", first: "Open in profile and track laterally as the character moves through the space; keep obstacles and landmarks visible.", second: "Cut to a low-angle medium view of the decision or physical consequence, preserving travel direction and screen geography." },
    { primary: "Use a subjective point-of-view composition or a frame through a doorway, window or foreground object.", first: "Open from the protagonist's point of view, looking toward the discovery or threat; show enough context to understand what is being seen.", second: "Cut to a close reaction from a three-quarter angle, with the eyeline fixed on the discovery and no face-to-face pose." },
    { primary: "Use a high-angle geography shot with strong diagonal composition.", first: "Open from a motivated high angle that maps the characters, exits and important props in the space.", second: "Cut to a tight detail insert on the clue, object or physical choice that changes the scene." },
    { primary: "Use a low-angle reveal with a distinct foreground silhouette.", first: "Open low and slightly off-axis as the character or threat enters the frame; reveal scale and intention through movement.", second: "Cut to a wider reaction composition that shows both the acting character and the environment changing around them." },
    { primary: "Use a restrained long-lens profile or compressed two-shot, not a frontal talking-head setup.", first: "Open with a compressed profile two-shot, using a natural foreground edge to separate the characters while preserving personal space.", second: "Cut to a moving three-quarter medium close-up that follows the affected character's turn or withdrawal." },
  ][(sceneNumber - 1) % 7];
  const fixed = `${openers[presentation]} Camera: ${cameraMotion}. The camera move must be motivated, smooth and physically plausible: restrained push-in for a reveal, gentle tracking for moving dialogue, or subtle handheld micro-movement when appropriate; no arbitrary zooms, spins or spatial warping. SHOT BLOCKING: stage one clear continuous action with a readable starting pose, physical action, and visible reaction or settled ending; describe who moves, in which direction, and what they touch or affect. Keep one dominant subject in focus, subordinate background activity, preserve eyelines and screen direction, and keep the camera on one side of the 180-degree axis. The visual description must specify shot size and subject placement when story-relevant; use close-ups for emotion, medium shots for interaction, and wide shots only when geography matters. ${coverage.primary} Avoid stacking unrelated actions into one shot. Mood: ${mood.render}. ${genreLook ? `Genre: ${genreLook}. ` : ''}${energy ? `Energy: ${energy}. ` : ''}Look: ${look}. ${aspectHint} ${verticalCraft}${presentation === 'shortdrama' ? 'Use two motivated editorial coverage shots within this same continuous story moment. Preserve the same action, time, location, eyelines, screen direction and 180-degree axis across the cut; the cut must not reset or reverse the action.' : 'One coherent shot, no unmotivated cuts. Hold one location and camera setup for the full clip.'} Show one clear physical action that progresses naturally; do not force extra beats, spins or camera changes. Preserve the same face, facial structure, apparent age, skin tone, hair, build, wardrobe and props for every named character. Keep natural anatomy, hand shape and physical contact with objects; show grounded feet, believable weight and natural gait. Preserve fixed set geometry, perspective, object scale, the 180-degree axis, screen direction and subject facing. A runner keeps looking and moving in the stated travel direction; never reverse, mirror or rotate without showing the physical turn. No decorative background extras. Show every character required by this exact story beat: when three or more characters are present, use a readable medium-wide group composition with all named characters visible and naturally spaced; do not silently omit scripted characters. Never overlap faces or hands. STRICT NATURAL BLOCKING: maintain ordinary conversational personal space (roughly an arm's length); characters must not touch noses, press foreheads together, rub faces, lean nose-to-nose, or hold an unblinking face-to-face stare unless the approved script explicitly requires that exact contact. For conversations, show relaxed shoulders, natural alternating eyelines, visible mouth movement and small purposeful gestures; use over-the-shoulder or three-quarter profile coverage rather than face-to-face extreme close-ups. No romantic posing, forced embraces, handshakes or face touching unless explicitly written in the scene. Avoid repeated identical two-person compositions, golden-hour lens flares and melodramatic posing. One readable physical beat at a time. No duplicate people, teleporting, reset actions, morphing limbs, floating, sliding or generated text/logos/subtitles/captions. These are generation targets, not a guarantee of artifact-free output.`;
  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((l) => l.half === h);
    const audioFor = (spokenLines: SceneLine[]) => {
      const words = spokenFor(spokenLines);
      if (presentation === 'movie') return spokenLines.length
        ? `Audio: continuous score and location sound from first frame to last; music stays underneath dialogue and gently ducks, never cuts out or restarts. Natural in-scene speech with accurate lip sync; speak only these exact words in order, no ad-libs or stage directions, and finish before the clip ends. ${words}`
        : 'Audio: continuous cinematic score and natural action sounds from first frame to last; no speech.';
      if (presentation === 'dialogue') return spokenLines.length
        ? `Audio: natural in-scene dialogue with accurate lip sync over continuous room tone and subtle music. Keep music audible under speech; never stop or restart it. Speak only the exact quoted words in order, with no additions, omissions or narrator. Finish before the clip ends. ${words}`
        : 'Audio: continuous subtle score and natural room tone from first frame to last; no speech.';
      if (presentation === 'shortdrama') return spokenLines.length
        ? `Audio: emotional in-scene dialogue with accurate lip sync over continuous room tone and score. The score remains audible under speech and continues smoothly across the edit. Speak only the exact quoted words in order, no ad-libs or narrator; finish before this shot ends. ${words}`
        : 'Audio: continuous tense score and natural room tone; no speech.';
      return spokenLines.length
        ? `Audio: off-screen narrator reads only the exact words below over continuous ambient sound and score. Nobody on screen speaks. ${words}`
        : 'Audio: continuous natural ambience and subtle score; no speech.';
    };
    const tail = `${audioFor(mine)}${soundText && h === 1 ? ` Scene sounds: ${soundText}.` : ''}`;
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

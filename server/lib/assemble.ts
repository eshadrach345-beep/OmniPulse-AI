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
  const fixed = `${openers[presentation]} Camera: ${cameraMotion}. Mood and grade: ${mood.render}.${genreLook ? ` Genre look: ${genreLook}.` : ''}${energy ? ` Energy: ${energy}.` : ''} Visual look: ${look}. ${aspectHint} One coherent live-action take, believable human anatomy and real-world physics. Preserve the 180-degree action axis and exact screen direction for the entire shot. RUNNING CONTINUITY LOCK: keep the runner's torso, head and gaze aligned with the direction of travel; if moving left-to-right, continue looking and moving right, and if moving right-to-left, continue looking and moving left. Never turn to face the lens, front-pose, reverse, mirror or rotate the runner unless the prompt explicitly shows the physical turn happening over time. The camera may move around the subject only without changing the subject's screen direction. For fights, show one physically readable attack/block/contact/reaction beat, with grounded feet, believable weight and a clear final pose. No random spins, mirrored movement, sliding feet, rubber limbs, impossible impacts, teleporting, duplicated people or reset actions. No generated text, letters, captions, subtitles, logos or watermarks in the picture; subtitles are added separately from the approved script.`;
  const parts = [];
  for (let h = 1; h <= halves; h++) {
    const mine = lines.filter((l) => l.half === h);
    const tails = {
      movie: mine.length ? `Audio: continuous cinematic rhythmic score and realistic sound effects (footsteps, impacts, wind, crashes, breathing). The score plays from the first frame to the last frame, stays audible underneath speech and gently ducks during dialogue; it must never stop or restart at a dialogue cue. The lines below are spoken inside the scene, in the middle of the action and never to the camera, with accurate lip sync. Start the first spoken line promptly, within the first 1.0 second when possible. Keep the background score and ambient sound continuous underneath the dialogue; lower the score during speech if needed, but NEVER mute, stop, restart or create a silence gap when a person begins speaking. Deliver the complete line naturally and finish it before the final 0.5 second. ${spokenFor(mine)}` : 'Audio: continuous cinematic rhythmic score plus realistic sound effects and ambient sound of the action (footsteps, impacts, wind, crashes). The score plays from the first frame to the last without stopping or restarting; no speech.',
      dialogue: mine.length ? `Audio: clear natural spoken dialogue, unhurried and human, with accurate lip sync and matching room sound over a continuous subtle cinematic music bed. Keep the music playing from the first frame through the last frame; duck it under speech but never stop, restart or leave a silence gap. Treat the quoted script as locked dialogue: speak every quoted word verbatim, in order, with no added or missing words, no ad-libs, no filler, no paraphrasing and no extra narrator. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: continuous subtle cinematic score under natural room sound; the score plays from the first frame to the last without stopping or restarting; no speech.',
      shortdrama: mine.length ? `Audio: clear, emotional spoken dialogue delivered to the other person in the scene, with accurate lip sync and matching room sound over a continuous emotional cinematic score. Keep the score playing from the first frame through the last frame; duck it under speech but never stop, restart or leave a silence gap. Treat the quoted script as locked dialogue: speak every quoted word verbatim, in order, with no added or missing words, no ad-libs, no filler, no paraphrasing and no extra narrator. Each person finishes their whole sentence and stops speaking a moment before the clip ends. ${spokenFor(mine)}` : 'Audio: continuous tense cinematic score under room tone and small realistic sounds; the score plays from the first frame to the last without stopping or restarting; no speech.',
      narrated: mine.length ? `Audio: a calm off-screen narrator reads the line below as a voice-over over natural ambient sound and a continuous subtle cinematic score. Keep the score playing throughout, gently ducked under narration, never stopped or restarted. Nobody on screen speaks. ${spokenFor(mine)}` : 'Audio: natural ambient sound with a continuous subtle cinematic score from the first frame to the last; no speech.',
    } as const;
    const tail = `${tails[presentation]}${soundText && h === 1 ? ` Sounds in this scene: ${soundText}.` : ''}`;
    const lead = h === 1 && continuesPrevious ? 'IMAGE-TO-VIDEO CONTINUATION FROM THE PREVIOUS SCENE: start from its exact final frame. Preserve every character identity, face, clothing, body pose, prop hand, location, lighting, camera side and screen direction. Continue one clear physical beat forward; do not reset, reverse, mirror, teleport or introduce a new person. ' : h === 1 ? '' : `IMAGE-TO-VIDEO CONTINUATION: the opening frame is the exact final frame of the previous clip. Continue one beat forward from that precise body position, pose, prop placement, camera angle, lens, lighting and background. Preserve each person's identity, facing and screen direction; never reverse direction, teleport, reset the action, change clothes or move an object to another hand. No cut and no new location. Next physical beat: ${(second || 'the action carries on naturally from the last frame').replace(/[.\\s]+$/, '')}. `;
    // The second half starts from the first half's last picture, so it only describes the next beat. Repeating the opening description makes the video jump back.
    const visual = h === 1 ? cut(visualBase, Math.max(200, RENDER_PROMPT_MAX - fixed.length - tail.length - lead.length - 4)) : 'The same people, place and light as in the picture it starts from.';
    parts.push({ seconds: PART_SECONDS, kind: h === 1 ? 'text' : 'continue', prompt: `${lead}${visual} ${fixed} ${tail}`.slice(0, RENDER_PROMPT_MAX), lines: mine.map((l) => ({ speaker: l.speaker, text: l.text })) });
  }
  return parts;
}

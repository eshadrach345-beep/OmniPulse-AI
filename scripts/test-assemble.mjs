// Regression tests for the prompts sent to the LTX/DeAPI renderer.
// No API keys or paid generation requests are used.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = (source, fileName) => ts.transpileModule(source, {
  fileName, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const prompts = compile(fs.readFileSync(new URL('../server/lib/prompts.ts', import.meta.url), 'utf8'), 'prompts.ts');
const promptsUrl = 'data:text/javascript;base64,' + Buffer.from(prompts).toString('base64');
const P = await import(promptsUrl);
const source = fs.readFileSync(new URL('../server/lib/assemble.ts', import.meta.url), 'utf8').replace("from './prompts.js'", "from '" + promptsUrl + "'");
const js = compile(source, 'assemble.ts');
const A = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.error('FAIL:', msg); } };
const base = {
  brief: { genre: 'auto', intensity: 'balanced' }, mood: { render: 'soft window light' },
  look: 'cinematic live action', aspect: '9:16', cameraMotion: 'a slow controlled push-in',
  characters: [{ name: 'Mara', gender: 'female', voice: 'a low clear female voice' }, { name: 'Jonah', gender: 'male', voice: 'a warm male voice' }],
  sceneNumber: 4,
};
const dialogue = A.assembleParts({
  ...base, presentation: 'shortdrama', halves: 1,
  visualBase: 'An over-the-shoulder shot: Mara holds Jonah’s phone, unlocks it, reads the message, pauses as her jaw tightens, then looks up at him.',
  second: '', soundText: 'a phone notification buzz and quiet room tone',
  lines: [
    { speaker: 'Mara', text: 'You told me you deleted this.', half: 1, emotion: 'quiet and hurt', doing: 'keeps her eyes on the screen' },
    { speaker: 'Jonah', text: 'Mara, give me a second.', half: 1, emotion: 'defensive', doing: 'reaches toward the phone, then stops' },
  ],
});
check(dialogue.length === 1, 'one 10-second scene creates one clip');
check(!/hard cut transitions/i.test(dialogue[0].prompt), 'dialogue remains one uninterrupted take');
check(dialogue[0].prompt.includes('"You told me you deleted this."'), 'approved first dialogue is sent');
check(dialogue[0].prompt.includes('"Mara, give me a second."'), 'approved second dialogue is sent');
check(dialogue[0].prompt.includes('keeps her eyes on the screen'), 'line-level physical acting is sent');
check(dialogue[0].prompt.includes('reaches toward the phone, then stops'), 'listener action is sent');
check(dialogue[0].prompt.includes('five distinct fingers'), 'renderer prompt retains an anatomy guardrail');
check(dialogue[0].prompt.length <= A.RENDER_PROMPT_MAX, 'dialogue prompt respects the provider limit');
check(!dialogue[0].multiPrompt, 'dialogue does not become a cut-up multi-shot prompt');

const silent = A.assembleParts({
  ...base, presentation: 'shortdrama', halves: 1,
  visualBase: 'A close insert shows a hand placing a key into a lock, turning it, then pushing the door open.',
  second: '', soundText: 'keys clinking and a quiet door creak', lines: [],
});
check(/hard cut transitions/i.test(silent[0].prompt), 'silent action may use a motivated cut');
check(silent[0].multiPrompt?.length === 2, 'silent short drama may use two-shot coverage');
check(silent[0].prompt.length <= A.RENDER_PROMPT_MAX, 'silent prompt respects provider limit');

const continuation = A.assembleParts({
  ...base, presentation: 'shortdrama', halves: 2,
  visualBase: 'A side-angle shot: Mara unlocks Jonah’s phone and reads the message, her thumb holding the screen steady.',
  second: 'Mara lowers the phone, looks at Jonah, takes one unsteady breath, then throws the phone to the floor; it skids to a stop beside the table.',
  soundText: 'a phone buzz, a sharp impact on the floor and quiet room tone',
  lines: [
    { speaker: 'Mara', text: 'Who is she?', half: 1, doing: 'keeps staring at the message' },
    { speaker: 'Jonah', text: 'It is not what you think.', half: 2, doing: 'takes one step toward her' },
  ],
});
check(continuation.length === 2, 'a 20-second scene creates two linked clips');
check(continuation[1].prompt.includes('Mara lowers the phone'), 'continuation includes the next physical beat');
check(continuation[1].prompt.includes('throws the phone to the floor'), 'continuation includes the consequence');
check(!continuation[1].prompt.includes('A side-angle shot'), 'continuation does not re-caption the previous frame');
check(!/hard cut transitions/i.test(continuation[1].prompt), 'continuation has no conflicting cut direction');
check(continuation[1].prompt.length <= A.RENDER_PROMPT_MAX, 'continuation prompt respects provider limit');

const frameAnchoredCut = A.assembleParts({
  ...base, presentation: 'shortdrama', halves: 1,
  visualBase: 'A new low-angle view of Mara entering the lighthouse keeper room, still wearing the same olive jacket and carrying the same stone anchor.',
  second: '', soundText: 'quiet room tone', lines: [],
  continuesPrevious: false, referencePrevious: true,
});
check(frameAnchoredCut.length === 1, 'a motivated cut remains one clip');
check(frameAnchoredCut[0].prompt.includes('exact supplied final frame of the preceding scene'), 'motivated cut receives the previous final frame as its visual anchor');
check(frameAnchoredCut[0].prompt.includes('new low-angle view of Mara'), 'motivated cut keeps its newly requested shot composition');
check(frameAnchoredCut[0].prompt.includes('exact wardrobe, prop designs, location geometry'), 'motivated cut preserves identities, props and set details');
check(!frameAnchoredCut[0].multiPrompt, 'frame-anchored cut does not add competing multi-shot instructions');
check(frameAnchoredCut[0].prompt.length <= A.RENDER_PROMPT_MAX, 'frame-anchored prompt respects the provider limit');

const nativeMultiShot = A.toNativeMultiShotPrompt([
  { prompt: 'Vertical 9:16 premium live-action short drama. Preserve the same actors, faces, wardrobe, props, set geometry, light direction and screen direction across both shots. Mara crosses the lighthouse room. First shot: a medium-wide side angle. Wind and footsteps.', duration: 5 },
  { prompt: 'Vertical 9:16 premium live-action short drama. Preserve the same actors, faces, wardrobe, props, set geometry, light direction and screen direction across both shots. Continue from the exact action and body positions in Shot 1. Second shot: a close insert of the same stone anchor. Wind and stone scraping.', duration: 5 },
]);
check(nativeMultiShot.includes('The opening shot lasts about 5 seconds'), 'DeAPI LTX receives an opening shot in native multi-shot prose');
check(nativeMultiShot.includes('A hard cut transitions to the next shot'), 'DeAPI LTX receives an explicit cut in the same generation');
check(!nativeMultiShot.includes('Continue from the exact action and body positions'), 'native multi-shot prose removes redundant shot-list phrasing');
check(nativeMultiShot.includes('same named cast, exact faces, hair, wardrobe, props'), 'native multi-shot prose locks identity and key props across cuts');

const deapiCastNotes = A.addDeapiCastNotes(
  'Mara enters the lighthouse room carrying the same stone anchor.',
  [{ prompt: 'The opening shot follows Mara through the doorway.', duration: 5 }, { prompt: 'A hard cut shows the same anchor on the table.', duration: 5 }],
  [{ name: 'Mara', description: 'olive skin, dark wavy shoulder-length hair, olive jacket and canvas backpack' }],
);
check(deapiCastNotes.prompt.includes('ESTABLISHED CAST APPEARANCE NOTES'), 'DeAPI prompt includes saved cast appearance notes');
check(deapiCastNotes.prompt.includes('dark wavy shoulder-length hair'), 'DeAPI prompt carries the saved character description');
check(deapiCastNotes.multiPrompt?.every((shot) => shot.prompt.includes('olive jacket and canvas backpack')), 'DeAPI native multi-shot carries cast notes into every shot');
check(!deapiCastNotes.prompt.includes('image input: https://'), 'DeAPI cast notes do not pretend image URLs are supported');


const handlerSource = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
check(handlerSource.includes('no duplicates, clones or unlisted background people'), 'every clip prompt forbids duplicate and unlisted characters');
check(handlerSource.includes('Keep exact wardrobe and accessories across cuts and location changes'), 'every clip prompt locks wardrobe across location changes');
check(handlerSource.includes('same silhouette, dimensions, proportions, material, colour, texture and marks'), 'every clip prompt locks recurring prop geometry and materials');
check(handlerSource.includes('five fingers per hand'), 'every clip prompt includes a hand anatomy guardrail');
check(handlerSource.includes('preserve camera axis, screen direction, perspective and light direction'), 'every clip prompt preserves lighting continuity within a location');

check(handlerSource.includes('sharesVisibleCharacter && !explicitTimeJump && !explicitCostumeChange && !timeChanged'), 'same character keeps a frame anchor through a location change');
check(handlerSource.includes('replace the old background; do not carry the previous set'), 'a location transition replaces the previous scene background');
check(handlerSource.includes('toNativeMultiShotPrompt(multiPrompt)'), 'DeAPI receives native multi-shot prose when a coverage pair exists');
check(handlerSource.includes('${prompt} ${toNativeMultiShotPrompt(multiPrompt)}'), 'DeAPI multi-shot requests retain the shared scene prompt and continuity context');

const commercialShots = A.buildCommercialShotPrompts({
  visual: 'A sleek black smartphone showing a clean teal AI dashboard on a dark desk.',
  cameraMotion: 'a slow controlled push-in',
  spokenLines: [
    { speaker: 'Narrator', text: 'Too many tools? Bring your workflow together.' },
    { speaker: 'Narrator', text: 'Create images, video, voice and chat in one place.' },
  ],
});
check(commercialShots.length === 2, 'commercial coverage is split into two shots');
check(commercialShots.every((shot) => shot.duration === 5), 'commercial shot durations are five seconds each');
check(commercialShots[0].prompt.includes('Too many tools?'), 'first narration line stays in the opening shot');
check(!commercialShots[0].prompt.includes('Create images, video'), 'narration is not duplicated across commercial shots');
check(commercialShots[1].prompt.includes('Create images, video'), 'second narration line is kept in the second shot');
check(commercialShots[1].prompt.includes('Hard cut to a distinct five-second'), 'second commercial shot has a deliberate camera cut');
check(commercialShots[0].prompt.includes('Avoid hand close-ups'), 'commercial shots explicitly avoid common anatomy failures');
check(commercialShots.every((shot) => shot.prompt.includes('exact supplied product')), 'both shots preserve the supplied product reference');

const savedContinuity = P.continuityBlock({
  partNumber: 2, previousTitle: 'The Lighthouse', previousLogline: 'A map is found.', storySoFar: 'The crew found a stone anchor.',
  endingScene: { visualPrompt: 'Mara holds the anchor.', voiceoverText: '' }, characters: [],
  keyProps: [{ name: 'Stone anchor', description: 'A solid, weathered grey stone anchor with two short blunt flukes; never a ring.' }],
  locationDescription: 'A stone lighthouse keeper room with a narrow north window.'
});
check(savedContinuity.includes('LOCKED RECURRING PROPS'), 'later parts receive the previous part recurring prop inventory');
check(savedContinuity.includes('never a ring'), 'canonical prop geometry carries into later parts');
if (failed) { console.error(failed + ' prompt regression checks failed.'); process.exit(1); }
console.log('All LTX render-prompt regression checks passed.');

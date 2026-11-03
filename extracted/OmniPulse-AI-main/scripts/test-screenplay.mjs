// Checks the rules that decide what a character SAYS and what the camera SHOWS.
// Run:  node scripts/test-screenplay.mjs   (needs the "typescript" package, which the project already uses)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync(new URL('../server/lib/screenplay.ts', import.meta.url), 'utf8'), { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
const S = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.error('FAIL:', msg); } };
const names = ['Mara', 'Jonah', 'Dex'];

// descriptions of what happens are ACTIONS: they must never be spoken
for (const t of ['The lion fell.', 'The lion falls', 'A door slams.', 'Mara opens the door.', 'Mara and Jonah run toward the gate.', 'She was running toward the gate.', 'He fell.', 'His hand shook.', 'The big lion roared.', 'The car skidded off the road.', 'Dex grabbed the knife.', 'The old tree collapsed.'])
  check(S.isStageDirection(t, 'Mara', names), `should be an action, not speech: "${t}"`);

// real speech must stay speech
for (const t of ['He fell!', 'Mara, open the door.', 'I saw the lion fall.', 'Did the lion fall?', 'Mara hates this place.', 'The meeting was cancelled.', 'The lion is dangerous.', 'You stole it from me.', 'We have to leave now.', 'Run!', 'It is over.', 'The plan failed.', 'He loves her.', 'Where were you last night?'])
  check(!S.isStageDirection(t, 'Mara', names), `should stay speech: "${t}"`);

// plain prose: quotes are dialogue, events are actions, a time jump is the only narration
const units = S.proseToUnits('A lion stalked through the tall grass. Mara said, "Stay behind me." The lion pounced.\n\nThree years later, the village was silent.');
check(units.some((u) => u.kind === 'speech' && u.speaker === 'Mara' && u.text === 'Stay behind me.'), 'quoted speech should be Mara\'s dialogue');
check(units.filter((u) => u.kind === 'action').length >= 2, 'events should be actions');
check(units.filter((u) => u.kind === 'narration').length === 1, 'only the time jump should be narration');

// narration is rationed, and actions in lines are shown instead of said
const state = { narratorLines: 0 };
const policy = { narratorCarriesStory: false, scenes: 8 };
const a = S.refineScene([{ speaker: 'Narrator', text: 'The lion fell.', half: 1 }, { speaker: 'Mara', text: 'Stay behind me.', half: 1 }], { sceneIndex: 3, policy, names, state });
check(a.lines.length === 1 && a.lines[0].speaker === 'Mara', 'mid-story narration describing an action must not be spoken');
check(a.shown.includes('The lion fell.'), 'the described action must be shown');
const b = S.refineScene([{ speaker: 'Jonah', text: 'Jonah opens the door.', half: 1 }], { sceneIndex: 4, policy, names, state });
check(b.lines.length === 0 && b.shown.length === 1, 'a character must not read out their own stage direction');
const c = S.refineScene([{ speaker: 'Narrator', text: 'Three years later.', half: 1 }], { sceneIndex: 5, policy, names, state });
check(c.lines.length === 1, 'a time jump may be narrated');
const d = S.refineScene([{ speaker: 'Narrator', text: 'The lion fell.', half: 1 }], { sceneIndex: 3, policy: { narratorCarriesStory: true, scenes: 8 }, names, state: { narratorLines: 0 } });
check(d.lines.length === 1, 'a narrated story keeps its narrator');

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('All screenplay checks passed.');

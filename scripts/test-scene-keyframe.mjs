import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/scene-keyframe.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'scene-keyframe.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const storyboardPrompt = fs.readFileSync(new URL('../server/lib/prompts.ts', import.meta.url), 'utf8');
assert.match(storyboardPrompt, /not only recurring props/);
assert.match(storyboardPrompt, /list its visible contents as separate props/);

const prompt = mod.buildSceneKeyframePrompt({
  scenePrompt: 'A woman opens a weathered wooden box beside the sea.',
  location: 'Stormy cliffside with iron railing.',
  aspect: '9:16',
  characters: [{ name: 'Mara', description: 'Dark hair, olive skin, orange raincoat.' }],
  props: [{ name: 'wooden box', description: 'Rectangular dark oak box with brass corner panels.' }],
  referenceKind: 'character',
});
assert.match(prompt, /exact lead-character identity reference/);
assert.match(prompt, /Mara: Dark hair/);
assert.match(prompt, /wooden box: Rectangular dark oak/);
assert.match(prompt, /9:16 frame/);
assert.match(prompt, /natural hands and fingers/);
assert.match(prompt, /No ghosted objects/);

const refs = [
  { url: 'https://example.test/location.jpg', kind: 'location' },
  { url: 'https://example.test/character.jpg', kind: 'character' },
  { url: 'https://example.test/product.jpg', kind: 'product' },
];
const propLock = mod.buildCanonicalPropLock([{ name: 'Evidence phone', description: 'black glass slab, cracked upper-right corner, silver side buttons' }]);
assert.match(propLock, /Evidence phone: black glass slab/);
assert.match(propLock, /Never replace, duplicate, erase, redesign/);
assert.match(propLock, /Treat nested contents as separate locked props/);
assert.match(propLock, /Never show an empty container/);
const emptyInventoryLock = mod.buildCanonicalPropLock([]);
assert.match(emptyInventoryLock, /identify every story-critical object/);
assert.match(emptyInventoryLock, /stored inside another object/);

assert.equal(mod.chooseSceneKeyframeReference(refs).url, refs[1].url, 'character identity takes priority over location plate');
assert.equal(mod.chooseSceneKeyframeReference([{ url: 'https://example.test/product.jpg', kind: 'product' }]).kind, 'product');
assert.equal(mod.chooseSceneKeyframeReference([]), undefined);
assert.equal(mod.resolveSceneOpeningFrameUrl('https://example.test/prepared.jpg', 'https://example.test/source.jpg'), 'https://example.test/prepared.jpg', 'a prepared scene keyframe takes priority');
assert.equal(mod.resolveSceneOpeningFrameUrl('', 'https://example.test/source.jpg'), 'https://example.test/source.jpg', 'the saved original reference is used when keyframe preparation is unavailable');
assert.equal(mod.resolveSceneOpeningFrameUrl('not-a-url', 'https://example.test/source.jpg'), 'https://example.test/source.jpg', 'invalid prepared URLs cannot suppress a valid reference');
assert.equal(mod.resolveSceneOpeningFrameUrl('', ''), '', 'no reference produces no opening frame');
console.log('Scene keyframe prompt and reference-selection tests passed.');
